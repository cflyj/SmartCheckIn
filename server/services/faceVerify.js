/** 人脸识别 descriptor 校验（基于 face-api 128 维特征向量的欧氏距离） */

/** 历史默认曾为 0.55，易出现「换人仍过」误判；收窄以降低错误接受（见 docs/FACE_VERIFICATION_HARDENING_PRD.md） */
export const DEFAULT_FACE_MATCH_THRESHOLD = 0.42

const THRESHOLD_MIN = 0.35
const THRESHOLD_MAX = 0.6

/** 当请求附带 detector score 时使用；缺省与浏览器侧守门一致 */
export const DEFAULT_MIN_PROBE_DETECTION_SCORE = 0.55

const PROBE_SCORE_ENV_MIN = 0.35
const PROBE_SCORE_ENV_MAX = 0.95

/**
 * L2 距离 ≤ 返回值则视为同人。可通过 `FACE_MATCH_DISTANCE_THRESHOLD` 覆盖默认。
 */
export function getMatchDistanceThreshold() {
  const raw = process.env.FACE_MATCH_DISTANCE_THRESHOLD
  if (raw === undefined || raw === '') return DEFAULT_FACE_MATCH_THRESHOLD
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_FACE_MATCH_THRESHOLD
  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, n))
}

function envTruthy(name) {
  const v = process.env[name]
  if (v === undefined || v === '') return false
  return /^(1|true|yes|on)$/i.test(String(v).trim())
}

export function getMinProbeDetectionScore() {
  const raw = process.env.FACE_MIN_PROBE_DETECTION_SCORE
  if (raw === undefined || raw === '') return DEFAULT_MIN_PROBE_DETECTION_SCORE
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_MIN_PROBE_DETECTION_SCORE
  return Math.min(PROBE_SCORE_ENV_MAX, Math.max(PROBE_SCORE_ENV_MIN, n))
}

/**
 * @param {unknown} body HTTP body
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function assertProbeDetectionAcceptable(body) {
  const minScore = getMinProbeDetectionScore()
  const requireField = envTruthy('FACE_REQUIRE_DETECTION_SCORE')

  const raw = body?.detection_score
  if (raw === undefined || raw === null || raw === '') {
    if (requireField) {
      return {
        ok: false,
        code: 'validation_error',
        message: '请更新页面后重做人脸核验（缺少检测置信度）',
      }
    }
    return { ok: true }
  }

  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    return {
      ok: false,
      code: 'validation_error',
      message: '检测置信度参数无效',
    }
  }

  if (n < minScore) {
    return {
      ok: false,
      code: 'low_detection_confidence',
      message: '人脸检测置信度过低，请正对镜头并保持光线充足',
    }
  }

  return { ok: true }
}

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
 * @param {number} [threshold] 显式阈值；不传则使用 `getMatchDistanceThreshold()`
 */
export function descriptorsMatch(ref, probe, threshold) {
  const t = threshold !== undefined ? threshold : getMatchDistanceThreshold()
  if (
    !Array.isArray(ref) ||
    !Array.isArray(probe) ||
    ref.length !== 128 ||
    probe.length !== 128
  ) {
    return { ok: false, reason: 'dimension', distance: null }
  }
  const distance = euclideanDistance(ref, probe)
  return { ok: distance <= t, distance, reason: null }
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
