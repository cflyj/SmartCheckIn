/**
 * face-api.js：TinyFaceDetector + 68 landmarks + FaceRecognitionNet (128-D)。
 * 默认从 jsDelivr 拉权重；离线/内网可改 `VITE_FACE_WEIGHTS_URL` 指向 `public/face-models/`。
 */

let loadPromise = null

const FALLBACK_WEIGHTS =
  'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights'

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
 */
export async function captureFaceDescriptor(el) {
  try {
    const faceapi = await loadFaceModels()
    const detection = await faceapi
      .detectSingleFace(
        el,
        new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.38, inputSize: 416 })
      )
      .withFaceLandmarks()
      .withFaceDescriptor()
    if (!detection?.descriptor) {
      return { error: 'no_face' }
    }
    return { descriptor: Array.from(detection.descriptor) }
  } catch (e) {
    console.warn(e)
    return { error: 'model_failed' }
  }
}
