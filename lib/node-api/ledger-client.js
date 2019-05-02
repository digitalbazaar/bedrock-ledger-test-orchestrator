/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {WebLedgerClient} = require('web-ledger-client');

exports.getEndpoints = async ({hostnames}) => {
  const promises = hostnames.map(hostname => {
    const client = new WebLedgerClient({hostname, strictSSL: false});

    return (async () => {
      // there is no benefit in running these in parallel
      const endpoint = await client.getServiceEndpoint(
        {serviceId: 'ledgerOperationService'});
      const targetNode = await client.getTargetNode();
      return {endpoint, targetNode};
    })();
  });
  return Promise.all(promises);
};
