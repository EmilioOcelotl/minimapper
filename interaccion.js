// El detector de caras de la sección "interacción" del panel, como módulo: sketch.js lo
// carga con import() sólo al encender la cámara, así index.html sigue ligero.
//
// Una lectura = un nombre, un número de 0 a 1 y lo que mide. Agregar una lectura es sumar
// una fila aquí y calcularla en leer(): minimapper la descubre sola y la muestra en los
// selectores de señal.
export const LECTURAS = [
  { nombre: 'cercania', que: 'qué tan cerca está la cara más grande: su ancho contra el ancho del cuadro' },
  { nombre: 'cerca', que: '1 si la cercanía pasa el umbral, 0 si no. Un evento: la rampa la pone cada quad', evento: true },
]

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1'
const MODELO = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite'

// crearLector({ delegados }): `delegados` en orden de preferencia. minimapper pide sólo CPU:
// la GPU abriría un tercer contexto WebGL junto a p5 y Hydra, uno más que se pierde al
// conectar el proyector. Con un modelo tan chico, la diferencia no se nota.
export function crearLector ({ delegados = ['GPU', 'CPU'], umbral = 0.45 } = {}) {
  let detector = null, cargando = null, ultimo = -1, crudo = 0, antes = performance.now()
  const valores = Object.fromEntries(LECTURAS.map(l => [l.nombre, 0]))

  async function crear () {
    let vision, fileset
    try {
      vision = await import(MP + '/vision_bundle.mjs')
      fileset = await vision.FilesetResolver.forVisionTasks(MP + '/wasm')
    } catch (e) {
      throw new Error('no se pudo bajar el modelo. Hace falta internet la primera vez; después queda guardado en el navegador')
    }
    let error
    for (const delegate of delegados) {
      try {
        detector = await vision.FaceDetector.createFromOptions(fileset,
          { baseOptions: { modelAssetPath: MODELO, delegate }, runningMode: 'VIDEO' })
        return
      } catch (e) { error = e }
    }
    throw error
  }

  const lector = {
    umbral,
    valores,
    caja: null,   // la cara más grande del último cuadro, en pixeles del video
    get listo () { return !!detector },

    // Una sola carga aunque se pida dos veces: la promesa se comparte, y si falla se
    // borra para poder intentar de nuevo.
    cargar () {
      if (!cargando) cargando = crear().catch(e => { cargando = null; throw e })
      return cargando
    },

    // Llamar en cada vuelta del bucle, haya o no cuadro nuevo: sin cara, la cercanía
    // baja suave hasta 0.
    leer (video, ahora = performance.now()) {
      const dt = Math.min(0.1, (ahora - antes) / 1000)
      antes = ahora
      const listo = detector && video.readyState >= 2
      if (listo && video.currentTime !== ultimo) {
        ultimo = video.currentTime
        const r = detector.detectForVideo(video, performance.now())
        lector.caja = r.detections.map(d => d.boundingBox).sort((a, b) => b.width - a.width)[0] || null
      }
      const medida = listo && lector.caja ? Math.min(1, lector.caja.width / video.videoWidth / 0.5) : 0
      // apenas suavizado: el sensor crudo tiembla. La rampa de verdad la pone cada quad.
      crudo += (medida - crudo) * (1 - Math.pow(0.5, dt * 60))
      valores.cercania = crudo
      valores.cerca = crudo > lector.umbral ? 1 : 0
      return valores
    },

    cerrar () {
      detector?.close?.()
      detector = null
      cargando = null
    },
  }
  return lector
}
