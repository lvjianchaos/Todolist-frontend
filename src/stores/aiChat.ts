import { defineStore } from 'pinia'

interface AiChatPosition {
  x: number
  y: number
}

interface AiChatPersistedState {
  conversationId: string | null
  isExpanded: boolean
  position: AiChatPosition
}

type AiChatState = AiChatPersistedState

const STORAGE_KEY = 'aiChat'

function getDefaultState(): AiChatPersistedState {
  return {
    conversationId: null,
    isExpanded: false,
    position: { x: 24, y: 120 },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readStringOrNull(value: unknown, fallback: string | null): string | null {
  return typeof value === 'string' ? value : fallback
}

function readPersistedState(): AiChatPersistedState {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return getDefaultState()

  try {
    const parsed = JSON.parse(raw) as unknown
    const fallback = getDefaultState()

    if (!isRecord(parsed)) return fallback

    const positionRaw = parsed.position
    const position: AiChatPosition = isRecord(positionRaw)
      ? {
          x: readNumber(positionRaw.x, fallback.position.x),
          y: readNumber(positionRaw.y, fallback.position.y),
        }
      : fallback.position

    return {
      conversationId: readStringOrNull(parsed.conversationId, fallback.conversationId),
      isExpanded: readBoolean(parsed.isExpanded, fallback.isExpanded),
      position,
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return getDefaultState()
  }
}

function persistState(state: AiChatPersistedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const useAiChatStore = defineStore('aiChat', {
  state: (): AiChatState => readPersistedState(),
  actions: {
    setConversationId(conversationId: string) {
      this.conversationId = conversationId
      persistState(this.$state)
    },
    clearConversation() {
      this.conversationId = null
      persistState(this.$state)
    },
    setExpanded(isExpanded: boolean) {
      this.isExpanded = isExpanded
      persistState(this.$state)
    },
    setPosition(position: AiChatPosition) {
      this.position = position
      persistState(this.$state)
    },
  },
})
