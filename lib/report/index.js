const async = require('async');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
const reports = require('./reports');

require('./config');

const batteryCollectionName = 'battery';

bedrock.events.on('bedrock-mongodb.ready', callback => async.auto({
  openCollections: callback =>
    database.openCollections([batteryCollectionName], callback)
}, err => callback(err)));

bedrock.events.on('bedrock.started', async () => {
  try {
    const batteryCollection = database.collections[batteryCollectionName];
    const batteryId = '12a86e7f-7130-4e95-8e1f-f32104d66727';

    await reports.listBatteries({batteryCollection});

    // await reports.primaryStagesSummary({batteryCollection, batteryId});
    await reports.new({batteryCollection, batteryId});
  } catch(e) {
    console.error(e);
  }
  bedrock.exit();
});

bedrock.start();
