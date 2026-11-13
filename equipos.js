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
      breve: 'Papis',
      idea: 'Tres espacios de una casa, en imágenes que Hydra distorsiona al acercarse. La cercanía cambia la velocidad de una muestra de audio.',
      usa: ['camara'],
      lecturas: ['cercania'],
      receta: [
        'Un quad Hydra por espacio, cada uno con su imagen en su propia fuente: `s0.initImage(\'enlace\')` en el primero, `s1` en el segundo, `s2` en el tercero.',
        'El enlace de la nube tiene que ser el de descarga, `/api/public/dl/…`, no el de `/share/`: Hydra no lo traduce.',
        'La distorsión, poco a poco: `src(s0).modulate(noise(3), () => rampa(\'cercania\', 3) * 0.5).out(o0)`.',
        'Sonido: + Pista, señal `cercania`, mueve `velocidad`. Lenta es la velocidad de lejos y rápida la de cerca; invertir lo voltea. El tono cambia con la velocidad.',
        'Subida y bajada de la pista iguales a la de la imagen, para que cambien juntas.',
      ],
      nota: 'La cámara tiene que ver la cara de quien se acerca, no la proyección.',
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
      id: 'mesa',
      caso: 'Animación de una mesa',
      breve: 'Flower',
      idea: 'Sobre una mesa: al acercarse alguien, aparece un video y empieza; al irse, se apaga y se detiene.',
      usa: ['camara'],
      lecturas: ['cercania', 'cerca'],
      receta: [
        'El umbral de la cámara decide qué tan cerca es cerca: muévanlo hasta que `cerca` pase a 1 donde quieren que empiece. Se recuerda en esta computadora.',
        'Un quad con fuente Video. Señal `cerca` → nivel, y reproduce: con señal.',
        'Subida es lo que tarda en aparecer, bajada lo que tarda en apagarse. Al terminar de apagarse, el video se detiene y vuelve al principio.',
      ],
      nota: 'La cámara tiene que ver la cara de quien se acerca a la mesa, no la proyección.',
    },
    {
      id: 'aura',
      caso: 'Aura',
      breve: 'Aura',
      idea: 'Una textura de Hydra que el cuerpo de quien está enfrente deforma.',
      usa: ['silueta'],
      lecturas: ['presencia', 'silueta_x'],
      receta: [
        'Arriba del código: `s0.init({ src: silueta })`. La silueta es blanca donde hay persona y negra donde no.',
        'Antes de `.out(o0)`: `.modulate(src(s0), () => rampa(\'presencia\', 0.5, 2) * 0.3)`. Sin nadie no pasa nada; al llegar alguien, el cuerpo empuja la textura.',
        'Con `.mask(src(s0))` la textura se ve sólo dentro del cuerpo; con `.mult(src(s0).invert())`, sólo fuera.',
        'Silueta enciende la cámara sola. La cámara no se proyecta: sólo la máscara, dentro de su código.',
      ],
      nota: 'El modelo espera a la persona de frente y a media distancia, como en una videollamada. Que la cámara no vea la proyección.',
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
