<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue'
import draggable from 'vuedraggable'
import type { InputInstance } from 'element-plus'
import type { TaskDto, TaskPriority } from '@/api/tasks/types'
import { taskTreeContextKey, type DateField, type TaskMenuCommand } from './taskTreeContext'

defineOptions({ name: 'TaskTreeNode' })

const props = defineProps<{ task: TaskDto; depth: number }>()

const ctx = inject(taskTreeContextKey)!

const editNameInputRef = ref<InputInstance>()
const createChildInputRef = ref<InputInstance>()

// 让右键菜单跟随鼠标位置（而不是元素中间）
const taskMenuVirtualRef = ref<
  | {
      getBoundingClientRect: () => DOMRect
    }
  | null
>(null)

watch(
  () => ctx.editingTaskId.value,
  async (id) => {
    if (id !== props.task.id) return
    await nextTick()
    editNameInputRef.value?.focus()
  }
)

watch(
  () => ctx.creatingSubtaskParentId.value,
  async (id) => {
    if (id !== props.task.id) return
    await nextTick()
    createChildInputRef.value?.focus()
  }
)

const indentPx = computed<number>(() => {
  const base = 0
  const step = 18
  const max = 240
  return Math.min(max, base + step * (props.depth ?? 0))
})

const titleIndentStyle = computed<Record<string, string>>(() => {
  return { paddingLeft: `${indentPx.value}px` }
})

const createIndentStyle = computed<Record<string, string>>(() => {
  const base = 0
  const step = 18
  const max = 240
  const px = Math.min(max, base + step * ((props.depth ?? 0) + 1))
  return { paddingLeft: `${px}px` }
})

const children = computed<TaskDto[]>(() => ctx.childrenByParentId[props.task.id] ?? [])
const childrenSortedForView = computed<TaskDto[]>(() => ctx.sortTasksForView(children.value))

const isExpanded = computed<boolean>(() => ctx.isTaskExpanded(props.task.id))

const hasVisibleChildrenArea = computed<boolean>(() => {
  if (ctx.creatingSubtaskParentId.value === props.task.id) return true
  if (children.value.length > 0) return true
  return Boolean(props.task.hasChildren)
})

const showExpandToggle = computed<boolean>(() => {
  return hasVisibleChildrenArea.value
})

const draggableChildrenEnabled = computed<boolean>(() => {
  return ctx.sortKey.value === 'custom' && ctx.filter.value === 'all'
})

async function onToggleExpanded(): Promise<void> {
  await ctx.toggleTaskExpanded(props.task)
}

function onPriorityCommand(cmd: TaskPriority): void {
  ctx.setPriority(props.task, cmd)
}

function onTaskMenuCommand(cmd: TaskMenuCommand): void {
  ctx.onTaskCommand(props.task, cmd)
}

function startCreateChild(): void {
  void ctx.startCreateSubtask(props.task)
}

function confirmCreateChild(): void {
  void ctx.confirmCreateSubtask(props.task)
}

function cancelCreateChild(): void {
  ctx.cancelCreateSubtask()
}

function startEdit(field: DateField): void {
  ctx.startEditDate(props.task.id, field)
}

function onTaskContextMenu(evt: MouseEvent): void {
  // 不要 stopPropagation，否则 el-dropdown 的 contextmenu 触发不会执行
  const x = evt.clientX
  const y = evt.clientY
  taskMenuVirtualRef.value = {
    getBoundingClientRect: () => new DOMRect(x, y, 0, 0),
  }
}

function inputGrowStyle(text: string): Record<string, string> {
  const minPx = 120
  const maxPx = 320
  const perCharPx = 14
  const paddingPx = 28
  const len = (text ?? '').length
  const raw = len * perCharPx + paddingPx
  const widthPx = Math.max(minPx, Math.min(maxPx, raw))
  return { minWidth: `${minPx}px`, width: `${widthPx}px`, maxWidth: `${maxPx}px` }
}
</script>

