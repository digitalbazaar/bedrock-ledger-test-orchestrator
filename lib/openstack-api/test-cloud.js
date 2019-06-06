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

exports.createServer = async ({auth, cloudConfig, image, name}) => {
  const client = exports.createClient({auth});

  const createServer = promisify(client.createServer.bind(client));
  const getServer = promisify(client.getServer.bind(client));
  logger.debug('Attempting to create server.', {name});
  const server = await createServer({
    cloudConfig: Buffer.from(cloudConfig).toString('base64'),
    flavor: 'b4d84a4b-45d8-4a84-aae7-5607924827f0', // ledger.super
    // flavor: 'cb0f3b9d-14db-4d6e-8981-a9e8931ab492', // ledger.medium
    // image: '772ad0d2-83ad-44a6-9f76-9a5316b17c98', // test-base
    // image: '27395632-3a9f-4a62-803a-c5cf0b702ba8', // test-base-mongo4
    // image: 'c58c3b27-43e5-42ac-b8e3-01886440d244', // ubuntu
    image,
    keyname: 'matt-rsa',
    name,
    networks: [{uuid: 'e78a0d0d-dab0-4e9d-b4f1-f451ff32c6a9'}],
    securityGroups: [{name: 'bedrock-ledger-test'}, {name: 'inspector'}],
  });
  logger.debug('Successfully created server.', {name});
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
