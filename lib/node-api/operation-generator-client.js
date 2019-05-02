/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const assert = require('assert-plus');
const {create} = require('apisauce');
const https = require('https');
const {util: {BedrockError}} = require('bedrock');

exports.sendTargets = async ({hostname, strictSSL = false, targets}) => {
  assert.string(hostname, 'options.hostname');
  assert.array(targets, 'options.targets');

  // FIXME: the port should be configurable
  const baseURL = `https://${hostname}:18443/targets`;
  const api = create({
    baseURL,
    httpsAgent: new https.Agent({rejectUnauthorized: strictSSL}),
    timeout: 5000,
  });
  const response = await api.post('/', targets);
  if(response.problem) {
    const error = new BedrockError('Error sending targets.', 'NetworkError');
    if(response.problem === 'CLIENT_ERROR') {
      error.details = {
        baseURL, error: response.data, status: response.status
      };
    } else {
      error.details = {
        baseURL, error: response.originalError, status: response.status
      };
    }
    throw error;
  }
};
