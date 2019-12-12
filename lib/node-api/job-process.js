/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _email = require('../email-api');
const _ledgerClient = require('./ledger-client');
const _openstackApi = require('../openstack-api');
const _operationGeneratorClient = require('./operation-generator-client');
// const _scalewayApi = require('../scaleway-api');
const _statsClient = require('./stats-client');
const database = require('bedrock-mongodb');
const {config: {constants}, util: {uuid, BedrockError}} = require('bedrock');
const _logger = require('./logger');

require('bedrock-ledger-context');
require('bedrock-veres-one-context');

exports.processStage = async job => exports[job.name](job);

exports.monitorNodes = async job => {
  const {data, queue} = job;
  const {vms} = data;
  // _logger.debug('VMS', {vms});
  const {hostnames} = _getLedgerNodeDetails({vms});
  _logger.debug('HOSTNAMES', {hostnames});
  const reports = await _statsClient.collectReports({hostnames});
  // console.log('xxx', JSON.stringify(reports, null, 2));
  const stats = [];
  for(const nodeReports of reports) {
    // get the last report
    const nodeReport = nodeReports[nodeReports.length - 1];
    // iterate the monitorIds in the report
    for(const monitor in nodeReport.monitors) {
      if(monitor.startsWith('ledgerNode')) {
        const {continuity: {
          localOpsListLength,
          latestSummary: {
            eventBlock: {block: {blockHeight}}
          }
        }} = nodeReport.monitors[monitor];
        stats.push({blockHeight, localOpsListLength});
      }
    }
  }
  _logger.debug('NODE STATS', {stats});
  // if this job completed, reschedule another
  await queue.add('monitorNodes', data, {delay: 90000});
};

exports.monitorNodesOld = async job => {
  const {data} = job;
  const {vms} = data;
  _logger.debug('VMS', {vms});
  const {hostnames} = _getLedgerNodeDetails({vms});
  _logger.debug('HOSTNAMES', {hostnames});
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
    throw e;
  }

  try {
    await _sendElectorPool({targets});
  } catch(e) {
    _logger.debug('Failed to send elector pool.', {errorName: e.name});
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
  await queue.add('monitorNodes', data, {delay: 90000});
  // await queue.add('monitorNodes', data, {repeat: {
  //   jobId: uuid(),
  //   every: 90000,
  //   // end monitor 10 secs before the end of the stage
  //   endDate: Date.now() + data.duration - 10000,
  // }});
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
  const {dockerTag, id: stageId, flavor, ledgerNodeCount} = data;
  _logger.debug('starting stage', {stage: data});
  data.status = 'deployed';

  // data.vms = await _openstackApi.launchNetwork({ledgerNodeCount});
  data.vms = await _openstackApi.launchNetwork(
    {dockerTag, flavor, ledgerNodeCount});
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

  let destroyServersResult;
  try {
    destroyServersResult = await _openstackApi.destroyServers({instanceIds});
    _logger.debug('destroyed servers', {destroyServersResult});
  } catch(error) {
    _logger.error('An error occured destroying servers.', {error});
  }

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

async function _sendElectorPool({targets}) {
  const didContexts = [
    constants.DID_CONTEXT_URL,
    constants.VERES_ONE_CONTEXT_V1_URL
  ];
  // targets = [{endpoint, hostname, targetNode}]
  const electorPoolDoc = {
    '@context': didContexts,
    id: 'did:v1:uuid:b3275fed-daf4-4c07-b63a-747fa8857609',
    type: 'ElectorPool',
    // FIXME: this has to be in the v1 context before we can sign documents
    // veresOneTicketRate: 10, /* TBD */
    // replaced with maintainer's DID in test
    controller: 'did:v1:fakeMaintainerDid',
    electorPool: [],
  };
  for(const t of targets) {
    electorPoolDoc.electorPool.push({
      type: 'Continuity2017Elector',
      service: {
        type: 'Continuity2017Peer',
        id: `urn:uuid:${uuid()}`,
        serviceEndpoint: t.targetNode
      }
    });
  }

  // pick one node to send the electorPool document to
  const [target] = targets;
  const https = require('https');
  const httpsAgent = new https.Agent({rejectUnauthorized: false});
  const {WebLedgerClient} = require('web-ledger-client');
  const client = new WebLedgerClient({
    hostname: `${target.hostname}:18443`, httpsAgent});
  const operation = await client.wrap({record: electorPoolDoc});
  _logger.debug('ElectorPool operatation.', {operation});
  await client.sendOperation({operation});
}
