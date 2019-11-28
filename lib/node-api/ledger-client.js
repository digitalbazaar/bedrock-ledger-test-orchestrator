/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {WebLedgerClient} = require('web-ledger-client');
const https = require('https');

exports.getBlockHeights = async ({hostnames}) => Promise.all(
  hostnames.map(hostname => (async () => {
    const httpsAgent = new https.Agent({rejectUnauthorized: false});

    // FIXME: this port number should be configurable
    const client = new WebLedgerClient({
      hostname: `${hostname}:18443`, httpsAgent});

    const result = await client.getDocument({service: 'ledgerBlockService'});
    const {blockHeight} = result.latest.block;
    return blockHeight;
  })()));

exports.getEndpoints = async ({hostnames}) => Promise.all(
  hostnames.map(hostname => (async () => {
    const httpsAgent = new https.Agent({rejectUnauthorized: false});

    // FIXME: this port number should be configurable
    const client = new WebLedgerClient(
      {hostname: `${hostname}:18443`, httpsAgent});

    // there is no benefit in running these in parallel
    const endpoint = await client.getServiceEndpoint(
      {serviceId: 'ledgerOperationService'});
    const targetNode = await client.getTargetNode();
    return {endpoint, hostname, targetNode};
  })()));
