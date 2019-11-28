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
    <h5>Popular Flavors</h5>
    <ul>
      <li>14cb1106-0d17-48d4-9b85-90d743ccae06 - 2/4/8</li>
      <li>fcf01d72-b247-453b-bdaf-e5f2dcd191ef - 4/8/16</li>
      <li>eb27c270-edaf-4af8-afe9-66e05f5a7f16 - 8/8/16</li>
      <li>c778586b-bc49-4cb5-9c92-d32cb3b8700c - 16/16/16</li>
    </ul>
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
    duration: 1800000
  },
  operationsPerSecond: {
    startCount: 100,
    endCount: 100,
  },
  dockerTag: 'latest',
  flavor: '14cb1106-0d17-48d4-9b85-90d743ccae06',
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
