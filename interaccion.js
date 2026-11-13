// El detector de caras (y de manos y silueta) de la sección "interacción" del panel, como módulo: sketch.js lo
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
  // La silueta, con el botón "silueta": un segmentador separa a la persona del fondo. La
  // máscara es una imagen (lector.mascara, que sketch.js pone en el global `silueta` para
  // Hydra); aquí van los números que salen de ella.
  { nombre: 'presencia', que: 'cuánto del cuadro es persona: un cuerpo de frente a media distancia anda por 0.2–0.4', silueta: true },
  { nombre: 'silueta_x', que: 'el centro de la persona, de izquierda (0) a derecha (1), en espejo. Sin nadie se queda donde estaba', silueta: true },
]

// La diferencia entre cuadros se hace sobre una copia chica de la cámara, en gris. Un
// pixel cuenta como movimiento si su brillo cambió más que MARGEN (de 0 a 1).
const MOV_AN = 64, MOV_AL = 48, MARGEN = 0.08

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1'
const MODELO = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite'
const MODELO_MANOS = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'
const MODELO_SILUETA = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
// El punto de la mano que se publica: 9 es el nudillo del dedo medio, el centro de la palma.
const PALMA = 9

// crearLector({ delegados }): `delegados` para el detector de caras, en orden de preferencia.
// minimapper le pide sólo CPU: corre en este hilo y la GPU abriría un tercer contexto WebGL
// junto a p5 y Hydra, uno más que se pierde al conectar el proyector. Con un modelo tan chico,
// la diferencia no se nota. Manos y silueta, en cambio, prueban GPU primero: corren en su
// worker, con su propio contexto, y si ése se pierde vuelven solos a CPU (ver los workers).
//
// La cara (cercania, cerca, cara_x, movimiento) sólo se calcula con `conCara`: si la cámara
// se encendió nada más para las manos o la silueta, no se gasta este hilo en ella.
export function crearLector ({ delegados = ['GPU', 'CPU'], umbral = 0.45 } = {}) {
  let detector = null, cargando = null, ultimo = -1, crudo = 0, antes = performance.now()
  let x = 0.5, mov = 0, movCrudo = 0, anterior = null, lienzo = null
  let vision = null, fileset = null
  // Un worker por modelo: { w, ocupado, cargando, delegado, n, ms }. n cuenta resultados y
  // ms es lo que tardó el último, de que se pidió el cuadro a que llegó la respuesta.
  const trabajos = { manos: { w: null }, silueta: { w: null } }
  let presencia = 0, siluetaX = 0.5
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

  // Abre el worker de un modelo. Resuelve cuando el modelo cargó, con el delegado que quedó.
  function abrirWorker (cual, archivo, modelo, nombre, alResultado) {
    const t = trabajos[cual]
    return new Promise((resolver, fallar) => {
      const w = new Worker(new URL(archivo, import.meta.url), { type: 'module' })
      let listo = false
      w.onmessage = ({ data }) => {
        if (data.tipo === 'listo') { listo = true; t.w = w; t.delegado = data.delegado; t.n = 0; resolver(data.delegado) }
        else if (data.tipo === 'delegado') { t.delegado = data.delegado; console.info(`${nombre}: ahora en ${data.delegado}`); lector.alCambiarDelegado?.(cual, data.delegado) }
        else if (data.tipo === 'error') {
          t.ocupado = false
          if (!listo) { w.terminate(); fallar(new Error(`no se pudo cargar el modelo de ${nombre}: ` + data.mensaje)) }
          else { console.warn(nombre + ':', data.mensaje); siguiente(cual) }
        } else {
          t.ms = performance.now() - t.pedido
          t.n++
          t.ocupado = false
          alResultado(data)
          siguiente(cual)
        }
      }
      w.onerror = (e) => { w.terminate(); fallar(new Error(`no se pudo abrir el detector de ${nombre}: ` + (e.message || e))) }
      w.postMessage({ tipo: 'cargar', mp: MP, modelo, delegados: ['GPU', 'CPU'] })
    })
  }

  const activo = (cual) => cual === 'manos' ? lector.conManos : lector.conSilueta

  // Manda el cuadro actual al worker, a 320 pixeles de ancho: los modelos miran a unos 200
  // por dentro, así que no se pierde nada y se copia una cuarta parte. Uno a la vez.
  function pedir (cual) {
    const t = trabajos[cual], v = lector.video
    if (!t.w || t.ocupado || !activo(cual) || !v || v.readyState < 2 || !v.videoWidth) return
    t.ocupado = true
    t.cuadro = cuadros
    t.pedido = performance.now()
    const an = 320, al = Math.round(an * v.videoHeight / v.videoWidth)
    createImageBitmap(v, { resizeWidth: an, resizeHeight: al, resizeQuality: 'low' })
      .then(img => { if (t.w) t.w.postMessage({ tipo: 'cuadro', img, t: performance.now() }, [img]); else { img.close(); t.ocupado = false } })
      .catch(() => { t.ocupado = false })
  }

  // Al llegar un resultado se pide el siguiente cuadro sin esperar al bucle de la página
  // (que va a 20 Hz): si la cámara ya dio uno que el modelo no vio, de inmediato; si no, en
  // cuanto llegue (cuadros cuenta los de la cámara). El modelo marca el ritmo.
  let cuadros = 0, contando = null
  function contarCuadros (v) {
    if (contando === v || !v.requestVideoFrameCallback) return
    contando = v
    const otro = () => { if (contando !== v) return; cuadros++; esperando.splice(0).forEach(pedir); v.requestVideoFrameCallback(otro) }
    v.requestVideoFrameCallback(otro)
  }
  const esperando = []
  function siguiente (cual) {
    const v = lector.video
    if (!v || !v.requestVideoFrameCallback) return setTimeout(() => pedir(cual), 0)
    contarCuadros(v)
    if (cuadros > (trabajos[cual].cuadro ?? -1)) pedir(cual)
    else if (!esperando.includes(cual)) esperando.push(cual)
  }

  // Las palmas del cuadro, en espejo y con y hacia arriba. Con dos, cada una va a la ranura
  // que tenía más cerca, para que `mano` y `mano2` no se intercambien a cada cuadro. Se
  // publican en cuanto llegan (lector.alLlegar), con un suavizado ligero.
  function ubicarManos (r) {
    crudas = (r.landmarks || []).map(l => ({ x: 1 - l[PALMA].x, y: 1 - l[PALMA].y }))
    const d = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2
    let orden = crudas
    if (crudas.length === 2 && d(crudas[0], palmas[1]) + d(crudas[1], palmas[0]) < d(crudas[0], palmas[0]) + d(crudas[1], palmas[1])) {
      orden = [crudas[1], crudas[0]]
    }
    const nuevos = {}
    palmas.forEach((p, i) => {
      const o = orden[i]
      if (o) {
        if (!p.ve) { p.x = o.x; p.y = o.y }   // recién aparece: sin arrastrarla desde donde estaba
        else { p.x += (o.x - p.x) * 0.7; p.y += (o.y - p.y) * 0.7 }
      }
      p.ve = !!o
      const n = i ? 'mano2' : 'mano'
      nuevos[n] = p.ve ? 1 : 0
      nuevos[n + '_x'] = Math.min(1, Math.max(0, p.x))
      nuevos[n + '_y'] = Math.min(1, Math.max(0, p.y))
    })
    Object.assign(valores, nuevos)
    lector.alLlegar?.(nuevos)
  }

  function ubicarSilueta (data) {
    lector.mascara = { bytes: data.bytes, w: data.w, h: data.h, n: (lector.mascara?.n || 0) + 1 }
    presencia += (data.presencia - presencia) * 0.6
    if (data.presencia > 0.02) siluetaX += (1 - data.x - siluetaX) * 0.6
    const nuevos = { presencia, silueta_x: Math.min(1, Math.max(0, siluetaX)) }
    Object.assign(valores, nuevos)
    lector.alLlegar?.(nuevos, lector.mascara)
  }

  function cargarTrabajo (cual, archivo, modelo, nombre, alResultado) {
    const t = trabajos[cual]
    if (!t.cargando) t.cargando = bajarVision().then(() => abrirWorker(cual, archivo, modelo, nombre, alResultado)).catch(e => { t.cargando = null; throw e })
    return t.cargando
  }

  function cerrarTrabajo (cual) {
    const t = trabajos[cual]
    t.w?.terminate()
    trabajos[cual] = { w: null }
  }

  const lector = {
    umbral,
    valores,
    video: null,     // la cámara: la pone leer()
    alLlegar: null,  // (lecturas, mascara?) => …: manos y silueta, en cuanto llegan
    alCambiarDelegado: null,   // (cual, delegado) => …: un worker pasó de GPU a CPU
    caja: null,      // la cara más grande del último cuadro, en pixeles del video
    conCara: false,
    conManos: false,
    conSilueta: false,
    mascara: null,   // { bytes, w, h, n }: la última máscara, n cuenta las que llegaron
    // Los puntos de las manos del último cuadro, de 0 a 1 en espejo, para la miniatura.
    get manos () { return lector.conManos ? crudas : [] },
    get listo () { return !!detector || !!trabajos.manos.w || !!trabajos.silueta.w },
    // Para medir: resultados, ms del último y delegado de cada worker.
    get trabajos () { return Object.fromEntries(Object.entries(trabajos).map(([k, t]) => [k, { n: t.n || 0, ms: t.ms, delegado: t.delegado }])) },

    cargarManos () {
      return cargarTrabajo('manos', './manos-worker.js', MODELO_MANOS, 'manos', (data) => { if (lector.conManos) ubicarManos(data) })
    },

    cargarSilueta () {
      return cargarTrabajo('silueta', './silueta-worker.js', MODELO_SILUETA, 'silueta', (data) => { if (lector.conSilueta) ubicarSilueta(data) })
    },

    // Una sola carga aunque se pida dos veces: la promesa se comparte, y si falla se
    // borra para poder intentar de nuevo.
    cargar () {
      if (!cargando) cargando = crear().catch(e => { cargando = null; throw e })
      return cargando
    },

    // Llamar en cada vuelta del bucle de la cámara, haya o no cuadro nuevo: sin cara, la
    // cercanía baja suave hasta 0. Manos y silueta van por su lado; aquí sólo se les da el
    // empujón inicial (pedir no hace nada si ya están trabajando).
    leer (video, ahora = performance.now()) {
      const dt = Math.min(0.1, (ahora - antes) / 1000)
      antes = ahora
      lector.video = video
      const vivo = video.readyState >= 2
      pedir('manos')
      pedir('silueta')
      if (!vivo || !lector.conManos) {
        crudas = []
        palmas.forEach(p => { p.ve = false })
        valores.mano = valores.mano2 = 0
      }
      if (!vivo || !lector.conSilueta) { lector.mascara = null; presencia = 0; valores.presencia = 0 }

      const conCara = lector.conCara && detector && vivo
      if (conCara && video.currentTime !== ultimo) {
        ultimo = video.currentTime
        const r = detector.detectForVideo(video, performance.now())
        lector.caja = r.detections.map(d => d.boundingBox).sort((a, b) => b.width - a.width)[0] || null
        movCrudo = diferencia(video)
      }
      if (!conCara) { movCrudo = 0; anterior = null; lector.caja = null }
      const medida = conCara && lector.caja ? Math.min(1, lector.caja.width / video.videoWidth / 0.5) : 0
      // apenas suavizado: el sensor crudo tiembla. La rampa de verdad la pone cada quad.
      const k = 1 - Math.pow(0.5, dt * 60)
      crudo += (medida - crudo) * k
      // En espejo, como la miniatura: quien se mueve a su derecha ve el punto ir a la derecha.
      if (conCara && lector.caja) x += (1 - (lector.caja.originX + lector.caja.width / 2) / video.videoWidth - x) * k
      mov += (movCrudo - mov) * (1 - Math.pow(0.5, dt * 15))
      valores.cercania = crudo
      valores.cerca = crudo > lector.umbral ? 1 : 0
      valores.cara_x = Math.min(1, Math.max(0, x))
      valores.movimiento = mov
      return valores
    },

    cerrar () {
      detector?.close?.()
      detector = null
      cargando = null
      cerrarTrabajo('manos')
      cerrarTrabajo('silueta')
      lector.conCara = lector.conManos = lector.conSilueta = false
      lector.mascara = null
      lector.video = null
      contando = null
      esperando.length = 0
      anterior = null
    },
  }
  return lector
}
