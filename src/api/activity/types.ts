export interface ActivityRecord {
  id: number
  entityType: number
  action: number
  listId?: number | null
  listName?: string | null
  listGroupId?: number | null
  lgName?: string | null
  tgId?: number | null
  tgName?: string | null
  taskId?: number | null
  taskName?: string | null
  summary?: string | null
  extraData?: string | null
  createdAt: string
}

export interface ActivityPageData {
  records: ActivityRecord[]
  total: number
  size: number
  current: number
  pages: number
}

export interface ActivityQuery {
  listId?: number
  page: number
  size: number
}
