import request from '@/utils/request'
import type { Result } from '@/api/types'
import type { CreateTaskGroupDto, RenameDto, ReorderTaskGroupsDto, TaskGroupDto, TaskGroupsData } from './types'

const ENDPOINTS = {
  taskGroups: '/task/task-groups',
  reorder: '/task/task-groups/sort-order',
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

export function extractTaskGroupsData(data: unknown): TaskGroupDto[] | null {
  if (Array.isArray(data)) return data as TaskGroupDto[]
  if (!isRecord(data)) return null

  const taskGroups = data.taskGroups
  if (Array.isArray(taskGroups)) return taskGroups as TaskGroupDto[]

  const taskGroup = data.taskGroup
  if (Array.isArray(taskGroup)) return taskGroup as TaskGroupDto[]

  const groups = data.groups
  if (Array.isArray(groups)) return groups as TaskGroupDto[]

  return null
}

export async function fetchTaskGroups(listId: number): Promise<TaskGroupDto[]> {
  const response = await request.get<Result<TaskGroupsData>>(ENDPOINTS.taskGroups, { params: { listId } })
  if (!response.data.success) {
    throw new Error(response.data.message || '获取任务分组失败')
  }
  const extracted = extractTaskGroupsData(response.data.data)
  if (!extracted) {
    throw new Error('获取任务分组失败：返回数据格式不正确')
  }
  return extracted
}

export async function createTaskGroup(dto: CreateTaskGroupDto): Promise<TaskGroupDto> {
  const response = await request.post<Result<TaskGroupDto>>(ENDPOINTS.taskGroups, dto)
  if (!response.data.success) {
    throw new Error(response.data.message || '创建任务分组失败')
  }
  return response.data.data
}

export async function renameTaskGroup(groupId: number, dto: RenameDto): Promise<TaskGroupDto> {
  const response = await request.patch<Result<TaskGroupDto>>(`${ENDPOINTS.taskGroups}/${groupId}`, dto)
  if (!response.data.success) {
    throw new Error(response.data.message || '重命名任务分组失败')
  }
  return response.data.data
}

export async function deleteTaskGroup(groupId: number): Promise<void> {
  const response = await request.delete<Result<void>>(`${ENDPOINTS.taskGroups}/${groupId}`)
  if (!response.data.success) {
    throw new Error(response.data.message || '删除任务分组失败')
  }
}

export async function reorderTaskGroups(dto: ReorderTaskGroupsDto): Promise<TaskGroupDto[] | null> {
  const response = await request.patch<Result<TaskGroupsData>>(ENDPOINTS.reorder, dto)
  if (!response.data.success) {
    throw new Error(response.data.message || '更新任务分组排序失败')
  }
  return extractTaskGroupsData(response.data.data)
}
