import request from '@/utils/request'
import type { ChatRequestDto, ChatResponseDto } from './types'

const ENDPOINTS = {
  chat: '/ai-agent/chat',
} as const

export async function chat(dto: ChatRequestDto): Promise<ChatResponseDto> {
  const response = await request.post<ChatResponseDto>(ENDPOINTS.chat, dto)
  return response.data
}