<template>
  <div class="task-node">
    <el-dropdown
      class="task-menu"
      trigger="contextmenu"
      placement="bottom-start"
      @command="onTaskMenuCommand"
    >
      <div
        class="task"
        :class="{ 'is-done': ctx.statusDone(task) }"
        @contextmenu.capture="onTaskContextMenu"
        @click="() => ctx.openDrawerFromBlank(task)"
      >
        <div class="col-title">
          <div class="task__title" :style="titleIndentStyle">
            <el-checkbox class="task__check" :model-value="ctx.statusDone(task)" @change="() => ctx.toggleComplete(task)" />

            <button v-if="showExpandToggle" class="task__expand" type="button" @click.stop="onToggleExpanded">
              <el-icon>
                <IEpCaretRight v-if="!isExpanded" />
                <IEpCaretBottom v-else />
              </el-icon>
            </button>
            <span v-else class="task__expand-spacer" />

            <span
              v-if="ctx.editingTaskId.value !== task.id"
              class="task__name drag-handle"
              role="button"
              tabindex="0"
              @click.stop="() => void ctx.startEditTask(task)"
            >
              {{ task.name }}
            </span>
            <el-input
              v-else
              v-model="ctx.editingTaskName.value"
              class="task__name-input"
              size="large"
              ref="editNameInputRef"
              :style="inputGrowStyle(ctx.editingTaskName.value)"
              @keydown.enter.stop.prevent="ctx.confirmEditTask(task)"
              @keydown.esc.stop.prevent="ctx.cancelEditTask()"
              @blur="ctx.confirmEditTask(task)"
              @click.stop
            />
          </div>
        </div>

        <div class="col-date" @click.stop>
          <template v-if="ctx.isEditingDate(task.id, 'startedAt')">
            <el-date-picker
              type="date"
              size="small"
              :model-value="task.startedAt"
              value-format="YYYY-MM-DD"
              placeholder="选择日期"
              @update:model-value="ctx.onDateChange(task, 'startedAt', $event)"
            />
          </template>
          <span v-else class="date-text" :class="{ 'date-text--danger': false }" @click.stop="startEdit('startedAt')">
            {{ ctx.formatDate(task.startedAt) }}
          </span>
        </div>

        <div class="col-date" @click.stop>
          <template v-if="ctx.isEditingDate(task.id, 'dueAt')">
            <el-date-picker
              type="date"
              size="small"
              :model-value="task.dueAt"
              value-format="YYYY-MM-DD"
              placeholder="选择日期"
              @update:model-value="ctx.onDateChange(task, 'dueAt', $event)"
            />
          </template>
          <span v-else class="date-text" :class="{ 'date-text--danger': ctx.isOverdue(task) }" @click.stop="startEdit('dueAt')">
            {{ ctx.formatDate(task.dueAt) }}
          </span>
        </div>

        <div class="col-priority" @click.stop>
          <el-dropdown trigger="click" @command="onPriorityCommand">
            <span class="priority-trigger">
              <el-tag size="small" :type="ctx.priorityTagType(task.priority)">{{ ctx.priorityLabel(task.priority) }}</el-tag>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item :command="0">无</el-dropdown-item>
                <el-dropdown-item :command="1">低</el-dropdown-item>
                <el-dropdown-item :command="2">中</el-dropdown-item>
                <el-dropdown-item :command="3">高</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="rename">重命名</el-dropdown-item>
          <el-dropdown-item command="newChild">新建子任务</el-dropdown-item>
          <el-dropdown-item divided command="delete">删除</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <div v-if="hasVisibleChildrenArea" v-show="isExpanded" class="children">
      <div v-if="ctx.childrenLoading.value.has(task.id)" class="children__loading">加载中…</div>

      <template v-else>
        <draggable
          v-if="draggableChildrenEnabled && ctx.childrenByParentId[task.id]"
          v-model="ctx.childrenByParentId[task.id]"
          item-key="id"
          tag="div"
          class="task-list"
          :animation="150"
          :disabled="ctx.dragDisabled.value"
          handle=".drag-handle"
          :group="{ name: `children-${task.id}`, pull: false, put: false }"
          @end="ctx.handleChildTaskDragEnd(task.id, $event)"
        >
          <template #item="{ element }">
            <div class="task-wrap">
              <TaskTreeNode :task="element" :depth="depth + 1" />
            </div>
          </template>
        </draggable>

        <div v-else class="task-list">
          <div v-for="child in childrenSortedForView" :key="child.id" class="task-wrap">
            <TaskTreeNode :task="child" :depth="depth + 1" />
          </div>
        </div>

        <div class="children__create">
          <div :style="createIndentStyle">
            <div v-if="ctx.creatingSubtaskParentId.value === task.id" class="create-row" @click.stop>
            <el-input
              ref="createChildInputRef"
              v-model="ctx.creatingSubtaskName.value"
              :style="inputGrowStyle(ctx.creatingSubtaskName.value)"
              placeholder="子任务标题"
              @keydown.enter.stop.prevent="confirmCreateChild"
              @keydown.esc.stop.prevent="cancelCreateChild"
              @blur="confirmCreateChild"
            />
            </div>
            <el-button v-else text class="create-btn" @click.stop="startCreateChild">
              <el-icon><IEpPlus /></el-icon>
              <span>新建子任务</span>
            </el-button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.task-node {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.col-title {
  flex: 1;
  min-width: 0;
}

.col-date {
  width: 140px;
  display: flex;
  justify-content: flex-start;
}

.col-priority {
  width: 90px;
  display: flex;
  justify-content: flex-start;
}

.task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px;
  border-radius: 10px;
  width: 100%;
}

.task:hover {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}

.task.is-done {
  opacity: 0.75;
}

.task.is-done .task__name {
  color: var(--el-text-color-secondary);
  text-decoration: line-through;
}

.task-menu.el-dropdown {
  display: block;
}

.task__title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.task__check {
  flex: 0 0 auto;
}

.task__expand {
  border: none;
  background: transparent;
  color: var(--el-text-color-regular);
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
}

.task__expand-spacer {
  width: 16px;
  height: 16px;
  display: inline-block;
}

.task__name {
  display: block;
  min-width: 0;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
  padding: 1px 0;
}

.drag-handle {
  cursor: grab;
}

.drag-handle:active {
  cursor: grabbing;
}

.date-text {
  color: var(--el-text-color-regular);
  cursor: pointer;
  user-select: none;
}

.date-text--danger {
  color: var(--el-color-danger);
}

.priority-trigger {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.children {
  margin-left: 0;
  padding: 6px 0 4px;
}

.children__loading {
  padding: 8px;
  color: var(--el-text-color-secondary);
}

.children__create {
  padding: 6px 8px 0;
}

:deep(.el-date-editor) {
  width: 100%;
}
</style>
