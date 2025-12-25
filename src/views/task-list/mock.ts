import type { TaskDto, TaskGroupDto } from '@/api/tasks/types'

function isoNow(): string {
  return new Date().toISOString()
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

let nextTaskId = 1000
let nextGroupId = 2000

export function createMockTaskGroups(listId: number): TaskGroupDto[] {
  return [
    { id: nextGroupId++, listId, name: '未分组', sortOrder: 1, isDefault: true },
    { id: nextGroupId++, listId, name: '默认分组', sortOrder: 2, isDefault: false },
  ]
}

export function createMockRootTasks(listId: number, groupId: number): TaskDto[] {
  const now = isoNow()
  return [
    {
      id: nextTaskId++,
      userId: 1,
      listId,
      taskGroupId: groupId,
      parentId: 0,
      name: '示例任务 A',
      content: '这是一个示例任务。',
      sortOrder: 1,
      status: 0,
      priority: 3,
      startedAt: '2025-12-09',
      dueAt: '2026-01-01',
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      hasChildren: true,
    },
    {
      id: nextTaskId++,
      userId: 1,
      listId,
      taskGroupId: groupId,
      parentId: 0,
      name: '示例任务 B',
      content: null,
      sortOrder: 2,
      status: 0,
      priority: 1,
      startedAt: null,
      dueAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      hasChildren: false,
    },
  ]
}

export async function mockFetchChildren(parentId: number): Promise<TaskDto[]> {
  await delay(350)
  const now = isoNow()

  return [
    {
      id: nextTaskId++,
      userId: 1,
      listId: 0,
      taskGroupId: 0,
      parentId,
      name: '子任务 1',
      content: null,
      sortOrder: 1,
      status: 0,
      priority: 2,
      startedAt: null,
      dueAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      hasChildren: true,
    },
    {
      id: nextTaskId++,
      userId: 1,
      listId: 0,
      taskGroupId: 0,
      parentId,
      name: '子任务 2',
      content: null,
      sortOrder: 2,
      status: 0,
      priority: 0,
      startedAt: null,
      dueAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      hasChildren: false,
    },
  ]
}

export async function mockCreateTask(partial: Pick<TaskDto, 'listId' | 'taskGroupId' | 'parentId' | 'name'>): Promise<TaskDto> {
  await delay(120)
  const now = isoNow()
  return {
    id: nextTaskId++,
    userId: 1,
    listId: partial.listId,
    taskGroupId: partial.taskGroupId,
    parentId: partial.parentId,
    name: partial.name,
    content: null,
    sortOrder: 0,
    status: 0,
    priority: 0,
    startedAt: null,
    dueAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    hasChildren: false,
  }
}

export async function mockCreateGroup(listId: number, name: string): Promise<TaskGroupDto> {
  await delay(120)
  return {
    id: nextGroupId++,
    listId,
    name,
    sortOrder: 0,
    isDefault: false,
  }
}
