const async = require('async');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
const reports = require('./reports');

require('./config');

const batteryCollectionName = 'battery';

bedrock.events.on('bedrock-cli.init', () => bedrock.program
  .option('-b, --battery <value>', 'The battery to query.')
);

bedrock.events.on('bedrock-mongodb.ready', callback => async.auto({
  openCollections: callback =>
    database.openCollections([batteryCollectionName], callback)
}, err => callback(err)));

bedrock.events.on('bedrock.started', async () => {
  try {
    const batteryCollection = database.collections[batteryCollectionName];
    const batteryId = bedrock.program.battery;

    await reports.listBatteries({batteryCollection});

    // await reports.primaryStagesSummary({batteryCollection, batteryId});
    await reports.new({batteryCollection, batteryId});
  } catch(e) {
    console.error(e);
  }
  bedrock.exit();
});

bedrock.start();
