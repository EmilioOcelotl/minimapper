// El segmentador de interaccion.js (botón "silueta"), en su propio hilo, como el de manos
// (ver manos-worker.js). Recibe un ImageBitmap del cuadro y devuelve la máscara en bytes
// (0 fondo, 255 persona), ya limpia, más la presencia y el centro de la persona.
//
// La limpieza es la del ejemplo de silueta de lab-cct: cada máscara se mezcla con la
// anterior para que no tiemble, y la orilla pasa por un umbral suave alrededor de 0.5.
self.importScripts = (...urls) => {
  for (const u of urls) {
    const x = new XMLHttpRequest()
    x.open('GET', u, false)
    x.send()
    ;(0, eval)(x.responseText)
  }
}

const BANDA = 0.12   // media anchura de la orilla: 0 sería un corte seco
let modelo = null, suave = null

self.onmessage = async ({ data }) => {
  try {
    if (data.tipo === 'cargar') {
      const vision = await import(data.mp + '/vision_bundle.mjs')
      const fileset = await vision.FilesetResolver.forVisionTasks(data.mp + '/wasm')
      modelo = await vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: data.modelo, delegate: 'CPU' },
        runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
      })
      self.postMessage({ tipo: 'listo' })
    } else if (data.tipo === 'cuadro') {
      const r = modelo.segmentForVideo(data.img, data.t)
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
        const v = suave[i] = suave[i] * 0.5 + a * 0.5
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
