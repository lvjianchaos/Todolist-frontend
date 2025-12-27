<script lang="ts" setup>
import { computed, nextTick, onMounted, provide, reactive, ref, watch } from 'vue'
import type { InputInstance } from 'element-plus'
import type { SortDir, TaskDto, TaskFilter, TaskGroupDto, TaskPriority, TaskSortKey } from '@/api/tasks/types'
import { useListStore } from '@/stores/list'
import { fetchTaskGroups } from '@/api/tasks/taskGroupsApi'
import { createTask, deleteTask, fetchChildren, fetchMyRootTasks, moveTask, patchTask } from '@/api/tasks/tasksApi'
import AllTaskTreeNode from './AllTaskTreeNode.vue'
import { taskTreeContextKey, type DateField, type EditingDate, type Id, type TaskMenuCommand } from '@/views/task-list/taskTreeContext'

const listStore = useListStore()

const filter = ref<TaskFilter>('all')
const sortKey = ref<TaskSortKey>('createdAt')
const sortDir = ref<SortDir>('desc')

const rootTasks = ref<TaskDto[]>([])
const rootLoading = ref(false)

const childrenByParentId = reactive<Record<Id, TaskDto[]>>({})
const childrenLoading = ref<Set<Id>>(new Set())
const expandedTaskIds = ref<Set<Id>>(new Set())

const creatingSubtaskParentId = ref<Id | null>(null)
const creatingSubtaskName = ref('')

const editingTaskId = ref<Id | null>(null)
const editingTaskName = ref('')

const editingDate = ref<EditingDate>(null)

const drawerOpen = ref(false)
const drawerTaskId = ref<Id | null>(null)

const editingContentTaskId = ref<Id | null>(null)
const editingContentValue = ref('')
const editingContentInputRef = ref<InputInstance>()

const drawerBelongListId = ref<Id | null>(null)
const drawerBelongGroupId = ref<Id | null>(null)

const taskGroupsByListId = reactive<Record<Id, TaskGroupDto[]>>({})

const taskIndex = computed<Record<Id, TaskDto>>(() => {
  const map: Record<number, TaskDto> = {}
  for (const task of rootTasks.value) map[task.id] = task
  for (const list of Object.values(childrenByParentId)) {
    if (!Array.isArray(list)) continue
    for (const task of list) map[task.id] = task
  }
  return map
})

const drawerTask = computed<TaskDto | null>(() => {
  if (drawerTaskId.value == null) return null
  return taskIndex.value[drawerTaskId.value] ?? null
})

const allLists = computed(() => {
  return listStore.listGroup.flatMap((g) => g.list)
})

const drawerGroupOptions = computed<TaskGroupDto[]>(() => {
  const listId = drawerBelongListId.value
  if (listId == null) return []
  return taskGroupsByListId[listId] ?? []
})

const drawerDirectChildren = computed<TaskDto[]>(() => {
  const task = drawerTask.value
  if (!task) return []
  return childrenByParentId[task.id] ?? []
})

function normalizeTaskOrderInPlace(tasks: TaskDto[]): void {
  tasks.sort((a, b) => a.sortOrder - b.sortOrder)
}

function getLastSortOrder(items: Array<{ sortOrder: number }>): number {
  if (!items.length) return 0
  return items[items.length - 1]?.sortOrder ?? 0
}

function closeDrawer(): void {
  drawerOpen.value = false
  drawerTaskId.value = null
  editingContentTaskId.value = null
  editingContentValue.value = ''
  cancelCreateSubtask()
}

async function startEditContent(task: TaskDto): Promise<void> {
  editingContentTaskId.value = task.id
  editingContentValue.value = task.content ?? ''
  await nextTick()
  editingContentInputRef.value?.focus()
}

function cancelEditContent(): void {
  editingContentTaskId.value = null
  editingContentValue.value = ''
}

function confirmEditContent(task: TaskDto): void {
  if (editingContentTaskId.value !== task.id) return
  const raw = editingContentValue.value
  const next = raw.trim()
  const nextContent = next ? raw : null
  const prev = {
    content: task.content,
    updatedAt: task.updatedAt,
  }

  task.content = nextContent
  task.updatedAt = new Date().toISOString()

  void patchTask(task.id, { content: nextContent })
    .then((updated) => Object.assign(task, updated))
    .catch(() => Object.assign(task, prev))
    .finally(cancelEditContent)
}

