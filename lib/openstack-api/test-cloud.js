/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {util: {delay}} = require('bedrock');
const logger = require('../node-api/logger');
const pkgcloud = require('pkgcloud');
const {promisify} = require('util');

exports.createClient = ({auth}) => {
  const clientOptions = {
    keystoneAuthVersion: 'v3',
    provider: 'openstack', // required
    username: auth.username, // required
    password: auth.password, // required
    authUrl: 'http://controller:5000', // required
    // strictSSL: false,
    domainId: 'default',
    region: 'Blacksburg',
    tenantName: 'veres-delta-stress',
    projectDomainId: 'default',
  };
  return pkgcloud.compute.createClient(clientOptions);
};

exports.createServer = async ({auth, cloudConfig, flavor, image, name}) => {
  const client = exports.createClient({auth});

  const createServer = promisify(client.createServer.bind(client));
  const getServer = promisify(client.getServer.bind(client));
  logger.debug('Attempting to create server.', {name});
  let server;
  try {
    server = await createServer({
      cloudConfig: Buffer.from(cloudConfig).toString('base64'),
      flavor,
      image,
      name,
      networks: [{uuid: 'e78a0d0d-dab0-4e9d-b4f1-f451ff32c6a9'}],
      securityGroups: [{name: 'bedrock-ledger-test'}, {name: 'inspector'}],
    });
    logger.debug('Successfully created server.', {name});
  } catch(e) {
    logger.error(e);
    throw e;
  }
  let serverDetails;
  let serverReady;
  let i = 0;
  do {
    i++;
    logger.debug(`[${i}] Attempting to get server details.`, {id: server.id});
    serverDetails = await getServer(server.id);
    serverReady = _serverReady(serverDetails);
    if(!serverReady) {
      await delay(5000);
    }
  } while(!serverReady);

  return serverDetails;

  // as soon as IP info is available and status is running, move on
  function _serverReady(details) {
    return details.status === 'RUNNING' && details.addresses.private;
  }
};

exports.destroyServers = async ({auth, instanceIds}) => {
  const client = exports.createClient({auth});
  const destroyServer = promisify(client.destroyServer.bind(client));
  return Promise.all(instanceIds.map(id => destroyServer(id)));
};
