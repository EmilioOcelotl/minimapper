// El modelo de manos de interaccion.js, en su propio hilo. En el hilo de la página tardaba
// unos 60 ms por cuadro (CPU) y frenaba el mapeo a la mitad; aquí la página sólo manda
// un ImageBitmap del cuadro y recibe los puntos de vuelta.
//
// MediaPipe carga su wasm con importScripts(), que no existe en un worker de módulo. Se
// reemplaza por uno que baja el script y lo evalúa en el ámbito global, que es lo que
// haría el original.
self.importScripts = (...urls) => {
  for (const u of urls) {
    const x = new XMLHttpRequest()
    x.open('GET', u, false)
    x.send()
    ;(0, eval)(x.responseText)
  }
}

// GPU primero: en el worker tiene su propio contexto (un OffscreenCanvas), así que no le
// quita nada a p5 ni a Hydra. Si no hay GPU, o el contexto se pierde (conectar el proyector
// puede tirarlo), se vuelve a crear en CPU y se avisa con { tipo: 'delegado' }.
let manos = null, crear = null, delegado = null

// Una GPU por software (SwiftShader, llvmpipe: sin aceleración, o headless) es mucho más
// lenta que la CPU para esto. Si el renderizador lo es, ni se intenta.
function gpuDeVerdad () {
  try {
    const gl = new OffscreenCanvas(1, 1).getContext('webgl2')
    if (!gl) return false
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const nombre = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
    return !/swiftshader|llvmpipe|software|basic render/i.test(nombre)
  } catch (e) { return false }
}

// Y si aun así la GPU tarda más que PRUEBA_MS en los primeros PRUEBA_N cuadros, a CPU.
const PRUEBA_N = 5, PRUEBA_MS = 40
let tiempos = []

async function abrir (delegados) {
  let error
  if (!gpuDeVerdad()) delegados = delegados.filter(d => d !== 'GPU')
  tiempos = []
  for (const d of delegados) {
    try {
      manos?.close?.()
      manos = await crear(d)
      delegado = d
      return d
    } catch (e) { error = e }
  }
  throw error
}

self.onmessage = async ({ data }) => {
  try {
    if (data.tipo === 'cargar') {
      const vision = await import(data.mp + '/vision_bundle.mjs')
      const fileset = await vision.FilesetResolver.forVisionTasks(data.mp + '/wasm')
      crear = (d) => vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: data.modelo, delegate: d },
        canvas: d === 'GPU' ? new OffscreenCanvas(1, 1) : undefined,
        runningMode: 'VIDEO', numHands: 2,
      })
      self.postMessage({ tipo: 'listo', delegado: await abrir(data.delegados || ['CPU']) })
    } else if (data.tipo === 'cuadro') {
      let r
      const t0 = performance.now()
      try { r = manos.detectForVideo(data.img, data.t) }
      catch (e) {
        if (delegado !== 'GPU') throw e
        self.postMessage({ tipo: 'delegado', delegado: await abrir(['CPU']) })
        r = manos.detectForVideo(data.img, performance.now())
      }
      if (delegado === 'GPU' && tiempos.length < PRUEBA_N) {
        tiempos.push(performance.now() - t0)
        if (tiempos.length === PRUEBA_N && tiempos.sort((a, b) => a - b)[PRUEBA_N >> 1] > PRUEBA_MS) {
          self.postMessage({ tipo: 'delegado', delegado: await abrir(['CPU']) })
        }
      }
      data.img.close()
      self.postMessage({ tipo: 'manos', landmarks: r.landmarks || [] })
    }
  } catch (e) {
    data.img?.close?.()
    self.postMessage({ tipo: 'error', mensaje: String(e && e.message || e) })
  }
}
