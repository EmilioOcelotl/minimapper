// El modelo de manos de interaccion.js, en su propio hilo. En el hilo de la página tarda
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

let manos = null

self.onmessage = async ({ data }) => {
  try {
    if (data.tipo === 'cargar') {
      const vision = await import(data.mp + '/vision_bundle.mjs')
      const fileset = await vision.FilesetResolver.forVisionTasks(data.mp + '/wasm')
      manos = await vision.HandLandmarker.createFromOptions(fileset,
        { baseOptions: { modelAssetPath: data.modelo, delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 2 })
      self.postMessage({ tipo: 'listo' })
    } else if (data.tipo === 'cuadro') {
      const r = manos.detectForVideo(data.img, data.t)
      data.img.close()
      self.postMessage({ tipo: 'manos', landmarks: r.landmarks || [] })
    }
  } catch (e) {
    data.img?.close?.()
    self.postMessage({ tipo: 'error', mensaje: String(e && e.message || e) })
  }
}
