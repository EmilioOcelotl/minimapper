// El segmentador de interaccion.js (botón "silueta"), en su propio hilo, como el de manos
// (ver manos-worker.js). Recibe un ImageBitmap del cuadro y devuelve la máscara en bytes
// (0 fondo, 255 persona), ya limpia, más la presencia y el centro de la persona.
//
// La limpieza es la del ejemplo de silueta de lab-cct, más ligera: cada máscara se mezcla
// un poco con la anterior (un cuarto) para que no tiemble sin quedarse atrás, y la orilla
// pasa por un umbral suave alrededor de 0.5.
self.importScripts = (...urls) => {
  for (const u of urls) {
    const x = new XMLHttpRequest()
    x.open('GET', u, false)
    x.send()
    ;(0, eval)(x.responseText)
  }
}

const BANDA = 0.12   // media anchura de la orilla: 0 sería un corte seco
let modelo = null, suave = null, crear = null, delegado = null

// GPU primero, con vuelta a CPU si no hay o se pierde: ver manos-worker.js.
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
      modelo?.close?.()
      modelo = await crear(d)
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
      crear = (d) => vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: data.modelo, delegate: d },
        canvas: d === 'GPU' ? new OffscreenCanvas(1, 1) : undefined,
        runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
      })
      self.postMessage({ tipo: 'listo', delegado: await abrir(data.delegados || ['CPU']) })
    } else if (data.tipo === 'cuadro') {
      let r
      const t0 = performance.now()
      try { r = modelo.segmentForVideo(data.img, data.t) }
      catch (e) {
        if (delegado !== 'GPU') throw e
        self.postMessage({ tipo: 'delegado', delegado: await abrir(['CPU']) })
        r = modelo.segmentForVideo(data.img, performance.now())
      }
      if (delegado === 'GPU' && tiempos.length < PRUEBA_N) {
        tiempos.push(performance.now() - t0)
        if (tiempos.length === PRUEBA_N && tiempos.sort((a, b) => a - b)[PRUEBA_N >> 1] > PRUEBA_MS) {
          self.postMessage({ tipo: 'delegado', delegado: await abrir(['CPU']) })
        }
      }
      data.img.close()
      const m = r.confidenceMasks[r.confidenceMasks.length - 1]
      const datos = m.getAsFloat32Array()
      const w = m.width, h = m.height
      if (!suave || suave.length !== datos.length) suave = new Float32Array(datos.length)
      const bytes = new Uint8ClampedArray(datos.length)
      let suma = 0, sx = 0
      for (let i = 0; i < datos.length; i++) {
        const a = datos[i]
        suma += a
        sx += a * (i % w)
        const v = suave[i] = suave[i] * 0.25 + a * 0.75
        let e = (v - (0.5 - BANDA)) / (2 * BANDA)
        e = e <= 0 ? 0 : e >= 1 ? 1 : e * e * (3 - 2 * e)
        bytes[i] = e * 255
      }
      r.close()
      self.postMessage({ tipo: 'silueta', bytes, w, h, presencia: suma / datos.length, x: suma > 0 ? sx / suma / w : 0.5 }, [bytes.buffer])
    }
  } catch (e) {
    data.img?.close?.()
    self.postMessage({ tipo: 'error', mensaje: String(e && e.message || e) })
  }
}
