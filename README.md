# MiniMapper

MiniMapper es una herramienta experimental para explorar videomapping generativo en tiempo real usando Hydra y p5.js.

Permite generar visuales y proyectarlos sobre superficies deformables (quads) con bordes curvos, manipulando directamente sus puntos de control en el espacio.

## Uso básico

- Haz clic en ✦ para activar el modo edición
- Haz clic en + Quad para crear una superficie
- Escribe o modifica el código de Hydra en el editor
- Haz clic en RUN para ejecutar
- Usa STOP para silenciar (hush())

## Fuentes de textura

Cada quad puede usar una fuente distinta, seleccionable con el menú junto a su nombre:

- **Hydra:** usa el canvas de Hydra (por defecto)
- **Video:** carga un archivo de video local con el botón "Cargar"
- **Imagen:** carga una imagen local con el botón "Cargar"

Las fuentes de video e imagen no persisten al recargar la página y deben volver a cargarse.

## Interacción

- **+ Quad:** activa el modo dibujo — el cursor cambia a crosshair. Clic y arrastra en el canvas para definir el área del quad; soltar lo crea. ESC cancela.
- **Puntos rojos (esquinas):** están sobre la superficie — arrástralos para reposicionar el quad
- **Puntos amarillos (intermedios):** atraen la superficie hacia ellos curvando los bordes. El punto activo se muestra en blanco mientras se arrastra.
- **✕** (en cada quad): eliminar superficie
- **RUN:** ejecutar código Hydra
- **STOP:** detener salida visual
- **CTRL + SHIFT + H** o clic en ✦: mostrar / ocultar interfaz
- **ESC:** silenciar o cancelar modo dibujo

## Créditos

- [Hydra](https://hydra.ojack.xyz/) — Olivia Jack
- [p5.js](https://p5js.org/) — Processing Foundation
