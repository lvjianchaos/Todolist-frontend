<script lang="ts" setup>
import TaskListHeader from '@/views/task-list/TaskListHeader.vue'
import TaskListMain from '@/views/task-list/TaskListMain.vue'
</script>

<template>
  <el-container class="common-layout">
    <TaskListHeader />
    <TaskListMain />
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
