import { ApiError } from '../api/client.js'

/** catch 分支里统一的文案（避免各页重复三元） */
export function apiErrorMessage(error, fallback = '请求失败') {
  return error instanceof ApiError ? error.message : fallback
}
