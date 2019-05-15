/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const {config} = bedrock;

require('bedrock-mongodb');
require('bedrock-views');
require('./node-api');
require('./http-api');
require('./config');

bedrock.events.on('bedrock-cli.init', () => bedrock.program
  .option('--aws', 'Configure for AWS.')
  .option('--baremetal', 'Configure for Bare Metal.')
);

bedrock.events.on('bedrock-cli.ready', async () => {
  if(bedrock.program.aws) {
    // require('./config-aws');
    // this lives here instead of the config due to async functions
    const awsInstanceMetadata = require('aws-instance-metadata');
    const localIp = await awsInstanceMetadata.fetch('local-ipv4');

    config.server.bindAddr = [localIp];
    config.server.domain = localIp;
  }
  if(bedrock.program.baremetal) {
    require('./config-baremetal');
  }
});

bedrock.start();
