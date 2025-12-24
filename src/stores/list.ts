import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import {
  createListGroup,
  deleteListGroup,
  extractListGroupsData,
  fetchListGroups,
  renameListGroup,
  reorderListGroups,
} from '@/api/listGroups/listGroupsApi'
import { createList, deleteList, renameList, reorderLists } from '@/api/lists/listsApi'
import type { ListGroupDto } from '@/api/listGroups/types'

export interface ListItem {
  id: number
  name: string
  sortOrder: number
}

export interface ListGroup {
  id: number
  name: string
  sortOrder: number
  list: ListItem[]
}

interface ListStoreState {
  listGroup: ListGroup[]
  loading: boolean
  loaded: boolean
  lastFetchedAt: number | null
}

type Id = number

type ReorderGroupPayload = {
  movedId: Id
  prevId: Id | null
  nextId: Id | null
  prevSortOrder: number
  nextSortOrder: number
}

type ReorderListPayload = {
  groupId: Id
  movedId: Id
  prevId: Id | null
  nextId: Id | null
  prevSortOrder: number
  nextSortOrder: number
}

type ReorderPayload = ReorderGroupPayload | ReorderListPayload

const reorderTimers = new Map<string, number>()
const reorderLatestPayload = new Map<string, ReorderPayload>()
const reorderQueues = new Map<string, Promise<void>>()

function enqueue(scope: string, task: () => Promise<void>): void {
  const prev = reorderQueues.get(scope) ?? Promise.resolve()
  const next = prev.catch(() => undefined).then(task)
  reorderQueues.set(scope, next)
}

function insertByNeighbors<T extends { id: number }>(items: T[], item: T, prevId?: number | null, nextId?: number | null): void {
  if (prevId !== undefined) {
    const prevIndex = items.findIndex((x) => x.id === prevId)
    if (prevIndex >= 0) {
      items.splice(prevIndex + 1, 0, item)
      return
    }
  }
  if (nextId !== undefined) {
    const nextIndex = items.findIndex((x) => x.id === nextId)
    if (nextIndex >= 0) {
      items.splice(nextIndex, 0, item)
      return
    }
  }
  items.push(item)
}

function normalizeFromDto(dto: ListGroupDto): ListGroup {
  return {
    id: dto.id,
    name: dto.name,
    sortOrder: dto.sortOrder,
    list: (dto.list ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      sortOrder: l.sortOrder,
    })),
  }
}

function getMaxSortOrder<T extends { sortOrder: number }>(items: T[]): number {
  let max = 0
  for (const item of items) {
    if (typeof item.sortOrder === 'number' && item.sortOrder > max) max = item.sortOrder
  }
  return max
}

function getSortOrderById<T extends { id: number; sortOrder: number }>(
  items: T[],
  id: number | null,
  opts: { scope: string; role: 'prev' | 'next'; movedId: number } | null = null,
): number {
  if (id == null) return 0
  const found = items.find((x) => x.id === id)
  if (found) return found.sortOrder

  if (opts && import.meta.env.DEV) {
    console.warn('[reorder] neighbor not found in state, fallback sortOrder=0', {
      scope: opts.scope,
      movedId: opts.movedId,
      role: opts.role,
      neighborId: id,
    })
  }
  return 0
}

