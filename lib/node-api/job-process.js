/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _openstackApi = require('../openstack-api');
const _statsClient = require('./stats-client');
const database = require('bedrock-mongodb');
const {util: {BedrockError}} = require('bedrock');
const _logger = require('./logger');

exports.processStage = async job => {
  if(job.name === 'startStage') {
    return exports.startStage(job);
  }
  return exports.stopStage(job);
};

// TODO: current implementation is for doing sequencial stages
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
  const {id: stageId, duration, ledgerNodeCount} = data;
  _logger.debug('starting stage', {stage: data});
  data.status = 'deployed';

  data.vms = await _openstackApi.launchNetwork({ledgerNodeCount});
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

  // the duration of the stage is used to determine when the stage will be
  // stopped
  queue.add('stopStage', data, {delay: duration});
};

exports.stopStage = async job => {
  const {data, queue} = job;
  const {id: stageId, sequence: currentSequence} = data;

  // TODO: pulls stats reports from all nodes
  // use the details found in stage.vms to collect stats history and store
  // in the stage
  console.log('COLLECTING STATS');
  // TODO: for now just collect stats from ledgerNodes
  const ledgerNodes = data.vms
    .filter(v => ['primary', 'secondary'].includes(v.type));
  const hostnames = ledgerNodes.map(v => v.details.ipAddress);
  const collectedReports = await _statsClient.collectReports(
    {hostnames, params: {monitorIds: ['os']}});

  const reports = ledgerNodes.map((vm, index) =>
    ({vm, stats: collectedReports[index]}));

  const instanceIds = data.vms.map(v => v.details.id);
  const destroyServersResult = await _openstackApi.destroyServers(
    {instanceIds});
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
  queue.add('startStage', nextStage);
};
