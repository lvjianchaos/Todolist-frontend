<script lang="ts" setup>
import { computed, nextTick, ref } from 'vue'
import { useRoute } from 'vue-router'
import UserAvatar from '@/components/UserAvatar.vue'
import { useListStore } from '@/stores/list'
import type { InputInstance } from 'element-plus'

const route = useRoute()
const listStore = useListStore()

const listId = computed<number | null>(() => {
  const idParam = route.params.id
  const id = typeof idParam === 'string' ? Number(idParam) : Number(Array.isArray(idParam) ? idParam[0] : idParam)
  return Number.isNaN(id) ? null : id
})

const isRenaming = ref(false)
const renamingValue = ref('')
const renamingInputRef = ref<InputInstance>()

const listName = computed(() => {
  if (listId.value === null) return '清单'
  return listStore.findListNameById(listId.value) ?? '清单'
})

async function startRename(): Promise<void> {
  if (listId.value === null) return
  isRenaming.value = true
  renamingValue.value = listName.value
  await nextTick()
  renamingInputRef.value?.focus()
}

function cancelRename(): void {
  isRenaming.value = false
  renamingValue.value = ''
}

function confirmRename(): void {
  if (listId.value === null) {
    cancelRename()
    return
  }

  const name = renamingValue.value.trim()
  if (!name) {
    cancelRename()
    return
  }

  void listStore.renameList(listId.value, name).catch((error: unknown) => {
    ElMessage.error(error instanceof Error ? error.message : '重命名清单失败')
  })

  cancelRename()
}
</script>

<template>
  <el-header>
    <div class="title">
      <el-icon><IEpTickets /></el-icon>
      <el-input
        v-if="isRenaming"
        ref="renamingInputRef"
        v-model="renamingValue"
        @keyup.enter="confirmRename"
        @keyup.esc="cancelRename"
        @blur="confirmRename"
        @click.stop
      />
      <span
        v-else
        class="title-text"
        role="button"
        tabindex="0"
        @click="startRename"
        @keyup.enter.space="startRename"
      >
        {{ listName }}
      </span>
    </div>
    <div class="avatar"><UserAvatar /></div>
  </el-header>
</template>

<style lang="scss" scoped>
.el-header {
  height: 60px;
  font-size: 20px;
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

  .title-text {
    cursor: pointer;
    user-select: none;
  }

  .title-text:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
    border-radius: 6px;
  }

  .avatar {
    padding-right: 1em;
  }
}
</style>
