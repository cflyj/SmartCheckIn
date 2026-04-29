/**
 * 参与者活动页地理围栏「体感」展示与定位辅助（SessionDetailView）。
 * 纯函数 + 常量，无 Vue 依赖。
 */

/** 硬性上限：到点必结束，避免无限等 */
export const GEO_LOCATE_HARD_MAX_MS = 45000
export const GEO_LOCATE_HARD_MAX_SEC = Math.ceil(GEO_LOCATE_HARD_MAX_MS / 1000)
/** 至少等这么久再允许提前结束，减少首点乱跳 */
export const GEO_LOCATE_MIN_BEFORE_EARLY_MS = 1800
/** 精度优于此值（米）且已过最短时间 → 可提前结束 */
export const GEO_LOCATE_GOOD_ACCURACY_M = 90
/** 精度不再变好超过此时长 → 认为已稳定，提前采用当前最优 */
export const GEO_LOCATE_STALL_MS = 3200

/** 手机用 http://IP 访问时，浏览器会禁用定位与摄像头（非安全上下文）。localhost 例外。 */
export function needsHttpsForSensitiveApis() {
  if (typeof window === 'undefined') return false
  const h = location.hostname
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return false
  return !window.isSecureContext
}

export function geoMessageFromError(err) {
  if (!err || typeof err.code !== 'number') return null
  if (err.code === 1) return '已拒绝定位权限。请在浏览器或系统设置中允许本站使用位置信息。'
  if (err.code === 2) return '暂时无法确定位置。请确认系统定位已开，并到窗边或室外重试。'
  if (err.code === 3) return '定位超时。请重试或到室外开阔处。'
  return null
}

/** 大数字标题：≥1000 米用公里，避免十几万米难以扫读 */
export function geoHeadlineDist(dist) {
  const d = Math.round(dist)
  if (d < 1000) return { num: String(d), unit: '米' }
  const km = d / 1000
  if (d < 100000) {
    const decimals = km >= 10 ? 1 : 2
    const s = km.toFixed(decimals).replace(/\.?0+$/, '')
    return { num: s, unit: '公里' }
  }
  return { num: String(Math.round(km)), unit: '公里' }
}

/** 文案里「还差多少」（外层可再加「约」）：大距离用公里 */
export function geoGapLabel(remainingM) {
  if (remainingM <= 0) return ''
  if (remainingM < 1000) return `${Math.round(remainingM)} 米`
  const km = remainingM / 1000
  if (remainingM < 100000) return `${km >= 10 ? km.toFixed(1) : km.toFixed(2)} 公里`
  return `${Math.round(km)} 公里`
}

/**
 * 条形图用对数比例：距离差几个数量级时，线性比例会让「允许半径」缩成一条线。
 * 仍保持：圈内则蓝点在绿区边界左侧或重合，圈外则蓝点在右侧。
 */
export function buildGeoFeel(dist, radius) {
  if (dist == null || radius == null) return null
  const inside = dist <= radius
  const remaining = Math.max(0, dist - radius)
  const maxViz = Math.max(dist, radius * 1.35, 50)
  const denom = Math.max(Math.log1p(maxViz), 1e-9)
  const userPct = Math.min(100, Math.max(0, (Math.log1p(Math.max(0, dist)) / denom) * 100))
  const fencePct = Math.min(100, Math.max(0, (Math.log1p(radius) / denom) * 100))
  const head = geoHeadlineDist(dist)
  const remainingLabel = inside ? '' : geoGapLabel(remaining)
  const vizNote =
    dist > Math.max(3000, radius * 15)
      ? '条的长度不是按比例尺画的（否则太远时看不清绿区），只看「蓝点在绿线哪一侧」；准确米数/公里数以上方大数字为准。'
      : ''
  return {
    inside,
    dist,
    radius,
    remaining,
    userPct,
    fencePct,
    distNum: head.num,
    distUnit: head.unit,
    remainingLabel,
    vizNote,
  }
}
