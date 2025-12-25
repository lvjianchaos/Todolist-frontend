<script lang="ts" setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { InputInstance } from 'element-plus'
import { storeToRefs } from 'pinia'
import draggable from 'vuedraggable'
import type { SortableEvent } from 'sortablejs'
import { useListStore, type ListGroup } from '@/stores/list'

const router = useRouter()
const route = useRoute()

const listStore = useListStore()
const { listGroup } = storeToRefs(listStore)

onMounted(() => {
  void listStore.fetchListGroups().catch(() => undefined)
})

// 顶部菜单选中态
const topActiveIndex = computed<string>(() => {
  if (route.path.startsWith('/all-task')) return '1'
  if (route.path.startsWith('/activity-record')) return '2'
  return ''
})

// 侧边清单菜单选中态
const listActiveIndex = computed<string>(() => {
  if (!route.path.startsWith('/task-list/')) return ''
  const id = String(route.params.id ?? '')
  return id ? `list-${id}` : ''
})

// 菜单展开/收起事件
const handleOpen = (key: string, keyPath: string[]) => {
  ElMessage.info(`open: ${key}, ${keyPath}`)
}
const handleClose = (key: string, keyPath: string[]) => {
  ElMessage.info(`close: ${key}, ${keyPath}`)
}

// 菜单选择事件
function handleSelect(index: string): void {
  if (index === '1') {
    void router.push('/all-task')
    return
  }

  if (index === '2') {
    void router.push('/activity-record')
  }
}

// 回到首页
async function goHome(): Promise<void> {
  await router.push('/')
}



// 菜单组件暴露的方法接口
interface MenuExpose {
  open: (index: string) => void
}

// 菜单组件引用
const listMenuRef = ref<MenuExpose>()

// 编辑分组状态
const editingGroupId = ref<number | null>(null)
const editingGroupName = ref('')
const editingGroupInputRef = ref<InputInstance>()

// 创建清单状态
const creatingListGroupId = ref<number | null>(null)
const newListName = ref('')
const newListInputRef = ref<InputInstance>()

// 编辑清单状态
const editingListId = ref<number | null>(null)
const editingListName = ref('')
const editingListInputRef = ref<InputInstance>()

// 处理分组拖拽结束事件
function handleGroupDragEnd(evt: SortableEvent): void {
  const newIndex = evt.newIndex
  if (newIndex === undefined || newIndex === null) return

  const moved = listGroup.value[newIndex]
  if (!moved) return
  const prevId = newIndex > 0 ? listGroup.value[newIndex - 1]?.id ?? null : null
  const nextId = newIndex < listGroup.value.length - 1 ? listGroup.value[newIndex + 1]?.id ?? null : null
  listStore.reorderGroup(moved.id, { prevId, nextId })
}

// 处理清单拖拽结束事件
function handleListDragEnd(groupId: number, evt: SortableEvent): void {
  const newIndex = evt.newIndex
  if (newIndex === undefined || newIndex === null) return

  const group = getGroupById(groupId)
  if (!group) return

  const moved = group.list[newIndex]
  if (!moved) return
  const prevId = newIndex > 0 ? group.list[newIndex - 1]?.id ?? null : null
  const nextId = newIndex < group.list.length - 1 ? group.list[newIndex + 1]?.id ?? null : null
  listStore.reorderList(groupId, moved.id, { prevId, nextId })
}

// 根据分组ID获取分组
function getGroupById(groupId: number): ListGroup | undefined {
  return listGroup.value.find((g) => g.id === groupId)
}

// 获取所有清单ID
function getAllListIds(): number[] {
  const ids: number[] = []
  for (const group of listGroup.value) {
    for (const item of group.list) ids.push(item.id)
  }
  return ids
}

// 分组操作函数
async function startRenameGroup(groupId: number): Promise<void> {
  const group = getGroupById(groupId)
  if (!group) return

  editingGroupId.value = groupId
  editingGroupName.value = group.name
  await nextTick()
  editingGroupInputRef.value?.focus()
}

// 取消重命名分组
function cancelRenameGroup(): void {
  editingGroupId.value = null
  editingGroupName.value = ''
}

// 确认重命名分组
function confirmRenameGroup(): void {
  if (editingGroupId.value === null) return
  const group = getGroupById(editingGroupId.value)
  if (!group) {
    cancelRenameGroup()
    return
  }

  const name = editingGroupName.value.trim()
  if (name) {
    void listStore.renameGroup(editingGroupId.value, name).catch((error: unknown) => {
      ElMessage.error(error instanceof Error ? error.message : '重命名分组失败')
    })
  }
  cancelRenameGroup()
}

