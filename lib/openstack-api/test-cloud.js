/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const pkgcloud = require('pkgcloud');
const {promisify} = require('util');

exports.createServer = async ({auth, cloudConfig, name}) => {
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

  const openstack = pkgcloud.compute.createClient(clientOptions);

  const createServer = promisify(openstack.createServer.bind(openstack));
  const getServer = promisify(openstack.getServer.bind(openstack));

  const server = await createServer({
    cloudConfig: Buffer.from(cloudConfig).toString('base64'),
    flavor: 'cb0f3b9d-14db-4d6e-8981-a9e8931ab492', // ledger.medium
    image: 'fee15bca-2898-4ce2-bd0e-f085a2a29621', // node10base
    keyname: 'matt-rsa',
    name,
    networks: [{uuid: 'e78a0d0d-dab0-4e9d-b4f1-f451ff32c6a9'}],
    securityGroups: [{name: 'bedrock-ledger-test'}, {name: 'inspector'}],
  });

  let serverDetails;
  for(let i = 0; i < 30; ++i) {
    serverDetails = await getServer(server.id);
    // as soon as IP info is available, move on
    if(serverDetails.addresses.private) {
      break;
    }
    await _sleep(1000);
  }

  // success, output IP information
  console.log('SERVER DETAILS', serverDetails.addresses.private[0] +
    ' ' + serverDetails.addresses.private[0] + '\n');

  return serverDetails;
};

function _sleep(ms) {
  return new Promise(resolve => setTimeout(() => resolve(), ms));
}
