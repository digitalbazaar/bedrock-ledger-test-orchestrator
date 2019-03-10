/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import axios from 'axios';

export default class OrchestratorService {
  async addBattery({batteryConfig}) {
    const result = await axios.post('/orchestrator/battery', batteryConfig);
    console.log('SSSSSSS', result.status);
  }
}
