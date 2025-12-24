import request from '@/utils/request'
import type { Result } from '@/api/types'
import type { CreateListDto, ListDto, RenameDto, ReorderListsDto, ReorderListsResponseData } from './types'

const ENDPOINTS = {
  lists: '/task/lists',
  reorder: '/task/lists/sort-order',
} as const

export async function createList(dto: CreateListDto): Promise<ListDto> {
  const response = await request.post<Result<ListDto>>(ENDPOINTS.lists, dto)
  if (!response.data.success) {
    throw new Error(response.data.message || '创建清单失败')
  }
  return response.data.data
}

export async function renameList(listId: number, dto: RenameDto): Promise<ListDto> {
  const response = await request.patch<Result<ListDto>>(`${ENDPOINTS.lists}/${listId}`, dto)
  if (!response.data.success) {
    throw new Error(response.data.message || '重命名清单失败')
  }
  return response.data.data
}

export async function deleteList(listId: number): Promise<void> {
  const response = await request.delete<Result<void>>(`${ENDPOINTS.lists}/${listId}`)
  if (!response.data.success) {
    throw new Error(response.data.message || '删除清单失败')
  }
}

export async function reorderLists(dto: ReorderListsDto): Promise<ReorderListsResponseData> {
  const response = await request.patch<Result<ReorderListsResponseData>>(ENDPOINTS.reorder, dto)
  if (!response.data.success) {
    throw new Error(response.data.message || '更新清单排序失败')
  }
  return response.data.data
}
