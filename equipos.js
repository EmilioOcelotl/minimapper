// Las tarjetas de la sección "equipos" de la pestaña de interacción. Sólo se bajan con
// ?equipos=<grupo> (ver iniciarEquipos en sketch.js). Un grupo es una lista de proyectos:
//
//   id       clave corta, sin espacios: se recuerda cuál eligió cada laptop
//   caso     lo que propone el proyecto. Nunca el nombre de quien lo hizo
//   breve    el nombre breve del equipo, cuando lo den ('' mientras tanto)
//   idea     una frase: qué pasa en la pieza
//   usa      fuentes del panel: 'camara', 'mic', 'mouse'. [] = sin interacción
//   lecturas las que conviene mirar en vivo
//   receta   pasos con lo que hay en minimapper; `así` se vuelve código
//   nota     lo que hay que resolver fuera de minimapper
//
// Los casos salen de las entregas del 13 nov 2026 para la proyección del 20 nov.

// Enlaces del grupo que encabezan la bienvenida, arriba de los de siempre.
export const RECURSOS = {
  'lab-cct': [
    { texto: 'Página del curso', url: 'https://emilioocelotl.github.io/centro-2027-I/lab-cct/', nota: 'lab-cct' },
    { texto: 'Ejemplos de interacción', url: 'https://emilioocelotl.github.io/centro-2027-I/lab-cct/interaccion/', nota: 'sesión 9' },
  ],
}

export const EQUIPOS = {
  'lab-cct': [
    {
      id: 'cueva',
      caso: 'Cueva / estados del agua',
      breve: '',
      idea: 'Cuatro caras de una cueva. Al acercarse, el agua cambia de estado y suenan gotas con eco.',
      usa: ['camara'],
      lecturas: ['cercania', 'cerca'],
      receta: [
        'Un quad por cara. En cada uno, señal `cercania` → nivel, subida 2 s, bajada 4 s.',
        'Una escena por estado del agua si cambian de imagen, no sólo de brillo: en escena por señal, `cerca`.',
        'Sonido: + Pista con las gotas, bucle sí, señal `cercania`, subida 1 s, bajada 5 s.',
      ],
      nota: 'El eco va en el archivo: el efecto Eco de Audacity alcanza. En la caja a escala, la cámara tiene que ver la cara de quien se asoma, no la proyección.',
    },
    {
      id: 'sala',
      caso: 'Sala, cocina, comedor',
      breve: '',
      idea: 'Tres espacios de una casa que se vuelven surreales, poco a poco, al acercarse.',
      usa: ['camara'],
      lecturas: ['cercania'],
      receta: [
        'Ya lo tienen en Hydra con `() => sensor.cercania`. Para que cambie poco a poco: `() => rampa(\'cercania\', 3)` sube en 3 s y baja en 3 s.',
        'Con otra bajada: `() => rampa(\'cercania\', 3, 6)`.',
        'Sin código: señal `cercania` en el quad, con subida y bajada.',
        'Sonido: + Pista, señal `cercania`, con la misma subida que la imagen para que entren juntas.',
      ],
    },
    {
      id: 'graves',
      caso: 'Cercanía y graves',
      breve: '',
      idea: 'Sólo sonido: mientras más cerca, más fuerte el grave.',
      usa: ['camara'],
      lecturas: ['cercania'],
      receta: [
        '+ Pista con los graves, bucle sí, señal `cercania`.',
        'Subida 0.5 s y bajada 2 s: que no corte en seco cuando la persona se va.',
        'Si quieren que se vea algo, un quad con señal `cercania` → nivel.',
      ],
      nota: 'Los graves casi no salen de una laptop: prueben con las bocinas del salón antes del 20.',
    },
    {
      id: 'bosque',
      caso: 'Bosque → ciudad',
      breve: '',
      idea: 'Un paisaje sonoro de 60 s que pasa del bosque a la ciudad.',
      usa: [],
      lecturas: [],
      receta: [
        '+ Pista con el audio, sin señal (siempre) y bucle no. ▶ al empezar.',
        'Si hay imagen, una escena de 60 s en mapear y reproducción ▶. Se arranca la escena y la pista al mismo tiempo.',
      ],
      nota: 'Lo que entregaron es el texto de un prompt: falta generar o grabar el audio y traerlo como archivo. Queda constancia: sin interacción.',
    },
    {
      id: 'video',
      caso: 'Video con sonido',
      breve: '',
      idea: 'Un video de YouTube proyectado, con su sonido.',
      usa: [],
      lecturas: [],
      receta: [
        'Fuente Pantalla en el quad y compartir la pestaña del video. El sonido sale de esa pestaña: no la silencien.',
        'Para que no se vea la interfaz de YouTube: pantalla completa del video en su pestaña antes de compartirla.',
      ],
      nota: 'En Mac se trabó y en Windows no: proyecten desde una Windows. Queda constancia: sin interacción.',
    },
    {
      id: 'galaxia',
      caso: 'Galaxia / night city',
      breve: '',
      idea: 'Tocar el muro cambia la animación, el aplauso da pigmento y moverse a los lados cambia el tamaño.',
      usa: ['camara', 'mic'],
      lecturas: ['movimiento', 'volumen', 'cara_x'],
      receta: [
        'Tocar el muro: una escena por animación. En escena por señal, `movimiento`, umbral 0.5.',
        'Aplauso o voz → pigmento: señal `volumen` → saturación del quad, subida 0 s, bajada 1.5 s. La ganancia del mic decide cuánto ruido hace falta.',
        'Izquierda y derecha → tamaño, en Hydra: `.scale(() => 0.5 + rampa(\'cara_x\', 0.5))`.',
      ],
      nota: 'Si la cámara ve la proyección, la animación se mueve y cambia la escena sola: apúntenla al muro, fuera de la imagen proyectada.',
    },
    {
      id: 'lineas',
      caso: 'Líneas que observan',
      breve: '',
      idea: 'En una maqueta, una rejilla de líneas que gira para mirar las manos de quien se acerca.',
      usa: ['manos'],
      lecturas: ['mano', 'mano_x', 'mano_y', 'mano2'],
      receta: [
        'El sketch va en un quad con fuente Código p5. Donde decía `mouseX`, `sensor.mano_x * width`; donde decía `mouseY`, `(1 - sensor.mano_y) * height`.',
        'Sólo cuando `sensor.mano` vale 1 hay mano. Sin ella, las líneas se quedan quietas.',
        'Con `sensor.mano2` hay una segunda mano: cada línea mira a la más cercana.',
        'Manos enciende la cámara sola. La cámara no se proyecta: sólo llegan los números.',
      ],
      nota: 'La cámara tiene que ver las manos, no la proyección: póngala de frente a quien se acerca. Con poca luz las pierde.',
    },
  ],
}
