/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const path = require('path');

config.mongodb.name = 'bedrock_ledger_test_orchestrator';

config.paths.cache = path.join(__dirname, '.cache');

// add pseudo packages
config.views.system.packages.push({
  path: path.join(__dirname, '..', 'components'),
  manifest: path.join(__dirname, '..', 'package.json')
});
