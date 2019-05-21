/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _email = require('../email-api');
const _ledgerClient = require('./ledger-client');
// const _openstackApi = require('../openstack-api');
const _operationGeneratorClient = require('./operation-generator-client');
const _scalewayApi = require('../scaleway-api');
const _statsClient = require('./stats-client');
const database = require('bedrock-mongodb');
const {util: {BedrockError}} = require('bedrock');
const _logger = require('./logger');

exports.processStage = async job => exports[job.name](job);

exports.monitorNodes = async job => {
  const {data, queue} = job;
  const {vms} = data;
  const {hostnames} = _getLedgerNodeDetails({vms});
  const blockHeights = await _ledgerClient.getBlockHeights({hostnames});
  _logger.debug('BLOCKHEIGHTS', {blockHeights});
  const max = Math.max(...blockHeights);
  const min = Math.min(...blockHeights);
  const diff = max - min;
  // diff > 10 creates false positives
  if(diff > 100) {
    console.debug('MAX DIFF EXCEEDED', {data, diff, blockHeights});
    try {
      await _email.send({
        text: `MAX DIFF EXCEEDED ${blockHeights}\n` +
        `${JSON.stringify(data, null, 2)}`
      });
    } catch(e) {
      _logger.error('Could not send alert email.', {error: e});
    }

    // FIXME: first approach being used to stop battery in case of error
    // just send email
    // await queue.empty();
  }
};

// attempts to get agent endpoints for all the ledger nodes
// once all endpoints have been successfully aquired, instruct the operation
// generator to start sending ops
exports.startOperations = async job => {
  const {data, queue} = job;
  const {id: stageId, duration, vms} = data;
  const {hostnames} = _getLedgerNodeDetails({vms});
  _logger.debug('Attempting to collect target details.', {hostnames});
  let targets;
  try {
    targets = await _ledgerClient.getEndpoints({hostnames});
  } catch(e) {
    _logger.debug('Failed to collect target details.', {errorName: e.name});
    console.log('EEEEEEEEEEEE', e);
    throw e;
  }
  targets.forEach(e => e.operationsPerSecond = data.operationsPerSecond);
  _logger.debug('Successfully collected target details', {targets});

  const {details: {ipAddress: hostname}} =
    vms.find(v => v.type === 'operation-generator');
  _logger.debug(
    'Attempting to send targets to operation generator.', {hostname});
  try {
    await _operationGeneratorClient.sendTargets({hostname, targets});
  } catch(e) {
    _logger.error('Failed to send targets to operation generator.', {error: e});
    throw e;
  }
  _logger.debug('Successfully sent operation generator targets.');

  const result = await database.collections.battery.updateOne({
    'battery.stages.id': stageId
  }, {
    $set: {
      'battery.stages.$.operationsStartDate': Date.now(),
    },
  });
  if(result.result.n !== 1) {
    throw new BedrockError('Error updating stage.', 'NotFoundError', {stageId});
  }

  // the duration of the stage is used to determine when the stage will be
  // stopped
  await queue.add('stopStage', data, {delay: duration});
  await queue.add('monitorNodes', data, {repeat: {
    every: 90000,
    endDate: Date.now() + data.duration,
  }});
};

// TODO: current implementation is for doing sequential stages
// in the future we could calculate the required capacity for the stage
// query openstack and determine if the necessary capacity
// launch multiple stages in parallel if the capacity exists.
// many ways to address this, one would be that if the battery is configured
// to run in parallel, all stages can could be enqueued at once, and
// this function would just fail the job if `checkOpenStackCapacity` fails
// and the stage job would just keep retrying until the capacity becomes
// available
exports.startStage = async job => {
  const {data, queue} = job;
  const {id: stageId, ledgerNodeCount} = data;
  _logger.debug('starting stage', {stage: data});
  data.status = 'deployed';

  // data.vms = await _openstackApi.launchNetwork({ledgerNodeCount});
  data.vms = await _scalewayApi.launchNetwork({ledgerNodeCount});
  _logger.debug('created servers', {vms: data.vms});

  const result = await database.collections.battery.updateOne({
    'battery.stages.id': stageId
  }, {
    $set: {
      'battery.stages.$.status': data.status,
      'battery.stages.$.vms': data.vms
    },
  });
  if(result.result.n !== 1) {
    throw new BedrockError('Error updating stage.', 'NotFoundError', {stageId});
  }
  // kicks off a ledgerNetwork / battery stage
  // records data about VMs from openstack API into `battery` collection
  // schedules the stop job based on the stage.duration

  await queue.add('startOperations', data, {
    attempts: 1000,
    backoff: 20000,
    removeOnComplete: true,
    removeOnFail: true,
  });
};

exports.stopStage = async job => {
  const {data, queue} = job;
  const {id: stageId, sequence: currentSequence} = data;

  // TODO: pulls stats reports from all ledger nodes
  // use the details found in stage.vms to collect stats history and store
  // in the stage
  console.log('COLLECTING STATS');
  // TODO: for now just collect stats from ledgerNodes, could collect stats
  // from operation generator as well.
  const {hostnames, ledgerNodes} = _getLedgerNodeDetails({vms: data.vms});
  const collectedReports = await _statsClient.collectReports(
    {hostnames, params: {monitorIds: ['os']}});
  _logger.debug('Successfully collected stats.');
  const reports = ledgerNodes.map((vm, index) =>
    ({vm, stats: collectedReports[index]}));

  const instanceIds = data.vms.map(v => v.details.id);

  // const destroyServersResult = await _openstackApi.destroyServers(
  //   {instanceIds});

  const destroyServersResult = await _scalewayApi.destroyServers({instanceIds});

  _logger.debug('destroyed servers', {destroyServersResult});

  const now = Date.now();
  console.log('STOPPING STAGE', now);
  const stageResult = await database.collections.battery.findOneAndUpdate({
    'battery.stages.id': stageId
  }, {
    $set: {
      'battery.stages.$.status': 'complete',
      'battery.stages.$.completedDate': now,
      'battery.stages.$.destroyServersResult': destroyServersResult,
      'battery.stages.$.reports': reports,
    },
  }, {returnOriginal: false});
  if(stageResult.lastErrorObject.n !== 1) {
    throw new BedrockError('Error updating stage.', 'NotFoundError', {stageId});
  }
  const {value: {battery: {stages}}} = stageResult;

  // TODO: when doing parallel, this can look for any uncompleted stage
  const nextStage = stages.find(s => s.sequence === currentSequence + 1);

  if(!nextStage) {
    const batteryResult = await database.collections.battery.updateOne({
      'battery.stages.id': stageId
    }, {
      $set: {
        'battery.completedDate': now,
      }
    });
    if(batteryResult.result.n !== 1) {
      throw new BedrockError(
        'Error updating battery.', 'NotFoundError', {stageId});
    }
    return;
  }
  console.log('SCHEDULING NEXT STAGE', nextStage);
  await queue.add('startStage', nextStage);
};

function _getLedgerNodeDetails({vms}) {
  const ledgerNodes =
    vms.filter(v => ['primary', 'secondary'].includes(v.type));
  const hostnames = ledgerNodes.map(v => v.details.ipAddress);
  return {ledgerNodes, hostnames};
}
