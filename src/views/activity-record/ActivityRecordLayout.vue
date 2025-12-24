<script lang="ts" setup>
import ActivityRecordHeader from './ActivityRecordHeader.vue';
import ActivityRecordMain from './ActivityRecordMain.vue';


</script>

<template>
  <el-container class="common-layout">
    <ActivityRecordHeader />
    <ActivityRecordMain />
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
