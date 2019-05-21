/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {create} = require('apisauce');
const fs = require('fs');
const path = require('path');
const {util: {uuid}} = require('bedrock');
const yaml = require('js-yaml');

exports.launchLedgerNode = async ({auth, instanceConfig, name}) => {
  let cloudConfig = fs.readFileSync(
    path.join(__dirname, 'cloud-config.yml'), 'utf8');
  const instanceConfigB64 = Buffer.from(yaml.safeDump(instanceConfig))
    .toString('base64');
  cloudConfig = cloudConfig.replace('_INSTANCECONFIG_', instanceConfigB64);
  console.log('CLOUD CONFIG', cloudConfig);
  return exports.createServer({auth, cloudConfig, name});
};

exports.launchPrimary = async ({auth} = {}) => {
  const instanceConfig = {
    'mongo-dbname': uuid()
  };
  const name = `primary-${uuid()}`;
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
    image: 'a2878dfa-3687-4e22-ae65-e5e6518bf844',
    commercial_type: 'DEV1-S',
    tags: [],
    enable_ipv6: false,
    boot_type: 'local'
  });

  const {server: {id: serverId}} = data;
  const y = await scalewayApi.patch(
    `/${serverId}/user_data/cloud-init`,
    cloudConfig, {
      headers: {
        'Content-Type': 'text/plain'
      }
    });

  console.log('YYYYYYY', y.data);
  const z = await scalewayApi.post(`/${serverId}/action`, {action: 'poweron'});
  console.log('ZZZZZZZZ', z.data);
  return data;
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

exports.launchPrimary()
  .then(d => {
    console.log('FFFFFFFFFFFFFFF', d);
  });
