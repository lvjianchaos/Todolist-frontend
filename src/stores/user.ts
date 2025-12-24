import { defineStore } from 'pinia'
import { useTokenStore } from '@/stores/token'

export interface UserInfo {
  userId: string
  username: string
  nickname: string
  avatar: string | null
}

interface UserStoreState {
  userId: string | null
  username: string | null
  nickname: string | null
  avatar: string | null
}

const STORAGE_KEY = 'user'

function readPersistedUser(): UserStoreState {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return {
      userId: null,
      username: null,
      nickname: null,
      avatar: null,
    }
  }

  try {
    const parsed = JSON.parse(raw) as Partial<UserInfo>
    return {
      userId: parsed.userId ?? null,
      username: parsed.username ?? null,
      nickname: parsed.nickname ?? null,
      avatar: parsed.avatar ?? null,
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return {
      userId: null,
      username: null,
      nickname: null,
      avatar: null,
    }
  }
}

export const useUserStore = defineStore('user', {
  state: (): UserStoreState => readPersistedUser(),
  actions: {
    setUser(info: UserInfo) {
      this.userId = info.userId
      this.username = info.username
      this.nickname = info.nickname
      this.avatar = info.avatar

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          userId: this.userId,
          username: this.username,
          nickname: this.nickname,
          avatar: this.avatar,
        } satisfies UserInfo),
      )
    },
    clearUser() {
      this.userId = null
      this.username = null
      this.nickname = null
      this.avatar = null
      localStorage.removeItem(STORAGE_KEY)
    },
    logout() {
      const tokenStore = useTokenStore()
      tokenStore.clearToken()
      this.clearUser()
    },
  },
})
