import request from '@/utils/request'
import type { Result } from '@/api/types'
import type { ActivityPageData, ActivityQuery } from './types'

const ENDPOINTS = {
  logs: '/activity/logs',
} as const

export async function getActivityLogs(params: ActivityQuery): Promise<ActivityPageData> {
  const response = await request.get<Result<ActivityPageData>>(ENDPOINTS.logs, { params })
  if (!response.data.success) {
    throw new Error(response.data.message || '获取动态失败')
  }
  return response.data.data
}
