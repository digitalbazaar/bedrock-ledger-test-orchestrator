/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const fs = require('fs');
const path = require('path');
const pLimit = require('p-limit');
const testCloud = require('./test-cloud');
const {util: {uuid}} = bedrock;
const yaml = require('js-yaml');
const logger = require('../node-api/logger');

// used to limit the number of secondaries launched at one time
const limit = pLimit(1);

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

exports.launchNetwork = async ({dockerTag, flavor, ledgerNodeCount}) => {
  const auth = exports.getAuth();
  const ledgerNodes = [];

  // modify docker-compose
  const dockerCompose = require('./docker-compose');
  dockerCompose.services['bedrock-ledger-test'].image =
    `digitalbazaar/bedrock-ledger-test:${dockerTag}`;
  const dockerComposeB64 = Buffer.from(yaml.safeDump(dockerCompose))
    .toString('base64');

  // launch the primary node
  const primaryDetails = _serverDetails(await exports.launchPrimary(
    {auth, dockerComposeB64, flavor}));
  ledgerNodes.push({type: 'primary', details: primaryDetails});
  const {ipAddress: primaryHostname} = primaryDetails;

  // launch the operation generator
  const dockerComposeOpGen = require('./docker-compose-operation-generator');
  const dockerComposeOpGenB64 = Buffer.from(yaml.safeDump(dockerComposeOpGen))
    .toString('base64');
  const opGeneratorDetails = _serverDetails(
    await exports.launchOperationGenerator({
      auth, dockerComposeB64: dockerComposeOpGenB64}));
  ledgerNodes.push({type: 'operation-generator', details: opGeneratorDetails});

  const secondaryCount = ledgerNodeCount - 1;
  const secondaries = [];
  for(let i = 0; i < secondaryCount; ++i) {
    secondaries.push(
      limit(() => exports.launchSecondary(
        {auth, dockerComposeB64, flavor, primaryHostname})));
  }
  const secondaryResult = await Promise.all(secondaries);
  for(const serverDetails of secondaryResult) {
    ledgerNodes.push({
      type: 'secondary', details: _serverDetails(serverDetails)
    });
  }
  return ledgerNodes;
};

exports.launchLedgerNode = async ({
  auth, dockerComposeB64, flavor, instanceConfig, name
}) => {
  let cloudConfig = fs.readFileSync(
    path.join(__dirname, 'cloud-config.yml'), 'utf8');
  // const instanceConfigB64 = Buffer.from(instanceConfig, 'utf8')
  //   .toString('base64');
  cloudConfig = cloudConfig.replace('_ENVFILE_', instanceConfig);
  cloudConfig = cloudConfig.replace('_DOCKER_COMPOSE_', dockerComposeB64);
  // cloudConfig = cloudConfig.replace('_ENVFILE_', instanceConfigB64);
  const image = '772ad0d2-83ad-44a6-9f76-9a5316b17c98';
  logger.debug('Launching Ledger Node', {cloudConfig});
  return testCloud.createServer({auth, cloudConfig, flavor, image, name});
};

exports.launchOperationGenerator = async ({auth, dockerComposeB64}) => {
  let cloudConfig = fs.readFileSync(
    path.join(__dirname, 'cloud-config-operation-generator.yml'), 'utf8');
  const instanceConfig = 'PUBLIC_IP={{ ds.ec2_metadata.local_ipv4 }}';
  cloudConfig = cloudConfig.replace('_ENVFILE_', instanceConfig);
  cloudConfig = cloudConfig.replace('_DOCKER_COMPOSE_', dockerComposeB64);
  const name = `operation-generator-${uuid()}`;
  const image = '27395632-3a9f-4a62-803a-c5cf0b702ba8';
  logger.debug('Launching Operation Generator', {cloudConfig});
  // TODO: hard coding 2/4 flavor, this should be specified in UI
  const flavor = '14cb1106-0d17-48d4-9b85-90d743ccae06';
  return testCloud.createServer({auth, cloudConfig, flavor, image, name});
};

exports.launchPrimary = async ({auth, dockerComposeB64, flavor}) => {
  // this is for TestCloud
  const instanceConfig = 'PUBLIC_IP={{ ds.ec2_metadata.local_ipv4 }}';
  const name = `primary-${uuid()}`;
  return exports.launchLedgerNode(
    {auth, dockerComposeB64, flavor, instanceConfig, name});
};

exports.launchSecondary = async ({
  auth, dockerComposeB64, flavor, primaryHostname
}) => {
  // FIXME: this port number should be configurable
  const instanceConfig = `PRIMARY_HOSTNAME=${primaryHostname}:18443\n` +
    // this is for TestCloud including 5 spaces for indent
    '     PUBLIC_IP={{ ds.ec2_metadata.local_ipv4 }}';
  const name = `secondary-${uuid()}`;
  return exports.launchLedgerNode(
    {auth, dockerComposeB64, flavor, instanceConfig, name});
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
