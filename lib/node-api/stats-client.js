/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const assert = require('assert-plus');
const {create} = require('apisauce');
const https = require('https');
const uuid = require('uuid-random');
const {util: {BedrockError}} = require('bedrock');

exports.get = async ({hostname, params, strictSSL = false}) => {
  assert.object(params, 'options.params');
  assert.array(params.monitorIds, 'options.params.monitorIds');
  const baseURL = `https://${hostname}/stats/storage/redis`;
  const api = create({
    baseURL,
    httpsAgent: new https.Agent({rejectUnauthorized: strictSSL}),
  });
  // FIXME: enable
  // const response = await api.get('/', params);
  const response = {data: _mockReports()};
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

function _mockReports() {
  const reports = [];
  const reportStartTime = Date.now();
  for(let i = 0; i < 3; ++i) {
    // simulate reports generated at 1 sec intervals
    const createdDate = reportStartTime + (i * 1000);
    const aReport = {};
    const bReport = {};
    for(let k = 0; k < 5; ++k) {
      aReport[k] = uuid();
      bReport[k] = uuid();
    }
    const report = {createdDate, monitors: {a: aReport, b: bReport}};
    reports.push(report);
  }
  return reports;
}
