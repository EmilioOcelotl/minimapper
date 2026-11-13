// El detector de caras (y de manos) de la sección "interacción" del panel, como módulo: sketch.js lo
// carga con import() sólo al encender la cámara, así index.html sigue ligero.
//
// Una lectura = un nombre, un número de 0 a 1 y lo que mide. Agregar una lectura es sumar
// una fila aquí y calcularla en leer(): minimapper la descubre sola y la muestra en los
// selectores de señal.
export const LECTURAS = [
  { nombre: 'cercania', que: 'qué tan cerca está la cara más grande: su ancho contra el ancho del cuadro' },
  { nombre: 'cerca', que: '1 si la cercanía pasa el umbral, 0 si no. Un evento: la rampa la pone cada quad', evento: true },
  { nombre: 'cara_x', que: 'dónde está la cara, de izquierda (0) a derecha (1), como se ve en la miniatura. Sin cara se queda donde estaba' },
  { nombre: 'movimiento', que: 'cuánto cambió la imagen entre dos cuadros, sin modelo: un 20 % del cuadro en movimiento ya es 1' },
  // Las manos sólo se buscan con el botón "manos" (otro modelo, más caro que el de caras).
  // Centro de la palma, en espejo como cara_x, con `y` hacia arriba como el recuadro del
  // mouse: sensor.mano_x y sensor.mano_y se leen igual que sensor.x y sensor.y. Sin mano,
  // la posición se queda donde estaba y `mano` baja a 0. Con una sola mano es siempre `mano`.
  { nombre: 'mano', que: '1 si la cámara ve una mano, 0 si no', manos: true, evento: true },
  { nombre: 'mano_x', que: 'centro de la palma, de izquierda (0) a derecha (1)', manos: true },
  { nombre: 'mano_y', que: 'centro de la palma, de abajo (0) a arriba (1)', manos: true },
  { nombre: 'mano2', que: '1 si ve una segunda mano', manos: true, evento: true },
  { nombre: 'mano2_x', que: 'la segunda mano, de izquierda a derecha', manos: true },
  { nombre: 'mano2_y', que: 'la segunda mano, de abajo a arriba', manos: true },
]

// La diferencia entre cuadros se hace sobre una copia chica de la cámara, en gris. Un
// pixel cuenta como movimiento si su brillo cambió más que MARGEN (de 0 a 1).
const MOV_AN = 64, MOV_AL = 48, MARGEN = 0.08

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1'
const MODELO = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite'
const MODELO_MANOS = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'
// El punto de la mano que se publica: 9 es el nudillo del dedo medio, el centro de la palma.
const PALMA = 9

