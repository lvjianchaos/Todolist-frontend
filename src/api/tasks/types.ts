export type TaskStatus = 0 | 1 | 2
export type TaskPriority = 0 | 1 | 2 | 3

export interface TaskDto {
  id: number
  userId: number
  listId: number
  taskGroupId: number
  // 后端约定：根任务 parentId = 0
  parentId: number
  name: string
  content: string | null
  sortOrder: number
  status: TaskStatus
  priority: TaskPriority
  startedAt: string | null // DATE: YYYY-MM-DD
  dueAt: string | null // DATE: YYYY-MM-DD
  completedAt: string | null // DATETIME: ISO string
  createdAt: string // DATETIME: ISO string
  updatedAt: string // DATETIME: ISO string
  hasChildren: boolean
}

export interface TaskGroupDto {
  id: number
  listId: number
  name: string
  sortOrder: number
  isDefault: boolean
}

export interface RenameDto {
  name: string
}

export interface CreateTaskGroupDto {
  listId: number
  name: string
  prevId?: number | null
  nextId?: number | null
  prevSortOrder: number
}

export interface ReorderTaskGroupsDto {
  listId: number
  movedId: number
  prevId?: number | null
  nextId?: number | null
  prevSortOrder: number | null
  nextSortOrder: number | null
}

export type TaskGroupsData =
  | TaskGroupDto[]
  | { taskGroups: TaskGroupDto[] }
  | { taskGroup: TaskGroupDto[] }
  | { groups: TaskGroupDto[] }

export interface CreateTaskDto {
  listId: number
  taskGroupId: number
  parentId: number
  name: string
  prevId?: number | null
  nextId?: number | null
  prevSortOrder: number
}

export interface PatchTaskDto {
  name?: string
  content?: string | null
  startedAt?: string | null
  dueAt?: string | null
  status?: TaskStatus
  priority?: TaskPriority
}

export interface MoveTaskDto {
  listId: number
  taskGroupId?: number
  parentId?: number
  prevId?: number | null
  nextId?: number | null
  prevSortOrder?: number | null
  nextSortOrder?: number | null
}

export interface ReorderTasksDto {
  listId: number
  taskGroupId: number
  parentId: number
  movedId: number
  prevId?: number | null
  nextId?: number | null
  prevSortOrder: number | null
  nextSortOrder: number | null
}

export type TasksData = TaskDto[] | { tasks: TaskDto[] } | { list: TaskDto[] }

export type TaskFilter = 'all' | 'todo' | 'done'

export type TaskSortKey = 'custom' | 'startedAt' | 'dueAt' | 'createdAt' | 'updatedAt' | 'completedAt' | 'priority'
export type SortDir = 'asc' | 'desc'

export type FetchMyRootTasksParams = {
  // 后端从 token 解析用户；允许透传 userId 仅作为兼容/调试
  userId?: number | string
  // 后端约定：根任务 parentId = 0
  parentId?: number
  filter?: TaskFilter
  sortKey?: TaskSortKey
  sortDir?: SortDir
}