function formatDate(date: string | null): string {
  return date ? date : '—'
}

function priorityLabel(p: number): string {
  if (p === 3) return '高'
  if (p === 2) return '中'
  if (p === 1) return '低'
  return '无'
}

function priorityTagType(p: number): 'danger' | 'warning' | 'success' | 'info' {
  if (p === 3) return 'danger'
  if (p === 2) return 'warning'
  if (p === 1) return 'success'
  return 'info'
}

function setPriority(task: TaskDto, priority: TaskPriority): void {
  const prev = {
    priority: task.priority,
    updatedAt: task.updatedAt,
  }

  task.priority = priority
  task.updatedAt = new Date().toISOString()

  void patchTask(task.id, { priority })
    .then((updated) => Object.assign(task, updated))
    .catch(() => Object.assign(task, prev))
}

function statusDone(task: TaskDto): boolean {
  return task.status === 1
}

function isOverdue(task: TaskDto): boolean {
  if (!task.dueAt) return false
  if (statusDone(task)) return false
  const todayStr = new Date().toISOString().slice(0, 10)
  const dueDate = task.dueAt.slice(0, 10)
  return dueDate < todayStr
}

function compareNullableStringNullLastWithDir(a: string | null, b: string | null, dir: 1 | -1): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a.localeCompare(b) * dir
}

function sortTasksForView(tasks: TaskDto[]): TaskDto[] {
  const base = tasks.filter((t) => {
    if (filter.value === 'todo') return t.status === 0
    if (filter.value === 'done') return t.status === 1
    return true
  })

  const key = sortKey.value
  const dir: 1 | -1 = sortDir.value === 'asc' ? 1 : -1
  return base
    .slice()
    .sort((a, b) => {
      let cmp = 0
      if (key === 'startedAt') cmp = compareNullableStringNullLastWithDir(a.startedAt, b.startedAt, dir)
      if (key === 'dueAt') cmp = compareNullableStringNullLastWithDir(a.dueAt, b.dueAt, dir)
      if (key === 'createdAt') cmp = a.createdAt.localeCompare(b.createdAt) * dir
      if (key === 'updatedAt') cmp = a.updatedAt.localeCompare(b.updatedAt) * dir
      if (key === 'completedAt') cmp = compareNullableStringNullLastWithDir(a.completedAt, b.completedAt, dir)
      if (key === 'priority') cmp = (a.priority - b.priority) * dir

      if (cmp === 0) cmp = (a.sortOrder - b.sortOrder) * dir
      if (cmp === 0) cmp = a.id - b.id
      return cmp
    })
}

const rootTasksForView = computed<TaskDto[]>(() => sortTasksForView(rootTasks.value))

async function ensureChildrenLoaded(parentId: Id, templateTask: TaskDto): Promise<void> {
  if (childrenByParentId[parentId]) return
  if (childrenLoading.value.has(parentId)) return

  const loading = new Set(childrenLoading.value)
  loading.add(parentId)
  childrenLoading.value = loading

  try {
    void templateTask
    childrenByParentId[parentId] = await fetchChildren(parentId)
    normalizeTaskOrderInPlace(childrenByParentId[parentId])
  } finally {
    const next = new Set(childrenLoading.value)
    next.delete(parentId)
    childrenLoading.value = next
  }
}

async function toggleTaskExpanded(task: TaskDto): Promise<void> {
  const set = new Set(expandedTaskIds.value)
  if (set.has(task.id)) {
    set.delete(task.id)
    expandedTaskIds.value = set
    return
  }

  set.add(task.id)
  expandedTaskIds.value = set

  if (task.hasChildren) {
    await ensureChildrenLoaded(task.id, task)
  }
}

function isTaskExpanded(taskId: Id): boolean {
  return expandedTaskIds.value.has(taskId)
}

function openDrawer(taskId: Id): void {
  drawerTaskId.value = taskId
  drawerOpen.value = true
}

function openDrawerFromBlank(task: TaskDto): void {
  if (editingTaskId.value === task.id) return
  openDrawer(task.id)
}

