![Minimapper](/assets/img/minimapperCaptura.png)

# MiniMapper

MiniMapper es una herramienta experimental para explorar videomapping generativo en tiempo real usando Hydra y p5.js.

Permite generar visuales y proyectarlos sobre superficies deformables con bordes curvos, manipulando directamente sus puntos de control en el espacio.

> Funciona mejor en **Chrome** o **Firefox**.

## Uso básico

- Haz clic en ✦ (o CTRL + SHIFT + H) para activar el modo edición
- Crea superficies con **+ Quad** o **+ Libre**
- Escribe código Hydra en el editor y haz clic en **RUN**
- **STOP** silencia la salida visual (hush())
- Vuelve a clic en ✦ para modo presentación (UI oculta)

## Tipos de superficie

### Quad
Superficie cuadrangular con parche Bezier cuadrático (grilla 3×3 de puntos de control).

- Clic en **+ Quad**, luego clic y arrastra en el canvas para definir el área
- **Puntos rojos (esquinas):** están sobre la superficie — arrástralos para reposicionar
- **Puntos amarillos (intermedios):** curvan los bordes sin tocar la superficie
- Soltar crea el quad; ESC cancela

### Libre (freeform)
Polígono de forma libre con cualquier número de vértices.

- Clic en **+ Libre** para activar el modo
- Clic en el canvas para colocar cada vértice
- Cierra la forma con **doble clic** en cualquier parte, o con **clic en el primer vértice** (se vuelve verde al acercarse)
- Mínimo 3 vértices; ESC cancela

## Fuentes de textura

Cada superficie puede usar una fuente distinta, seleccionable con el menú junto a su nombre:

- **Hydra:** usa el canvas de Hydra (por defecto)
- **Video:** carga un archivo de video local con el botón "Cargar"
- **Imagen:** carga una imagen local con el botón "Cargar"
- **Cámara:** usa la webcam conectada (pide permiso al navegador)

Las fuentes de video, imagen y cámara no persisten al recargar la página y deben volver a activarse manualmente.

## Guardar y cargar sesión

- **↓ Sesión:** descarga un archivo `.json` con el estado completo (código Hydra, vértices e imágenes embebidas)
- **↑ Sesión:** carga una sesión desde archivo — las imágenes se restauran automáticamente; los videos y la cámara deben recargarse manualmente

El código Hydra y la posición de los vértices también se auto-guardan en el navegador (localStorage) al hacer cualquier cambio.

## Atajos

| Acción | Atajo |
|---|---|
| Mostrar / ocultar UI | **CTRL + SHIFT + H** o clic en ✦ |
| Silenciar Hydra / cancelar modo dibujo | **ESC** |
| Deshacer movimiento de vértice | **CTRL + Z** |

## Créditos

- [Hydra](https://hydra.ojack.xyz/) — Olivia Jack
- [p5.js](https://p5js.org/) — Processing Foundation
