/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const assert = require('assert-plus');
const {create} = require('apisauce');
const https = require('https');
const {util: {BedrockError}} = require('bedrock');

exports.get = async ({hostname, strictSSL = false}) => {
  // assert.object(params, 'options.params');
  // assert.array(params.monitorIds, 'options.params.monitorIds');

  // FIXME: port should be configurable
  const baseURL = `https://${hostname}:18443/stats/storage/redis`;
  const api = create({
    baseURL,
    httpsAgent: new https.Agent({rejectUnauthorized: strictSSL}),
    timeout: 5000,
  });
  // get all available stats monitor IDs
  const monitorIds = await api.get('/monitors');
  const response = await api.get('/', {monitorIds});
  if(response.problem) {
    const error = new BedrockError('Error getting reports.', 'NetworkError');
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
  return response.data;
};

exports.collectReports = async ({hostnames, params}) => Promise.all(
  hostnames.map(hostname => exports.get({hostname, params})));
