export interface ChatRequestDto {
  conversationId?: string | null
  message: string
}

export interface ChatResponseDto {
  conversationId: string
  reply: string
}
