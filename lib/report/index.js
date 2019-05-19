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
      'battery.id': '518927f8-4354-4bb7-8be5-f9d91a7dc667',
      'battery.stages.reports': {$exists: true}
    }},
    {$unwind: '$battery.stages'},
    {$unwind: '$battery.stages.reports'},
    // {$unwind: '$battery.stages.reports.stats'},
    {$match: {'battery.stages.reports.vm.type': 'primary'}},
    {$project: {
      operationsPerSecond: '$battery.stages.operationsPerSecond',
      sequence: '$battery.stages.sequence',
      slice: {$slice: ['$battery.stages.reports.stats', -1]}
    }},
    {$unwind: '$slice'},
    // {$group: {
    //   _id: '$operationsPerSecond',
    //   averageCpu: {
    //     $avg: '$slice.monitors.os.currentLoad.avgload'
    //   },
    // }},
    // {$sort: {_id: 1}}
    {$project: {
      createdDate: '$slice.createdDate',
      operationsPerSecond: 1,
      sequence: 1,
      // y: {$objectToArray: '$$ROOT.slice.monitors'}
      y: {
        $filter: {
          input: {$objectToArray: '$$ROOT.slice.monitors'},
          as: 'd',
          cond: {
            $or: [
              {$not: {$strcasecmp: ['$$d.k', 'nodeOs']}},
              {$not: {
                $strcasecmp: [
                  {$substrCP: ['$$d.k', 0, 10]},
                  'ledgerNode'
                ]
              }}
            ]
          }
        }
      }
    }},
    {$project: {
      createdDate: 1,
      operationsPerSecond: 1,
      sequence: 1,
      stats: {$arrayToObject: '$y'}
      // x: {$arrayElemAt: ['$y', 0]}
    }},
    // {$project: {
    //   createdDate: 1,
    //   operationsPerSecond: 1,
    //   continuity: '$x.v.continuity',
    //   nodeOs: '$x.v.nodeOs',
    // }},
    {$sort: {sequence: 1}}

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
  // console.log('ZZZZZZZZZZ', JSON.stringify(result, null, 2));
  const shaped = result.map(r => {
    const t = {};
    t.operationsPerSecond = r.operationsPerSecond;
    t.sequence = r.sequence;
    t.createdDate = r.createdDate;
    const {stats: s} = r;
    t.loadAvg1 = s.nodeOs.loadAvg[0];
    t.loadAvg5 = s.nodeOs.loadAvg[1];
    t.loadAvg15 = s.nodeOs.loadAvg[2];
    const ledgerNodeKey = Object.keys(s).find(e => e.startsWith('ledgerNode'));
    const {continuity: c} = s[ledgerNodeKey];
    // t.c = c;
    t.blockHeight = c.latestSummary.eventBlock.block.blockHeight;
    t.mergeEventsOutstanding = c.mergeEventsOutstanding;
    t.mergeEventsTotal = c.mergeEventsTotal;
    t.eventsTotal = c.eventsTotal;
    t.localOpsPerSecond = c.localOpsPerSecond;
    t.peerOpsPerSecond = c.peerOpsPerSecond;
    t.avgConsensusTime = Math.round(c.avgConsensusTime / 1000);
    return t;
  });
  console.log('XXXXXXXX', JSON.stringify(shaped, null, 2));
  console.log('================ CSV ===============\n', toCsv(shaped));
  bedrock.exit();
});

bedrock.start();

function toCsv(json) {
  const {Parser} = require('json2csv');

  // const fields = ['field1', 'field2', 'field3'];
  // const opts = { fields };
  let csv;
  try {
    const parser = new Parser();
    csv = parser.parse(json);
  } catch(e) {
    console.error(e);
    throw e;
  }
  return csv;
}
