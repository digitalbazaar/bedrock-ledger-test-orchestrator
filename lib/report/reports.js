
exports.listBatteries = async ({batteryCollection}) => {
  const result = await batteryCollection.find()
    .project({
      _id: 0,
      'battery.id': 1,
      'battery.description': 1
    })
    // .limit(1)
    .toArray();
  console.log('ZZZZZZZZz', JSON.stringify(result, null, 2));
};

exports.new = async ({batteryCollection, batteryId}) => {
  const promises = [];
  // FIXME: make dependendent on number of VM instances, hardcode to 4 now
  for(let i = 0; i < 4; ++i) {
    promises.push(_batteryReport(
      {batteryCollection, batteryId, vmInstance: i}));
  }
  const s = await Promise.all(promises);
  // const shaped = s.join('');
  // console.log('SSSSSSSSS', JSON.stringify(s[1], null, 2));
  const shaped = [];
  s.forEach(vm => shaped.push(...vm));
  // sort by sequence and createDate
  shaped.sort((a, b) =>
    a.sequence - b.sequence || a.createdDate - b.createdDate);
  console.log(`================ CSV ===============\n${_toCsv(shaped)}`);
};

exports.primaryStagesSummary = async ({batteryCollection, batteryId}) => {
  const result = await batteryCollection.aggregate([
    {$match: {
      'battery.id': batteryId,
      'battery.stages.reports': {$exists: true}
    }},
    {$unwind: '$battery.stages'},
    {$unwind: '$battery.stages.reports'},
    {$match: {'battery.stages.reports.vm.type': 'primary'}},
    {$project: {
      operationsPerSecond: '$battery.stages.operationsPerSecond',
      sequence: '$battery.stages.sequence',
      slice: {$slice: ['$battery.stages.reports.stats', -1]}
    }},
    {$unwind: '$slice'},
    {$project: {
      createdDate: '$slice.createdDate',
      operationsPerSecond: 1,
      sequence: 1,
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
    }},
    {$sort: {sequence: 1}}
  ]).toArray();
  const shaped = _shapeReport(result);
  console.log(`================ CSV ===============\n${_toCsv(shaped)}`);
};

async function _batteryReport({batteryCollection, batteryId, vmInstance = 0}) {
  const result = await batteryCollection.aggregate([
    {$match: {
      'battery.id': batteryId,
      'battery.stages.reports': {$exists: true}
    }},
    {$unwind: '$battery.stages'},
    {$unwind: {path: '$battery.stages.reports', includeArrayIndex: 'ai'}},
    // Selecting an array index selects a VM for the summary
    {$match: {ai: vmInstance}},
    {$project: {
      operationsPerSecond: '$battery.stages.operationsPerSecond',
      sequence: '$battery.stages.sequence',
      slice: {$slice: ['$battery.stages.reports.stats', -1]}
    }},
    {$unwind: '$slice'},
    {$project: {
      createdDate: '$slice.createdDate',
      operationsPerSecond: 1,
      sequence: 1,
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
    }},
    {$sort: {sequence: 1}}
  ]).toArray();
  // console.log('ZZZZZZZ', JSON.stringify(result, null, 2));
  return _shapeReport(result);
}

function _shapeReport(report) {
  return report.map(r => {
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
}

function _toCsv(json) {
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
