const async = require('async');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');

require('./config');

const batteryCollectionName = 'battery';

bedrock.events.on('bedrock-mongodb.ready', callback => async.auto({
  openCollections: callback =>
    database.openCollections([batteryCollectionName], callback)
}, err => callback(err)));

bedrock.events.on('bedrock.started', async () => {
  console.log('STARTED!!!!!!!!!!!!!!!!!!!!!');
  const batteryCollection = database.collections[batteryCollectionName];
  // const result = await batteryCollection.find({
  //   'battery.id': '927c2cf5-4ecd-4365-aa95-b1725636337f',
  // }, {
  //   'battery.stages.sequence': 1,
  //   'battery.stages.operationsPerSecond': 1,
  //   'battery.stages.status': 1,
  //   // 'battery.stages.reports': 1,
  //   'battery.stages.reports.vm.details.id': 1,
  //   'battery.stages.reports.stats.createdDate': 1,
  //   'battery.stages.reports.stats.monitors.os.currentLoad.avgload': 1,
  // }).toArray();
  const result = await batteryCollection.aggregate([
    {$match: {
      'battery.id': 'ef7fd45a-d61e-4436-b9c7-6ff0104afd2c',
      'battery.stages.reports': {$exists: true}
    }},
    {$unwind: '$battery.stages'},
    {$unwind: '$battery.stages.reports'},
    // {$unwind: '$battery.stages.reports.stats'},
    {$match: {'battery.stages.reports.vm.type': 'primary'}},
    {$project: {
      operationsPerSecond: '$battery.stages.operationsPerSecond',
      slice: {$slice: ['$battery.stages.reports.stats', -6]}
    }},
    {$unwind: '$slice'},
    {$group: {
      _id: '$operationsPerSecond',
      averageCpu: {
        $avg: '$slice.monitors.os.currentLoad.avgload'
      },
    }},
    {$sort: {_id: 1}}

    // {$sort: {'battery.stages.reports.stats.createdDate': 1}},
    // {$group: {
    //   _id: {
    //     // sequence: '$battery.stages.sequence',
    //     operationsPerSecond: '$battery.stages.operationsPerSecond',
    //     // vm: '$battery.stages.reports.vm.details.ipAddress',
    //   },
    //   // _id: '$battery.stages.reports',
    //   averageCpu: {
    //     $avg: '$battery.stages.reports.stats.monitors.os.currentLoad.avgload'
    //   },
    // }},
    // {$sort: {
    //   // '_id.vm': 1,
    //   // '_id.sequence': 1
    //   '_id.operationsPerSecond': 1
    // }}
  ]).toArray();
  console.log('ZZZZZZZZZZ', JSON.stringify(result, null, 2));
  // console.log('XXXXXXXX', await result.toArray());
  bedrock.exit();
});

bedrock.start();
