/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const email = require('emailjs/email');
const {promisify} = require('util');
const serverInfo = require('./email-server-info.json');

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

exports.send = async ({text}) => {
  const server 	= email.server.connect(serverInfo);
  const send = promisify(server.send).bind(server);
  try {
    await send({
      text,
      from: 'mcollier@digitalbazaar.com',
      to: 'collier.matthew@gmail.com',
      subject: '[Bedrock Ledger Test Orchestrator] Alarm'
    });
  } catch(e) {
    console.log('ERROR SENDING EMAIL', e);
  }
};
