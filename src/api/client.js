/** 与 Express 挂载一致：业务接口均在 `/api` 下；若环境变量只写了源站（如 http://127.0.0.1:3001），自动补上 `/api`。 */
export function apiBase() {
  const raw = import.meta.env.VITE_API_BASE_URL
  if (raw == null || String(raw).trim() === '') return '/api'
  let b = String(raw).trim().replace(/\/+$/, '')
  if (!b.startsWith('http')) return b.startsWith('/') ? b : `/${b}`
  if (!b.endsWith('/api')) b = `${b}/api`
  return b
}

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

export async function api(path, options = {}) {
  const url = path.startsWith('http') ? path : `${apiBase()}${path.startsWith('/') ? path : `/${path}`}`
  const headers = {
    Accept: 'application/json',
    ...options.headers,
  }
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const token = localStorage.getItem('token')
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(url, {
    ...options,
    headers,
    body:
      options.body && typeof options.body === 'object' && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    const code = data.error?.code || 'request_failed'
    const message = data.error?.message || res.statusText || '请求失败'
    throw new ApiError(code, message, res.status)
  }
  return data.data
}
