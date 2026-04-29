/** 内置三组默认预设（示意坐标，选后建议用「使用我当前的位置」校准） */
export const BUILTIN_LOCATION_PRESETS = [
  {
    id: '__builtin_restaurant',
    label: '学校餐厅',
    lat: 39.9042,
    lng: 116.4074,
    builtin: true,
  },
  {
    id: '__builtin_gym',
    label: '学校体育馆',
    lat: 39.9025,
    lng: 116.4074,
    builtin: true,
  },
  {
    id: '__builtin_library',
    label: '学校图书馆',
    lat: 39.9042,
    lng: 116.4058,
    builtin: true,
  },
]

const STORAGE_KEY_PREFIX = 'smartcheckin:geo-presets:v1:'

/** @returns {typeof BUILTIN_LOCATION_PRESETS[number]} */
function sanitizePreset(raw) {
  const label = typeof raw.label === 'string' ? raw.label.trim() : ''
  const lat = Number(raw.lat)
  const lng = Number(raw.lng)
  if (
    !label ||
    label.length > 60 ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null
  }
  return {
    id:
      typeof raw.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(raw.id) && raw.id.length <= 48
        ? raw.id
        : `cu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    label,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    builtin: !!raw.builtin,
  }
}

/** @param {string} userId */
export function loadCustomPresets(userId) {
  if (!userId) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + userId)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.map((x) => sanitizePreset(x)).filter(Boolean)
  } catch {
    return []
  }
}

/** @param {string} userId @param {Array<{ id: string, label: string, lat: number, lng: number }>} presets */
export function persistCustomPresets(userId, presets) {
  if (!userId) return
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(presets))
  } catch {
    /* quota / privacy mode */
  }
}

/**
 * @param {string} userId
 * @param {{ label: string, lat: number, lng: number }} p
 */
export function addCustomPreset(userId, p) {
  const sanitized = sanitizePreset({ ...p, builtin: false })
  if (!sanitized) throw new Error('invalid_preset')
  const list = loadCustomPresets(userId)
  list.unshift(sanitized)
  const capped = list.slice(0, 40)
  persistCustomPresets(userId, capped)
  return capped
}

/** @param {string} userId @param {string} presetId */
export function removeCustomPreset(userId, presetId) {
  const list = loadCustomPresets(userId).filter((x) => x.id !== presetId)
  persistCustomPresets(userId, list)
  return list
}