function toggleComplete(task: TaskDto): void {
  const prev = {
    status: task.status,
    completedAt: task.completedAt,
    updatedAt: task.updatedAt,
  }
  const nextStatus = task.status === 1 ? 0 : 1
  task.status = nextStatus
  task.completedAt = nextStatus === 1 ? new Date().toISOString() : null
  task.updatedAt = new Date().toISOString()

  void patchTask(task.id, { status: task.status })
    .then((updated) => Object.assign(task, updated))
    .catch(() => Object.assign(task, prev))
}

function startEditDate(taskId: Id, field: DateField): void {
  editingDate.value = { taskId, field }
}

function stopEditDate(): void {
  editingDate.value = null
}

function isEditingDate(taskId: Id, field: DateField): boolean {
  return editingDate.value?.taskId === taskId && editingDate.value?.field === field
}

function updateDate(task: TaskDto, field: DateField, value: string | null): void {
  const prev = {
    startedAt: task.startedAt,
    dueAt: task.dueAt,
    updatedAt: task.updatedAt,
  }

  task[field] = value
  task.updatedAt = new Date().toISOString()
  stopEditDate()

  const payload = field === 'startedAt' ? { startedAt: value } : { dueAt: value }
  void patchTask(task.id, payload)
    .then((updated) => Object.assign(task, updated))
    .catch(() => Object.assign(task, prev))
}

function onDateChange(task: TaskDto, field: DateField, evt: unknown): void {
  if (evt == null || evt === '') {
    updateDate(task, field, null)
    return
  }
  updateDate(task, field, String(evt))
}

function toggleDrawerComplete(): void {
  if (!drawerTask.value) return
  toggleComplete(drawerTask.value)
}

function onDrawerDateChange(field: DateField, evt: unknown): void {
  if (!drawerTask.value) return
  onDateChange(drawerTask.value, field, evt)
}

async function startEditTask(task: TaskDto): Promise<void> {
  editingTaskId.value = task.id
  editingTaskName.value = task.name
  await nextTick()
}

function cancelEditTask(): void {
  editingTaskId.value = null
  editingTaskName.value = ''
}

function confirmEditTask(task: TaskDto): void {
  if (editingTaskId.value !== task.id) return
  const name = editingTaskName.value.trim()
  if (!name) {
    cancelEditTask()
    return
  }

  void patchTask(task.id, { name })
    .then((updated) => Object.assign(task, updated))
    .finally(cancelEditTask)
}

function deleteTaskSubtree(taskId: Id): void {
  const children = childrenByParentId[taskId]
  if (Array.isArray(children)) {
    for (const child of children) deleteTaskSubtree(child.id)
  }
  delete childrenByParentId[taskId]

  const expanded = new Set(expandedTaskIds.value)
  if (expanded.delete(taskId)) expandedTaskIds.value = expanded
}

function removeTaskFromView(taskId: Id): boolean {
  const rootIdx = rootTasks.value.findIndex((t) => t.id === taskId)
  if (rootIdx >= 0) {
    rootTasks.value.splice(rootIdx, 1)
    deleteTaskSubtree(taskId)
    if (drawerTaskId.value === taskId) closeDrawer()
    return true
  }

  for (const parentIdStr of Object.keys(childrenByParentId)) {
    const parentId = Number(parentIdStr)
    const list = childrenByParentId[parentId]
    if (!Array.isArray(list)) continue
    const idx = list.findIndex((t) => t.id === taskId)
    if (idx < 0) continue
    list.splice(idx, 1)

    deleteTaskSubtree(taskId)
    if (drawerTaskId.value === taskId) closeDrawer()

    if (list.length === 0) {
      delete childrenByParentId[parentId]
      const parent = taskIndex.value[parentId]
      if (parent) parent.hasChildren = false
      const expanded = new Set(expandedTaskIds.value)
      expanded.delete(parentId)
      expandedTaskIds.value = expanded
    }
    return true
  }

  return false
}

function onTaskCommand(task: TaskDto, cmd: TaskMenuCommand): void {
  if (cmd === 'rename') {
    void startEditTask(task)
    return
  }
  if (cmd === 'delete') {
    void deleteTask(task.id, { cascade: true })
      .then(() => removeTaskFromView(task.id))
      .catch(() => undefined)
    return
  }
  if (cmd === 'newChild') {
    void startCreateSubtask(task)
  }
}

