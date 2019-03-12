<template>
  <q-page
    class="column gutter-md background"
    padding>
    <h5>Test Battery Config</h5>
    <json-editor v-model="jsonData" />
    <q-btn
      color="primary"
      label="Submit"
      @click="submit" />
  </q-page>
</template>
<script>
/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import {JsonEditor} from 'vue-json-formatter-editor';
import OrchestratorService from './OrchestratorService.js';

const batteryTemplate = {
  description: '',
  ledgerNodes: {
    startCount: 4,
    endCount: 4,
  },
  stages: {
    count: 1,
    duration: 3600000
  },
  operationsPerSecond: {
    startCount: 1,
    endCount: 2,
  }
};

export default {
  name: 'Home',
  components: {JsonEditor},
  data: () => ({
    orchestratorService: null,
    jsonData: JSON.stringify(batteryTemplate),
  }),
  beforeCreate() {
  },
  mounted() {
    this.orchestratorService = new OrchestratorService();
  },
  methods: {
    async submit() {
      const batteryConfig = JSON.parse(this.jsonData);
      await this.orchestratorService.addBattery({batteryConfig});
    }
  }
};
</script>
<style>
</style>
