<template>
  <q-layout>
    <q-layout-header>
      <q-toolbar>
        <q-toolbar-title>
          Bedrock Ledger Test Orchestrator
        </q-toolbar-title>
      </q-toolbar>
    </q-layout-header>

    <q-page-container>
      <router-view />
    </q-page-container>

    <q-layout-footer />
  </q-layout>
</template>
<script>
export default {
  name: 'BrRoot'
};
</script>
<style>
</style>
