/**
 * 大屏二维码内容为「完整签到链接」；扫描结果往往是整段 URL，需取出 token 再提交接口。
 * 与 `server/utils/qrPayload.js` 行为保持一致（服务端也会再抽一次，兼容第三方客户端）。
 */
export function extractCheckinTokenFromPayload(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  try {
    const u = new URL(s)
    const t = u.searchParams.get('token')
    if (t) return t.trim()
  } catch {
    /* 非绝对 URL */
  }
  try {
    const u = new URL(s, 'https://placeholder.invalid')
    const t = u.searchParams.get('token')
    if (t) return t.trim()
  } catch {
    /* ignore */
  }
  const m = s.match(/[?&]token=([^&?#]+)/i)
  if (m) {
    try {
      return decodeURIComponent(m[1].trim())
    } catch {
      return m[1].trim()
    }
  }
  return s
}
