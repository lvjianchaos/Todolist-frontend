<script lang="ts" setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import UserAvatar from '@/components/UserAvatar.vue'
import { useListStore } from '@/stores/list'

const route = useRoute()
const listStore = useListStore()

const listName = computed(() => {
  const idParam = route.params.id
  const id = typeof idParam === 'string' ? Number(idParam) : Number(Array.isArray(idParam) ? idParam[0] : idParam)
  if (Number.isNaN(id)) return '清单'

  return listStore.findListNameById(id) ?? '清单'
})
</script>

<template>
  <el-header>
    <div class="title">
      <el-icon><IEpTickets /></el-icon>
      <span>{{ listName }}</span>
    </div>
    <div class="avatar"><UserAvatar /></div>
  </el-header>
</template>

<style lang="scss" scoped>
.el-header {
  height: 60px;
  font-size: 20px;
  border-top: 1px solid var(--el-border-color);
  border-bottom: 1px solid var(--el-border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  font-weight: 600;

  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--el-text-color-regular);
    text-shadow:
      0 0 6px color-mix(in srgb, var(--el-color-white) 40%, transparent),
      0 0 14px color-mix(in srgb, var(--el-color-white) 20%, transparent);

    :deep(.el-icon) {
      filter:
        drop-shadow(0 0 6px color-mix(in srgb, var(--el-color-white) 35%, transparent))
        drop-shadow(0 0 14px color-mix(in srgb, var(--el-color-white) 18%, transparent));
    }
  }

  .avatar {
    padding-right: 1em;
  }
}
</style>