// 删除分组
async function deleteGroup(groupId: number): Promise<void> {
  const group = listGroup.value.find((g) => g.id === groupId)
  if (!group) return

  try {
    await ElMessageBox.confirm(
      `确认删除分组“${group.name}”吗？该分组下的清单与任务也会被移除。`,
      '删除确认',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }

  await listStore.deleteGroup(groupId).catch((error: unknown) => {
    ElMessage.error(error instanceof Error ? error.message : '删除分组失败')
  })

  const allListIds = new Set(getAllListIds())
  if (route.path.startsWith('/task-list/')) {
    const id = Number(route.params.id)
    if (!Number.isNaN(id) && !allListIds.has(id)) {
      void router.push('/all-task')
    }
  }
}

// 清单操作函数
async function startCreateList(groupId: number): Promise<void> {
  creatingListGroupId.value = groupId
  newListName.value = ''

  const groupIndex = `group-${groupId}`
  listMenuRef.value?.open(groupIndex)
  await nextTick()
  newListInputRef.value?.focus()
}

// 取消创建清单
function cancelCreateList(): void {
  creatingListGroupId.value = null
  newListName.value = ''
}

// 确认创建清单
function confirmCreateList(): void {
  if (creatingListGroupId.value === null) return
  const group = getGroupById(creatingListGroupId.value)
  if (!group) {
    cancelCreateList()
    return
  }

  const name = newListName.value.trim()
  if (!name) {
    cancelCreateList()
    return
  }

  void listStore.createList(creatingListGroupId.value, name).catch((error: unknown) => {
    ElMessage.error(error instanceof Error ? error.message : '创建清单失败')
  })

  cancelCreateList()
}

// 开始重命名清单
async function startRenameList(listId: number, currentName: string): Promise<void> {
  editingListId.value = listId
  editingListName.value = currentName
  await nextTick()
  editingListInputRef.value?.focus()
}

// 取消重命名清单
function cancelRenameList(): void {
  editingListId.value = null
  editingListName.value = ''
}

// 确认重命名清单
function confirmRenameList(): void {
  if (editingListId.value === null) return
  const name = editingListName.value.trim()
  if (!name) {
    cancelRenameList()
    return
  }

  void listStore.renameList(editingListId.value, name).catch((error: unknown) => {
    ElMessage.error(error instanceof Error ? error.message : '重命名清单失败')
  })

  cancelRenameList()
}

// 删除清单
async function deleteList(listId: number): Promise<void> {
  let targetName = ''
  for (const group of listGroup.value) {
    const item = group.list.find((i) => i.id === listId)
    if (item) {
      targetName = item.name
      break
    }
  }

  try {
    await ElMessageBox.confirm(
      targetName ? `确认删除清单“${targetName}”吗？其下所有任务也会被移除。` : '确认删除该清单吗？其下所有任务也会被移除。',
      '删除确认',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }

  await listStore.deleteList(listId).catch((error: unknown) => {
    ElMessage.error(error instanceof Error ? error.message : '删除清单失败')
  })

  if (route.path === `/task-list/${listId}`) {
    void router.push('/')
  }
}

// 处理清单选择事件
function handleListSelect(index: string): void {
  if (!index.startsWith('list-')) return
  const id = index.slice('list-'.length)
  if (!id) return
  void router.push(`/task-list/${id}`)
}

// 创建分组状态
const isCreatingGroup = ref(false)
const newGroupName = ref('')
const newGroupInputRef = ref<InputInstance>()

// 拖拽禁用状态
const dragDisabled = computed<boolean>(() => {
  return (
    editingGroupId.value !== null ||
    editingListId.value !== null ||
    creatingListGroupId.value !== null ||
    isCreatingGroup.value
  )
})

// 开始创建分组
async function startCreateGroup(): Promise<void> {
  isCreatingGroup.value = true
  await nextTick()
  newGroupInputRef.value?.focus()
}

// 取消创建分组
function cancelCreateGroup(): void {
  isCreatingGroup.value = false
  newGroupName.value = ''
}

// 确认创建分组
function confirmCreateGroup(): void {
  const name = newGroupName.value.trim()
  if (!name) {
    cancelCreateGroup()
    return
  }

  void listStore.createGroup(name).catch((error: unknown) => {
    ElMessage.error(error instanceof Error ? error.message : '创建分组失败')
  })

  cancelCreateGroup()
}
</script>

<template>
  <el-aside>
    <div class="title" role="button" tabindex="0" @click="goHome" @keyup.enter.space="goHome">
      <el-icon size="larger"><IEpOdometer /></el-icon>
      <span>智能任务</span>
    </div>

    <el-menu
      class="el-menu-vertical"
      :default-active="topActiveIndex"
      @open="handleOpen"
      @close="handleClose"
      @select="handleSelect"
    >
      <el-menu-item index="1">
        <el-icon><IEpGrid /></el-icon>
        <span>全部任务</span>
      </el-menu-item>
      <el-menu-item index="2">
        <el-icon><IEpShare /></el-icon>
        <span>动态记录</span>
      </el-menu-item>
    </el-menu>

    <el-divider />

    <el-scrollbar class="list-scrollbar">
      <el-menu
        ref="listMenuRef"
        class="el-menu-vertical el-menu-list-group"
        :default-active="listActiveIndex"
        @select="handleListSelect"
      >
        <draggable
          v-model="listGroup"
          item-key="id"
          tag="div"
          class="draggable-group-container"
          :animation="150"
          :disabled="dragDisabled"
          handle=".drag-handle"
          @end="handleGroupDragEnd"
        >
          <template #item="{ element: group }">
            <el-sub-menu :key="group.id" :index="`group-${group.id}`">
              <template #title>
                <div class="group-title-row">
                  <div class="group-title-left">
                    <el-icon class="group-leading-icon drag-handle"><IEpFolder /></el-icon>
                    <el-input
                      v-if="editingGroupId === group.id"
                      ref="editingGroupInputRef"
                      v-model="editingGroupName"
                      size="large"
                      @keyup.enter="confirmRenameGroup"
                      @keyup.esc="cancelRenameGroup"
                      @blur="confirmRenameGroup"
                      @click.stop
                    />
                    <span v-else class="group-title-text drag-handle">{{ group.name }}</span>
                  </div>

                  <div class="group-title-actions" @click.stop>
                    <el-icon class="action-icon" @click.stop="startCreateList(group.id)"><IEpPlus /></el-icon>
                    <el-dropdown
                      trigger="click"
                      @command="(cmd) => {
                        if (cmd === 'rename') void startRenameGroup(group.id)
                        if (cmd === 'delete') void deleteGroup(group.id)
                      }"
                    >
                      <span class="dropdown-trigger" @click.stop>
                        <el-icon class="action-icon"><IEpMoreFilled /></el-icon>
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="rename">重命名分组</el-dropdown-item>
                          <el-dropdown-item command="delete">删除分组</el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </div>
              </template>

              <el-menu-item
                v-if="creatingListGroupId === group.id"
                :index="`creating-list-${group.id}`"
                disabled
              >
                <el-input
                  ref="newListInputRef"
                  v-model="newListName"
                  size="large"
                  placeholder="新建清单"
                  @keyup.enter="confirmCreateList"
                  @keyup.esc="cancelCreateList"
                  @blur="confirmCreateList"
                  @click.stop
                />
              </el-menu-item>

              <draggable
                v-model="group.list"
                item-key="id"
                tag="div"
                class="draggable-list-container"
                :animation="150"
                :disabled="dragDisabled"
                handle=".drag-handle"
                :group="{ name: `list-${group.id}`, pull: false, put: false }"
                @end="handleListDragEnd(group.id, $event)"
              >
                <template #item="{ element: item }">
                  <el-menu-item :key="item.id" :index="`list-${item.id}`" :disabled="editingListId === item.id">
                    <div class="list-item-row">
                      <div class="list-item-left">
                        <el-icon class="list-leading-icon drag-handle"><IEpTickets /></el-icon>
                        <el-input
                          v-if="editingListId === item.id"
                          ref="editingListInputRef"
                          v-model="editingListName"
                          size="large"
                          @keyup.enter="confirmRenameList"
                          @keyup.esc="cancelRenameList"
                          @blur="confirmRenameList"
                          @click.stop
                        />
                        <span v-else class="list-item-text drag-handle">{{ item.name }}</span>
                      </div>

                      <el-dropdown
                        trigger="click"
                        @command="(cmd) => {
                          if (cmd === 'rename') void startRenameList(item.id, item.name)
                          if (cmd === 'delete') void deleteList(item.id)
                        }"
                      >
                        <span class="dropdown-trigger" @click.stop>
                          <el-icon class="action-icon"><IEpMoreFilled /></el-icon>
                        </span>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item command="rename">重命名清单</el-dropdown-item>
                            <el-dropdown-item command="delete">删除清单</el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                    </div>
                  </el-menu-item>
                </template>
              </draggable>
            </el-sub-menu>
          </template>
        </draggable>
      </el-menu>
    </el-scrollbar>
    <div class="create-group">
      <el-input
        v-if="isCreatingGroup"
        ref="newGroupInputRef"
        v-model="newGroupName"
        size="large"
        placeholder="+ 新建分组"
        @keyup.enter="confirmCreateGroup"
        @keyup.esc="cancelCreateGroup"
        @blur="confirmCreateGroup"
      />
      <el-button size="large" v-else text class="create-group-button" @click="startCreateGroup">
        <el-icon><IEpPlus /></el-icon>
        <span> 新建分组</span>
      </el-button>
    </div>
  </el-aside>
