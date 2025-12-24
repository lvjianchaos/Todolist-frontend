export interface ListItemDto {
  id: number
  name: string
  sortOrder: number
}

export interface ListGroupDto {
  id: number
  name: string
  sortOrder: number
  list: ListItemDto[]
}

export interface CreateListGroupDto {
  name: string
  prevId?: number | null
  nextId?: number | null
  prevSortOrder: number
}

export interface RenameDto {
  name: string
}

export interface ReorderDto {
  movedId: number
  prevId?: number | null
  nextId?: number | null
  prevSortOrder: number | null
  nextSortOrder: number | null
}

export type ListGroupsData =
  | ListGroupDto[]
  | { listGroup: ListGroupDto[] }
  | { listGroups: ListGroupDto[] }