async function startCreateSubtask(parentTask: TaskDto): Promise<void> {
  if (!childrenByParentId[parentTask.id]) {
    if (parentTask.hasChildren) {
      await ensureChildrenLoaded(parentTask.id, parentTask)
    } else {
      childrenByParentId[parentTask.id] = []
    }
  }

  parentTask.hasChildren = true

  const set = new Set(expandedTaskIds.value)
  if (!set.has(parentTask.id)) {
    set.add(parentTask.id)
    expandedTaskIds.value = set
  }

  creatingSubtaskParentId.value = parentTask.id
  creatingSubtaskName.value = ''
  await nextTick()
}

function cancelCreateSubtask(): void {
  creatingSubtaskParentId.value = null
  creatingSubtaskName.value = ''
}

async function confirmCreateSubtask(parentTask: TaskDto): Promise<void> {
  if (creatingSubtaskParentId.value == null) return
  const name = creatingSubtaskName.value.trim()
  if (!name) {
    cancelCreateSubtask()
    return
  }

  const list = childrenByParentId[parentTask.id] ?? (childrenByParentId[parentTask.id] = [])

  const created = await createTask({
    listId: parentTask.listId,
    taskGroupId: parentTask.taskGroupId,
    parentId: parentTask.id,
    name,
    prevSortOrder: getLastSortOrder(list),
  })
  list.push(created)
  normalizeTaskOrderInPlace(list)

  parentTask.hasChildren = true

  cancelCreateSubtask()
}

async function ensureTaskGroupsLoaded(targetListId: Id): Promise<TaskGroupDto[]> {
  const cached = taskGroupsByListId[targetListId]
  if (Array.isArray(cached) && cached.length > 0) return cached

  const fetched = await fetchTaskGroups(targetListId)
  fetched.sort((a, b) => a.sortOrder - b.sortOrder)
  taskGroupsByListId[targetListId] = fetched
  return fetched
}

async function getDefaultGroupId(targetListId: Id): Promise<Id | null> {
  const g = taskGroupsByListId[targetListId] ?? (await ensureTaskGroupsLoaded(targetListId))
  return g.find((x) => x.isDefault)?.id ?? g[0]?.id ?? null
}

async function moveTaskToRoot(task: TaskDto, target: { listId: Id; taskGroupId: Id }): Promise<void> {
  const updated = await moveTask(task.id, { listId: target.listId, taskGroupId: target.taskGroupId, parentId: 0 })
  removeTaskFromView(task.id)
  rootTasks.value.push(updated)
}

async function onDrawerListChange(nextListId: Id): Promise<void> {
  const task = drawerTask.value
  if (!task) return
  drawerBelongListId.value = nextListId
  await ensureTaskGroupsLoaded(nextListId).catch(() => undefined)
  const targetGroupId = await getDefaultGroupId(nextListId)
  if (targetGroupId == null) return
  drawerBelongGroupId.value = targetGroupId

  if (nextListId === task.listId) return
  await moveTaskToRoot(task, { listId: nextListId, taskGroupId: targetGroupId })
}

async function onDrawerGroupChange(nextGroupId: Id): Promise<void> {
  const task = drawerTask.value
  if (!task) return
  drawerBelongGroupId.value = nextGroupId
  const listId = drawerBelongListId.value ?? task.listId
  if (nextGroupId === task.taskGroupId && task.parentId === 0 && listId === task.listId) return
  await moveTaskToRoot(task, { listId, taskGroupId: nextGroupId })
}

async function loadRootTasks(): Promise<void> {
  rootLoading.value = true
  try {
    const tasks = await fetchMyRootTasks({ parentId: 0 })
    rootTasks.value = tasks
  } finally {
    rootLoading.value = false
  }
}

const dragDisabled = computed<boolean>(() => {
  return (
    creatingSubtaskParentId.value !== null ||
    editingDate.value !== null ||
    editingTaskId.value !== null ||
    editingContentTaskId.value !== null
  )
})

function handleChildTaskDragEnd(): void {
  // AllTaskMain 不支持拖拽排序
}

