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
  console.log('111111111111111111', auth);
  const primaryDetails = await exports.launchPrimary({auth});
  console.log('PRIMARYINFO', JSON.stringify(primaryDetails, null, 2));
  ledgerNodes.push({type: 'primary', serverDetails: primaryDetails});
  // FIXME: do it
  const primaryHostname = "extractIPfromPrimaryInfo";
  const secondaryCount = ledgerNodeCount - 1;
  const secondaries = [];
  for(let i = 0; i < secondaryCount; ++i) {
    secondaries.push(exports.launchSecondary({auth, primaryHostname}));
  }
  const secondaryResult = await Promise.all(secondaries);
  for(const serverDetails of secondaryResult) {
    // FIXME: track this somewhere
    console.log('SSSSSSSSSS', serverDetails);
    ledgerNodes.push({type: 'secondary', serverDetails});
  }
};

exports.launchLedgerNode = async ({
  auth, cloudConfig, instanceConfig, name
}) => {
  const instanceConfigB64 = Buffer.from(yaml.safeDump(instanceConfig))
    .toString('base64');
  cloudConfig = cloudConfig.replace('_INSTANCECONFIG_', instanceConfigB64);
  console.log('2222222222222222222', cloudConfig);
  return testCloud.createServer({auth, cloudConfig, name});
};

exports.launchPrimary = async ({auth}) => {
  const instanceConfig = {
    'mongo-dbname': uuid()
  };
  const cloudConfig = fs.readFileSync(
    path.join(__dirname, 'cloud-config-primary.yml'), 'utf8');
  const name = `primary-${uuid()}`;
  return exports.launchLedgerNode({auth, cloudConfig, instanceConfig, name});
};

exports.launchSecondary = async ({auth, primaryHostname}) => {
  const instanceConfig = {
    'mongo-dbname': uuid(),
    'primary-hostname': primaryHostname,
  };
  const cloudConfig = fs.readFileSync(
    path.join(__dirname, 'cloud-config-secondary.yml'), 'utf8');
  const name = `secondary-${uuid()}`;
  return exports.launchLedgerNode({auth, cloudConfig, instanceConfig, name});
};
