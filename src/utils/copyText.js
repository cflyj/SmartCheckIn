/**
 * 尽量复制到剪贴板。百度等壳浏览器常不支持 Clipboard API，会回退到 execCommand。
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  const t = String(text ?? '')
  if (!t || typeof document === 'undefined') return false

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && globalThis.isSecureContext) {
    try {
      await navigator.clipboard.writeText(t)
      return true
    } catch {
      /* fall through */
    }
  }
  return copyViaExecCommand(t)
}

function copyViaExecCommand(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', 'readonly')
  ta.setAttribute('aria-hidden', 'true')
  ta.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;margin:0;border:none;opacity:0;'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  ta.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(ta)
  return ok
}
