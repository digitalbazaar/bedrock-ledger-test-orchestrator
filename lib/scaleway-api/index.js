/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {create} = require('apisauce');
const fs = require('fs');
const logger = require('../node-api/logger');
const path = require('path');
const pLimit = require('p-limit');
const {util: {delay, uuid}} = require('bedrock');
const yaml = require('js-yaml');

// used to limit the number of secondaries launched at one time
const limit = pLimit(3);

exports.createClient = ({auth}) => {
  const {
    // scalewayOrganization,
    scalewaySecretKey
  } = auth;
  return create({
    baseURL: 'https://cp-par1.scaleway.com/servers',
    headers: {
      'X-Auth-Token': scalewaySecretKey
    },
    timeout: 30000,
  });
};

exports.launchLedgerNode = async ({auth, instanceConfig, name}) => {
  let cloudConfig = fs.readFileSync(
    path.join(__dirname, 'cloud-config.yml'), 'utf8');
  const instanceConfigB64 = Buffer.from(yaml.safeDump(instanceConfig))
    .toString('base64');
  cloudConfig = cloudConfig.replace('_INSTANCECONFIG_', instanceConfigB64);
  // console.log('CLOUD CONFIG', cloudConfig);
  logger.debug('Launching instance.', {name});
  return exports.createServer({auth, cloudConfig, name});
};

exports.launchOperationGenerator = async ({auth} = {}) => {
  const cloudConfig = fs.readFileSync(
    path.join(__dirname, 'cloud-config-operation-generator.yml'), 'utf8');
  const name = `operation-generator-${uuid()}`;
  return exports.createServer({auth, cloudConfig, name});
};

exports.launchPrimary = async ({auth} = {}) => {
  const instanceConfig = {
    'mongo-dbname': uuid()
  };
  const name = `primary-${uuid()}`;
  return exports.launchLedgerNode({auth, instanceConfig, name});
};

exports.launchSecondary = async ({auth, primaryHostname}) => {
  const instanceConfig = {
    'mongo-dbname': uuid(),
    // FIXME: this port number should be configurable
    'primary-hostname': `${primaryHostname}:18443`,
  };
  const name = `secondary-${uuid()}`;
  return exports.launchLedgerNode({auth, instanceConfig, name});
};

exports.createServer = async ({cloudConfig, name}) => {
  const {scalewayOrganization, scalewaySecretKey} = exports.getAuth();
  const scalewayApi = create({
    baseURL: 'https://cp-par1.scaleway.com/servers',
    headers: {
      'X-Auth-Token': scalewaySecretKey
    }
  });
  const {data} = await scalewayApi.post('', {
    organization: scalewayOrganization,
    name,
    // image: 'a2878dfa-3687-4e22-ae65-e5e6518bf844', // amd mongo4
    // commercial_type: 'DEV1-S',
    // commercial_type: 'DEV1-M',
    image: '3d2748d1-0622-450d-b056-7259b9655666', // arm64 mongo4
    commercial_type: 'ARM64-2GB',
    tags: [],
    enable_ipv6: false,
    boot_type: 'local'
  });

  const {server: {id: serverId}} = data;

  await scalewayApi.patch(
    `/${serverId}/user_data/cloud-init`,
    cloudConfig, {
      headers: {
        'Content-Type': 'text/plain'
      }
    });

  await scalewayApi.post(`/${serverId}/action`, {action: 'poweron'});

  let serverDetails;
  let serverReady = false;
  let i = 0;
  do {
    i++;
    if(!serverReady) {
      await delay(15000);
    }
    logger.debug(`[${i}] Attempting to get server details.`, {id: serverId});
    serverDetails = await _getServer(serverId);
    serverReady = _serverReady(serverDetails);
  } while(!serverReady);

  return serverDetails;

  // as soon as IP info is available and status is running, move on
  function _serverReady(details) {
    // public_ip is null until it is assigned
    return !!details.public_ip;
  }

  async function _getServer(serverId) {
    const t = await scalewayApi.get(`/${serverId}`);
    return t.data.server;
  }
  return data;
};

exports.destroyServers = async ({instanceIds}) => {
  const auth = exports.getAuth();
  const client = exports.createClient({auth});
  return Promise.all(instanceIds.map(async id => {
    const {data} = await client.post(`/${id}/action`, {action: 'terminate'});
    return data;
  }));
};

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
    secondaries.push(
      limit(() => exports.launchSecondary({auth, primaryHostname})));
  }
  const secondaryResult = await Promise.all(secondaries);
  for(const serverDetails of secondaryResult) {
    ledgerNodes.push({
      type: 'secondary', details: _serverDetails(serverDetails)
    });
  }
  return ledgerNodes;
};

function _serverDetails(serverDetails) {
  const {
    public_ip: {address: ipAddress}, id, hostname: name,
    image: {id: imageId}, commercial_type: flavorId
  } = serverDetails;
  return {id, ipAddress, name, imageId, flavorId};
}
