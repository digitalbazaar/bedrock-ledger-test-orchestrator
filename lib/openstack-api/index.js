/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const testCloud = require('./test-cloud');
const uuid = require('uuid-random');
const yaml = require('js-yaml');

exports.getAuth = () => {
  let auth;
  try {
    auth = yaml.safeLoad(fs.readFileSync(
      path.join(__dirname, '..', '..', 'cloud-auth.yml'), 'utf8'));
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
  return auth;
};

exports.launchNetwork = async ({ledgerNodeCount}) => {
  const auth = exports.getAuth();
  const ledgerNodes = [];

  // launch the primary node
  const primaryDetails = _serverDetails(await exports.launchPrimary({auth}));
  ledgerNodes.push({type: 'primary', details: primaryDetails});
  const {ipAddress: primaryHostname} = primaryDetails;

  // launch the operation generator
  const opGeneratorDetails = _serverDetails(
    await exports.launchOperationGenerator({auth}));
  ledgerNodes.push({type: 'operation-generator', details: opGeneratorDetails});

  const secondaryCount = ledgerNodeCount - 1;
  const secondaries = [];
  for(let i = 0; i < secondaryCount; ++i) {
    secondaries.push(exports.launchSecondary({auth, primaryHostname}));
  }
  const secondaryResult = await Promise.all(secondaries);
  for(const serverDetails of secondaryResult) {
    ledgerNodes.push({
      type: 'secondary', details: _serverDetails(serverDetails)
    });
  }
  return ledgerNodes;
};

exports.launchLedgerNode = async ({auth, instanceConfig, name}) => {
  let cloudConfig = fs.readFileSync(
    path.join(__dirname, 'cloud-config.yml'), 'utf8');
  const instanceConfigB64 = Buffer.from(yaml.safeDump(instanceConfig))
    .toString('base64');
  cloudConfig = cloudConfig.replace('_INSTANCECONFIG_', instanceConfigB64);
  console.log('CLOUD CONFIG', cloudConfig);
  return testCloud.createServer({auth, cloudConfig, name});
};

exports.launchOperationGenerator = async ({auth}) => {
  const cloudConfig = fs.readFileSync(
    path.join(__dirname, 'cloud-config-operation-generator.yml'), 'utf8');
  const name = `operation-generator-${uuid()}`;
  return testCloud.createServer({auth, cloudConfig, name});
};

exports.launchPrimary = async ({auth}) => {
  const instanceConfig = {
    'mongo-dbname': uuid()
  };
  const name = `primary-${uuid()}`;
  return exports.launchLedgerNode({auth, instanceConfig, name});
};

exports.launchSecondary = async ({auth, primaryHostname}) => {
  const instanceConfig = {
    'mongo-dbname': uuid(),
    'primary-hostname': primaryHostname,
  };
  const name = `secondary-${uuid()}`;
  return exports.launchLedgerNode({auth, instanceConfig, name});
};

exports.destroyServers = async ({instanceIds}) => {
  const auth = exports.getAuth();
  return testCloud.destroyServers({auth, instanceIds});
};

function _serverDetails(serverDetails) {
  const {addresses: {private: [ipAddress]}, id, name, imageId, flavorId} =
    serverDetails;
  return {id, ipAddress, name, imageId, flavorId};
}
