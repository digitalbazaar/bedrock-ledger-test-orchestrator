/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
require('bedrock-mongodb');
require('bedrock-views');
require('./node-api');
require('./http-api');
require('./config');

bedrock.start();