provide(taskTreeContextKey, {
  sortKey,
  filter,

  childrenByParentId,
  childrenLoading,

  editingTaskId,
  editingTaskName,
  editingDate,
  creatingSubtaskParentId,
  creatingSubtaskName,

  dragDisabled,

  statusDone,
  isOverdue,
  formatDate,

  priorityLabel,
  priorityTagType,
  setPriority,

  openDrawerFromBlank,
  toggleComplete,

  startEditTask,
  confirmEditTask,
  cancelEditTask,

  startEditDate,
  isEditingDate,
  onDateChange,

  toggleTaskExpanded,
  isTaskExpanded,

  startCreateSubtask,
  confirmCreateSubtask,
  cancelCreateSubtask,

  onTaskCommand,

  ensureChildrenLoaded,
  sortTasksForView,

  handleChildTaskDragEnd,
})

onMounted(() => {
  void listStore.fetchListGroups().catch(() => undefined)
  void loadRootTasks().catch(() => undefined)
})

watch(
  drawerBelongListId,
  (next) => {
    if (next == null) return
    void ensureTaskGroupsLoaded(next).catch(() => undefined)
  },
  { immediate: false },
)

watch(
  drawerTaskId,
  (next) => {
    if (next == null) return
    const task = taskIndex.value[next]
    if (!task) return
    drawerBelongListId.value = task.listId
    drawerBelongGroupId.value = task.taskGroupId
    cancelEditContent()

    if (task.hasChildren) {
      void ensureChildrenLoaded(task.id, task)
    }
  },
  { immediate: false },
)
</script>

