<script lang="ts" setup>
import AllTaskHeader from '@/views/all-task/AllTaskHeader.vue';
import AllTaskMain from '@/views/all-task/AllTaskMain.vue';
</script>

<template>
  <el-container class="common-layout">
    <AllTaskHeader />
    <AllTaskMain />
  </el-container>
</template>

<style lang="scss" scoped>
.common-layout {
  height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
}
</style>

