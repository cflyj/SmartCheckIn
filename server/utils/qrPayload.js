/**
 * 二维码常为完整签到 URL；客户端可能提交整段字符串，与 session_qr_state.token 比对前需抽出 token。
 */
export function extractCheckinTokenFromPayload(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  try {
    const t = new URL(s).searchParams.get('token')
    if (t) return t.trim()
  } catch {
    /* 非绝对 URL */
  }
  try {
    const t = new URL(s, 'https://placeholder.invalid').searchParams.get('token')
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