<template>
  <el-main class="task-main">
    <div class="toolbar">
      <div class="toolbar__left">
        <el-dropdown trigger="click" @command="(cmd) => (filter = cmd)">
          <el-button text class="toolbar-btn">
            <span v-if="filter === 'all'">全部任务</span>
            <span v-else-if="filter === 'todo'">未完成</span>
            <span v-else>已完成</span>
            <el-icon class="toolbar-icon"><IEpArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="all">全部任务</el-dropdown-item>
              <el-dropdown-item command="todo">未完成</el-dropdown-item>
              <el-dropdown-item command="done">已完成</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <el-dropdown
          trigger="click"
          @command="(cmd) => {
            if (cmd === 'toggle-dir') {
              sortDir = sortDir === 'asc' ? 'desc' : 'asc'
              return
            }
            sortKey = cmd
          }"
        >
          <el-button text class="toolbar-btn">
            <span>排序：</span>
            <span v-if="sortKey === 'startedAt'">开始时间</span>
            <span v-else-if="sortKey === 'dueAt'">截止时间</span>
            <span v-else-if="sortKey === 'createdAt'">创建时间</span>
            <span v-else-if="sortKey === 'updatedAt'">更新时间</span>
            <span v-else-if="sortKey === 'priority'">优先级</span>
            <span v-else>完成时间</span>
            <el-icon class="toolbar-icon" @click.stop="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"><IEpSort /></el-icon>
            <el-icon class="toolbar-icon"><IEpArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="startedAt">开始时间</el-dropdown-item>
              <el-dropdown-item command="dueAt">截止时间</el-dropdown-item>
              <el-dropdown-item command="createdAt">创建时间</el-dropdown-item>
              <el-dropdown-item command="updatedAt">更新时间</el-dropdown-item>
              <el-dropdown-item command="completedAt">完成时间</el-dropdown-item>
              <el-dropdown-item command="priority">优先级</el-dropdown-item>
              <el-dropdown-item divided command="toggle-dir">
                <span class="dropdown-row">
                  <span>切换顺序</span>
                  <el-icon v-if="sortDir === 'asc'"><IEpSortUp /></el-icon>
                  <el-icon v-else><IEpSortDown /></el-icon>
                </span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="table">
      <div class="table__header">
        <div class="col-title">任务标题</div>
        <div class="col-date">开始时间</div>
        <div class="col-date">截止时间</div>
        <div class="col-priority">优先级</div>
      </div>

      <el-scrollbar class="table__body">
        <div v-if="rootLoading" class="muted">加载中…</div>
        <div v-else-if="rootTasksForView.length === 0" class="muted">暂无任务</div>

        <div v-else class="task-list">
          <div v-for="task in rootTasksForView" :key="task.id" class="task-wrap">
            <AllTaskTreeNode :task="task" :depth="0" />
          </div>
        </div>
      </el-scrollbar>
    </div>

    <el-drawer v-model="drawerOpen" class="task-drawer" size="420px" direction="rtl" :with-header="false" @closed="closeDrawer">
      <el-scrollbar class="drawer__scroll" view-class="drawer__scroll-view">
        <div v-if="drawerTask" class="drawer">
          <div class="drawer__header">
            <div class="drawer__title-area" @click.stop>
              <div class="drawer__title" role="heading" aria-level="2">
                <el-icon class="drawer__title-icon"><IEpFinished /></el-icon>
                <span class="drawer__title-text">{{ drawerTask.name }}</span>
              </div>
            </div>

            <el-button class="drawer__complete" :type="statusDone(drawerTask) ? 'success' : 'primary'" @click="toggleDrawerComplete">
              <el-icon><IEpCircleCheck /></el-icon>
              <span>{{ statusDone(drawerTask) ? '标记未完成' : '标记完成' }}</span>
            </el-button>
          </div>

          <div class="drawer__section">
            <div class="drawer__row">
              <div class="drawer__label">开始时间</div>
              <el-date-picker
                :model-value="drawerTask.startedAt"
                type="date"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                clearable
                :editable="false"
                @update:model-value="onDrawerDateChange('startedAt', $event)"
              />
            </div>
            <div class="drawer__row">
              <div class="drawer__label">截止时间</div>
              <el-date-picker
                :model-value="drawerTask.dueAt"
                type="date"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                clearable
                :editable="false"
                @update:model-value="onDrawerDateChange('dueAt', $event)"
              />
            </div>
          </div>

          <div class="drawer__section">
            <div class="drawer__row drawer__row--top">
              <div class="drawer__belong">
                <div class="drawer__belong-item">
                  <div class="drawer__belong-label">清单</div>
                  <el-select
                    class="drawer__select"
                    filterable
                    placeholder="选择清单"
                    :model-value="drawerBelongListId ?? drawerTask.listId"
                    @update:model-value="onDrawerListChange($event)"
                  >
                    <el-option v-for="l in allLists" :key="l.id" :label="l.name" :value="l.id" />
                  </el-select>
                </div>
                <div class="drawer__belong-item">
                  <div class="drawer__belong-label">分组</div>
                  <el-select
                    class="drawer__select"
                    filterable
                    placeholder="选择分组"
                    :model-value="drawerBelongGroupId ?? drawerTask.taskGroupId"
                    @update:model-value="onDrawerGroupChange($event)"
                  >
                    <el-option v-for="g in drawerGroupOptions" :key="g.id" :label="g.name" :value="g.id" />
                  </el-select>
                </div>
              </div>
            </div>
          </div>

          <div class="drawer__section">
            <div class="drawer__section-title">任务详情</div>
            <el-input
              v-if="editingContentTaskId === drawerTask.id"
              ref="editingContentInputRef"
              v-model="editingContentValue"
              type="textarea"
              :autosize="{ minRows: 8, maxRows: 18 }"
              placeholder="填写任务详情"
              @keyup.esc.stop.prevent="cancelEditContent"
              @blur="confirmEditContent(drawerTask)"
            />
            <div v-else class="drawer__content" @click="() => void startEditContent(drawerTask!)">
              <span v-if="drawerTask.content" class="drawer__content-text">{{ drawerTask.content }}</span>
              <span v-else class="drawer__content-placeholder">点击填写任务详情</span>
            </div>
          </div>

          <div class="drawer__section">
            <div class="drawer__section-title">子任务</div>

            <div v-if="childrenLoading.has(drawerTask.id)" class="drawer__muted">加载中…</div>
            <div v-else-if="drawerDirectChildren.length === 0" class="drawer__muted">暂无子任务</div>
            <div v-else class="drawer__children">
              <div
                v-for="child in drawerDirectChildren"
                :key="child.id"
                class="drawer__child"
                :class="{ 'is-done': statusDone(child) }"
                @click.stop
              >
                <el-checkbox class="drawer__child-check" :model-value="statusDone(child)" @change="() => toggleComplete(child)" />
                <div class="drawer__child-name">{{ child.name }}</div>
              </div>
            </div>
          </div>

          <div class="drawer__section drawer__section--secondary">
            <div class="drawer__meta">
              <span class="drawer__meta-label">创建：</span>
              <span class="drawer__meta-value">{{ drawerTask.createdAt }}</span>
            </div>
            <div class="drawer__meta">
              <span class="drawer__meta-label">更新：</span>
              <span class="drawer__meta-value">{{ drawerTask.updatedAt }}</span>
            </div>
            <div class="drawer__meta">
              <span class="drawer__meta-label">完成：</span>
              <span class="drawer__meta-value">{{ drawerTask.completedAt ?? '—' }}</span>
            </div>
          </div>
        </div>
      </el-scrollbar>
    </el-drawer>
  </el-main>
