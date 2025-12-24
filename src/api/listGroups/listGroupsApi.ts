import request from '@/utils/request'
import type { Result } from '@/api/types'
import type {
  CreateListGroupDto,
  ListGroupDto,
  ListGroupsData,
  RenameDto,
  ReorderDto,
} from './types'

const ENDPOINTS = {
  listGroups: '/task/list-groups',
  reorder: '/task/list-groups/sort-order',
} as const

export async function fetchListGroups(): Promise<ListGroupDto[]> {
  const response = await request.get<Result<ListGroupDto[]>>(ENDPOINTS.listGroups)
  if (!response.data.success) {
    throw new Error(response.data.message || '获取清单分组失败')
  }
  return response.data.data
}

export async function createListGroup(dto: CreateListGroupDto): Promise<ListGroupDto> {
  const response = await request.post<Result<ListGroupDto>>(ENDPOINTS.listGroups, dto)
  if (!response.data.success) {
    throw new Error(response.data.message || '创建分组失败')
  }
  return response.data.data
}

export async function renameListGroup(groupId: number, dto: RenameDto): Promise<ListGroupDto> {
  const response = await request.patch<Result<ListGroupDto>>(`${ENDPOINTS.listGroups}/${groupId}`, dto)
  if (!response.data.success) {
    throw new Error(response.data.message || '重命名分组失败')
  }
  return response.data.data
}

export async function deleteListGroup(groupId: number): Promise<void> {
  const response = await request.delete<Result<void>>(`${ENDPOINTS.listGroups}/${groupId}`)
  if (!response.data.success) {
    throw new Error(response.data.message || '删除分组失败')
  }
}

export async function reorderListGroups(dto: ReorderDto): Promise<ListGroupsData> {
  const response = await request.patch<Result<ListGroupsData>>(ENDPOINTS.reorder, dto)
  if (!response.data.success) {
    throw new Error(response.data.message || '更新分组排序失败')
  }
  return response.data.data
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

export function extractListGroupsData(data: unknown): ListGroupDto[] | null {
  if (Array.isArray(data)) return data as ListGroupDto[]
  if (!isRecord(data)) return null

  const listGroup = data.listGroup
  if (Array.isArray(listGroup)) return listGroup as ListGroupDto[]

  const listGroups = data.listGroups
  if (Array.isArray(listGroups)) return listGroups as ListGroupDto[]

  return null
}
