import { defineStore } from 'pinia'

interface TokenStore {
  token: string | null
}

export const useTokenStore = defineStore('token', {
  state: (): TokenStore => ({
    token: localStorage.getItem('token'),
  }),
  actions: {
    setToken(newToken: string) {
      this.token = newToken
      localStorage.setItem('token', newToken)
    },
    clearToken() {
      this.token = null
      localStorage.removeItem('token')
    },
  },
})
