import request from '@/utils/request'
import type { Result } from '@/api/types'
import type {
  CreateTaskDto,
  FetchMyRootTasksParams,
  MoveTaskDto,
  PatchTaskDto,
  ReorderTasksDto,
  TaskDto,
  TasksData,
} from './types'

const ENDPOINTS = {
  tasks: '/task/tasks',
  reorder: '/task/tasks/sort-order',
  root: '/task/tasks/root',
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

export function extractTasksData(data: unknown): TaskDto[] | null {
  if (Array.isArray(data)) return data as TaskDto[]
  if (!isRecord(data)) return null

  const tasks = data.tasks
  if (Array.isArray(tasks)) return tasks as TaskDto[]

  const list = data.list
  if (Array.isArray(list)) return list as TaskDto[]

  return null
}

export async function fetchTasks(params: {
  listId: number
  taskGroupId?: number
  parentId: number
}): Promise<TaskDto[]> {
  const response = await request.get<Result<TasksData>>(ENDPOINTS.tasks, {
    params: {
      listId: params.listId,
      taskGroupId: params.taskGroupId,
      parentId: params.parentId,
    },
  })
  if (!response.data.success) {
    throw new Error(response.data.message || '获取任务失败')
  }
  const extracted = extractTasksData(response.data.data)
  if (!extracted) {
    throw new Error('获取任务失败：返回数据格式不正确')
  }
  return extracted
}

export async function fetchMyRootTasks(params: FetchMyRootTasksParams = {}): Promise<TaskDto[]> {
  const response = await request.get<Result<TasksData>>(ENDPOINTS.root, {
    params: {
      parentId: params.parentId ?? 0,
      filter: params.filter,
      sortKey: params.sortKey,
      sortDir: params.sortDir,
    },
  })
  if (!response.data.success) {
    throw new Error(response.data.message || '获取任务失败')
  }
  const extracted = extractTasksData(response.data.data)
  if (!extracted) {
    throw new Error('获取任务失败：返回数据格式不正确')
  }
  return extracted
}

export async function fetchChildren(taskId: number): Promise<TaskDto[]> {
  const response = await request.get<Result<TaskDto[]>>(`${ENDPOINTS.tasks}/${taskId}/children`)
  if (!response.data.success) {
    throw new Error(response.data.message || '获取子任务失败')
  }
  return response.data.data
}

export async function createTask(dto: CreateTaskDto): Promise<TaskDto> {
  const response = await request.post<Result<TaskDto>>(ENDPOINTS.tasks, dto)
  if (!response.data.success) {
    throw new Error(response.data.message || '创建任务失败')
  }
  return response.data.data
}

export async function patchTask(taskId: number, dto: PatchTaskDto): Promise<TaskDto> {
  const response = await request.patch<Result<TaskDto>>(`${ENDPOINTS.tasks}/${taskId}`, dto)
  if (!response.data.success) {
    throw new Error(response.data.message || '更新任务失败')
  }
  return response.data.data
}

export async function deleteTask(taskId: number, opts?: { cascade?: boolean }): Promise<void> {
  const response = await request.delete<Result<void>>(`${ENDPOINTS.tasks}/${taskId}`, {
    params: { cascade: opts?.cascade ?? true },
  })
  if (!response.data.success) {
    throw new Error(response.data.message || '删除任务失败')
  }
}

export async function moveTask(taskId: number, dto: MoveTaskDto): Promise<TaskDto> {
  const response = await request.patch<Result<TaskDto>>(`${ENDPOINTS.tasks}/${taskId}/move`, dto)
  if (!response.data.success) {
    throw new Error(response.data.message || '移动任务失败')
  }
  return response.data.data
}

export async function reorderTasks(dto: ReorderTasksDto): Promise<TaskDto[] | null> {
  const response = await request.patch<Result<TasksData>>(ENDPOINTS.reorder, dto)
  if (!response.data.success) {
    throw new Error(response.data.message || '更新任务排序失败')
  }
  return extractTasksData(response.data.data)
}
