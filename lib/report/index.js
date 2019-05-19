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
  const batteryCollection = database.collections[batteryCollectionName];
  const batteryId = '518927f8-4354-4bb7-8be5-f9d91a7dc667';

  await reports.primaryStagesSummary({batteryCollection, batteryId});

  bedrock.exit();
});

bedrock.start();
