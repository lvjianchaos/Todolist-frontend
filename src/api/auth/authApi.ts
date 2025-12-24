import type { LoginRequestDto, LoginResponseDto, RegisterRequestDto } from './types'
import request from '@/utils/request'
import type { Result } from '@/api/types.ts'
const AUTH_ENDPOINTS = {
  login: '/auth/login',
  register: '/auth/register',
} as const

export async function login(dto: LoginRequestDto): Promise<LoginResponseDto> {
  const response = await request.post<Result<LoginResponseDto>>(AUTH_ENDPOINTS.login, dto)
  if (!response.data.success) {
    throw new Error(response.data.message || '登录失败')
  }
  return response.data.data
}

export async function register(dto: RegisterRequestDto): Promise<Result<void>> {
  const response = await request.post<Result<void>>(AUTH_ENDPOINTS.register, dto)
  if (!response.data.success) {
    throw new Error(response.data.message || '注册失败')
  }
  return response.data
}
