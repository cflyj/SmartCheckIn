/**
 * face-api.js：TinyFaceDetector + 68 landmarks + FaceRecognitionNet (128-D)。
 * 默认从 jsDelivr 拉权重；离线/内网可改 `VITE_FACE_WEIGHTS_URL` 指向 `public/face-models/`。
 */

let loadPromise = null

const FALLBACK_WEIGHTS =
  'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights'

/** TinyFace 初始过滤：越高越保守（减少含糊框），见 docs/FACE_VERIFICATION_HARDENING_PRD.md */
function readViteNum(key, fallback, min, max) {
  try {
    const raw = import.meta.env[key]
    if (raw === undefined || raw === '') return fallback
    const n = Number(raw)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, n))
  } catch {
    return fallback
  }
}

const DETECTOR_SCORE_THRESHOLD = readViteNum(
  'VITE_FACE_DETECTOR_SCORE_THRESHOLD',
  0.5,
  0.35,
  0.85
)
/** 低于此值的帧不提交 descriptor（与服务端 FACE_MIN_PROBE_DETECTION_SCORE 建议对齐） */
const MIN_FACE_DETECTION_CONFIDENCE = readViteNum(
  'VITE_FACE_MIN_DETECTION_SCORE',
  0.55,
  0.4,
  0.95
)

async function resolveFaceApi() {
  const mod = await import('face-api.js')
  return mod.default || mod
}

export async function loadFaceModels() {
  if (!loadPromise) {
    loadPromise = (async () => {
      const faceapi = await resolveFaceApi()
      const base = (import.meta.env.VITE_FACE_WEIGHTS_URL || FALLBACK_WEIGHTS).replace(/\/?$/, '')
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(base),
        faceapi.nets.faceLandmark68Net.loadFromUri(base),
        faceapi.nets.faceRecognitionNet.loadFromUri(base),
      ])
      return faceapi
    })()
  }
  return loadPromise
}

/**
 * @param {HTMLVideoElement | HTMLCanvasElement | HTMLImageElement} el
 * @returns {Promise<{ descriptor: number[], detection_score?: number } | { error: string }>}
 */
export async function captureFaceDescriptor(el) {
  try {
    const faceapi = await loadFaceModels()
    const detection = await faceapi
      .detectSingleFace(el, new faceapi.TinyFaceDetectorOptions({
        scoreThreshold: DETECTOR_SCORE_THRESHOLD,
        inputSize: 416,
      }))
      .withFaceLandmarks()
      .withFaceDescriptor()
    if (!detection?.descriptor) {
      return { error: 'no_face' }
    }
    const score =
      typeof detection.detection?.score === 'number'
        ? detection.detection.score
        : detection.score
    if (typeof score === 'number' && Number.isFinite(score) && score < MIN_FACE_DETECTION_CONFIDENCE) {
      return { error: 'low_face_confidence' }
    }
    return {
      descriptor: Array.from(detection.descriptor),
      ...(typeof score === 'number' && Number.isFinite(score)
        ? { detection_score: score }
        : {}),
    }
  } catch (e) {
    console.warn(e)
    return { error: 'model_failed' }
  }
}
