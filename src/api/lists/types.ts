export interface ListDto {
  id: number
  groupId: number
  name: string
  sortOrder: number
}

export interface CreateListDto {
  groupId: number
  name: string
  prevId?: number | null
  nextId?: number | null
  prevSortOrder: number
}

export interface RenameDto {
  name: string
}

export interface ReorderListsDto {
  groupId: number
  movedId: number
  prevId?: number | null
  nextId?: number | null
  prevSortOrder: number
  nextSortOrder: number
}

import type { ListGroupsData } from '@/api/listGroups/types'

export type ReorderListsResponseData = ListGroupsData
