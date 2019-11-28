/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _q = require('./job-queue');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
const {promisify} = require('util');
const {util: {uuid}} = bedrock;

bedrock.events.on('bedrock-mongodb.ready', async () => {
  await promisify(database.openCollections)(['battery']);
});

exports.addBattery = async ({batteryConfig}) => {
  const {
    description, dockerTag, flavor, ledgerNodes, operationsPerSecond, stages
  } = batteryConfig;
  const now = Date.now();
  const batteryId = uuid();
  const record = {
    battery: {
      id: batteryId,
      description,
      stages: []
    },
    meta: {
      createdDate: now,
      updatedDate: now
    }
  };
  let opsPerSecondIncrement = 0;
  if(stages.count > 1) {
    const operationPerSecondDiff = operationsPerSecond.endCount -
      operationsPerSecond.startCount;
    if(operationPerSecondDiff !== 0) {
      opsPerSecondIncrement = operationPerSecondDiff / (stages.count - 1);
    }
  }
  for(let i = 0; i < stages.count; ++i) {
    const stage = {
      dockerTag,
      // TODO: flavor currently directly corresponds to openstack, need
      // a matrix that maps UI flavors to flavor IDs for cloud providers
      flavor,
      sequence: i,
      id: uuid(),
      duration: stages.duration,
      ledgerNodeCount: ledgerNodes.startCount,
      operationsPerSecond: Math.floor(operationsPerSecond.startCount +
        (opsPerSecondIncrement * i)),
      status: false,
    };
    record.battery.stages.push(stage);
  }
  await database.collections.battery.insert(record, database.writeOptions);
  await _q.jobQueue.add('startStage', record.battery.stages[0]);
};
