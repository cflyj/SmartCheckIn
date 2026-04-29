/** 人脸识别 descriptor 校验（基于 face-api 128 维特征向量的欧氏距离） */

export const DEFAULT_FACE_MATCH_THRESHOLD = 0.55

export function euclideanDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    return Number.POSITIVE_INFINITY
  }
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = Number(a[i]) - Number(b[i])
    sum += d * d
  }
  return Math.sqrt(sum)
}

/**
 * @param {number[]} ref 已录入向量
 * @param {number[]} probe 签到当次向量
 * @param {number} [threshold]
 */
export function descriptorsMatch(ref, probe, threshold = DEFAULT_FACE_MATCH_THRESHOLD) {
  if (
    !Array.isArray(ref) ||
    !Array.isArray(probe) ||
    ref.length !== 128 ||
    probe.length !== 128
  ) {
    return { ok: false, reason: 'dimension', distance: null }
  }
  const distance = euclideanDistance(ref, probe)
  return { ok: distance <= threshold, distance, reason: null }
}

/** @param {unknown} body */
export function parseDescriptorFromBody(body) {
  const d = body?.descriptor
  if (!Array.isArray(d) || d.length !== 128) return null
  const nums = []
  for (let i = 0; i < d.length; i++) {
    const n = Number(d[i])
    if (!Number.isFinite(n)) return null
    nums.push(n)
  }
  return nums
}
