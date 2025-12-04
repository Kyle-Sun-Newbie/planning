<template>
  <CesiumViewer />
</template>

<script setup lang="ts">
import CesiumViewer from './components/CesiumViewer.vue'
</script>

<style>
/* 让 body、html、#app 都占满屏，避免出现空白 */
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}
</style>