</template>

<style lang="scss" scoped>
.el-aside {
  border-top: 1px solid var(--el-border-color);
  border-right: 1px solid var(--el-border-color);
  width: 240px;
  padding: 20px 5px;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  .title {
    padding-left: 10px;
    display: flex;
    align-items: center;
    font-size: 20px;
    font-weight: 900;
    margin-bottom: 20px;
    cursor: pointer;
    user-select: none;
    color: var(--el-text-color-regular);
    transition:
      transform 180ms ease,
      text-shadow 180ms ease,
      filter 180ms ease;
    transform-origin: left center;
    text-shadow:
      0 0 6px color-mix(in srgb, var(--el-color-white) 40%, transparent),
      0 0 14px color-mix(in srgb, var(--el-color-white) 20%, transparent);

    :deep(.el-icon) {
      filter:
        drop-shadow(0 0 6px color-mix(in srgb, var(--el-color-white) 35%, transparent))
        drop-shadow(0 0 14px color-mix(in srgb, var(--el-color-white) 18%, transparent));
      transition: filter 180ms ease, transform 180ms ease;
    }

    &:hover {
      transform: scale(1.04);
      text-shadow:
        0 0 10px color-mix(in srgb, var(--el-color-white) 55%, transparent),
        0 0 22px color-mix(in srgb, var(--el-color-white) 35%, transparent);

      :deep(.el-icon) {
        filter:
          drop-shadow(0 0 10px color-mix(in srgb, var(--el-color-white) 50%, transparent))
          drop-shadow(0 0 22px color-mix(in srgb, var(--el-color-white) 30%, transparent));
        transform: scale(1.06);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;
      :deep(.el-icon) {
        transition: none;
      }
      &:hover {
        transform: none;
        :deep(.el-icon) {
          transform: none;
        }
      }
    }

    &:focus-visible {
      outline: 2px solid var(--el-color-primary);
      outline-offset: 2px;
      border-radius: 6px;
    }

    span {
      margin-left: 10px;
      font-size: 24px;
      font-family:'Courier New', Courier, monospace;
    }
  }
  .el-menu-vertical {
    border-right: none;
    .el-menu-item {
      font-size: 14px;
      border-radius: 10px;
      :deep(.el-icon) {
        margin-right: 10px;
      }
      // 选中态
      &.is-active {
        background-color: var(--el-color-primary-light-9);
      }
    }
  }

  .el-menu-list-group {
    flex: 1;
    min-height: 0;
  }

  .list-scrollbar {
    flex: 1;
    min-height: 0;
  }

  .group-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 8px;
  }

  .group-title-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .group-leading-icon {
    color: var(--el-color-primary);
    flex: 0 0 auto;
    font-size: 16px;
  }

  .group-title-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 15px;
    font-weight: 500;
  }

  .draggable-group-container,
  .draggable-list-container {
    width: 100%;
  }

  .drag-handle {
    cursor: grab;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .group-title-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .list-item-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 8px;
  }

  .list-item-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .list-leading-icon {
    color: currentColor;
    flex: 0 0 auto;
  }

  .list-item-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropdown-trigger {
    display: inline-flex;
    align-items: center;
  }

  .action-icon {
    font-size: 14px;
    color: var(--el-text-color-regular);
  }

  .action-icon:hover {
    color: var(--el-color-primary);
  }

  .create-group {
    margin-top: 8px;
    padding: 0 10px;
  }

  .create-group-button {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
