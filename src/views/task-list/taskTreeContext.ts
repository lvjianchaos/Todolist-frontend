import type { InjectionKey, Ref } from 'vue'
import type { SortableEvent } from 'sortablejs'
import type { TaskDto, TaskPriority, TaskSortKey, TaskFilter } from '@/api/tasks/types'

export type Id = number
export type DateField = 'startedAt' | 'dueAt'
export type EditingDate = { taskId: Id; field: DateField } | null

export type TaskMenuCommand = 'rename' | 'delete' | 'newChild'

export interface TaskTreeContext {
  sortKey: Ref<TaskSortKey>
  filter: Ref<TaskFilter>

  childrenByParentId: Record<Id, TaskDto[]>
  childrenLoading: Ref<Set<Id>>

  editingTaskId: Ref<Id | null>
  editingTaskName: Ref<string>

  editingDate: Ref<EditingDate>

  creatingSubtaskParentId: Ref<Id | null>
  creatingSubtaskName: Ref<string>

  dragDisabled: Ref<boolean>

  statusDone: (task: TaskDto) => boolean
  isOverdue: (task: TaskDto) => boolean
  formatDate: (date: string | null) => string

  priorityLabel: (p: number) => string
  priorityTagType: (p: number) => 'danger' | 'warning' | 'success' | 'info'
  setPriority: (task: TaskDto, priority: TaskPriority) => void

  openDrawerFromBlank: (task: TaskDto) => void
  toggleComplete: (task: TaskDto) => void

  startEditTask: (task: TaskDto) => Promise<void>
  confirmEditTask: (task: TaskDto) => void
  cancelEditTask: () => void

  startEditDate: (taskId: Id, field: DateField) => void
  isEditingDate: (taskId: Id, field: DateField) => boolean
  onDateChange: (task: TaskDto, field: DateField, evt: unknown) => void

  toggleTaskExpanded: (task: TaskDto) => Promise<void>
  isTaskExpanded: (taskId: Id) => boolean

  startCreateSubtask: (parentTask: TaskDto) => Promise<void>
  confirmCreateSubtask: (parentTask: TaskDto) => Promise<void>
  cancelCreateSubtask: () => void

  onTaskCommand: (task: TaskDto, cmd: TaskMenuCommand) => void

  ensureChildrenLoaded: (parentId: Id, templateTask: TaskDto) => Promise<void>
  sortTasksForView: (tasks: TaskDto[]) => TaskDto[]

  handleChildTaskDragEnd: (parentId: Id, evt: SortableEvent) => void
}

export const taskTreeContextKey: InjectionKey<TaskTreeContext> = Symbol('taskTreeContext')
