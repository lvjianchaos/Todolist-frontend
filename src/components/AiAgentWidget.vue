<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { chat as chatApi } from '@/api/aiAgent/aiAgentApi'
import { useAiChatStore } from '@/stores/aiChat'
import { useUserStore } from '@/stores/user'

type ChatRole = 'user' | 'assistant'

type ChatMessageStatus = 'sending' | 'done' | 'error'

interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  status: ChatMessageStatus
}

const PANEL_WIDTH = 400
const PANEL_HEIGHT = 500
const COLLAPSED_WIDTH = 360
const COLLAPSED_HEIGHT = 56
const Z_INDEX = 200000

const aiChatStore = useAiChatStore()
const userStore = useUserStore()

const isExpanded = computed({
  get: () => aiChatStore.isExpanded,
  set: (value: boolean) => aiChatStore.setExpanded(value),
})

const position = computed({
  get: () => aiChatStore.position,
  set: (value: { x: number; y: number }) => aiChatStore.setPosition(value),
})

const inputText = ref('')
const isSending = ref(false)
const messages = ref<ChatMessage[]>([])

const messageListEl = ref<HTMLDivElement | null>(null)

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getViewportSize(): { width: number; height: number } {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

function getCurrentBoxSize(): { width: number; height: number } {
  return isExpanded.value
    ? { width: PANEL_WIDTH, height: PANEL_HEIGHT }
    : { width: COLLAPSED_WIDTH, height: COLLAPSED_HEIGHT }
}

function clampToViewport(nextX: number, nextY: number): { x: number; y: number } {
  const viewport = getViewportSize()
  const box = getCurrentBoxSize()

  const maxX = Math.max(0, viewport.width - box.width)
  const maxY = Math.max(0, viewport.height - box.height)

  return {
    x: clamp(nextX, 0, maxX),
    y: clamp(nextY, 0, maxY),
  }
}

function normalizePositionInViewport(): void {
  const next = clampToViewport(position.value.x, position.value.y)
  if (next.x !== position.value.x || next.y !== position.value.y) {
    position.value = next
  }
}

watch(isExpanded, async () => {
  normalizePositionInViewport()
  if (isExpanded.value) {
    await nextTick()
    scrollToBottom()
  }
})

window.addEventListener('resize', normalizePositionInViewport)

onBeforeUnmount(() => {
  window.removeEventListener('resize', normalizePositionInViewport)
  stopTypewriter()
})

function scrollToBottom(): void {
  if (!messageListEl.value) return
  messageListEl.value.scrollTop = messageListEl.value.scrollHeight
}

function toUserIdNumber(userId: string | null): number | null {
  if (!userId) return null
  const parsed = Number.parseInt(userId, 10)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

let dragPointerId: number | null = null
const dragStart = ref<{ pointerX: number; pointerY: number; startX: number; startY: number } | null>(null)

function onHeaderPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return

  dragPointerId = event.pointerId
  dragStart.value = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    startX: position.value.x,
    startY: position.value.y,
  }

  target.setPointerCapture(event.pointerId)
}

function onHeaderPointerMove(event: PointerEvent): void {
  if (dragPointerId === null || event.pointerId !== dragPointerId) return
  if (!dragStart.value) return

  const dx = event.clientX - dragStart.value.pointerX
  const dy = event.clientY - dragStart.value.pointerY

  const next = clampToViewport(dragStart.value.startX + dx, dragStart.value.startY + dy)
  position.value = next
}

function onHeaderPointerUp(event: PointerEvent): void {
  if (dragPointerId === null || event.pointerId !== dragPointerId) return

  dragPointerId = null
  dragStart.value = null

  const target = event.currentTarget
  if (target instanceof HTMLElement) {
    try {
      target.releasePointerCapture(event.pointerId)
    } catch {
      // ignore
    }
  }
}

const typingState = ref<{ timerId: number; messageId: string; fullText: string; index: number } | null>(null)

function stopTypewriter(): void {
  if (!typingState.value) return
  window.clearInterval(typingState.value.timerId)
  typingState.value = null
}

function startTypewriter(messageId: string, fullText: string): void {
  stopTypewriter()

  const timerId = window.setInterval(() => {
    const state = typingState.value
    if (!state) return

    const target = messages.value.find((m) => m.id === state.messageId)
    if (!target) {
      stopTypewriter()
      return
    }

    const nextIndex = Math.min(state.fullText.length, state.index + 2)
    target.text = state.fullText.slice(0, nextIndex)
    state.index = nextIndex

    if (isExpanded.value) {
      scrollToBottom()
    }

    if (state.index >= state.fullText.length) {
      stopTypewriter()
    }
  }, 20)

  typingState.value = {
    timerId,
    messageId,
    fullText,
    index: 0,
  }
}

async function sendMessage(): Promise<void> {
  const trimmed = inputText.value.trim()
  if (!trimmed) return

  const userIdNumber = toUserIdNumber(userStore.userId)
  if (userIdNumber === null) {
    ElMessage.error('用户信息缺失，请重新登录')
    return
  }

  const userMessage: ChatMessage = {
    id: createId(),
    role: 'user',
    text: trimmed,
    status: 'done',
  }
  messages.value.push(userMessage)

  const assistantMessage: ChatMessage = {
    id: createId(),
    role: 'assistant',
    text: '',
    status: 'sending',
  }
  messages.value.push(assistantMessage)

  inputText.value = ''
  isSending.value = true

  try {
    const result = await chatApi({
      conversationId: aiChatStore.conversationId,
      message: trimmed,
    })

    if (result.conversationId) {
      aiChatStore.setConversationId(result.conversationId)
    }

    assistantMessage.status = 'done'

    // 发送成功后展开（收缩也继续打字）
    aiChatStore.setExpanded(true)

    await nextTick()
    scrollToBottom()

    startTypewriter(assistantMessage.id, result.reply)
  } catch (error: unknown) {
    assistantMessage.status = 'error'
    assistantMessage.text = '请求失败，请稍后重试'

    const message = error instanceof Error ? error.message : '请求失败'
    ElMessage.error(message)
  } finally {
    isSending.value = false
  }
}

