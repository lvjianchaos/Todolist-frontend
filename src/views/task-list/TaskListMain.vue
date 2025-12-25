<script lang="ts" setup>
import { computed, nextTick, onMounted, provide, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import draggable from 'vuedraggable'
import type { SortableEvent } from 'sortablejs'
import type { InputInstance } from 'element-plus'
import type { SortDir, TaskDto, TaskFilter, TaskGroupDto, TaskPriority, TaskSortKey } from '@/api/tasks/types'
import type { ReorderTaskGroupsDto, ReorderTasksDto } from '@/api/tasks/types'
import { useListStore } from '@/stores/list'
import { createTaskGroup, deleteTaskGroup, fetchTaskGroups, reorderTaskGroups, renameTaskGroup } from '@/api/tasks/taskGroupsApi'
import { createTask, deleteTask, fetchChildren, fetchTasks, moveTask, patchTask, reorderTasks } from '@/api/tasks/tasksApi'
import TaskTreeNode from './TaskTreeNode.vue'
import { taskTreeContextKey } from './taskTreeContext'

type Id = number

type DateField = 'startedAt' | 'dueAt'
type EditingDate = { taskId: Id; field: DateField } | null

type TaskMenuCommand = 'rename' | 'delete' | 'newChild'
type GroupMenuCommand = 'rename' | 'delete'

const route = useRoute()
const router = useRouter()
const listStore = useListStore()

const listId = computed<number | null>(() => {
  const idParam = route.params.id
  const id = typeof idParam === 'string' ? Number(idParam) : Number(Array.isArray(idParam) ? idParam[0] : idParam)
  return Number.isNaN(id) ? null : id
})

const filter = ref<TaskFilter>('all')
const sortKey = ref<TaskSortKey>('custom')
const sortDir = ref<SortDir>('asc')

const groups = ref<TaskGroupDto[]>([])
const collapsedGroupIds = ref<Set<Id>>(new Set())

const rootTasksByGroupId = reactive<Record<Id, TaskDto[]>>({})
const childrenByParentId = reactive<Record<Id, TaskDto[]>>({})
const childrenLoading = ref<Set<Id>>(new Set())
const expandedTaskIds = ref<Set<Id>>(new Set())

const creatingTaskGroupId = ref<Id | null>(null)
const creatingTaskName = ref('')
const creatingTaskInputRef = ref<InputInstance>()

const creatingSubtaskParentId = ref<Id | null>(null)
const creatingSubtaskName = ref('')

const isCreatingGroup = ref(false)
const newGroupName = ref('')
const newGroupInputRef = ref<InputInstance>()

const editingGroupId = ref<Id | null>(null)
const editingGroupName = ref('')
const editingGroupInputRef = ref<InputInstance>()

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

type ListUiState = {
  collapsedGroupIds: Set<Id>
  expandedTaskIds: Set<Id>
}

const listUiStateCache = new Map<Id, ListUiState>()

const taskIndex = computed<Record<Id, TaskDto>>(() => {
  const map: Record<number, TaskDto> = {}
  for (const group of groups.value) {
    for (const task of rootTasksByGroupId[group.id] ?? []) map[task.id] = task
  }
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
  if (drawerBelongListId.value == null) return []
  return taskGroupsByListId[drawerBelongListId.value] ?? []
})

const drawerDirectChildren = computed<TaskDto[]>(() => {
  const task = drawerTask.value
  if (!task) return []
  return childrenByParentId[task.id] ?? []
})

function normalizeTaskOrderInPlace(tasks: TaskDto[]): void {
  tasks.sort((a, b) => a.sortOrder - b.sortOrder)
}

function clearReactiveRecord(record: Record<Id, unknown>): void {
  for (const key of Object.keys(record)) {
    delete record[Number(key)]
  }
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

function removeTaskFromView(taskId: Id): void {
  // 尝试从根任务列表移除
  for (const group of groups.value) {
    const list = rootTasksByGroupId[group.id]
    if (!list) continue
    const idx = list.findIndex((t) => t.id === taskId)
    if (idx < 0) continue
    list.splice(idx, 1)
    return
  }

  // 尝试从某个父任务的 children 列表移除
  for (const parentIdStr of Object.keys(childrenByParentId)) {
    const parentId = Number(parentIdStr)
    const list = childrenByParentId[parentId]
    if (!Array.isArray(list)) continue
    const idx = list.findIndex((t) => t.id === taskId)
    if (idx < 0) continue
    list.splice(idx, 1)

    if (list.length === 0) {
      delete childrenByParentId[parentId]
      const parent = taskIndex.value[parentId]
      if (parent) parent.hasChildren = false
      const expanded = new Set(expandedTaskIds.value)
      expanded.delete(parentId)
      expandedTaskIds.value = expanded
    }
    return
  }
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

function resetTransientUiState(): void {
  drawerOpen.value = false
  drawerTaskId.value = null
  editingContentTaskId.value = null
  editingContentValue.value = ''

  creatingTaskGroupId.value = null
  creatingTaskName.value = ''
  creatingSubtaskParentId.value = null
  creatingSubtaskName.value = ''

  isCreatingGroup.value = false
  newGroupName.value = ''

  editingGroupId.value = null
  editingGroupName.value = ''

  editingTaskId.value = null
  editingTaskName.value = ''

  editingDate.value = null
}

function saveCurrentListUiState(currentListId: Id | null): void {
  if (currentListId == null) return
  listUiStateCache.set(currentListId, {
    collapsedGroupIds: new Set(collapsedGroupIds.value),
    expandedTaskIds: new Set(expandedTaskIds.value),
  })
}

function restoreListUiState(targetListId: Id): void {
  const found = listUiStateCache.get(targetListId)
  collapsedGroupIds.value = new Set(found?.collapsedGroupIds ?? [])
  expandedTaskIds.value = new Set(found?.expandedTaskIds ?? [])
}

const listLoading = ref(false)

async function loadListData(targetListId: Id): Promise<void> {
  listLoading.value = true
  try {
    resetTransientUiState()

    const fetchedGroups = await ensureTaskGroupsLoaded(targetListId)
    groups.value = fetchedGroups.slice().sort((a, b) => a.sortOrder - b.sortOrder)

    clearReactiveRecord(rootTasksByGroupId)
    for (const group of groups.value) rootTasksByGroupId[group.id] = []

    const roots = await Promise.all(
      groups.value.map(async (g) => {
        const list = await fetchTasks({ listId: targetListId, taskGroupId: g.id, parentId: 0 })
        normalizeTaskOrderInPlace(list)
        return { groupId: g.id, list }
      })
    )

    for (const row of roots) {
      rootTasksByGroupId[row.groupId] = row.list
    }

    clearReactiveRecord(childrenByParentId)
    childrenLoading.value = new Set()

    restoreListUiState(targetListId)
  } finally {
    listLoading.value = false
  }
}

async function moveTaskToAnotherList(task: TaskDto, targetListId: Id): Promise<void> {
  const fromListId = listId.value
  if (fromListId == null) return
  if (targetListId === fromListId) return

  const targetGroupId = await getDefaultGroupId(targetListId)
  if (targetGroupId == null) return

  await moveTask(task.id, { listId: targetListId, taskGroupId: targetGroupId, parentId: 0 })
  removeTaskFromView(task.id)

  closeDrawer()
  await router.push({ path: `/task-list/${targetListId}` })
}

async function moveTaskToGroupInCurrentList(task: TaskDto, targetGroupId: Id): Promise<void> {
  if (listId.value == null) return
  if (task.taskGroupId === targetGroupId && task.parentId === 0) return

  const rootList = rootTasksByGroupId[targetGroupId] ?? (rootTasksByGroupId[targetGroupId] = [])
  const prevSortOrder = getLastSortOrder(rootList)
  const updated = await moveTask(task.id, {
    listId: listId.value,
    taskGroupId: targetGroupId,
    parentId: 0,
    prevSortOrder,
  })

  removeTaskFromView(task.id)
  rootList.push(updated)
  normalizeTaskOrderInPlace(rootList)
}

function onDrawerListChange(nextListId: Id): void {
  const task = drawerTask.value
  if (!task) return
  drawerBelongListId.value = nextListId

  if (listId.value == null) return
  if (nextListId === listId.value) return

  void moveTaskToAnotherList(task, nextListId)
}

function onDrawerGroupChange(nextGroupId: Id): void {
  const task = drawerTask.value
  if (!task) return
  drawerBelongGroupId.value = nextGroupId

  // 仅支持当前清单内改分组；跨清单移动时会落到目标清单默认分组
  if (drawerBelongListId.value !== listId.value) return
  void moveTaskToGroupInCurrentList(task, nextGroupId)
}

function getLastSortOrder(items: Array<{ sortOrder: number }>): number {
  if (!items.length) return 0
  return items[items.length - 1]?.sortOrder ?? 0
}

function inputGrowStyle(text: string): Record<string, string> {
  const minPx = 320
  const maxPx = 640
  const perCharPx = 14
  const paddingPx = 28
  const len = (text ?? '').length
  const raw = len * perCharPx + paddingPx
  const widthPx = Math.max(minPx, Math.min(maxPx, raw))
  return { minWidth: `${minPx}px`, width: `${widthPx}px`, maxWidth: `${maxPx}px` }
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
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const dueDate = task.dueAt.slice(0, 10)
  return dueDate < todayStr
}

function compareNullableString(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a.localeCompare(b)
}

function sortTasksForView(tasks: TaskDto[]): TaskDto[] {
  const base = tasks.filter((t) => {
    if (filter.value === 'todo') return t.status === 0
    if (filter.value === 'done') return t.status === 1
    return true
  })

  if (sortKey.value === 'custom') return base.slice().sort((a, b) => a.sortOrder - b.sortOrder)

  const key = sortKey.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  return base
    .slice()
    .sort((a, b) => {
      let cmp = 0
      if (key === 'startedAt') cmp = compareNullableString(a.startedAt, b.startedAt)
      if (key === 'dueAt') cmp = compareNullableString(a.dueAt, b.dueAt)
      if (key === 'createdAt') cmp = a.createdAt.localeCompare(b.createdAt)
      if (key === 'updatedAt') cmp = a.updatedAt.localeCompare(b.updatedAt)
      if (key === 'completedAt') cmp = compareNullableString(a.completedAt, b.completedAt)
      if (cmp === 0) cmp = a.sortOrder - b.sortOrder
      return cmp * dir
    })
}

function toggleGroupCollapsed(groupId: Id): void {
  const set = new Set(collapsedGroupIds.value)
  if (set.has(groupId)) set.delete(groupId)
  else set.add(groupId)
  collapsedGroupIds.value = set
}

function isGroupCollapsed(groupId: Id): boolean {
  return collapsedGroupIds.value.has(groupId)
}

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

  const payload = (field === 'startedAt' ? { startedAt: value } : { dueAt: value })
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

async function startEditGroup(group: TaskGroupDto): Promise<void> {
  if (group.isDefault) return
  editingGroupId.value = group.id
  editingGroupName.value = group.name
  await nextTick()
  editingGroupInputRef.value?.focus()
}

function cancelEditGroup(): void {
  editingGroupId.value = null
  editingGroupName.value = ''
}

function confirmEditGroup(group: TaskGroupDto): void {
  if (editingGroupId.value !== group.id) return
  const name = editingGroupName.value.trim()
  if (!name) {
    cancelEditGroup()
    return
  }

  void renameTaskGroup(group.id, { name })
    .then((updated) => Object.assign(group, updated))
    .finally(cancelEditGroup)
}

function deleteGroup(group: TaskGroupDto): void {
  if (group.isDefault) return
  void deleteTaskGroup(group.id)
    .then(() => {
      const idx = groups.value.findIndex((g) => g.id === group.id)
      if (idx >= 0) groups.value.splice(idx, 1)
      taskGroupsByListId[group.listId] = groups.value.slice()
      delete rootTasksByGroupId[group.id]

      const collapsed = new Set(collapsedGroupIds.value)
      collapsed.delete(group.id)
      collapsedGroupIds.value = collapsed
    })
    .catch(() => undefined)
}

function onGroupCommand(group: TaskGroupDto, cmd: GroupMenuCommand): void {
  if (cmd === 'rename') {
    void startEditGroup(group)
    return
  }
  if (cmd === 'delete') deleteGroup(group)
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

function removeTaskFromLists(taskId: Id): boolean {
  for (const group of groups.value) {
    const list = rootTasksByGroupId[group.id]
    if (!list) continue
    const idx = list.findIndex((t) => t.id === taskId)
    if (idx >= 0) {
      list.splice(idx, 1)

      deleteTaskSubtree(taskId)
      if (drawerTaskId.value === taskId) {
        drawerOpen.value = false
        drawerTaskId.value = null
      }
      return true
    }
  }

  for (const parentIdStr of Object.keys(childrenByParentId)) {
    const parentId = Number(parentIdStr)
    const list = childrenByParentId[parentId]
    if (!Array.isArray(list)) continue
    const idx = list.findIndex((t) => t.id === taskId)
    if (idx < 0) continue
    list.splice(idx, 1)

    deleteTaskSubtree(taskId)
    if (drawerTaskId.value === taskId) {
      drawerOpen.value = false
      drawerTaskId.value = null
    }

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
      .then(() => removeTaskFromLists(task.id))
      .catch(() => undefined)
    return
  }
  if (cmd === 'newChild') {
    void startCreateSubtask(task)
  }
}

async function startCreateTask(groupId: Id): Promise<void> {
  creatingTaskGroupId.value = groupId
  creatingTaskName.value = ''
  await nextTick()
  creatingTaskInputRef.value?.focus()
}

function cancelCreateTask(): void {
  creatingTaskGroupId.value = null
  creatingTaskName.value = ''
}

async function confirmCreateTask(): Promise<void> {
  if (listId.value == null) return
  const groupId = creatingTaskGroupId.value
  if (groupId == null) return
  const name = creatingTaskName.value.trim()
  if (!name) {
    cancelCreateTask()
    return
  }

  const list = rootTasksByGroupId[groupId] ?? (rootTasksByGroupId[groupId] = [])

  const created = await createTask({
    listId: listId.value,
    taskGroupId: groupId,
    parentId: 0,
    name,
    prevSortOrder: getLastSortOrder(list),
  })
  list.push(created)
  normalizeTaskOrderInPlace(list)

  cancelCreateTask()
}

async function startCreateSubtask(parentTask: TaskDto): Promise<void> {
  // 支持无限层级：确保 children 容器存在，并自动展开
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
  if (listId.value == null) return
  if (creatingSubtaskParentId.value == null) return
  const name = creatingSubtaskName.value.trim()
  if (!name) {
    cancelCreateSubtask()
    return
  }

  const list = childrenByParentId[parentTask.id] ?? (childrenByParentId[parentTask.id] = [])

  const created = await createTask({
    listId: listId.value,
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


async function startCreateGroup(): Promise<void> {
  isCreatingGroup.value = true
  newGroupName.value = ''
  await nextTick()
  newGroupInputRef.value?.focus()
}

function cancelCreateGroup(): void {
  isCreatingGroup.value = false
  newGroupName.value = ''
}

async function confirmCreateGroup(): Promise<void> {
  if (listId.value == null) return
  const name = newGroupName.value.trim()
  if (!name) {
    cancelCreateGroup()
    return
  }

  const created = await createTaskGroup({
    listId: listId.value,
    name,
    prevSortOrder: getLastSortOrder(groups.value),
  })
  groups.value.push(created)
  groups.value.sort((a, b) => a.sortOrder - b.sortOrder)
  taskGroupsByListId[listId.value] = groups.value.slice()
  rootTasksByGroupId[created.id] = []

  cancelCreateGroup()
}

function handleGroupDragEnd(evt: SortableEvent): void {
  if (sortKey.value !== 'custom') return
  if (evt.newIndex == null) return
  if (listId.value == null) return
  const idx = evt.newIndex
  const moved = groups.value[idx]
  if (!moved) return

  const prev = groups.value[idx - 1]
  const next = groups.value[idx + 1]

  const dto: ReorderTaskGroupsDto = {
    listId: listId.value,
    movedId: moved.id,
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
    prevSortOrder: prev?.sortOrder ?? 0,
    nextSortOrder: next?.sortOrder ?? 0,
  }

  void reorderTaskGroups(dto)
    .then((updated) => {
      if (updated) {
        updated.sort((a, b) => a.sortOrder - b.sortOrder)
        groups.value = updated
        taskGroupsByListId[listId.value!] = updated
      }
    })
    .catch(() => undefined)
}

function handleRootTaskDragEnd(groupId: Id, evt: SortableEvent): void {
  if (sortKey.value !== 'custom') return
  if (evt.newIndex == null) return
  if (listId.value == null) return
  const list = rootTasksByGroupId[groupId]
  if (!list) return

  const idx = evt.newIndex
  const moved = list[idx]
  if (!moved) return
  const prev = list[idx - 1]
  const next = list[idx + 1]

  const dto: ReorderTasksDto = {
    listId: listId.value,
    taskGroupId: groupId,
    parentId: 0,
    movedId: moved.id,
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
    prevSortOrder: prev?.sortOrder ?? 0,
    nextSortOrder: next?.sortOrder ?? 0,
  }

  void reorderTasks(dto)
    .then((updated) => {
      if (updated) {
        updated.sort((a, b) => a.sortOrder - b.sortOrder)
        rootTasksByGroupId[groupId] = updated
      }
    })
    .catch(() => undefined)
}

function handleChildTaskDragEnd(parentId: Id, evt: SortableEvent): void {
  if (evt.newIndex == null) return
  if (listId.value == null) return
  const list = childrenByParentId[parentId]
  if (!list) return

  const idx = evt.newIndex
  const moved = list[idx]
  if (!moved) return
  const prev = list[idx - 1]
  const next = list[idx + 1]

  const groupId = taskIndex.value[parentId]?.taskGroupId ?? moved.taskGroupId
  if (!groupId) return

  const dto: ReorderTasksDto = {
    listId: listId.value,
    taskGroupId: groupId,
    parentId,
    movedId: moved.id,
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
    prevSortOrder: prev?.sortOrder ?? 0,
    nextSortOrder: next?.sortOrder ?? 0,
  }

  void reorderTasks(dto)
    .then((updated) => {
      if (updated) {
        updated.sort((a, b) => a.sortOrder - b.sortOrder)
        childrenByParentId[parentId] = updated
      }
    })
    .catch(() => undefined)
}

const dragDisabled = computed<boolean>(() => {
  return (
    sortKey.value !== 'custom' ||
    creatingTaskGroupId.value !== null ||
    creatingSubtaskParentId.value !== null ||
    isCreatingGroup.value ||
    editingDate.value !== null ||
    editingGroupId.value !== null ||
    editingTaskId.value !== null ||
    editingContentTaskId.value !== null
  )
})

const draggableEnabled = computed<boolean>(() => {
  // 过滤/非自定义排序时，使用非拖拽渲染以保证列表顺序与过滤一致
  return sortKey.value === 'custom' && filter.value === 'all'
})

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
})

watch(
  listId,
  (next, prev) => {
    saveCurrentListUiState(prev ?? null)
    if (next == null) return
    void loadListData(next)
  },
  { immediate: true },
)

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
            <span v-if="sortKey === 'custom'">拖拽自定义</span>
            <span v-else-if="sortKey === 'startedAt'">开始时间</span>
            <span v-else-if="sortKey === 'dueAt'">截止时间</span>
            <span v-else-if="sortKey === 'createdAt'">创建时间</span>
            <span v-else-if="sortKey === 'updatedAt'">更新时间</span>
            <span v-else>完成时间</span>
            <el-icon v-if="sortKey !== 'custom'" class="toolbar-icon" @click.stop="sortDir = sortDir === 'asc' ? 'desc' : 'asc'">
              <IEpSort />
            </el-icon>
            <el-icon class="toolbar-icon"><IEpArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="custom">拖拽自定义</el-dropdown-item>
              <el-dropdown-item command="startedAt">开始时间</el-dropdown-item>
              <el-dropdown-item command="dueAt">截止时间</el-dropdown-item>
              <el-dropdown-item command="createdAt">创建时间</el-dropdown-item>
              <el-dropdown-item command="updatedAt">更新时间</el-dropdown-item>
              <el-dropdown-item command="completedAt">完成时间</el-dropdown-item>
              <el-dropdown-item v-if="sortKey !== 'custom'" divided command="toggle-dir">
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

      <div class="toolbar__right">
        <el-button text class="toolbar-btn" :disabled="listId === null" @click="() => void startCreateGroup()">
          <el-icon class="toolbar-icon"><IEpPlus /></el-icon>
          <span>新建分组</span>
        </el-button>
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

        <draggable
          v-if="draggableEnabled"
          v-model="groups"
          item-key="id"
          tag="div"
          class="group-container"
          :animation="150"
          :disabled="dragDisabled"
          handle=".drag-handle"
          @end="handleGroupDragEnd"
        >
        <template #item="{ element: group }">
          <div class="group" :data-group-id="group.id">
            <div class="group__header">
              <button class="group__toggle" type="button" @click="toggleGroupCollapsed(group.id)">
                <el-icon class="group__toggle-icon">
                  <IEpCaretRight v-if="isGroupCollapsed(group.id)" />
                  <IEpCaretBottom v-else />
                </el-icon>
              </button>

              <div class="group__title" @click.stop>
                <el-input
                  v-if="editingGroupId === group.id"
                  ref="editingGroupInputRef"
                  v-model="editingGroupName"
                  placeholder="分组名称"
                  :style="inputGrowStyle(editingGroupName)"
                  @keyup.enter="confirmEditGroup(group)"
                  @keyup.esc="cancelEditGroup"
                  @blur="confirmEditGroup(group)"
                />
                <span
                  v-else
                  class="group__name drag-handle"
                  role="button"
                  tabindex="0"
                  @click="() => void startEditGroup(group)"
                >
                  {{ group.name }}
                </span>

                <div v-if="editingGroupId !== group.id" class="group__inline-actions">
                  <el-button text class="icon-btn" @click="() => void startCreateTask(group.id)">
                    <el-icon><IEpPlus /></el-icon>
                  </el-button>
                  <el-dropdown trigger="click" @command="(cmd) => onGroupCommand(group, cmd)">
                    <el-button text class="icon-btn" @click.stop>
                      <el-icon><IEpMoreFilled /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item :command="'rename'" :disabled="group.isDefault">重命名</el-dropdown-item>
                        <el-dropdown-item :command="'delete'" :disabled="group.isDefault" divided>删除</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </div>
            </div>

            <div v-show="!isGroupCollapsed(group.id)" class="group__body">
              <draggable
                v-if="sortKey === 'custom'"
                v-model="rootTasksByGroupId[group.id]"
                item-key="id"
                tag="div"
                class="task-list"
                :animation="150"
                :disabled="dragDisabled"
                handle=".drag-handle"
                :group="{ name: `tasks-${group.id}`, pull: false, put: false }"
                @end="handleRootTaskDragEnd(group.id, $event)"
              >
                <template #item="{ element: task }">
                  <div class="task-wrap">
                    <TaskTreeNode :task="task" :depth="0" />
                  </div>
                </template>
              </draggable>

              <div class="group-create">
                <div v-if="creatingTaskGroupId === group.id" class="create-row">
                  <el-input
                    ref="creatingTaskInputRef"
                    v-model="creatingTaskName"
                    placeholder="输入标题，回车确认"
                    :style="inputGrowStyle(creatingTaskName)"
                    @keyup.enter="confirmCreateTask"
                    @keyup.esc="cancelCreateTask"
                    @blur="confirmCreateTask"
                  />
                </div>
                <el-button v-else text class="create-btn" @click="() => void startCreateTask(group.id)">
                  <el-icon><IEpPlus /></el-icon>
                  <span>新建任务</span>
                </el-button>
              </div>
            </div>
          </div>
        </template>
        </draggable>

        <div v-else class="group-container">
        <div v-for="group in groups" :key="group.id" class="group" :data-group-id="group.id">
          <div class="group__header">
            <button class="group__toggle" type="button" @click="toggleGroupCollapsed(group.id)">
              <el-icon class="group__toggle-icon">
                <IEpCaretRight v-if="isGroupCollapsed(group.id)" />
                <IEpCaretBottom v-else />
              </el-icon>
            </button>
            <div class="group__title" @click.stop>
              <el-input
                v-if="editingGroupId === group.id"
                ref="editingGroupInputRef"
                v-model="editingGroupName"
                placeholder="分组名称"
                size="large"
                :style="inputGrowStyle(editingGroupName)"
                @keyup.enter="confirmEditGroup(group)"
                @keyup.esc="cancelEditGroup"
                @blur="confirmEditGroup(group)"
              />
              <span
                v-else
                class="group__name drag-handle"
                role="button"
                tabindex="0"
                @click="() => void startEditGroup(group)"
              >
                {{ group.name }}
              </span>

              <div v-if="editingGroupId !== group.id" class="group__inline-actions">
                <el-button text class="icon-btn" @click="() => void startCreateTask(group.id)">
                  <el-icon><IEpPlus /></el-icon>
                </el-button>
                <el-dropdown trigger="click" @command="(cmd) => onGroupCommand(group, cmd)">
                  <el-button text class="icon-btn" @click.stop>
                    <el-icon><IEpMoreFilled /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item :command="'rename'" :disabled="group.isDefault">重命名</el-dropdown-item>
                      <el-dropdown-item :command="'delete'" :disabled="group.isDefault" divided>删除</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
          </div>

          <div v-show="!isGroupCollapsed(group.id)" class="group__body">
            <div class="task-list">
              <div
                v-for="task in sortTasksForView(rootTasksByGroupId[group.id] ?? [])"
                :key="task.id"
                  class="task-wrap"
              >
                <TaskTreeNode :task="task" :depth="0" />
              </div>
            </div>

            <div class="group-create">
              <div v-if="creatingTaskGroupId === group.id" class="create-row">
                <el-input
                  ref="creatingTaskInputRef"
                  v-model="creatingTaskName"
                  placeholder="输入标题，回车确认"
                  size="large"
                  :style="inputGrowStyle(creatingTaskName)"
                  @keyup.enter="confirmCreateTask"
                  @keyup.esc="cancelCreateTask"
                  @blur="confirmCreateTask"
                />
              </div>
              <el-button v-else text class="create-btn" @click="() => void startCreateTask(group.id)">
                <el-icon><IEpPlus /></el-icon>
                <span>新建任务</span>
              </el-button>
            </div>
          </div>
        </div>
        </div>
      </el-scrollbar>

      <div class="table__footer">
        <div class="bottom-create">
          <div v-if="isCreatingGroup" class="create-row">
            <el-input
              ref="newGroupInputRef"
              v-model="newGroupName"
              placeholder="新建分组"
              :style="inputGrowStyle(newGroupName)"
              @keyup.enter="confirmCreateGroup"
              @keyup.esc="cancelCreateGroup"
              @blur="confirmCreateGroup"
            />
          </div>
          <el-button v-else text class="create-btn create-btn--group" @click="() => void startCreateGroup()">
            <el-icon><IEpPlus /></el-icon>
            <span>新建分组</span>
          </el-button>
        </div>
      </div>
    </div>

    <el-drawer
      v-model="drawerOpen"
      class="task-drawer"
      size="420px"
      direction="rtl"
      :with-header="false"
      @closed="closeDrawer"
    >
      <el-scrollbar class="drawer__scroll" view-class="drawer__scroll-view">
        <div v-if="drawerTask" class="drawer">
        <div class="drawer__header">
          <div class="drawer__title-area" @click.stop>
            <div class="drawer__title" role="heading" aria-level="2">
              <el-icon class="drawer__title-icon"><IEpDocument /></el-icon>
              <span class="drawer__title-text">{{ drawerTask.name }}</span>
            </div>
          </div>

          <el-button
            class="drawer__complete"
            :type="statusDone(drawerTask) ? 'success' : 'primary'"
            @click="toggleDrawerComplete"
          >
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
                  :model-value="(drawerBelongListId ?? drawerTask.listId)"
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
                  :disabled="(drawerBelongListId ?? drawerTask.listId) !== listId"
                  :model-value="(drawerBelongGroupId ?? drawerTask.taskGroupId)"
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
              <el-checkbox
                class="drawer__child-check"
                :model-value="statusDone(child)"
                @change="() => toggleComplete(child)"
              />
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
  gap: 8px;
  padding: 10px 10px;
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

.table__footer {
  flex: 0 0 auto;
  padding-top: 10px;
}

.group-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group {
  border-radius: 10px;
  background: color-mix(in srgb, var(--el-bg-color) 85%, transparent);
}

.group__header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 10px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.group__toggle {
  border: none;
  background: transparent;
  color: var(--el-text-color-regular);
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}

.group__title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.group__name {
  flex: 1;
  font-weight: 700;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group__inline-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  color: var(--el-text-color-regular);
}

.group__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.group__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.group__body {
  padding: 8px 0 10px;
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

.task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px;
  border-radius: 10px;
  width: 100%;
}

.task-menu.el-dropdown {
  display: block;
}

.task:hover {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}

.task.is-done {
  opacity: 0.75;
}

.col-title {
  flex: 1;
  min-width: 0;
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

.priority-trigger {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.task__title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.task__check {
  flex: 0 0 auto;
}

.task__expand {
  border: none;
  background: transparent;
  color: var(--el-text-color-regular);
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
}

.task__expand-spacer {
  width: 16px;
  height: 16px;
  display: inline-block;
}

.task__name {
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task--child {
  padding-left: 26px;
}

.drag-handle {
  cursor: grab;
}

.drag-handle:active {
  cursor: grabbing;
}

.date-text {
  color: var(--el-text-color-regular);
  cursor: pointer;
  user-select: none;
}

.date-text--danger {
  color: var(--el-color-danger);
}

.children {
  margin-left: 0;
  padding: 6px 0 4px;
}

.col-date :deep(.el-date-editor) {
  width: 100%;
}

.children__loading {
  padding: 8px;
  color: var(--el-text-color-secondary);
}

.children__create {
  padding: 6px 8px 0;
}

.group-create {
  padding: 8px 8px 0;
}

.bottom-create {
  margin-top: 0;
}

.create-row {
  padding: 6px 8px;
}

.create-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-regular);
}

.create-btn--group {
  width: 100%;
  justify-content: flex-start;
  border: 1px solid var(--el-color-primary);
  border-radius: 10px;
  padding: 12px 10px;
  color: var(--el-color-primary);
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

.drawer__actions {
  margin-bottom: 16px;
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

.drawer__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
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

.drawer__subtask-create {
  padding-top: 8px;
}

.drawer__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.drawer__meta-value {
  flex: 1;
  text-align: right;
  word-break: break-all;
}
</style>
