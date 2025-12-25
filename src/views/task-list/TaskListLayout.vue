<script lang="ts" setup>
import { ref } from 'vue'
import TaskListHeader from '@/views/task-list/TaskListHeader.vue'
import TaskListMain from '@/views/task-list/TaskListMain.vue'
import TaskListActivity from '@/views/task-list/TaskListActivity.vue'

type TabName = 'list' | 'activity'
const activeTab = ref<TabName>('list')
</script>

<template>
  <el-container class="common-layout">
    <TaskListHeader />
    <div class="task-tabs">
      <el-tabs v-model="activeTab" class="task-tabs__inner">
        <el-tab-pane name="list">
          <template #label>
            <span class="tab-label">
              <el-icon class="tab-icon"><IEpTickets /></el-icon>
              <span>列表</span>
            </span>
          </template>
        </el-tab-pane>
        <el-tab-pane name="activity">
          <template #label>
            <span class="tab-label">
              <el-icon class="tab-icon"><IEpShare /></el-icon>
              <span>动态</span>
            </span>
          </template>
        </el-tab-pane>
      </el-tabs>
    </div>

    <TaskListMain v-if="activeTab === 'list'" />
    <TaskListActivity v-else />
  </el-container>
</template>

<style lang="scss" scoped>
.common-layout {
  height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.task-tabs {
  padding: 0 24px;
  border-bottom: 1px solid var(--el-border-color);
}

.task-tabs__inner {
  :deep(.el-tabs__header) {
    margin: 0;
  }
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tab-icon {
  color: currentColor;
}
</style>