// crearLector({ delegados }): `delegados` en orden de preferencia. minimapper pide sólo CPU:
// la GPU abriría un tercer contexto WebGL junto a p5 y Hydra, uno más que se pierde al
// conectar el proyector. Con un modelo tan chico, la diferencia no se nota.
export function crearLector ({ delegados = ['GPU', 'CPU'], umbral = 0.45 } = {}) {
  let detector = null, cargando = null, ultimo = -1, crudo = 0, antes = performance.now()
  let x = 0.5, mov = 0, movCrudo = 0, anterior = null, lienzo = null
  let vision = null, fileset = null, manos = null, cargandoManos = null, ocupado = false
  // Las dos manos, ya suavizadas. `ve` es si el último cuadro la encontró.
  const palmas = [{ x: 0.5, y: 0.5, ve: false }, { x: 0.5, y: 0.5, ve: false }]
  let crudas = []
  const valores = Object.fromEntries(LECTURAS.map(l => [l.nombre, 0]))

  // Fracción del cuadro que cambió desde el anterior, de 0 a 1 (ver MOV_AN, MARGEN).
  function diferencia (video) {
    if (!lienzo) {
      lienzo = document.createElement('canvas')
      lienzo.width = MOV_AN
      lienzo.height = MOV_AL
    }
    const cc = lienzo.getContext('2d', { willReadFrequently: true })
    cc.drawImage(video, 0, 0, MOV_AN, MOV_AL)
    const px = cc.getImageData(0, 0, MOV_AN, MOV_AL).data
    const gris = new Float32Array(MOV_AN * MOV_AL)
    let cuenta = 0
    for (let i = 0; i < gris.length; i++) {
      gris[i] = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 765
      if (anterior && Math.abs(gris[i] - anterior[i]) > MARGEN) cuenta++
    }
    anterior = gris
    return Math.min(1, cuenta / gris.length / 0.2)
  }

  async function bajarVision () {
    if (vision) return
    try {
      vision = await import(MP + '/vision_bundle.mjs')
      fileset = await vision.FilesetResolver.forVisionTasks(MP + '/wasm')
    } catch (e) {
      vision = null
      throw new Error('no se pudo bajar el modelo. Hace falta internet la primera vez; después queda guardado en el navegador')
    }
  }

  async function crear () {
    await bajarVision()
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

  // Las manos corren en manos-worker.js: el modelo tarda unos 60 ms por cuadro, y en este
  // hilo frenaba el dibujo. Un cuadro a la vez: mientras el worker piensa, no se manda otro.
  function crearManos () {
    return new Promise((resolver, fallar) => {
      const w = new Worker(new URL('./manos-worker.js', import.meta.url), { type: 'module' })
      w.onmessage = ({ data }) => {
        if (data.tipo === 'listo') { manos = w; resolver() }
        else if (data.tipo === 'manos') { ocupado = false; if (lector.conManos) ubicarManos(data) }
        else if (data.tipo === 'error') {
          ocupado = false
          if (!manos) { w.terminate(); fallar(new Error('no se pudo cargar el modelo de manos: ' + data.mensaje)) }
          else console.warn('manos:', data.mensaje)
        }
      }
      w.onerror = (e) => { w.terminate(); fallar(new Error('no se pudo abrir el detector de manos: ' + (e.message || e))) }
      w.postMessage({ tipo: 'cargar', mp: MP, modelo: MODELO_MANOS })
    })
  }

  function mandarCuadro (video) {
    ocupado = true
    createImageBitmap(video)
      .then(img => { if (manos) manos.postMessage({ tipo: 'cuadro', img, t: performance.now() }, [img]); else { img.close(); ocupado = false } })
      .catch(() => { ocupado = false })
  }

  // Las palmas del cuadro, en espejo y con y hacia arriba. Con dos, cada una va a la ranura
  // que tenía más cerca, para que `mano` y `mano2` no se intercambien a cada cuadro.
  function ubicarManos (r) {
    crudas = (r.landmarks || []).map(l => ({ x: 1 - l[PALMA].x, y: 1 - l[PALMA].y }))
    const d = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2
    let orden = crudas
    if (crudas.length === 2 && d(crudas[0], palmas[1]) + d(crudas[1], palmas[0]) < d(crudas[0], palmas[0]) + d(crudas[1], palmas[1])) {
      orden = [crudas[1], crudas[0]]
    }
    palmas.forEach((p, i) => { p.ve = !!orden[i]; p.meta = orden[i] })
  }

  const lector = {
    umbral,
    valores,
    caja: null,   // la cara más grande del último cuadro, en pixeles del video
    // Los puntos de las manos del último cuadro, de 0 a 1 en espejo, para la miniatura.
    get manos () { return lector.conManos ? crudas : [] },
    conManos: false,
    get listo () { return !!detector },

    cargarManos () {
      if (!cargandoManos) cargandoManos = crearManos().catch(e => { cargandoManos = null; throw e })
      return cargandoManos
    },

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
        movCrudo = diferencia(video)
      }
      if (listo && manos && lector.conManos && !ocupado) mandarCuadro(video)
      if (!listo || !lector.conManos) { crudas = []; palmas.forEach(p => { p.ve = false }) }
      if (!listo) { movCrudo = 0; anterior = null }
      const medida = listo && lector.caja ? Math.min(1, lector.caja.width / video.videoWidth / 0.5) : 0
      // apenas suavizado: el sensor crudo tiembla. La rampa de verdad la pone cada quad.
      const k = 1 - Math.pow(0.5, dt * 60)
      crudo += (medida - crudo) * k
      // En espejo, como la miniatura: quien se mueve a su derecha ve el punto ir a la derecha.
      if (listo && lector.caja) x += (1 - (lector.caja.originX + lector.caja.width / 2) / video.videoWidth - x) * k
      mov += (movCrudo - mov) * (1 - Math.pow(0.5, dt * 15))
      valores.cercania = crudo
      valores.cerca = crudo > lector.umbral ? 1 : 0
      valores.cara_x = Math.min(1, Math.max(0, x))
      valores.movimiento = mov
      palmas.forEach((p, i) => {
        if (p.ve && p.meta) { p.x += (p.meta.x - p.x) * k; p.y += (p.meta.y - p.y) * k }
        const n = i ? 'mano2' : 'mano'
        valores[n] = p.ve ? 1 : 0
        valores[n + '_x'] = Math.min(1, Math.max(0, p.x))
        valores[n + '_y'] = Math.min(1, Math.max(0, p.y))
      })
      return valores
    },

    cerrar () {
      detector?.close?.()
      detector = null
      manos?.terminate()
      manos = null
      ocupado = false
      cargandoManos = null
      lector.conManos = false
      cargando = null
      anterior = null
    },
  }
  return lector
}
