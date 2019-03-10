/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {asyncHandler} = require('bedrock-express');
const bedrock = require('bedrock');
const brTestOrchestrator = require('../node-api');

// TODO: move into config
const basePath = '/orchestrator';
const cfg = {
  routes: {
    basePath,
    batteryPath: `${basePath}/battery`,
  }
};

bedrock.events.on('bedrock-express.configure.routes', app => {
  const {routes: {batteryPath}} = cfg;
  app.post(
    batteryPath,
    // ensureAuthenticated,
    // validate('someValidator'),
    asyncHandler(async (req, res) => {
      console.log('HERE!!!', req.body);
      await brTestOrchestrator.addBattery({batteryConfig: req.body});
      res.status(204).end();
    }));
});