function toggleExpanded(): void {
  aiChatStore.setExpanded(!aiChatStore.isExpanded)
}

function openExpanded(): void {
  aiChatStore.setExpanded(true)
}

function closeExpanded(): void {
  aiChatStore.setExpanded(false)
}
</script>

<template>
  <Teleport to="body">
    <div
      class="ai-agent-root"
      :style="{
        left: position.x + 'px',
        top: position.y + 'px',
        zIndex: String(Z_INDEX),
      }"
    >
      <div
        class="ai-agent-panel"
        :class="{ expanded: isExpanded, collapsed: !isExpanded }"
        role="dialog"
        aria-label="AI Agent"
      >
        <div
          class="ai-agent-header"
        >
          <div
            class="ai-agent-drag-handle"
            @pointerdown="onHeaderPointerDown"
            @pointermove="onHeaderPointerMove"
            @pointerup="onHeaderPointerUp"
            @pointercancel="onHeaderPointerUp"
          >
            <div class="ai-agent-title" @dblclick="toggleExpanded">AI Agent</div>
          </div>
          <div class="ai-agent-header-actions">
            <el-button
              size="small"
              text
              type="primary"
              :disabled="isSending"
              @click="isExpanded ? closeExpanded() : openExpanded()"
            >
              {{ isExpanded ? '收缩' : '展开' }}
            </el-button>
          </div>
        </div>

        <div v-if="isExpanded" class="ai-agent-body">
          <div ref="messageListEl" class="ai-agent-messages">
            <div
              v-for="m in messages"
              :key="m.id"
              class="ai-agent-message"
              :class="m.role"
            >
              <div class="ai-agent-bubble">
                <span class="ai-agent-text">{{ m.text }}</span>
                <span v-if="m.status === 'sending'" class="ai-agent-sending">...</span>
              </div>
            </div>
          </div>

          <div class="ai-agent-input">
            <el-input
              v-model="inputText"
              type="textarea"
              :rows="3"
              resize="none"
              placeholder="输入你的问题..."
              :disabled="isSending"
              @keydown.enter.exact.prevent="sendMessage"
            />
            <div class="ai-agent-input-actions">
              <el-button type="primary" :loading="isSending" :disabled="!inputText.trim()" @click="sendMessage">
                发送
              </el-button>
            </div>
          </div>
        </div>

        <div v-else class="ai-agent-collapsed">
          <div class="ai-agent-collapsed-row">
            <el-input
              v-model="inputText"
              class="ai-agent-collapsed-input"
              placeholder="问 AI..."
              :disabled="isSending"
              @keydown.enter.exact.prevent="sendMessage"
            />
            <el-button
              class="ai-agent-collapsed-send"
              type="primary"
              :loading="isSending"
              :disabled="!inputText.trim()"
              @click="sendMessage"
            >
              发送
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.ai-agent-root {
  position: fixed;
}

.ai-agent-panel {
  width: 360px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 30px color-mix(in srgb, var(--el-color-primary) 25%, transparent);
}

.ai-agent-panel.collapsed {
  animation: aiAgentBreath 2.2s ease-in-out infinite;
}

.ai-agent-panel.expanded {
  width: 400px;
  height: 500px;
  animation: none;
}

@keyframes aiAgentBreath {
  0% {
    box-shadow: 0 0 0 color-mix(in srgb, var(--el-color-primary) 0%, transparent);
  }
  50% {
    box-shadow: 0 0 22px color-mix(in srgb, var(--el-color-primary) 40%, transparent);
  }
  100% {
    box-shadow: 0 0 0 color-mix(in srgb, var(--el-color-primary) 0%, transparent);
  }
}

.ai-agent-header {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--el-fill-color-lighter);
  user-select: none;
}

.ai-agent-drag-handle {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  cursor: grab;
}

.ai-agent-drag-handle:active {
  cursor: grabbing;
}

.ai-agent-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.ai-agent-body {
  height: calc(500px - 44px);
  display: flex;
  flex-direction: column;
}

.ai-agent-messages {
  flex: 1;
  overflow: auto;
  padding: 12px;
  background: var(--el-bg-color);
}

.ai-agent-message {
  display: flex;
  margin-bottom: 10px;
}

.ai-agent-message.user {
  justify-content: flex-end;
}

.ai-agent-message.assistant {
  justify-content: flex-start;
}

.ai-agent-bubble {
  max-width: 85%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-agent-message.user .ai-agent-bubble {
  border-color: color-mix(in srgb, var(--el-color-primary) 40%, var(--el-border-color));
}

.ai-agent-sending {
  margin-left: 6px;
  color: var(--el-text-color-secondary);
}

.ai-agent-input {
  padding: 12px;
  border-top: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
}

.ai-agent-input-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}

.ai-agent-collapsed {
  height: 56px;
  padding: 8px 10px;
  background: var(--el-bg-color);
}

.ai-agent-collapsed-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.ai-agent-collapsed-input {
  flex: 1;
}
</style>