export const useListStore = defineStore('list', {
  state: (): ListStoreState => ({
    listGroup: [],
    loading: false,
    loaded: false,
    lastFetchedAt: null,
  }),
  getters: {
    findListNameById: (state) => {
      return (listId: Id): string | null => {
        for (const group of state.listGroup) {
          const item = group.list.find((x) => x.id === listId)
          if (item) return item.name
        }
        return null
      }
    },
  },
  actions: {
    async fetchListGroups(options: { force?: boolean } = {}): Promise<void> {
      if (this.loading) return
      if (this.loaded && !options.force) return

      this.loading = true
      try {
        const groups = await fetchListGroups()
        this.listGroup = groups.map(normalizeFromDto)
        this.loaded = true
        this.lastFetchedAt = Date.now()
      } catch (error: unknown) {
        ElMessage.error(error instanceof Error ? error.message : '获取清单分组失败')
        throw error
      } finally {
        this.loading = false
      }
    },

    async createGroup(name: string, opts: { prevId?: Id | null; nextId?: Id | null } = {}): Promise<void> {
      const prevSortOrder = getMaxSortOrder(this.listGroup)
      const group = await createListGroup({
        name,
        prevId: opts.prevId,
        nextId: opts.nextId,
        prevSortOrder,
      })
      const normalized = normalizeFromDto(group)
      insertByNeighbors(this.listGroup, normalized, opts.prevId, opts.nextId)
      this.loaded = true
    },

    async renameGroup(groupId: Id, name: string): Promise<void> {
      const updated = await renameListGroup(groupId, { name })
      const target = this.listGroup.find((g) => g.id === groupId)
      if (!target) return
      target.name = updated.name
      target.sortOrder = updated.sortOrder
    },

    async deleteGroup(groupId: Id): Promise<void> {
      await deleteListGroup(groupId)
      this.listGroup = this.listGroup.filter((g) => g.id !== groupId)
    },

    async createList(groupId: Id, name: string, opts: { prevId?: Id | null; nextId?: Id | null } = {}): Promise<void> {
      const group = this.listGroup.find((g) => g.id === groupId)
      if (!group) return

      const prevSortOrder = getMaxSortOrder(group.list)
      const created = await createList({
        groupId,
        name,
        prevId: opts.prevId,
        nextId: opts.nextId,
        prevSortOrder,
      })

      insertByNeighbors(
        group.list,
        { id: created.id, name: created.name, sortOrder: created.sortOrder },
        opts.prevId,
        opts.nextId,
      )
    },

    async renameList(listId: Id, name: string): Promise<void> {
      const updated = await renameList(listId, { name })
      for (const group of this.listGroup) {
        const item = group.list.find((x) => x.id === listId)
        if (item) {
          item.name = updated.name
          item.sortOrder = updated.sortOrder
          break
        }
      }
    },

    async deleteList(listId: Id): Promise<void> {
      await deleteList(listId)
      for (const group of this.listGroup) {
        const nextList = group.list.filter((i) => i.id !== listId)
        if (nextList.length !== group.list.length) {
          group.list = nextList
          break
        }
      }
    },

    reorderGroup(movedId: Id, opts: { prevId?: Id | null; nextId?: Id | null }): void {
      const scope = 'groups'
      const prevId = opts.prevId ?? null
      const nextId = opts.nextId ?? null
      const payload: ReorderGroupPayload = {
        movedId,
        prevId,
        nextId,
        prevSortOrder: getSortOrderById(this.listGroup, prevId, { scope, role: 'prev', movedId }),
        nextSortOrder: getSortOrderById(this.listGroup, nextId, { scope, role: 'next', movedId }),
      }
      reorderLatestPayload.set(scope, payload)

      if (reorderTimers.has(scope)) return
      const timer = window.setTimeout(() => {
        reorderTimers.delete(scope)
        const latest = reorderLatestPayload.get(scope) as ReorderGroupPayload | undefined
        if (!latest) return
        enqueue(scope, async () => {
          try {
            const data = await reorderListGroups(latest)
            const groups = extractListGroupsData(data)
            if (!groups) throw new Error('reorder 响应缺少 listGroups')
            this.listGroup = groups.map(normalizeFromDto)
            this.loaded = true
          } catch (error: unknown) {
            ElMessage.error(error instanceof Error ? error.message : '更新分组排序失败')
            await this.fetchListGroups({ force: true }).catch(() => undefined)
          }
        })
      }, 200)
      reorderTimers.set(scope, timer)
    },

    reorderList(groupId: Id, movedId: Id, opts: { prevId?: Id | null; nextId?: Id | null }): void {
      const scope = `lists:${groupId}`
      const prevId = opts.prevId ?? null
      const nextId = opts.nextId ?? null
      const group = this.listGroup.find((g) => g.id === groupId)
      const listItems = group?.list ?? []
      const payload: ReorderListPayload = {
        groupId,
        movedId,
        prevId,
        nextId,
        prevSortOrder: getSortOrderById(listItems, prevId, { scope, role: 'prev', movedId }),
        nextSortOrder: getSortOrderById(listItems, nextId, { scope, role: 'next', movedId }),
      }
      reorderLatestPayload.set(scope, payload)

      if (reorderTimers.has(scope)) return
      const timer = window.setTimeout(() => {
        reorderTimers.delete(scope)
        const latest = reorderLatestPayload.get(scope) as ReorderListPayload | undefined
        if (!latest) return
        enqueue(scope, async () => {
          try {
            const data = await reorderLists(latest)
            const groups = extractListGroupsData(data)
            if (!groups) throw new Error('reorder 响应缺少 listGroups')
            this.listGroup = groups.map(normalizeFromDto)
            this.loaded = true
          } catch (error: unknown) {
            ElMessage.error(error instanceof Error ? error.message : '更新清单排序失败')
            await this.fetchListGroups({ force: true }).catch(() => undefined)
          }
        })
      }, 200)
      reorderTimers.set(scope, timer)
    },
  },
})
