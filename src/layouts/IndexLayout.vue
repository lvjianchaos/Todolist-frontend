<script lang="ts" setup>
import MainAside from './IndexAside.vue';

</script>

<template>
  <div class="common-layout">
    <el-container class="layout-root">
      <MainAside />
      <el-container class="layout-content">
        <router-view />
      </el-container>
    </el-container>
  </div>
</template>

<style lang="scss" scoped>
.common-layout {
  height: 100vh;
  overflow: hidden;
}

.layout-root {
  height: 100%;
}

.layout-content {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
