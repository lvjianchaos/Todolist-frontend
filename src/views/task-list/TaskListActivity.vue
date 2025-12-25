<script lang="ts" setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useListStore } from '@/stores/list'

const route = useRoute()
const listStore = useListStore()

const listId = computed<number | null>(() => {
  const idParam = route.params.id
  const id = typeof idParam === 'string' ? Number(idParam) : Number(Array.isArray(idParam) ? idParam[0] : idParam)
  return Number.isNaN(id) ? null : id
})

const listName = computed(() => {
  if (listId.value === null) return '清单'
  return listStore.findListNameById(listId.value) ?? '清单'
})
</script>

<template>
  <el-main>
    <div class="activity">
      <div class="activity__title">动态</div>
      <div class="activity__hint">展示“{{ listName }}”下的操作记录（待接入）</div>
    </div>
  </el-main>
</template>

<style lang="scss" scoped>
.activity {
  padding: 16px;
}

.activity__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
}

.activity__hint {
  color: var(--el-text-color-secondary);
}
</style>