</template>

<style lang="scss" scoped>
.task-main {
  display: flex;
  flex-direction: column;
  padding: 0;
  min-height: 0;
  height: 100%;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color);
}

.toolbar__left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-regular);
}

.toolbar-icon {
  color: currentColor;
}

.dropdown-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.table {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 16px 16px;
}

.table__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 0px 6px 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.table__body {
  flex: 1;
  min-height: 0;
  padding: 0 0 8px;
}

.table__body :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.task-list {
  display: flex;
  flex-direction: column;
}

.task-wrap {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.col-title {
  flex: 1;
  min-width: 0;
}

.table__header .col-title {
  /* 对齐任务行中：checkbox + 展开按钮(或占位) + gap */
  padding-left: 48px;
}

.col-date {
  width: 140px;
  display: flex;
  justify-content: flex-start;
}

.col-priority {
  width: 90px;
  display: flex;
  justify-content: flex-start;
}

.muted {
  padding: 12px 8px;
  color: var(--el-text-color-secondary);
}

.drawer {
  padding: 16px;
}

.task-drawer :deep(.el-drawer__body) {
  padding: 0;
  overflow: hidden;
}

.drawer__scroll {
  height: 100%;
}

.drawer__scroll :deep(.el-scrollbar__bar.is-vertical) {
  width: 6px;
}

.drawer__scroll :deep(.el-scrollbar__thumb) {
  border-radius: 8px;
  background-color: color-mix(in srgb, var(--el-text-color-secondary) 32%, transparent);
}

.drawer__scroll :deep(.el-scrollbar__thumb:hover) {
  background-color: color-mix(in srgb, var(--el-text-color-secondary) 45%, transparent);
}

.drawer__scroll-view {
  min-height: 100%;
}

.drawer__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.drawer__title-area {
  flex: 1;
  min-width: 0;
}

.drawer__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
  font-weight: 700;
  color: var(--el-color-primary);
  line-height: 1.25;
  cursor: default;
  user-select: text;
  text-shadow:
    0 0 10px color-mix(in srgb, var(--el-color-primary) 55%, transparent),
    0 0 18px color-mix(in srgb, var(--el-color-primary) 35%, transparent);
}

.drawer__title-icon {
  flex: 0 0 auto;
  font-size: 18px;
  color: var(--el-color-primary);
}

.drawer__title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer__complete {
  flex: 0 0 auto;
}

.drawer__section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--el-border-color-lighter);
}

.drawer__section-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.drawer__section--secondary {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.drawer__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.drawer__row--top {
  align-items: flex-start;
}

.drawer__label {
  width: 72px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.drawer__belong {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 10px;
}

.drawer__belong-item {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.drawer__belong-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.drawer__select {
  width: 100%;
}

.drawer__content {
  border: 1px dashed var(--el-border-color);
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  background: color-mix(in srgb, var(--el-bg-color) 92%, transparent);
  min-height: 160px;
}

.drawer__content-text {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--el-text-color-primary);
  font-size: 14px;
  line-height: 1.6;
}

.drawer__content-placeholder {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.drawer__muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.drawer__children {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.drawer__child {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--el-bg-color) 90%, transparent);
  color: var(--el-text-color-primary);
}

.drawer__child:hover {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}

.drawer__child.is-done {
  opacity: 0.75;
}

.drawer__child-check {
  flex: 0 0 auto;
}

.drawer__child-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.drawer__child.is-done .drawer__child-name {
  color: var(--el-text-color-secondary);
  text-decoration: line-through;
}

.drawer__meta-value {
  flex: 1;
  text-align: right;
  word-break: break-all;
}
</style>

