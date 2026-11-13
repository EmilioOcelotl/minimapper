// --- MODO EDICIÓN / PRESENTACIÓN ---

let uiVisible = false;
let showHint = true;

// index.html?salida es la ventana que va al proyector: sólo el resultado. Nunca
// entra a edición, no muestra ✦, hint, ayuda, HUD ni cursor, ignora el teclado y
// no escribe nunca en localStorage: el dueño del estado es el editor, y la salida lo
// sigue (ver "PRESENTAR"). Sin editor, se queda con lo guardado al cargar.
const SALIDA = new URLSearchParams(location.search).has('salida');
// Con dos proyectores, cada salida es una región del lienzo: ?salida=A o ?salida=B.
const SALIDA_ID = SALIDA && new URLSearchParams(location.search).get('salida') === 'B' ? 'B' : 'A';

function toggleEditMode() {
  if (SALIDA) return;
  if (isPlaying) stopPlayback();
  if (drawingMode) cancelDrawing();
  if (freeformMode) cancelFreeform();
  uiVisible = !uiVisible;
  if (showHint) {
    showHint = false;
    document.getElementById("hint").style.display = "none";
  }
  const panel = document.getElementById('ui');
  const btn = document.getElementById('toggle-btn');
  const infoBtn = document.getElementById('info-btn');

  if (uiVisible) {
    panel.classList.add('visible');
    btn.classList.remove('presentation');
    infoBtn.classList.add('visible');
  } else {
    panel.classList.remove('visible');
    btn.classList.add('presentation');
    document.getElementById('welcome').classList.remove('visible');
    infoBtn.classList.remove('visible');
  }
}

function togglePanelCollapse() {
  const ui = document.getElementById('ui');
  const btn = document.getElementById('panel-collapse');
  ui.classList.toggle('collapsed');
  btn.textContent = ui.classList.contains('collapsed') ? '›' : '‹';
}

// Pestañas del panel. Presentar (arriba) y la sesión (abajo) quedan fuera de ellas: se usan
// desde cualquier pestaña. La pestaña abierta se recuerda entre recargas.
const PESTANAS = ['mapear', 'interaccion', 'salidas'];
let pestanaActiva = 'mapear';

function mostrarPestana(nombre) {
  if (!PESTANAS.includes(nombre)) nombre = 'mapear';
  pestanaActiva = nombre;
  document.querySelectorAll('#pestanas [data-pestana]').forEach(b => b.setAttribute('aria-selected', b.dataset.pestana === nombre));
  document.querySelectorAll('.pestana').forEach(p => p.classList.toggle('activa', p.dataset.pestana === nombre));
  try { localStorage.setItem('minimapper_pestana', nombre); } catch (e) {}
}

document.addEventListener('DOMContentLoaded', () => {
  let guardada = null;
  try { guardada = localStorage.getItem('minimapper_pestana'); } catch (e) {}
  mostrarPestana(guardada || 'mapear');
  renderMontaje();
});

// Modal de bienvenida / ayuda. En la primera visita se muestra solo (marca en
// localStorage); al cerrarlo se revela el entorno de trabajo. Después, el
// botón ? lo reabre sin cambiar de modo.
let pendingFirstReveal = false;

function openWelcome() {
  document.getElementById('welcome').classList.add('visible');
}

function closeWelcome() {
  document.getElementById('welcome').classList.remove('visible');
  if (pendingFirstReveal) {
    pendingFirstReveal = false;
    try { localStorage.setItem('minimapper_welcomed', '1'); } catch (e) {}
    if (!uiVisible) toggleEditMode();   // revela el entorno de trabajo
  }
}

document.addEventListener('keydown', (e) => {
  if (SALIDA) return;
  if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === 'H') toggleEditMode();
  if (e.key === 'Escape') {
    const welcome = document.getElementById('welcome');
    if (welcome && welcome.classList.contains('visible')) { closeWelcome(); return; }
    if (freeformMode) cancelFreeform();
    else if (drawingMode) cancelDrawing();
    else if (isPlaying) { stopPlayback(); if (!uiVisible) toggleEditMode(); }
    else stopHydra();
  }
  if (e.ctrlKey && e.key === 'z' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    undo();
  }
});

function alternarPantallaCompleta() {
  const el = document.documentElement;
  const dentro = document.fullscreenElement || document.webkitFullscreenElement;
  if (dentro) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('toggle-btn').classList.add('presentation');
  document.getElementById('info-btn').classList.remove('visible');
  loadFromLocalStorage();
  if (!SALIDA) {
    pistas.forEach(p => { if (p.url) prepararAudioPista(p, p.url); });
    renderPistas();
    renderEscenaSenal();
    iniciarEquipos();
  }
  if (SALIDA) {
    document.body.classList.add('salida');
    // La salida no tiene botones, y F11 en Windows a veces no responde (Fn+F11 duerme el
    // equipo): doble clic entra y sale de pantalla completa. ESC también sale.
    document.addEventListener('dblclick', alternarPantallaCompleta);
    // Con dos salidas, la letra en grande dice a qué proyector va esta ventana, hasta que
    // entra a pantalla completa.
    document.getElementById('letra-salida').textContent = SALIDA_ID;
    const completa = () => document.body.classList.toggle('completa', !!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', completa);
    document.addEventListener('webkitfullscreenchange', completa);
    actualizarSalidaDOM();
    return;
  }
  // El hint se proyectaría si la app se queda en presentación después de recargar.
  setTimeout(() => {
    if (!showHint) return;
    showHint = false;
    document.getElementById('hint').style.display = 'none';
  }, 10000);
  let welcomed = false;
  try { welcomed = !!localStorage.getItem('minimapper_welcomed'); } catch (e) {}
  if (!welcomed) {
    pendingFirstReveal = true;
    openWelcome();
  }
});

// --- HYDRA ---

var hydra = new Hydra({ canvas: document.getElementById("myCanvas") });
// p5 overwrites window.noise at DOMContentLoaded; capture Hydra's version first
var _hydraNoise = window.noise;
// Capture output references before anything overwrites them
const HYDRA_OUTPUTS = [o0, o1, o2, o3];

osc(1, 1, 1).out();

const BLOCKED = [
  'fetch', 'XMLHttpRequest', 'WebSocket',
  'document', 'window', 'location',
  'localStorage', 'sessionStorage', 'indexedDB',
  'navigator', 'history', 'cookie',
  'import', 'require', 'process',
  '__proto__', 'prototype', 'constructor'
];

function evalHydra(code) {
  const found = BLOCKED.find(word => code.includes(word));
  if (found) return found;
  try {
    eval(code);
  } catch (e) {
    console.log(e);
  }
  return null;
}

function runQuadHydra(index) {
  const code = quads[index]?.hydraCode || '';
  const statusEl = document.getElementById(`hydra-status-${index}`);
  const blocked = evalHydra(code);
  if (blocked) {
    if (statusEl) { statusEl.textContent = '✗'; statusEl.className = 'status-error'; clearTimeout(statusEl._t); statusEl._t = setTimeout(() => { statusEl.textContent = ''; statusEl.className = ''; }, 3000); }
    return;
  }
  // Sync code to all quads sharing the same hydra output slot
  const slot = quads[index]?.hydraOutput;
  if (slot != null) {
    quads.forEach((q, i) => {
      if (i !== index && q.sourceType === 'hydra' && q.hydraOutput === slot) {
        q.hydraCode = code;
        const ta = document.getElementById(`hydra-code-${i}`);
        if (ta) ta.value = code;
      }
    });
  }
  if (statusEl) { statusEl.textContent = '✓'; statusEl.className = 'status-ok'; clearTimeout(statusEl._t); statusEl._t = setTimeout(() => { statusEl.textContent = ''; statusEl.className = ''; }, 3000); }
  saveToLocalStorage();
}

function stopHydra() {
  try {
    hush();
  } catch (e) {
    console.log("Error al ejecutar hush:", e);
  }
}

// --- SESIÓN ---

function saveSession() {
  snapshotCurrentScene();
  const session = {
    version: 2,
    scenes: scenes.map((s, si) => ({
      id: s.id,
      duration_s: s.duration_s,
      hydraCode: s.hydraCode || '',
      quads: si === currentSceneIndex
        ? quads.map(q => {
            const srcUrl = (q.sourceUrl && q.sourceUrl.startsWith('http')) ? q.sourceUrl : null;
            let imageData = null;
            if (!srcUrl && q.sourceType === 'image' && q.sourceEl && q.sourceEl.canvas) {
              try { imageData = q.sourceEl.canvas.toDataURL('image/png'); } catch (e) {}
            }
            const srcType = (srcUrl || imageData) ? q.sourceType : (q.sourceType === 'image' ? 'hydra' : q.sourceType);
            const data = q.kind === 'freeform'
              ? { kind: 'freeform', vertices: q.vertices.map(v => ({ x: v.x, y: v.y })), sourceType: srcType }
              : { kind: 'quad', points: q.points.map(p => ({ x: p.x, y: p.y })), sourceType: srcType };
            if (srcUrl) data.sourceUrl = srcUrl;
            if (imageData) data.imageData = imageData;
            if (q.sourceType === 'hydra') { data.hydraCode = q.hydraCode || ''; data.hydraOutput = q.hydraOutput ?? 0; }
            if (q.sourceType === 'p5') data.p5Code = q.p5Code || '';
            const color = colorParaGuardar(q.color);
            if (color) data.color = color;
            if (q.recorte) data.recorte = q.recorte;
            return data;
          })
        : serializableQuads(s.quads)
    })),
    currentSceneIndex,
    playbackMode,
    montaje,
    pistas: pistasParaGuardar(),
    escenaSenal
  };
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `minimapper_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function loadSession() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        applySession(JSON.parse(ev.target.result));
      } catch (err) {
        alert("Archivo de sesión inválido.");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// Una sesión v1 es una sola escena con hydraCode global. Se normaliza a la forma
// v2 para que la restauración tenga un solo camino.
function normalizeSession(session) {
  if (session.version === 2 && session.scenes && session.scenes.length > 0) {
    return {
      scenes: session.scenes.map(s => ({
        id: s.id,
        duration_s: s.duration_s || 30,
        hydraCode: s.hydraCode || '',
        quads: s.quads || []
      })),
      currentSceneIndex: session.currentSceneIndex || 0,
      playbackMode: session.playbackMode || 'once',
      montaje: session.montaje,
      pistas: session.pistas,
      escenaSenal: session.escenaSenal
    };
  }
  return {
    scenes: [{ id: 1, duration_s: 30, hydraCode: session.hydraCode || '', quads: session.quads || [] }],
    currentSceneIndex: 0,
    playbackMode: 'once'
  };
}

function applySession(session) {
  if (isPlaying) stopPlayback();
  quads.forEach((_, i) => clearQuadSource(i));
  quads = [];

  const normalized = normalizeSession(session);
  const dropped = scenes;
  scenes = normalized.scenes;
  currentSceneIndex = Math.min(normalized.currentSceneIndex, scenes.length - 1);
  playbackMode = normalized.playbackMode;
  // Una sesión sin montaje (anterior a las dos salidas) deja el que hay.
  if (normalized.montaje) { montaje = normalizarMontaje(normalized.montaje); aplicarResolucionHydra(); renderMontaje(); }
  // Igual con el sonido y la escena por señal: una sesión sin ellos deja lo que hay.
  if (normalized.pistas) reemplazarPistas(normalized.pistas);
  if (normalized.escenaSenal) { escenaSenal = normalizarEscenaSenal(normalized.escenaSenal); renderEscenaSenal(); }
  // Las capturas que estaban aparcadas en las escenas que esta sesión reemplaza no las
  // alcanzó el clearQuadSource() de arriba, que sólo tocó los quads vivos.
  releaseScreenSources(dropped);

  const sceneData = scenes[currentSceneIndex];
  let pending = 0;
  hydraSlots = [0, 0, 0, 0];
  const legacyCode = sceneData.hydraCode || '';
  (sceneData.quads || []).forEach((qData, i) => {
    const srcType = qData.sourceType === 'camera' ? 'camera' : (qData.sourceType || 'hydra');
    const hydraCode = qData.hydraCode != null ? qData.hydraCode : (srcType === 'hydra' ? legacyCode : '');
    let hydraOutput = null;
    if (srcType === 'hydra') {
      const stored = qData.hydraOutput ?? -1;
      hydraOutput = (stored >= 0 && stored < 4) ? stored : hydraSlots.indexOf(Math.min(...hydraSlots));
      hydraSlots[hydraOutput]++;
    }
    let quad;
    if (qData.kind === 'freeform') {
      quad = { kind: 'freeform', vertices: (qData.vertices || []).map(v => createVector(v.x, v.y)), sourceType: srcType, sourceEl: null, sourceUrl: null, hydraCode, hydraOutput, p5Code: qData.p5Code || '', color: { ...COLOR_NEUTRO, ...qData.color }, recorte: normalizarRecorte(qData.recorte) };
    } else {
      const pts = qData.points || qData;
      quad = { kind: 'quad', points: pts.map(p => createVector(p.x, p.y)), sourceType: srcType, sourceEl: null, sourceUrl: null, hydraCode, hydraOutput, p5Code: qData.p5Code || '', color: { ...COLOR_NEUTRO, ...qData.color }, recorte: normalizarRecorte(qData.recorte) };
      buildTessCache(quad);
    }
    quads.push(quad);
    if (qData.sourceUrl && qData.sourceUrl.startsWith('http')) {
      loadQuadSourceFromUrl(i, qData.sourceUrl);
    } else if (srcType === 'image' && qData.imageData) {
      pending++;
      loadImage(qData.imageData, (img) => {
        quads[i].sourceEl = img;
        pending--;
        if (pending === 0) { renderQuadList(); saveToLocalStorage(); }
      });
    } else if (srcType === 'hydra' && hydraCode) {
      evalHydra(hydraCode);
    } else if (srcType === 'p5') {
      montarSketchP5(i);
    }
  });
  quads.forEach((q, i) => { if (q.sourceType === 'camera') startCamera(i); });
  undoStack.length = 0;
  if (pending === 0) { renderQuadList(); saveToLocalStorage(); }
  renderSceneStrip();
}

// --- LOCAL STORAGE ---

// El snapshot en memoria lleva referencias vivas (blob: de archivo local, imágenes del
// carrusel, el <video> de una captura de pantalla) que no tienen sentido —ni cabida— en el
// JSON: al recargar no existen.
function serializableQuads(quadsData) {
  return (quadsData || []).map(q => {
    const { carousel, carouselIndex, screenSource, ...rest } = q;
    if (rest.sourceUrl && !rest.sourceUrl.startsWith('http')) delete rest.sourceUrl;
    return rest;
  });
}

function saveToLocalStorage() {
  publicarEstado();   // un color movido en el panel también le llega a la salida
  if (SALIDA) return;
  try {
    snapshotCurrentScene();
    const config = {
      scenes: scenes.map(s => ({ id: s.id, duration_s: s.duration_s, hydraCode: s.hydraCode || '', quads: serializableQuads(s.quads) })),
      currentSceneIndex,
      playbackMode,
      montaje,
      pistas: pistasParaGuardar(),
      escenaSenal
    };
    localStorage.setItem("minimapper_config", JSON.stringify(config));
  } catch (e) {
    console.error(e);
  }
}

function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem("minimapper_config");
    if (!saved) { renderSceneStrip(); return; }
    const config = JSON.parse(saved);
    montaje = normalizarMontaje(config.montaje);
    pistas = normalizarPistas(config.pistas);
    escenaSenal = normalizarEscenaSenal(config.escenaSenal);

    if (config.scenes && config.scenes.length > 0) {
      scenes = config.scenes.map(s => ({
        id: s.id,
        duration_s: s.duration_s || 30,
        hydraCode: s.hydraCode || '',
        quads: s.quads || []
      }));
      currentSceneIndex = Math.min(config.currentSceneIndex || 0, scenes.length - 1);
      playbackMode = config.playbackMode || 'once';
    } else {
      // Formato anterior: migrar a una escena
      const hydraCode = config.hydraCode || '';
      const rawQuads = config.quadVertices || [];
      const quadsData = rawQuads.map(q => {
        if (q.kind === 'freeform') return { kind: 'freeform', vertices: q.vertices || [], sourceType: q.sourceType || 'hydra' };
        const pts = Array.isArray(q) ? q : (q.points || []);
        return { kind: 'quad', points: pts, sourceType: q.sourceType || 'hydra' };
      });
      scenes = [{ id: 1, duration_s: 30, hydraCode, quads: quadsData }];
      currentSceneIndex = 0;
    }

    console.log("Configuración cargada");
  } catch (e) {
    console.error("Error al cargar configuración:", e);
  }
}

// --- BEZIER PATCH ---
// Each quad is a 3×3 grid of control points (quadratic tensor-product Bezier surface).
// Corners are on the surface; edge/center points act as attractors.

const TESS = 8;
const CORNERS = new Set([0, 2, 6, 8]);

function evalPatch(pts, u, v) {
  let u1 = 1 - u, v1 = 1 - v;
  let bu = [u1*u1, 2*u*u1, u*u];
  let bv = [v1*v1, 2*v*v1, v*v];
  let x = 0, y = 0;
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      let w = bu[i] * bv[j];
      x += w * pts[j*3+i].x;
      y += w * pts[j*3+i].y;
    }
  }
  return { x, y };
}

function buildTessCache(quad) {
  const pts = quad.points;
  const cache = new Array(TESS + 1);
  for (let j = 0; j <= TESS; j++) {
    cache[j] = new Array(TESS + 1);
    for (let i = 0; i <= TESS; i++) {
      cache[j][i] = evalPatch(pts, i / TESS, j / TESS);
    }
  }
  quad.tessCache = cache;
}

// --- UNDO ---

const undoStack = [];
const UNDO_LIMIT = 20;

function pushUndo() {
  // El color entra al snapshot sin la rampa en curso: es estado, no decisión.
  const color = (q) => { if (!q.color) return null; const { rampa, _rampa, ...c } = q.color; return c; };
  undoStack.push(quads.map(q =>
    q.kind === 'freeform'
      ? { kind: 'freeform', data: q.vertices.map(v => ({ x: v.x, y: v.y })), color: color(q) }
      : { kind: 'quad',     data: q.points.map(p => ({ x: p.x, y: p.y })), color: color(q) }
  ));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

function undo() {
  if (undoStack.length === 0) return;
  const snapshot = undoStack.pop();
  snapshot.forEach((entry, qi) => {
    if (!quads[qi]) return;
    if (entry.kind === 'freeform') {
      quads[qi].vertices = entry.data.map(v => createVector(v.x, v.y));
    } else {
      quads[qi].points = entry.data.map(p => createVector(p.x, p.y));
      buildTessCache(quads[qi]);
    }
    if (entry.color) quads[qi].color = { ...entry.color, rampa: quads[qi].color?.rampa };
  });
  renderQuadList();
  saveToLocalStorage();
}

// --- ESCENAS ---

let scenes = [{ id: 1, duration_s: 30, hydraCode: '', quads: [] }];
let currentSceneIndex = 0;
let playbackMode = 'once';
let isPlaying = false;
let playbackTimeout = null;
let hudInterval = null;
let sceneStartTime = 0;

// --- P5 ---

let hc;
let hydraSlots = [0, 0, 0, 0];
let hydraCanvases = [];  // p5.Graphics (2D) per slot — object identity prevents p5 texture cache collisions
let quads = [];
let selected = { quad: -1, vert: -1 };
let drawingMode = false;
let drawStart = null;
let drawCurrent = null;
let freeformMode = false;
let freeformVerts = [];

// --- HYDRA SLOTS ---

function assignHydraSlot() {
  for (let i = 0; i < 4; i++) {
    if (hydraSlots[i] === 0) { hydraSlots[i]++; return i; }
  }
  // All slots taken: assign the least-used one (distributes quads 5+ across outputs)
  let minSlot = 0;
  for (let i = 1; i < 4; i++) {
    if (hydraSlots[i] < hydraSlots[minSlot]) minSlot = i;
  }
  hydraSlots[minSlot]++;
  return minSlot;
}

function releaseHydraSlot(slot) {
  if (slot != null && slot >= 0 && slot < 4) hydraSlots[slot] = Math.max(0, hydraSlots[slot] - 1);
}

// --- DETECCIÓN DE APLAUSO ---
let micContext = null;
let micAnalyser = null;
let micBuffer = null;
let micActive = false;
let lastOnsetTime = 0;
let energyAvg = 0;
const ONSET_COOLDOWN = 800;
let onsetRatio = 3.5;
const ONSET_MIN = 0.04;

// --- REJILLA DE CALIBRACIÓN ---
// Textura estática en espacio UV: el parche Bezier la deforma igual que deformará el
// contenido, así que sirve para alinear el quad con la superficie física antes de
// elegir la fuente real. Un solo p5.Graphics compartido por todos los quads en rejilla.
const GRID_TEX_SIZE = 512;
let gridGfx = null;

function buildGridTexture() {
  const S = GRID_TEX_SIZE;
  const g = createGraphics(S, S);
  g.background(0);
  g.noFill();

  // diagonales: acusan si el parche quedó torcido
  g.strokeWeight(1);
  g.stroke(255, 55);
  g.line(0, 0, S, S);
  g.line(S, 0, 0, S);

  // subdivisión fina: cada 1/16, apenas visible
  for (let i = 1; i < 16; i++) {
    if (i % 2 === 0) continue;
    const p = (i / 16) * S;
    g.line(p, 0, p, S);
    g.line(0, p, S, p);
  }

  // subdivisión marcada: cada 1/8, coincide con TESS, así se lee también la malla
  g.stroke(255, 200);
  g.strokeWeight(2);
  for (let i = 1; i < 8; i++) {
    const p = (i / 8) * S;
    g.line(p, 0, p, S);
    g.line(0, p, S, p);
  }

  // círculo inscrito: la deformación se lee mejor en una curva que en una recta
  g.stroke(255, 120);
  g.strokeWeight(2);
  g.ellipse(S / 2, S / 2, S * 0.75);

  // borde: el límite exacto del quad
  g.stroke(255, 240);
  g.strokeWeight(6);
  g.rect(3, 3, S - 6, S - 6);

  // marca de orientación (ámbar, como los atractores): rompe la simetría en los dos ejes,
  // así se distingue una rejilla rotada o volteada de una bien puesta
  const m = S / 5;
  g.stroke(255, 200, 64);
  g.strokeWeight(7);
  g.line(14, 14, m, 14);
  g.line(14, 14, 14, m);

  return g;
}

function startDrawingQuad() {
  if (freeformMode) cancelFreeform();
  drawingMode = true;
  document.body.classList.add('drawing-mode');
  document.getElementById('add-quad-btn').classList.add('active');
}

function startDrawingFreeform() {
  if (drawingMode) cancelDrawing();
  freeformMode = true;
  freeformVerts = [];
  document.body.classList.add('drawing-mode');
  document.getElementById('add-freeform-btn').classList.add('active');
}

function cancelFreeform() {
  freeformMode = false;
  freeformVerts = [];
  document.body.classList.remove('drawing-mode');
  const btn = document.getElementById('add-freeform-btn');
  if (btn) btn.classList.remove('active');
}

function finalizeFreeform() {
  if (freeformVerts.length < 3) { cancelFreeform(); return; }
  const shape = {
    kind: 'freeform',
    vertices: freeformVerts.map(v => createVector(v.x, v.y)),
    sourceType: 'grid',
    sourceEl: null,
    sourceUrl: null,
    hydraCode: '',
    hydraOutput: null,
    color: { ...COLOR_NEUTRO }
  };
  quads.push(shape);
  undoStack.length = 0;
  renderQuadList();
  saveToLocalStorage();
  updateCurrentSceneThumbnail();
  cancelFreeform();
}

function cancelDrawing() {
  drawingMode = false;
  drawStart = null;
  drawCurrent = null;
  document.body.classList.remove('drawing-mode');
  const btn = document.getElementById('add-quad-btn');
  if (btn) btn.classList.remove('active');
}

function finalizeQuad() {
  if (!drawStart || !drawCurrent) { cancelDrawing(); return; }

  // El tamaño mínimo se mide en pantalla; las esquinas, en los pixeles de la salida.
  if (abs(drawCurrent.x - drawStart.x) < 10 || abs(drawCurrent.y - drawStart.y) < 10) { cancelDrawing(); return; }
  const a = aMundo(min(drawStart.x, drawCurrent.x), min(drawStart.y, drawCurrent.y));
  const b = aMundo(max(drawStart.x, drawCurrent.x), max(drawStart.y, drawCurrent.y));
  const x0 = a.x, x2 = b.x, y0 = a.y, y2 = b.y;

  let points = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      points.push(createVector(
        map(col, 0, 2, x0, x2),
        map(row, 0, 2, y0, y2)
      ));
    }
  }

  const newQuad = { points, sourceType: 'grid', sourceEl: null, sourceUrl: null, hydraCode: '', hydraOutput: null, color: { ...COLOR_NEUTRO } };
  buildTessCache(newQuad);
  quads.push(newQuad);
  undoStack.length = 0;
  renderQuadList();
  saveToLocalStorage();
  updateCurrentSceneThumbnail();
  cancelDrawing();
}

// --- COLOR POR QUAD ---
// La etapa de color va entre la fuente y la superficie, como un Level TOP: nivel,
// saturación y tinte. Sirve igual para Hydra, video, imagen, cámara, pantalla y
// carrusel. Con los valores neutros el quad se dibuja como siempre, sin shader.

const COLOR_NEUTRO = { nivel: 1, saturacion: 1, tinte: '#ffffff' };
let colorShader = null;

const COLOR_VERT = `
precision highp float;
attribute vec3 aPosition;
attribute vec2 aTexCoord;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
varying vec2 vTexCoord;
void main() {
  vTexCoord = aTexCoord;
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}`;

const COLOR_FRAG = `
precision mediump float;
varying vec2 vTexCoord;
uniform sampler2D uTex;
uniform float uNivel;
uniform float uSaturacion;
uniform vec3 uTinte;
void main() {
  vec4 c = texture2D(uTex, vTexCoord);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 rgb = mix(vec3(l), c.rgb, uSaturacion) * uTinte * uNivel;
  gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), c.a);
}`;

function quadColor(quad) {
  if (!quad.color) quad.color = { ...COLOR_NEUTRO };
  return quad.color;
}

function colorEsNeutro(c) {
  return !c || (c.nivel === 1 && c.saturacion === 1 && /^#?(fff|ffffff)?$/i.test(c.tinte || '') && !c.senal);
}

function tinteRGB(hex) {
  let h = (hex || '#ffffff').slice(1);
  if (h.length === 3) h = h.replace(/./g, d => d + d);   // #fff → #ffffff
  const n = parseInt(h, 16);
  if (!isFinite(n)) return [1, 1, 1];
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

// Copia limpia para guardar: sólo si se movió algo, para no ensuciar sesiones viejas.
// El valor aplicado (c.rampa) no se guarda: es estado, no decisión.
function colorParaGuardar(c) {
  if (colorEsNeutro(c)) return null;
  const out = { nivel: c.nivel, saturacion: c.saturacion, tinte: c.tinte };
  if (c.senal) Object.assign(out, { senal: c.senal, destino: c.destino || 'nivel', invertir: !!c.invertir,
                                    subida: c.subida || 0, bajada: c.bajada || 0, video: !!c.video });
  return out;
}

function setQuadColor(index, campo, valor) {
  const c = quadColor(quads[index]);
  c[campo] = campo === 'tinte' ? valor : parseFloat(valor);
  const out = document.getElementById(`color-${campo}-${index}`);
  if (out && campo !== 'tinte') out.textContent = RAMPA_CAMPOS.includes(campo) ? segundos(c[campo]) : c[campo].toFixed(2);
  publicarEstado();   // la salida sigue el deslizador, no sólo al soltarlo
}

// --- RECORTE DE TEXTURA ---
// Qué parte de la fuente muestra el quad, como un rango de u (horizontal). Con dos
// proyectores, un quad en cada uno con su mitad de la misma textura: la continuidad se
// calibra arrastrando esquinas, cosa que un solo quad que cruzara la costura no permite
// (el parche no hace el quiebre). null = la textura completa. Ver CLAUDE.md, "Recorte".
const RECORTES = { completa: null, izquierda: { u0: 0, u1: 0.5 }, derecha: { u0: 0.5, u1: 1 } };

function normalizarRecorte(r) {
  if (!r || typeof r.u0 !== 'number' || typeof r.u1 !== 'number') return null;
  const u0 = Math.min(1, Math.max(0, r.u0)), u1 = Math.min(1, Math.max(0, r.u1));
  return u1 > u0 && !(u0 === 0 && u1 === 1) ? { u0, u1 } : null;
}

function nombreRecorte(r) {
  const n = Object.keys(RECORTES).find(k => RECORTES[k] && r && RECORTES[k].u0 === r.u0 && RECORTES[k].u1 === r.u1);
  return n || (r ? 'otro' : 'completa');
}

function setQuadRecorte(index, nombre) {
  if (!quads[index] || !(nombre in RECORTES)) return;
  quads[index].recorte = RECORTES[nombre] ? { ...RECORTES[nombre] } : null;
  saveToLocalStorage();   // y la salida lo toma con el estado
}

// Conectar el nivel a una lectura ('' = manual). Con señal, el deslizador
// de nivel es el máximo y la lectura decide cuánto de ese máximo sale.
function setQuadSenal(index, senal) {
  pushUndo();
  const c = quadColor(quads[index]);
  c.senal = senal || '';
  if (c.senal && c.invertir == null) c.invertir = false;
  renderQuadList();
  saveToLocalStorage();
}

// A qué parámetro va la señal: nivel, saturación o tinte.
function setQuadDestino(index, destino) {
  pushUndo();
  quadColor(quads[index]).destino = destino;
  saveToLocalStorage();
}

// Un quad de video con señal puede, además, reproducirse sólo con ella (ver
// seguirVideosPorSenal, abajo).
function toggleQuadVideo(index) {
  const c = quadColor(quads[index]);
  c.video = !c.video;
  renderQuadList();
  saveToLocalStorage();
}

function toggleQuadInvertir(index) {
  pushUndo();
  const c = quadColor(quads[index]);
  c.invertir = !c.invertir;
  renderQuadList();
  saveToLocalStorage();
}

// --- VIDEO POR SEÑAL ---
// Con `color.video`, el video del quad corre mientras la señal está arriba y se detiene
// cuando la rampa termina de bajar: se acerca alguien, el video aparece (nivel) y arranca;
// se va, se apaga y vuelve al principio, para que la siguiente persona lo vea desde el
// inicio. Sigue a la rampa, no a la lectura cruda, así que la bajada es el fundido de
// salida. Corre en el editor y en la salida: cada una tiene su propio <video> y su rampa,
// con las mismas lecturas. Sólo videos (archivo o enlace): la cámara y la pantalla no.
function videoDeQuad(q) {
  if (q.sourceType !== 'video') return null;
  if (q.sourceVideo) return q.sourceVideo;
  const el = q.sourceEl && q.sourceEl.elt;
  return el instanceof HTMLVideoElement ? el : null;
}

function seguirVideosPorSenal() {
  for (const q of quads) {
    const el = videoDeQuad(q);
    if (!el) continue;
    const c = q.color || {};
    const manda = !!(c.senal && c.video);
    if (manda) {
      const arriba = (c.rampa ?? 0) > 0.001;
      if (arriba && el.paused) el.play().catch(() => {});
      else if (!arriba && !el.paused) { el.pause(); el.currentTime = 0; }
      q._videoPorSenal = true;
    } else if (q._videoPorSenal) {
      // Se quitó la opción: el video vuelve a correr siempre, como cualquier otro.
      q._videoPorSenal = false;
      if (el.paused) el.play().catch(() => {});
    }
  }
}
setInterval(seguirVideosPorSenal, 100);

// --- LECTURAS ---
// Números de 0 a 1 que se guardan en el global `sensor`, que Hydra puede leer:
// osc(10, 0.1, () => sensor.cercania * 2).out(o0). Los produce la sección "interacción"
// del panel (ver INTERACCIÓN) y viajan a la salida por un BroadcastChannel, que sólo
// conecta páginas del mismo origen: la versión en línea, o un servidor local en la carpeta
// del repo (no file://).

// Arranca con todas en 0: así un sketch con () => sensor.cercania funciona aunque no haya
// nada encendido, y la lista no se redibuja al llegar la primera.
// `x` e `y` las publica el recuadro de la sección "interacción" (ver INTERACCIÓN, abajo).
var sensor = { cercania: 0, cerca: 0, cara_x: 0, movimiento: 0, volumen: 0, x: 0, y: 0, mano: 0, mano_x: 0, mano_y: 0 };
let sensorUltimo = 0;
const SENSOR_CANAL = 'minimapper-lecturas';
let canalSensor = null;

// Un solo receptor: lo alimentan la sección "interacción" de este panel y, en la salida,
// el canal que trae las del editor.
function recibirLecturas(lecturas) {
  if (!lecturas) return;
  let nuevas = false;
  for (const [k, v] of Object.entries(lecturas)) {
    // Sólo nombres simples: el nombre termina dentro del HTML de los selectores.
    if (!/^[a-z_][a-z0-9_]*$/i.test(k) || typeof v !== 'number' || !isFinite(v)) continue;
    if (!(k in sensor)) nuevas = true;
    sensor[k] = Math.min(1, Math.max(0, v));
  }
  sensorUltimo = performance.now();
  // Una lectura nueva aparece en los selectores de señal de cada quad.
  if (nuevas && typeof renderQuadList === 'function') { renderQuadList(); renderEscenaSenal(); renderPistas(); }
}

try {
  canalSensor = new BroadcastChannel(SENSOR_CANAL);
  canalSensor.onmessage = (e) => recibirLecturas(e.data && e.data.lecturas);
} catch (e) {
  console.warn('BroadcastChannel no disponible: la salida no recibe lecturas.', e);
}

function sensorVivo() {
  return performance.now() - sensorUltimo < 1500;
}

// --- RAMPA ---
// Una rampa lineal: el valor camina hacia la meta y tarda `subida` segundos en ir de 0 a 1
// y `bajada` en volver. Con 0 s el cambio es en seco. `estado` guarda { v, t } entre
// llamadas, así que sirve igual para un quad, una pista o Hydra.
const RAMPA_CAMPOS = ['subida', 'bajada'];
const segundos = (v) => (v || 0).toFixed(1) + ' s';

function pasoRampa(estado, meta, subida, bajada) {
  const ahora = performance.now();
  const dt = estado.t == null ? 0 : Math.min(0.5, (ahora - estado.t) / 1000);
  estado.t = ahora;
  if (estado.v == null) estado.v = meta;
  const tiempo = meta > estado.v ? subida : bajada;
  if (!(tiempo > 0)) estado.v = meta;
  else {
    const paso = dt / tiempo;
    estado.v = meta > estado.v ? Math.min(meta, estado.v + paso) : Math.max(meta, estado.v - paso);
  }
  return estado.v;
}

// Para Hydra: () => rampa('cercania', 3) sube en 3 s y baja en 3 s; con un tercer número,
// la bajada es otra: rampa('cercania', 0.5, 4). Cada combinación lleva su propio estado.
const rampasHydra = {};
function rampa(nombre, subida = 1, bajada = subida) {
  const clave = nombre + '|' + subida + '|' + bajada;
  const estado = rampasHydra[clave] || (rampasHydra[clave] = {});
  const meta = sensorVivo() ? (sensor[nombre] ?? 0) : 0;
  return pasoRampa(estado, meta, subida, bajada);
}

// Lo que sale del quad: los valores manuales o, si hay señal, el destino por la lectura,
// con la rampa del quad (subida y bajada, en segundos; 0 = de golpe).
// El deslizador del destino marca el máximo: nivel y saturación se multiplican por la
// lectura (0 = negro, 0 = gris); el tinte va de blanco (sin teñir) al color elegido.
function colorEfectivo(c) {
  const tinte = tinteRGB(c.tinte);
  if (!c.senal) return { nivel: c.nivel, saturacion: c.saturacion, tinte };
  let meta = sensorVivo() ? (sensor[c.senal] ?? 0) : 0;
  if (c.invertir) meta = 1 - meta;
  if (!c._rampa) c._rampa = {};
  c.rampa = pasoRampa(c._rampa, meta, c.subida || 0, c.bajada || 0);
  const destino = c.destino || 'nivel';
  return {
    nivel: destino === 'nivel' ? c.nivel * c.rampa : c.nivel,
    saturacion: destino === 'saturacion' ? c.saturacion * c.rampa : c.saturacion,
    tinte: destino === 'tinte' ? tinte.map(v => 1 + (v - 1) * c.rampa) : tinte,
  };
}

setInterval(() => {
  const el = document.getElementById('senal-estado');
  if (!el) return;
  const claves = Object.keys(sensor);
  const vivo = sensorVivo();
  el.classList.toggle('vivo', vivo);
  el.textContent = vivo
    ? 'señal · ' + claves.map(k => `${k} ${sensor[k].toFixed(2)}`).join(' · ')
    : (sensorUltimo ? 'señal · ninguna' : 'señal · enciende el mouse, la cámara o el mic');
  quads.forEach((q, i) => {
    const out = document.getElementById(`color-rampa-${i}`);
    if (out && q.color && q.color.senal) out.textContent = (q.color.rampa ?? 0).toFixed(2);
  });
  pintarPistas();
  pintarEquipo();
}, 200);

// --- INTERACCIÓN: LECTURAS HECHAS EN ESTE PANEL ---
// Tres fuentes, cada una con su botón: el mouse sobre un recuadro (`x`, `y`), la cámara
// con un detector de caras y la diferencia entre cuadros (`cercania`, `cerca`, `cara_x`,
// `movimiento`, ver interaccion.js) y el micrófono (`volumen`). Entran por
// recibirLecturas() y salen por el canal hacia la salida, que las aplica igual. Nada de
// esto corre si no se enciende: el detector se baja con import() al encender la cámara, y
// en presentación la miniatura no se dibuja. Al apagar una fuente sus lecturas bajan a 0.
// El mic es el mismo del carrusel (micActive, initMic): encenderlo aquí también lo
// enciende allá, y al revés.

const INTERACCION_HZ = 20;
const interaccion = {
  mouse: false, xy: { x: 0.5, y: 0.5 },
  camara: false, lector: null, video: null, cuadroUltimo: 0, manos: false,
  volumen: 0, micBuffer: null,
};

// El punto verde en la pestaña: hay una fuente encendida aunque se esté en otra pestaña.
function marcarPestanaInteraccion() {
  document.querySelector('#pestanas [data-pestana="interaccion"]')?.classList.toggle('encendida', interaccion.mouse || interaccion.camara || micActive);
}

// El volumen del mic: el RMS por la ganancia, de 0 a 1. Sube de inmediato y baja en
// unos 0.3 s, para que un aplauso no sea un parpadeo de un cuadro.
function leerVolumen() {
  if (!micActive || !micAnalyser) return 0;
  if (!interaccion.micBuffer || interaccion.micBuffer.length !== micAnalyser.fftSize) interaccion.micBuffer = new Float32Array(micAnalyser.fftSize);
  const b = interaccion.micBuffer;
  micAnalyser.getFloatTimeDomainData(b);
  let rms = 0;
  for (let i = 0; i < b.length; i++) rms += b[i] * b[i];
  rms = Math.sqrt(rms / b.length);
  const ganancia = parseFloat(document.getElementById('sensor-ganancia')?.value) || 12;
  const v = Math.min(1, rms * ganancia);
  interaccion.volumen = v > interaccion.volumen ? v : Math.max(v, interaccion.volumen - 1 / (0.3 * INTERACCION_HZ));
  const barra = document.querySelector('#sensor-medidor i');
  if (barra) barra.style.width = (interaccion.volumen * 100) + '%';
  return interaccion.volumen;
}

// Lo llaman initMic() y stopMic(), vengan del carrusel o de aquí.
function micCambio() {
  const caja = document.getElementById('sensor-mic');
  if (caja) caja.hidden = !micActive;
  if (!micActive) { interaccion.volumen = 0; publicarLecturas({ volumen: 0 }); }
  marcarPestanaInteraccion();
}

function publicarLecturas(lecturas) {
  recibirLecturas(lecturas);
  canalSensor?.postMessage({ lecturas });   // el objeto que publica no se oye a sí mismo
}

setInterval(() => {
  if (SALIDA) return;
  if (interaccion.mouse || interaccion.camara || micActive) {
    const v = {};
    if (interaccion.mouse) Object.assign(v, interaccion.xy);
    if (interaccion.camara && interaccion.lector?.listo) Object.assign(v, interaccion.lector.valores);
    if (micActive) v.volumen = leerVolumen();
    if (Object.keys(v).length) publicarLecturas(v);
  }
  vigilarEscenaSenal();
  avanzarPistas();
}, 1000 / INTERACCION_HZ);

// El recuadro: arrastrar dentro mueve el punto y el punto se queda donde se suelta.
// `y` crece hacia arriba, como en una gráfica.
function toggleMouseSensor() {
  interaccion.mouse = !interaccion.mouse;
  document.getElementById('sensor-mouse-btn').classList.toggle('active', interaccion.mouse);
  document.getElementById('sensor-xy').hidden = !interaccion.mouse;
  if (!interaccion.mouse) publicarLecturas({ x: 0, y: 0 });
  pintarXY();
  marcarPestanaInteraccion();
}

function pintarXY() {
  const punto = document.querySelector('#sensor-xy i');
  if (!punto) return;
  punto.style.left = (interaccion.xy.x * 100) + '%';
  punto.style.top = ((1 - interaccion.xy.y) * 100) + '%';
}

function moverXY(e) {
  const r = e.currentTarget.getBoundingClientRect();
  interaccion.xy = {
    x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
    y: Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)),
  };
  pintarXY();
}

document.addEventListener('DOMContentLoaded', () => {
  const pad = document.getElementById('sensor-xy');
  if (!pad) return;
  pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); moverXY(e); });
  pad.addEventListener('pointermove', (e) => { if (e.buttons) moverXY(e); });
  // El umbral es calibración de la sala, no de la sesión: se recuerda en esta máquina.
  const umbral = document.getElementById('sensor-umbral');
  const pintarUmbral = () => { const o = document.getElementById('sensor-umbral-valor'); if (o) o.textContent = parseFloat(umbral.value).toFixed(2); };
  try { const u = parseFloat(localStorage.getItem('minimapper_umbral')); if (u > 0 && u < 1 && umbral) umbral.value = u; } catch (e) {}
  if (umbral) pintarUmbral();
  umbral?.addEventListener('input', () => {
    if (interaccion.lector) interaccion.lector.umbral = parseFloat(umbral.value);
    pintarUmbral();
  });
  umbral?.addEventListener('change', () => { if (!SALIDA) try { localStorage.setItem('minimapper_umbral', umbral.value); } catch (e) {} });
  pintarXY();
});

function avisarCamara(texto, error = false) {
  const el = document.getElementById('sensor-nota');
  if (!el) return;
  el.textContent = texto;
  el.className = texto ? (error ? 'status-error' : 'status-ok') : '';
}

// Una cámara propia a 640×480, fuera del DOM, aunque un quad ya use la suya: pedirla dos
// veces funciona en Chrome y Firefox. Delegate CPU (ver interaccion.js).
async function toggleCamaraSensor() {
  if (interaccion.camara) return detenerCamaraSensor();
  const btn = document.getElementById('sensor-camara-btn');
  btn.disabled = true;
  try {
    if (!interaccion.lector) {
      avisarCamara('cargando el detector… la primera vez tarda unos segundos');
      const { crearLector } = await import('./interaccion.js');
      interaccion.lector = crearLector({ delegados: ['CPU'] });
      interaccion.lector.umbral = parseFloat(document.getElementById('sensor-umbral').value);
    }
    avisarCamara('esperando el permiso de la cámara…');
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    await video.play();
    interaccion.video = video;
    await interaccion.lector.cargar();
    if (interaccion.video !== video) return;   // se apagó mientras cargaba
    interaccion.camara = true;
    btn.classList.add('active');
    document.getElementById('sensor-camara').hidden = false;
    marcarPestanaInteraccion();
    avisarCamara('');
    cuadroCamara(video);
  } catch (e) {
    console.error(e);
    detenerCamaraSensor();
    const negado = e && e.name === 'NotAllowedError';
    avisarCamara(negado ? 'sin permiso para la cámara (sirve la página por http://localhost o https://)'
                        : 'no se pudo: ' + (e.message || e), true);
  } finally {
    btn.disabled = false;
  }
}

function detenerCamaraSensor() {
  const estaba = interaccion.camara;
  if (interaccion.manos) apagarManos();
  interaccion.video?.srcObject?.getTracks().forEach(t => t.stop());
  interaccion.video = null;
  interaccion.camara = false;
  document.getElementById('sensor-camara-btn')?.classList.remove('active');
  const caja = document.getElementById('sensor-camara');
  if (caja) caja.hidden = true;
  if (estaba) publicarLecturas(Object.fromEntries(Object.keys(interaccion.lector?.valores || { cercania: 0, cerca: 0 }).map(k => [k, 0])));
  marcarPestanaInteraccion();
}

// Manos: otro modelo sobre la misma cámara (ver interaccion.js). Encenderlo enciende la
// cámara si no estaba; apagar la cámara las apaga. La imagen de la cámara no se proyecta
// nunca: sólo salen los números (mano, mano_x, mano_y, mano2…).
async function toggleManosSensor() {
  if (interaccion.manos) return apagarManos();
  const btn = document.getElementById('sensor-manos-btn');
  if (!interaccion.camara) await toggleCamaraSensor();
  if (!interaccion.camara) return;
  btn.disabled = true;
  try {
    avisarCamara('cargando el modelo de manos…');
    await interaccion.lector.cargarManos();
    if (!interaccion.camara) return;
    interaccion.lector.conManos = true;
    interaccion.manos = true;
    btn.classList.add('active');
    avisarCamara('');
  } catch (e) {
    console.error(e);
    avisarCamara(e.message || String(e), true);
  } finally {
    btn.disabled = false;
  }
}

function apagarManos() {
  interaccion.manos = false;
  if (interaccion.lector) interaccion.lector.conManos = false;
  document.getElementById('sensor-manos-btn')?.classList.remove('active');
  publicarLecturas({ mano: 0, mano2: 0 });
}

// Bucle propio, no en draw(): un cuadro de cámara a la vez, a no más de INTERACCION_HZ.
// detectForVideo es síncrono (2–4 ms con este modelo) y en draw() frenaría el mapeo.
function cuadroCamara(video) {
  if (interaccion.video !== video) return;
  const otra = () => video.requestVideoFrameCallback
    ? video.requestVideoFrameCallback(() => cuadroCamara(video))
    : requestAnimationFrame(() => cuadroCamara(video));
  const ahora = performance.now();
  if (ahora - interaccion.cuadroUltimo < 1000 / INTERACCION_HZ) return otra();
  interaccion.cuadroUltimo = ahora;
  interaccion.lector.leer(video, ahora);
  const ui = document.getElementById('ui');
  if (uiVisible && !ui.classList.contains('collapsed') && pestanaActiva === 'interaccion') pintarVistaCamara(video, interaccion.lector);
  otra();
}

// Lo que ve la cámara, en espejo, con la caja de la cara (verde si pasa el umbral).
function pintarVistaCamara(video, lector) {
  const cv = document.getElementById('sensor-vista');
  if (!cv || video.readyState < 2) return;
  const ctx = cv.getContext('2d');
  ctx.save();
  ctx.translate(cv.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, cv.width, cv.height);
  const c = lector.caja;
  if (c) {
    const sx = cv.width / video.videoWidth, sy = cv.height / video.videoHeight;
    ctx.strokeStyle = lector.valores.cerca ? 'rgb(90,230,150)' : '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.originX * sx, c.originY * sy, c.width * sx, c.height * sy);
  }
  ctx.restore();
  // Las palmas ya vienen en espejo, como la miniatura: se pintan sin voltear.
  ctx.fillStyle = 'rgb(255,200,64)';
  for (const m of lector.manos) {
    ctx.beginPath();
    ctx.arc(m.x * cv.width, (1 - m.y) * cv.height, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- ESCENA POR SEÑAL ---
// Una lectura que pasa el umbral lleva a la siguiente escena: "tocar el muro cambia de
// animación". Vuelve a armarse cuando la lectura baja del 80 % del umbral, y entre dos
// cambios espera ESCENA_ESPERA ms, para que una mano que se queda no pase todas las escenas.
// En reproducción avanza como avanzaría el tiempo (advanceScene, con su modo); sin ella, a
// la siguiente en orden. Sólo el editor decide: la salida sigue a la escena montada.
const ESCENA_ESPERA = 2000;
let escenaSenal = { senal: '', umbral: 0.5 };
const escenaDisparo = { arriba: false, ultimo: 0 };

function normalizarEscenaSenal(e) {
  const umbral = parseFloat(e && e.umbral);
  return { senal: (e && typeof e.senal === 'string') ? e.senal : '', umbral: umbral > 0 && umbral < 1 ? umbral : 0.5 };
}

function renderEscenaSenal() {
  const el = document.getElementById('escena-senal');
  if (!el || SALIDA) return;
  const k = escenaSenal.senal;
  el.innerHTML = `<div class="quad-color">
      <label>señal<select onchange="setEscenaSenal('senal', this.value)">
        <option value="" ${!k ? 'selected' : ''}>ninguna</option>
        ${[...new Set([...Object.keys(sensor), ...(k ? [k] : [])])].map(n =>
          `<option value="${n}" ${k === n ? 'selected' : ''}>${n}</option>`).join('')}
      </select><output id="escena-senal-valor"></output></label>
      ${k ? `<label>umbral<input type="range" min="0.05" max="0.95" step="0.01" value="${escenaSenal.umbral}"
        oninput="setEscenaSenal('umbral', this.value)" onchange="saveToLocalStorage()"><output id="escena-senal-umbral">${escenaSenal.umbral.toFixed(2)}</output></label>` : ''}
    </div>
    <p class="montaje-nota">${k
      ? `Cuando ${k} pasa del umbral, va a la siguiente escena. Espera ${ESCENA_ESPERA / 1000} s antes de poder cambiar otra vez.`
      : 'Una lectura que pasa un umbral cambia de escena. Hacen falta dos escenas o más.'}</p>`;
}

function setEscenaSenal(campo, valor) {
  if (campo === 'umbral') {
    escenaSenal.umbral = parseFloat(valor);
    const out = document.getElementById('escena-senal-umbral');
    if (out) out.textContent = escenaSenal.umbral.toFixed(2);
    return;
  }
  escenaSenal.senal = valor || '';
  escenaDisparo.arriba = false;
  renderEscenaSenal();
  saveToLocalStorage();
}

function vigilarEscenaSenal() {
  const k = escenaSenal.senal;
  if (!k || !sensorVivo()) { escenaDisparo.arriba = false; return; }
  const v = sensor[k] ?? 0;
  const ahora = performance.now();
  if (!escenaDisparo.arriba && v > escenaSenal.umbral && ahora - escenaDisparo.ultimo > ESCENA_ESPERA) {
    escenaDisparo.arriba = true;
    escenaDisparo.ultimo = ahora;
    escenaSiguientePorSenal();
  } else if (escenaDisparo.arriba && v < escenaSenal.umbral * 0.8) {
    escenaDisparo.arriba = false;
  }
}

function escenaSiguientePorSenal() {
  if (scenes.length < 2) return;
  if (isPlaying) { clearTimeout(playbackTimeout); advanceScene(); return; }
  const next = (currentSceneIndex + 1) % scenes.length;
  const fadeEl = document.getElementById('scene-fade');
  fadeEl.classList.add('fading');
  setTimeout(() => { switchScene(next); fadeEl.classList.remove('fading'); }, 350);
}

// --- SONIDO: PISTAS ---
// Una pista es un archivo de audio o un enlace, con volumen, bucle y, si se quiere, una
// señal que lo sube y lo baja con su rampa (subida y bajada en segundos). Sin señal suena
// a su volumen, de principio a fin. Suena desde el editor, nunca desde la salida: las dos
// ventanas están en la misma computadora y la salida duplicaría el sonido.
// El volumen se mueve con el.volume, no con Web Audio: así un archivo de otro origen sin
// CORS suena igual, y no hay un segundo AudioContext junto al del mic.
// Las pistas son de toda la sesión, no de una escena. Se guardan como los quads: un enlace
// http persiste; un archivo local no, y al recargar queda su nombre y hay que volver a cargarlo.
// Arrancar exige un gesto (autoplay): sólo ▶ las hace sonar.
// Con señal, `mueve` dice qué sigue a la lectura: el volumen (lo de siempre) o la velocidad,
// que va de `lenta` (lectura 0) a `rapida` (lectura 1) con el volumen fijo. El tono sube y
// baja con la velocidad, como un disco: preservesPitch = false. El rango cabe en lo que
// Firefox acepta (de 0.25 a 4; afuera lo silencia).
let pistas = [];
const PISTA_CAMPOS = ['id', 'nombre', 'url', 'volumen', 'senal', 'invertir', 'subida', 'bajada', 'bucle', 'mueve', 'lenta', 'rapida'];
const PISTA_VELOCIDAD = { lenta: [0.25, 1], rapida: [1, 4] };
const entre = (v, [a, b], d) => isFinite(v) ? Math.min(b, Math.max(a, +v)) : d;

function normalizarPistas(lista) {
  return (Array.isArray(lista) ? lista : []).map((p, i) => ({
    id: p.id || i + 1,
    nombre: typeof p.nombre === 'string' ? p.nombre : `pista ${i + 1}`,
    url: typeof p.url === 'string' && p.url.startsWith('http') ? p.url : '',
    volumen: isFinite(p.volumen) ? Math.min(1, Math.max(0, p.volumen)) : 1,
    senal: typeof p.senal === 'string' ? p.senal : '',
    invertir: !!p.invertir,
    subida: isFinite(p.subida) ? p.subida : 1,
    bajada: isFinite(p.bajada) ? p.bajada : 2,
    bucle: p.bucle !== false,
    mueve: p.mueve === 'velocidad' ? 'velocidad' : 'volumen',
    lenta: entre(p.lenta, PISTA_VELOCIDAD.lenta, 0.5),
    rapida: entre(p.rapida, PISTA_VELOCIDAD.rapida, 2),
  }));
}

function pistasParaGuardar() {
  return pistas.map(p => Object.fromEntries(PISTA_CAMPOS.map(k => [k, p[k]])));
}

// Al cargar una sesión: suelta lo que suena y abre los enlaces de las nuevas.
function reemplazarPistas(lista) {
  pistas.forEach(soltarAudioPista);
  pistas = normalizarPistas(lista);
  if (!SALIDA) pistas.forEach(p => { if (p.url) prepararAudioPista(p, p.url); });
  renderPistas();
}

function soltarAudioPista(p) {
  if (p.el) { p.el.pause(); p.el.removeAttribute('src'); p.el.load(); }
  if (p.local) URL.revokeObjectURL(p.local);
  p.el = null; p.local = null; p.sonando = false;
}

function prepararAudioPista(p, src) {
  if (SALIDA) return;
  if (p.el) { p.el.pause(); p.sonando = false; }
  const el = new Audio();
  el.preload = 'auto';
  el.loop = p.bucle;
  el.volume = 0;
  el.preservesPitch = false;
  el.mozPreservesPitch = false;
  el.onerror = () => { p.nota = { text: 'No se pudo abrir el audio. Revisa el enlace o usa Archivo.', ok: false }; p.sonando = false; renderPistas(); };
  el.onended = () => { p.sonando = false; renderPistas(); };
  el.src = src;
  p.el = el;
  p.estado = {};
}

function agregarPista() {
  const id = pistas.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  pistas.push(normalizarPistas([{ id, nombre: `pista ${id}` }])[0]);
  pistas[pistas.length - 1].id = id;
  renderPistas();
  saveToLocalStorage();
}

function quitarPista(i) {
  if (!pistas[i]) return;
  soltarAudioPista(pistas[i]);
  pistas.splice(i, 1);
  renderPistas();
  saveToLocalStorage();
}

function cargarArchivoPista(i) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.onchange = () => {
    const f = input.files[0], p = pistas[i];
    if (!f || !p) return;
    if (p.local) URL.revokeObjectURL(p.local);
    p.local = URL.createObjectURL(f);
    p.nombre = f.name;
    p.url = '';
    p.nota = null;
    prepararAudioPista(p, p.local);
    renderPistas();
    saveToLocalStorage();
  };
  input.click();
}

function cargarEnlacePista(i, raw) {
  const p = pistas[i];
  if (!p) return;
  const res = normalizeSourceUrl(raw, 'audio');
  if (!res.ok) p.nota = { text: res.note, ok: false };
  else if (!res.url) return;
  else if (res.url.startsWith('http://') && location.protocol === 'https:') {
    p.nota = { text: 'El navegador bloquea un archivo http dentro de una página https. Busca la versión https o usa Archivo.', ok: false };
  } else {
    p.nota = res.note ? { text: res.note, ok: true } : null;
    if (p.local) { URL.revokeObjectURL(p.local); p.local = null; }
    p.url = res.url;
    try { p.nombre = decodeURIComponent(new URL(res.url).pathname.split('/').filter(Boolean).pop() || p.nombre); } catch (e) {}
    prepararAudioPista(p, res.url);
    saveToLocalStorage();
  }
  renderPistas();
}

function tocarPista(i) {
  const p = pistas[i];
  if (!p) return;
  if (!p.el) { p.nota = { text: p.nombre && !p.url ? `Vuelve a cargar ${p.nombre} con Archivo: un archivo local no se guarda.` : 'Primero carga un archivo o pega un enlace.', ok: false }; renderPistas(); return; }
  if (p.sonando) {
    p.el.pause();
    p.el.currentTime = 0;
    p.sonando = false;
    renderPistas();
    return;
  }
  p.estado = {};
  p.el.loop = p.bucle;
  p.el.volume = 0;
  p.el.playbackRate = 1;
  p.el.play().then(() => { p.sonando = true; p.nota = null; renderPistas(); })
    .catch(e => { p.nota = { text: 'El navegador no la dejó sonar: ' + (e.message || e.name), ok: false }; renderPistas(); });
}

function setPista(i, campo, valor) {
  const p = pistas[i];
  if (!p) return;
  if (campo === 'invertir' || campo === 'bucle') {
    p[campo] = !p[campo];
    if (campo === 'bucle' && p.el) p.el.loop = p.bucle;
    renderPistas();
    saveToLocalStorage();
    return;
  }
  if (campo === 'senal' || campo === 'mueve') {
    p[campo] = valor || '';
    if (campo === 'mueve' && p.el) p.el.playbackRate = 1;
    p.estado = {};
    renderPistas();
    saveToLocalStorage();
    return;
  }
  p[campo] = parseFloat(valor);
  const out = document.getElementById(`pista-${campo}-${i}`);
  if (out) out.textContent = RAMPA_CAMPOS.includes(campo) ? segundos(p[campo]) : (campo in PISTA_VELOCIDAD ? '×' : '') + p[campo].toFixed(2);
}

// La velocidad de una pista que sigue la señal con la velocidad. Sin señal, siempre 1.
const porVelocidad = (p) => !!p.senal && p.mueve === 'velocidad';
const velocidadPista = (p) => p.lenta + (p.rapida - p.lenta) * (p.nivel ?? 0);

// A 20 Hz, desde el mismo intervalo que publica las lecturas.
function avanzarPistas() {
  for (const p of pistas) {
    if (!p.el || !p.sonando) continue;
    let meta = 1;
    if (p.senal) {
      meta = sensorVivo() ? (sensor[p.senal] ?? 0) : 0;
      if (p.invertir) meta = 1 - meta;
    }
    p.nivel = pasoRampa(p.estado || (p.estado = {}), meta, p.subida, p.bajada);
    if (porVelocidad(p)) {
      p.el.volume = p.volumen;
      const v = velocidadPista(p);
      // Sólo si cambia de verdad: cada asignación reajusta el remuestreo del navegador.
      if (Math.abs(p.el.playbackRate - v) > 0.005) p.el.playbackRate = v;
    } else {
      p.el.volume = Math.min(1, Math.max(0, p.volumen * p.nivel));
    }
  }
}

function pintarPistas() {
  pistas.forEach((p, i) => {
    const out = document.getElementById(`pista-nivel-${i}`);
    if (out) out.textContent = !p.sonando ? '—' : porVelocidad(p) ? '×' + velocidadPista(p).toFixed(2) : (p.volumen * (p.nivel ?? 0)).toFixed(2);
  });
}

function renderPistas() {
  const el = document.getElementById('pistas');
  if (!el || SALIDA) return;
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  el.innerHTML = pistas.map((p, i) => {
    const k = p.senal;
    return `<div class="quad-item pista${p.sonando ? ' sonando' : ''}">
      <span class="quad-label" title="${esc(p.nombre)}">${esc(p.nombre)}</span>
      <div class="quad-controls">
        <button onclick="tocarPista(${i})" title="${p.sonando ? 'Parar y volver al principio' : 'Sonar'}">${p.sonando ? '■' : '▶'}</button>
        <button onclick="cargarArchivoPista(${i})">Archivo</button>
        <button onclick="quitarPista(${i})">✕</button>
      </div>
      <div class="quad-url-row">
        <input type="text" class="quad-url-input" value="${esc(p.url)}" placeholder="o pega el enlace"
          onkeydown="if(event.key==='Enter')cargarEnlacePista(${i},this.value)">
        <button onclick="cargarEnlacePista(${i},this.parentElement.querySelector('input').value)">URL</button>
      </div>
      ${p.nota ? `<div class="quad-url-note ${p.nota.ok ? 'status-ok' : 'status-error'}">${esc(p.nota.text)}</div>` : ''}
      <div class="quad-color">
        <label title="${porVelocidad(p) ? 'El volumen fijo: la lectura mueve la velocidad' : 'El máximo: con señal, la lectura decide cuánto de este volumen suena'}">volumen<input type="range" min="0" max="1" step="0.01" value="${p.volumen}"
          oninput="setPista(${i},'volumen',this.value)" onchange="saveToLocalStorage()"><output id="pista-volumen-${i}">${p.volumen.toFixed(2)}</output></label>
        <label>señal<select onchange="setPista(${i},'senal',this.value)">
          <option value="" ${!k ? 'selected' : ''}>siempre</option>
          ${[...new Set([...Object.keys(sensor), ...(k ? [k] : [])])].map(n =>
            `<option value="${n}" ${k === n ? 'selected' : ''}>${n}</option>`).join('')}
        </select><output id="pista-nivel-${i}" title="lo que suena ahora">—</output></label>
        ${k ? `<label title="Qué sigue a la lectura: el volumen, o la velocidad (y con ella el tono) con el volumen fijo">mueve<select onchange="setPista(${i},'mueve',this.value)">
          <option value="volumen" ${p.mueve !== 'velocidad' ? 'selected' : ''}>volumen</option>
          <option value="velocidad" ${p.mueve === 'velocidad' ? 'selected' : ''}>velocidad</option>
        </select><span></span></label>
        ${p.mueve === 'velocidad' ? Object.entries(PISTA_VELOCIDAD).map(([c, [a, b]]) => `<label title="${c === 'lenta' ? 'La velocidad con la lectura en 0. 1 = normal' : 'La velocidad con la lectura en 1. 1 = normal'}">${c}<input type="range" min="${a}" max="${b}" step="0.05" value="${p[c]}"
          oninput="setPista(${i},'${c}',this.value)" onchange="saveToLocalStorage()"><output id="pista-${c}-${i}">×${p[c].toFixed(2)}</output></label>`).join('') : ''}
        <label>invertir<button class="${p.invertir ? 'activo' : ''}" onclick="setPista(${i},'invertir')">${p.invertir ? 'sí' : 'no'}</button><span></span></label>
        ${RAMPA_CAMPOS.map(c => `<label title="${p.mueve === 'velocidad' ? (c === 'subida' ? 'Segundos para ir de lenta a rápida' : 'Segundos para volver a lenta') : (c === 'subida' ? 'Segundos para subir del silencio al volumen' : 'Segundos para volver al silencio')}. 0 = de golpe">${c}<input type="range" min="0" max="10" step="0.1" value="${p[c]}"
          oninput="setPista(${i},'${c}',this.value)" onchange="saveToLocalStorage()"><output id="pista-${c}-${i}">${segundos(p[c])}</output></label>`).join('')}` : ''}
        <label title="Al terminar vuelve a empezar">bucle<button class="${p.bucle ? 'activo' : ''}" onclick="setPista(${i},'bucle')">${p.bucle ? 'sí' : 'no'}</button><span></span></label>
      </div>
    </div>`;
  }).join('') || '<p class="montaje-nota">Un archivo de audio o un enlace. Con una señal, el volumen o la velocidad siguen a la lectura; sin ella, suena siempre. Suena desde esta ventana: conecta aquí las bocinas.</p>';
}

// --- EQUIPOS ---
// Una tarjeta por proyecto de un grupo: qué fuentes usa, sus lecturas en vivo y la receta
// para armarlo con lo que hay en el panel. Los datos viven en equipos.js, aparte, y sólo
// se bajan con ?equipos=<grupo>; el grupo se recuerda, y × lo olvida. Así la herramienta
// pública no carga los proyectos de un salón.
let equipos = null;   // { grupo, lista, elegido }
const FUENTES_NOMBRE = { camara: 'cámara', manos: 'manos', mic: 'mic', mouse: 'mouse' };

function fuenteEncendida(f) {
  return f === 'camara' ? interaccion.camara : f === 'manos' ? interaccion.manos : f === 'mic' ? micActive : f === 'mouse' ? interaccion.mouse : false;
}

async function iniciarEquipos() {
  if (SALIDA) return;
  const param = new URLSearchParams(location.search).get('equipos');
  let grupo = param;
  try {
    if (param) localStorage.setItem('minimapper_equipos', param);
    else grupo = localStorage.getItem('minimapper_equipos');
  } catch (e) {}
  if (!grupo) return;
  let modulo;
  try { modulo = await import('./equipos.js'); } catch (e) { console.warn('equipos.js no cargó', e); return; }
  const lista = modulo.EQUIPOS[grupo];
  ponerRecursosGrupo((modulo.RECURSOS || {})[grupo]);
  if (!Array.isArray(lista) || !lista.length) return;
  let elegido = '';
  try { elegido = localStorage.getItem('minimapper_equipo') || ''; } catch (e) {}
  equipos = { grupo, lista, elegido: lista.some(e => e.id === elegido) ? elegido : '' };
  document.getElementById('equipos').hidden = false;
  renderEquipos();
}

// Los enlaces del grupo, como filas arriba de los de siempre en la bienvenida.
function ponerRecursosGrupo(recursos) {
  const li = document.getElementById('welcome-curso');
  if (!li || !Array.isArray(recursos) || !recursos.length) return;
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  li.insertAdjacentHTML('beforebegin', recursos.map(r =>
    `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.texto)}${r.nota ? ` <span>${esc(r.nota)}</span>` : ''}</a></li>`).join(''));
}

function elegirEquipo(id) {
  equipos.elegido = id;
  try { localStorage.setItem('minimapper_equipo', id); } catch (e) {}
  renderEquipos();
}

function olvidarEquipos() {
  try { localStorage.removeItem('minimapper_equipos'); localStorage.removeItem('minimapper_equipo'); } catch (e) {}
  equipos = null;
  document.getElementById('equipos').hidden = true;
}

function encenderEquipo() {
  const e = equipos && equipos.lista.find(x => x.id === equipos.elegido);
  if (!e) return;
  for (const f of e.usa || []) {
    if (fuenteEncendida(f)) continue;
    if (f === 'camara') toggleCamaraSensor();
    else if (f === 'manos') toggleManosSensor();
    else if (f === 'mic') initMic();
    else if (f === 'mouse') toggleMouseSensor();
  }
}

function renderEquipos() {
  const el = document.getElementById('equipos-cuerpo');
  if (!el || !equipos) return;
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // `entre comillas invertidas` se vuelve código.
  const texto = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>');
  const e = equipos.lista.find(x => x.id === equipos.elegido);
  const titulo = (x) => x.breve ? `${x.breve} · ${x.caso}` : x.caso;
  el.innerHTML = `<div class="equipos-elegir">
      <select onchange="elegirEquipo(this.value)">
        <option value="" ${!e ? 'selected' : ''}>elige tu equipo</option>
        ${equipos.lista.map(x => `<option value="${x.id}" ${e && e.id === x.id ? 'selected' : ''}>${esc(titulo(x))}</option>`).join('')}
      </select>
      <button onclick="olvidarEquipos()" title="Quitar esta sección. Vuelve con ?equipos=${esc(equipos.grupo)}">×</button>
    </div>
    ${e ? `<div class="equipo">
      ${e.breve ? `<div class="equipo-nombre">${esc(e.breve)}</div><div class="equipo-caso">${esc(e.caso)}</div>` : `<div class="equipo-nombre">${esc(e.caso)}</div>`}
      ${e.idea ? `<p class="equipo-idea">${texto(e.idea)}</p>` : ''}
      ${(e.usa || []).length ? `<div class="equipo-usa">${e.usa.map(f => `<span data-fuente="${f}">${FUENTES_NOMBRE[f] || f}</span>`).join('')}
        <button onclick="encenderEquipo()" title="Enciende las fuentes que usa este proyecto">encender</button></div>
        <div class="equipo-lecturas" id="equipo-lecturas"></div>`
        : `<div class="equipo-usa sin">sin interacción</div>`}
      <ol class="equipo-receta">${(e.receta || []).map(r => `<li>${texto(r)}</li>`).join('')}</ol>
      ${e.nota ? `<p class="montaje-nota">${texto(e.nota)}</p>` : ''}
    </div>` : ''}`;
  pintarEquipo();
}

function pintarEquipo() {
  if (!equipos) return;
  const e = equipos.lista.find(x => x.id === equipos.elegido);
  if (!e) return;
  document.querySelectorAll('#equipos .equipo-usa [data-fuente]').forEach(s => s.classList.toggle('encendida', fuenteEncendida(s.dataset.fuente)));
  const out = document.getElementById('equipo-lecturas');
  if (out) out.textContent = (e.lecturas || []).map(k => `${k} ${(sensor[k] ?? 0).toFixed(2)}`).join(' · ');
}

// --- EDITOR → SALIDA: EL CANAL ---
// Un canal aparte de las lecturas. El editor publica lo vivo de la escena montada y la
// salida lo aplica (ver "PRESENTAR"):
//   salida → { tipo: 'pedir', ventana, lienzo: { w, h } }   (cada segundo)
//   editor → { tipo: 'estado', ventana, salida, escena, reproduccion, marca,
//              quads: [{ i, kind, fuente, puntos: [{ x, y }], local, color }] }
// Los puntos van en las coordenadas de siempre (centradas, en pixeles de la salida).
// `marca` es el punto que se arrastra (k = -1: la superficie entera, con M); `local`, el
// blob: de un archivo local. `ventana` es un id por pestaña.
const EDICION_CANAL = 'minimapper-edicion';
const VENTANA_ID = Math.random().toString(36).slice(2, 10);
let canalEdicion = null;
let estadoPendiente = false;

function estadoParaSalida() {
  return {
    tipo: 'estado', ventana: VENTANA_ID, salida: SALIDA, t0: relojBase,
    correccion: montaje.color, patron: { ...patrones },
    escena: scenes[currentSceneIndex]?.id,
    reproduccion: { activa: isPlaying, modo: playbackMode },
    marca: marcaParaSalida(),
    quads: quads.map((q, i) => {
      const c = quadColor(q);
      const libre = q.kind === 'freeform';
      return {
        i, kind: libre ? 'freeform' : 'quad', fuente: q.sourceType,
        puntos: (libre ? q.vertices : q.points).map(p => ({ x: p.x, y: p.y })),
        // Un archivo local del editor: la salida puede abrir su blob: mientras el editor viva.
        local: !SALIDA && q.sourceUrl && q.sourceUrl.startsWith('blob:') ? q.sourceUrl : undefined,
        recorte: q.recorte || null,
        color: { nivel: c.nivel, saturacion: c.saturacion, tinte: c.tinte,
                 senal: c.senal || '', destino: c.destino || 'nivel', invertir: !!c.invertir,
                 subida: c.subida || 0, bajada: c.bajada || 0, video: !!c.video },
      };
    }),
  };
}

// Se junta en un solo mensaje lo que cambie en el mismo instante (renderQuadList se
// llama varias veces seguidas al montar una escena). Sólo el editor publica.
function publicarEstado() {
  if (SALIDA || !canalEdicion || estadoPendiente) return;
  estadoPendiente = true;
  setTimeout(() => {
    estadoPendiente = false;
    canalEdicion.postMessage(estadoParaSalida());
  }, 50);
}

try {
  canalEdicion = new BroadcastChannel(EDICION_CANAL);
  canalEdicion.onmessage = (e) => {
    const m = e.data;
    if (!m) return;
    if (m.tipo === 'estado') { if (SALIDA && !m.salida) seguirEditor(m); return; }
    if (m.tipo === 'pedir') { notarSalida(m); publicarEstado(); entregarFuentes(); return; }
  };
} catch (e) {
  canalEdicion = null;
}

// Mientras el editor arrastra, la salida marca el punto tomado (o los de la superficie
// entera, con M): con video encima no se ve dónde cae una esquina en el muro. Se va sola
// un segundo después del último mensaje. Sólo en la salida, que nunca entra a edición.
let marcaRemota = null;
const MARCA_DURA = 1000;

function dibujarMarcaRemota() {
  if (!marcaRemota || uiVisible) return;
  const quad = quads[marcaRemota.i];
  if (!quad || performance.now() - marcaRemota.visto > MARCA_DURA) { marcaRemota = null; return; }
  const pts = quad.kind === 'freeform' ? quad.vertices : quad.points;
  const cuales = (marcaRemota.k >= 0 && pts[marcaRemota.k] ? [pts[marcaRemota.k]] : pts)
    .map(q => { const e = aPantalla(q); return { x: e.x - width / 2, y: e.y - height / 2 }; });
  push();
  resetMatrix();
  noFill();
  for (const p of cuales) {
    // anillo blanco con borde negro y cruz: se lee sobre cualquier textura
    stroke(0);
    strokeWeight(5);
    ellipse(p.x, p.y, 26, 26);
    stroke(255);
    strokeWeight(2);
    ellipse(p.x, p.y, 26, 26);
    line(p.x - 22, p.y, p.x - 8, p.y);
    line(p.x + 8, p.y, p.x + 22, p.y);
    line(p.x, p.y - 22, p.x, p.y - 8);
    line(p.x, p.y + 8, p.x, p.y + 22);
  }
  pop();
}

// --- PRESENTAR: LA SALIDA SIGUE AL EDITOR ---
// El editor (index.html) es el dueño del estado y la salida (?salida) lo sigue. Lo vivo
// —puntos, color y el punto que se arrastra— llega en `estado`, juntado cada 50 ms
// mientras algo cambia. Lo de estructura —quads nuevos o borrados, fuentes, código Hydra,
// otra escena— llega por localStorage: el editor ya guarda en cada uno de esos cambios, y
// el evento `storage` le avisa a la salida. La salida no guarda nunca.

const ventanasSalida = {};    // en el editor: 'A' / 'B' → la ventana que abrió Presentar
const salidas = new Map();    // en el editor: id de ventana → { id, visto, lienzo, pantalla }
let editorReproduce = false;
let firmaMontada = null;      // la estructura de la escena montada (ver firmaEscena)

// Lo que obliga a montar la escena de nuevo: número y forma de los quads y sus fuentes.
// No entran los puntos ni el color, que se siguen en vivo, ni el código Hydra, que basta
// con volver a ejecutar.
function firmaEscena(sceneData) {
  return JSON.stringify((sceneData?.quads || []).map(q => [
    q.kind === 'freeform' ? 'freeform' : 'quad', q.sourceType || 'hydra',
    (q.sourceUrl || '').startsWith('http') ? q.sourceUrl : '', q.hydraOutput ?? null,
    (q.kind === 'freeform' ? q.vertices : q.points)?.length || 0,
  ]));
}

// El punto que se arrastra aquí, para que la salida lo marque.
function marcaParaSalida() {
  if (SALIDA) return null;
  if (selected.quad !== -1) return { i: selected.quad, k: selected.move ? -1 : selected.vert };
  return null;
}

// Un clic, una ventana: el navegador bloquea la segunda si un mismo clic abre dos. Por eso
// con dos salidas hay dos botones.
function presentar(id = 'A') {
  const w = ventanasSalida[id];
  if (w && !w.closed) { w.focus(); return; }
  saveToLocalStorage();   // la salida arranca de lo guardado
  ventanasSalida[id] = window.open('?salida=' + id, 'minimapper-salida-' + id, 'popup,width=960,height=540');
}

function notarSalida(m) {
  if (SALIDA || !m.ventana || !m.lienzo) return;
  salidas.set(m.ventana, { id: m.id === 'B' ? 'B' : 'A', visto: performance.now(), lienzo: m.lienzo, pantalla: m.pantalla });
  // Sólo cuenta en "ventana": con resolución fija, el lienzo lo pone el montaje.
  if (!regiones()) lienzoTrabajo = { w: m.lienzo.w, h: m.lienzo.h };
}

// --- MONTAJE: UNA O DOS SALIDAS ---
// Pestaña "salidas". Con una salida en "ventana", todo es como siempre: el lienzo es el de
// la ventana que proyecta. Con resolución fija, o con dos salidas, el lienzo lo pone el
// montaje: las regiones van lado a lado (A a la izquierda) y centradas en el origen, así que
// una composición que ya existía queda en el centro, encima de la costura. Cada salida dibuja
// su región escalada a su ventana (1:1 en pantalla completa a esa resolución). Es del montaje,
// no de la obra: se guarda con la sesión, no por escena. Ver CLAUDE.md, "Lienzo extendido".

const RESOLUCIONES = { '1280x800': { w: 1280, h: 800 }, '1920x1080': { w: 1920, h: 1080 } };
// Corrección de color por ventana (paso 5): para igualar proyectores con lámparas distintas.
// tono en grados; temperatura de -1 (fría, más azul) a 1 (cálida, más roja).
const CORRECCION_NEUTRA = { brillo: 1, contraste: 1, saturacion: 1, tono: 0, temperatura: 0 };
const CORRECCION_RANGOS = { brillo: [0.5, 1.5], contraste: [0.5, 1.5], saturacion: [0, 2], tono: [-180, 180], temperatura: [-1, 1] };
let montaje = { n: 1, res: ['ventana', '1920x1080'], hydra: 'alta', color: { A: { ...CORRECCION_NEUTRA }, B: { ...CORRECCION_NEUTRA } } };

function normalizarCorreccion(c) {
  const out = { ...CORRECCION_NEUTRA };
  for (const [k, [lo, hi]] of Object.entries(CORRECCION_RANGOS)) {
    const v = c && c[k];
    if (typeof v === 'number' && isFinite(v)) out[k] = Math.min(hi, Math.max(lo, v));
  }
  return out;
}

function normalizarMontaje(m) {
  const n = m && m.n === 2 ? 2 : 1;
  const r = Array.isArray(m && m.res) ? m.res : [];
  const a = r[0] in RESOLUCIONES || (n === 1 && r[0] === 'ventana') ? r[0] : (n === 1 ? 'ventana' : '1920x1080');
  const b = r[1] in RESOLUCIONES ? r[1] : '1920x1080';
  return { n, res: [a, b], hydra: m && m.hydra === 'normal' ? 'normal' : 'alta',
           color: { A: normalizarCorreccion(m && m.color && m.color.A), B: normalizarCorreccion(m && m.color && m.color.B) } };
}

// Las regiones en coordenadas de puntos. null: "ventana", sin región fija.
function regiones() {
  if (montaje.n === 1 && montaje.res[0] === 'ventana') return null;
  const ids = montaje.n === 2 ? ['A', 'B'] : ['A'];
  const tams = ids.map((_, i) => RESOLUCIONES[montaje.res[i]]);
  let x = -tams.reduce((t, r) => t + r.w, 0) / 2;
  return ids.map((id, i) => {
    const r = { id, x, y: -tams[i].h / 2, w: tams[i].w, h: tams[i].h };
    x += tams[i].w;
    return r;
  });
}

function lienzoMontaje() {
  const rs = regiones();
  return rs ? { w: rs.reduce((t, r) => t + r.w, 0), h: Math.max(...rs.map(r => r.h)) } : null;
}

// En la salida: la región que le toca. Una B con montaje de una salida muestra la A.
function regionPropia() {
  const rs = regiones();
  return rs ? (rs.find(r => r.id === SALIDA_ID) || rs[0]) : null;
}

function setMontajeN(n) {
  montaje = normalizarMontaje({ ...montaje, n, res: [montaje.res[0] === 'ventana' && n === 2 ? '1920x1080' : montaje.res[0], montaje.res[1]] });
  aplicarResolucionHydra();
  saveToLocalStorage();
  renderMontaje();
}

function setMontajeRes(i, valor) {
  const res = [...montaje.res];
  res[i] = valor;
  montaje = normalizarMontaje({ ...montaje, res });
  saveToLocalStorage();
  renderMontaje();
}

function setMontajeHydra(calidad) {
  montaje = normalizarMontaje({ ...montaje, hydra: calidad });
  aplicarResolucionHydra();
  saveToLocalStorage();
  renderMontaje();
}

// --- HYDRA CON DOS SALIDAS: RESOLUCIÓN Y RELOJ ---
// Paso 4 del plan. Con una salida, Hydra sigue en 512×512 y con su propio reloj, como
// siempre. Con dos, la textura es apaisada (32:9, la de dos proyectores 16:9 juntos), así
// que cada mitad (ver RECORTE) es 16:9 y tiene más pixeles: 1024×576 por proyector en
// "alta", 512×288 en "normal". Cambia para todos los quads Hydra: uno que no use recorte
// ve la textura apaisada estirada. Y el reloj: cada ventana corre su Hydra, así que el
// editor fija un instante cero (relojBase) que manda en `estado`, y cada ventana pone
// `time` en lo que va desde ahí. Tiene que ser reciente: con millones de segundos, el
// noise() de Hydra pierde precisión en la GPU y la textura sale negra (lo enseñó
// tools/dos-salidas). Hydra suma su dt después, en su propio cuadro: la diferencia entre
// ventanas queda en unos ms. Límite: el feedback (src(o0)), Math.random(), mouse y el
// audio no se sincronizan con el reloj.
const RESOLUCION_HYDRA = { una: { w: 512, h: 512 }, normal: { w: 1024, h: 288 }, alta: { w: 2048, h: 576 } };
let relojBase = Date.now();   // en el editor, al cargar; en la salida, el del editor

function resolucionHydra() {
  return montaje.n === 2 ? RESOLUCION_HYDRA[montaje.hydra] : RESOLUCION_HYDRA.una;
}

// Hydra y los proxies por slot al tamaño del montaje. Los proxies se rehacen (objetos
// nuevos): p5 guarda la textura por objeto, y uno redimensionado podría quedar con la vieja.
function aplicarResolucionHydra() {
  if (typeof hydra === 'undefined' || !hydra.setResolution || !hydraCanvases.length) return;
  const r = resolucionHydra();
  if (hydra.width === r.w && hydra.height === r.h && hydraCanvases[0].width === r.w) return;
  // setResolution() escribe las globales width y height, que en modo global son las de p5:
  // sin devolverlas, la vista, el mouse y los marcos quedarían al tamaño de la textura.
  const w = width, h = height;
  hydra.setResolution(r.w, r.h);
  window.width = w;
  window.height = h;
  hydraCanvases = hydraCanvases.map(g => { g.remove(); return createGraphics(r.w, r.h); });
}

function sincronizarRelojHydra() {
  if (montaje.n !== 2 || typeof hydra === 'undefined' || !hydra.synth) return;
  hydra.synth.time = (Date.now() - relojBase) / 1000 * (hydra.synth.speed ?? 1);
}

// --- COLOR POR VENTANA Y PATRONES DE PRUEBA ---
// Paso 5 del plan. Para igualar dos proyectores con lámparas distintas: brillo, contraste,
// saturación, tono y temperatura por salida, aplicados en la salida como filtro CSS (más una
// matriz SVG para la temperatura) sobre el canvas, sin tocar el render. Es calibración, no
// expresión: va en el montaje, no en la escena, y el editor no la aplica (muestra la
// composición tal cual). Los patrones (blanco, gris 50%, barras) se dibujan dentro del mismo
// filtro, porque sin eso no sirven para calibrar, y no se guardan: viven mientras el editor
// los mande, para que una salida recargada sin editor no se quede proyectando gris.
const PATRONES = { no: 'nada', blanco: 'blanco', gris: 'gris 50%', barras: 'barras de color' };
const patrones = { A: 'no', B: 'no' };   // en el editor: lo que se pide; en la salida: lo que se ve
let patronVisto = 0;                     // en la salida: cuándo llegó el último estado con patrón

function setCorreccion(id, campo, valor) {
  const c = montaje.color[id];
  if (!c || !(campo in CORRECCION_RANGOS)) return;
  c[campo] = normalizarCorreccion({ ...c, [campo]: parseFloat(valor) })[campo];
  const out = document.getElementById(`correccion-${campo}-${id}`);
  if (out) out.textContent = campo === 'tono' ? Math.round(c[campo]) + '°' : c[campo].toFixed(2);
  publicarEstado();   // en vivo; se guarda al soltar
}

function resetCorreccion(id) {
  montaje.color[id] = { ...CORRECCION_NEUTRA };
  saveToLocalStorage();
  renderMontaje();
}

function setPatron(id, valor) {
  if (!(valor in PATRONES)) return;
  patrones[id] = valor;
  publicarEstado();
}

function correccionEsNeutra(c) {
  return !c || Object.keys(CORRECCION_NEUTRA).every(k => c[k] === CORRECCION_NEUTRA[k]);
}

// En la salida: filtro sobre el canvas y sobre el patrón. Sin corrección, sin filtro.
function aplicarCorreccion() {
  if (!SALIDA) return;
  const c = montaje.color[SALIDA_ID];
  let filtro = 'none';
  if (!correccionEsNeutra(c)) {
    const t = c.temperatura * 0.2;   // ±20% de rojo y azul en los extremos
    const matriz = document.getElementById('temperatura-matriz');
    if (matriz) matriz.setAttribute('values', `${1 + t} 0 0 0 0  0 ${1 + t * 0.1} 0 0 0  0 0 ${1 - t} 0 0  0 0 0 1 0`);
    filtro = `brightness(${c.brillo}) contrast(${c.contraste}) saturate(${c.saturacion}) hue-rotate(${c.tono}deg)` +
             (c.temperatura ? ' url(#temperatura)' : '');
  }
  const lienzo = document.getElementById('defaultCanvas0');   // el de p5, no los proxies
  if (lienzo) lienzo.style.filter = filtro;
  const patron = document.getElementById('patron');
  if (patron) {
    patron.style.filter = filtro;
    patron.className = patrones[SALIDA_ID] !== 'no' ? 'patron-' + patrones[SALIDA_ID] : '';
  }
}

// En la salida: el patrón se apaga si el editor deja de mandarlo.
if (SALIDA) setInterval(() => {
  if (patrones[SALIDA_ID] !== 'no' && performance.now() - patronVisto > 3000) { patrones[SALIDA_ID] = 'no'; aplicarCorreccion(); }
}, 1000);

// La pestaña "salidas" y los botones de Presentar.
function renderMontaje() {
  if (SALIDA) return;
  const dos = montaje.n === 2;
  document.getElementById('montaje-1')?.classList.toggle('active', !dos);
  document.getElementById('montaje-2')?.classList.toggle('active', dos);
  const opciones = (i, actual) => [...(dos ? [] : [['ventana', 'ventana (como siempre)']]), ['1280x800', '1280×800'], ['1920x1080', '1920×1080']]
    .map(([v, t]) => `<option value="${v}" ${v === actual ? 'selected' : ''}>${t}</option>`).join('');
  const filas = (dos ? ['A', 'B'] : ['A']).map((id, i) =>
    `<label class="montaje-fila">${dos ? id : 'salida'}<select onchange="setMontajeRes(${i}, this.value)">${opciones(i, montaje.res[i])}</select></label>`);
  if (dos) filas.push(`<label class="montaje-fila" title="La textura de Hydra con dos salidas: alta da más detalle por proyector; normal pesa menos (para una máquina lenta o Firefox)">Hydra<select onchange="setMontajeHydra(this.value)">` +
    [['alta', 'alta · 2048×576'], ['normal', 'normal · 1024×288']].map(([v, t]) => `<option value="${v}" ${montaje.hydra === v ? 'selected' : ''}>${t}</option>`).join('') + '</select></label>');
  const res = document.getElementById('montaje-res');
  if (res) res.innerHTML = filas.join('');
  const color = document.getElementById('montaje-color');
  if (color) color.innerHTML = (dos ? ['A', 'B'] : ['A']).map(id => {
    const c = montaje.color[id];
    const valor = (campo) => campo === 'tono' ? Math.round(c[campo]) + '°' : c[campo].toFixed(2);
    const rango = (campo, texto, paso) => {
      const [lo, hi] = CORRECCION_RANGOS[campo];
      return `<label>${texto}<input type="range" min="${lo}" max="${hi}" step="${paso}" value="${c[campo]}"
        oninput="setCorreccion('${id}','${campo}',this.value)" onchange="saveToLocalStorage()"><output id="correccion-${campo}-${id}">${valor(campo)}</output></label>`;
    };
    return `<div class="section-label correccion-titulo">color${dos ? ' · ' + id : ''}</div>
      <div class="quad-color correccion">
        <label title="Un patrón en la salida para comparar proyectores. No se guarda: se apaga al cerrar el editor">patrón<select onchange="setPatron('${id}', this.value)">
          ${Object.entries(PATRONES).map(([v, t]) => `<option value="${v}" ${patrones[id] === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select><span></span></label>
        ${rango('brillo', 'brillo', 0.01)}
        ${rango('contraste', 'contraste', 0.01)}
        ${rango('saturacion', 'saturación', 0.01)}
        ${rango('tono', 'tono', 1)}
        <label title="Hacia la izquierda, más azul (fría); hacia la derecha, más roja (cálida)">temperatura<input type="range" min="-1" max="1" step="0.01" value="${c.temperatura}"
          oninput="setCorreccion('${id}','temperatura',this.value)" onchange="saveToLocalStorage()"><output id="correccion-temperatura-${id}">${valor('temperatura')}</output></label>
        <label><span></span><button onclick="resetCorreccion('${id}')" title="Volver a los valores neutros">↺ neutro</button><span></span></label>
      </div>`;
  }).join('');
  const botones = document.getElementById('presentar-botones');
  if (botones) botones.innerHTML = (dos ? ['A', 'B'] : ['A']).map(id =>
    `<button class="wide-btn" onclick="presentar('${id}')" title="Abre la salida${dos ? ' ' + id : ''} en otra ventana: llévala ${dos ? 'a su' : 'al'} proyector y dale doble clic para pantalla completa. Sigue lo que hagas aquí.">` +
    `<span class="wide-icon">▭</span>Presentar${dos ? ' ' + id : ''}</button>`).join('');
}

// En la salida: la letra en grande sólo con dos salidas.
function actualizarSalidaDOM() {
  if (SALIDA) document.body.classList.toggle('dos', montaje.n === 2);
}

// Lo de afuera de la región no se proyecta: con una ventana de otra proporción, los quads
// que se salen, o la región vecina, se verían en las franjas.
function enmascararRegion(v) {
  const r = regionPropia();
  if (!r) return;
  const a = aPantalla({ x: r.x, y: r.y }, v), b = aPantalla({ x: r.x + r.w, y: r.y + r.h }, v);
  push();
  resetMatrix();
  translate(-width / 2, -height / 2);
  noStroke();
  fill(0);
  rect(0, 0, width, a.y);
  rect(0, b.y, width, height - b.y);
  rect(0, a.y, a.x, b.y - a.y);
  rect(b.x, a.y, width - b.x, b.y - a.y);
  pop();
}

// En el editor: la letra de cada salida sobre su marco (DOM: el texto en WEBGL pide una fuente).
function etiquetarSalidas(v) {
  const rs = !SALIDA && uiVisible && montaje.n === 2 ? regiones() : null;
  ['A', 'B'].forEach(id => {
    const el = document.getElementById('etiqueta-salida-' + id);
    if (!el) return;
    const r = rs && rs.find(x => x.id === id);
    el.hidden = !r;
    if (!r) return;
    const e = aPantalla({ x: r.x, y: r.y }, v);
    el.style.transform = `translate(${Math.round(e.x + 8)}px, ${Math.round(e.y + 6)}px)`;
  });
}

// --- VISTA: EL EDITOR TRABAJA A LA RESOLUCIÓN DE LA SALIDA ---
// Los puntos son pixeles de la ventana que proyecta. Con una salida abierta, el editor
// dibuja el lienzo de la salida entero, escalado para caber a la derecha del panel, y
// convierte el mouse con la inversa: lo que se ve aquí es lo que sale. El lienzo se
// recuerda mientras el editor siga abierto, para que la vista no salte si la salida se
// cierra un momento. Sólo en modo edición: en presentación el lienzo vuelve a 1:1. Es
// vista, no datos: no toca los puntos ni se guarda. Los radios de captura y el tamaño de
// los puntos siguen en pixeles de pantalla.

let lienzoTrabajo = null;   // en el editor: el lienzo de la última salida que se oyó
const VISTA_MARGEN = 24;

// { s, ox, oy }: escala, y dónde cae en pantalla el centro del lienzo de la salida.
function vista() {
  const identidad = { s: 1, ox: width / 2, oy: height / 2 };
  if (SALIDA) {
    // Su región, escalada para caber y centrada (ver MONTAJE). Sin región, 1:1 como siempre.
    const r = regionPropia();
    if (!r) return identidad;
    const s = Math.min(width / r.w, height / r.h);
    return { s, ox: width / 2 - (r.x + r.w / 2) * s, oy: height / 2 - (r.y + r.h / 2) * s };
  }
  const L = lienzoMontaje() || lienzoTrabajo;
  if (!uiVisible || !L) return identidad;
  const x0 = Math.max(0, document.getElementById('ui').getBoundingClientRect().right);
  const w = width - x0 - 2 * VISTA_MARGEN, h = height - 2 * VISTA_MARGEN;
  if (w <= 0 || h <= 0) return identidad;
  const s = Math.min(w / L.w, h / L.h);
  return { s, ox: x0 + VISTA_MARGEN + w / 2, oy: height / 2 };
}

function aPantalla(p, v = vista()) {
  return { x: v.ox + p.x * v.s, y: v.oy + p.y * v.s };
}

function aMundo(x, y, v = vista()) {
  return { x: (x - v.ox) / v.s, y: (y - v.oy) / v.s };
}

// El lienzo en el que viven los puntos: el de la salida si hay, si no el de esta ventana.
function lienzoComposicion() {
  const L = lienzoMontaje();
  if (L) return L;
  if (!SALIDA && lienzoTrabajo) return lienzoTrabajo;
  return { w: window.width || innerWidth, h: window.height || innerHeight };
}

// Lo que queda fuera del lienzo de la salida no se proyecta: se oscurece, y el borde
// se marca en ámbar. Se dibuja antes que los puntos, que tienen que alcanzarse aunque
// hayan quedado afuera.
function dibujarMarcoSalida(v) {
  if (SALIDA) return;
  const L = lienzoTrabajo;
  const rs = regiones() || (L ? [{ id: '', x: -L.w / 2, y: -L.h / 2, w: L.w, h: L.h }] : null);
  if (!rs) return;
  const p = rs.map(r => { const a = aPantalla({ x: r.x, y: r.y }, v); return { x: a.x, y: a.y, w: r.w * v.s, h: r.h * v.s }; });
  const x0 = Math.min(...p.map(r => r.x)), x1 = Math.max(...p.map(r => r.x + r.w));
  const y0 = Math.min(...p.map(r => r.y)), y1 = Math.max(...p.map(r => r.y + r.h));
  noStroke();
  fill(0, 0, 0, 170);
  rect(0, 0, width, y0);
  rect(0, y1, width, height - y1);
  rect(0, y0, x0, y1 - y0);
  rect(x1, y0, width - x1, y1 - y0);
  // Con dos regiones de distinta altura, lo que queda arriba y abajo de la más baja.
  for (const r of p) {
    if (r.y > y0) rect(r.x, y0, r.w, r.y - y0);
    if (r.y + r.h < y1) rect(r.x, r.y + r.h, r.w, y1 - r.y - r.h);
  }
  noFill();
  stroke(255, 200, 64, 160);
  strokeWeight(1);
  for (const r of p) rect(r.x, r.y, r.w, r.h);
}

// Puntos y color de cada quad, del estado del editor o de lo guardado. Si los quads no
// coinciden en número, forma o fuente, la estructura cambió y está por llegar el
// `storage`: mover puntos por índice ahora movería el quad equivocado.
function seguirQuads(datos) {
  const forma = q => q.kind === 'freeform' ? 'freeform' : 'quad';
  if (datos.length !== quads.length) return;
  if (!datos.every((d, i) => forma(d) === forma(quads[i]) && (d.fuente || d.sourceType || 'hydra') === quads[i].sourceType)) return;
  datos.forEach((d, i) => {
    const q = quads[i];
    const pts = forma(q) === 'freeform' ? q.vertices : q.points;
    const nuevos = d.puntos || (forma(q) === 'freeform' ? d.vertices : d.points) || [];
    if (nuevos.length === pts.length && nuevos.some((p, k) => p.x !== pts[k].x || p.y !== pts[k].y)) {
      nuevos.forEach((p, k) => { pts[k].x = p.x; pts[k].y = p.y; });
      if (forma(q) === 'quad') buildTessCache(q);
    }
    q.color = { ...COLOR_NEUTRO, ...d.color, rampa: q.color?.rampa, _rampa: q.color?._rampa };
    q.recorte = normalizarRecorte(d.recorte);
  });
}

function seguirEditor(m) {
  editorReproduce = !!m.reproduccion?.activa;
  if (typeof m.t0 === 'number' && isFinite(m.t0)) relojBase = m.t0;
  if (m.correccion) montaje.color = { A: normalizarCorreccion(m.correccion.A), B: normalizarCorreccion(m.correccion.B) };
  if (m.patron) { for (const id of ['A', 'B']) patrones[id] = m.patron[id] in PATRONES ? m.patron[id] : 'no'; patronVisto = performance.now(); }
  aplicarCorreccion();
  if (m.escena !== scenes[currentSceneIndex]?.id) return;   // la otra escena llega por storage
  seguirQuads(m.quads || []);
  seguirArchivosLocales(m.quads || []);
  if (m.marca && quads[m.marca.i]) marcaRemota = { i: m.marca.i, k: m.marca.k, visto: performance.now() };
}

// --- FUENTES DEL EDITOR EN LA SALIDA ---
// Paso 4 de "Control desde el modo edición". Lo que no viaja como texto vive en la máquina
// del editor y la salida lo toma prestado: un archivo local por su blob: (en el estado, ver
// estadoParaSalida) y la cámara y la pantalla por la referencia de window.open(), porque un
// MediaStream no cabe en un mensaje. La salida no tiene botones para pedir la pantalla, y
// la cámara la pedía por su cuenta, con un alert() en el proyector si no había permiso.
// Probado en Chromium y Firefox (ver CLAUDE.md, "Fuentes del editor en la salida"). Al cerrar el
// editor, lo prestado se acaba: el editor es el dueño.

// En el editor: lo que tiene vivo, por quad de la escena montada.
function fuentesParaSalida() {
  return quads.map((q, i) => {
    const stream = q.sourceType === 'camera' ? q.sourceEl?.elt?.srcObject
                 : q.sourceType === 'pantalla' ? q.sourceVideo?.srcObject : null;
    if (stream && stream.getVideoTracks().some(t => t.readyState === 'live')) return { i, tipo: q.sourceType, stream };
    return null;
  }).filter(Boolean);
}

// En el editor, cada vez que la salida pide (una vez por segundo): así llega a una salida
// recién abierta o recargada, a una fuente nueva y a la escena nueva sin avisos aparte.
// La salida no rehace nada si ya tiene el mismo stream.
function entregarFuentes() {
  if (SALIDA) return;
  const lista = fuentesParaSalida();
  for (const w of Object.values(ventanasSalida)) {
    if (!w || w.closed) continue;
    try { w.recibirFuentes?.(scenes[currentSceneIndex]?.id, lista); }
    catch (e) { console.warn('no se pudieron pasar las fuentes a la salida', e); }
  }
}

// En la salida: ¿la abrió un editor con Presentar? Si sí, la cámara la pone él.
function editorQueAbrio() {
  try { return SALIDA && window.opener && !window.opener.closed && typeof window.opener.fuentesParaSalida === 'function'; }
  catch (e) { return false; }
}

// En la salida. Un préstamo es un <video> propio con un clon del stream y su proxy, por id
// del stream original. El clon importa: parar sus tracks no le apaga la fuente al editor.
const prestamos = new Map();
let fuentesEditor = null;   // { escena, lista }: la última entrega

function recibirFuentes(escena, lista) {
  if (!SALIDA) return;
  fuentesEditor = { escena, lista: lista || [] };
  aplicarFuentesEditor();
}

function soltarPrestamo(id) {
  const p = prestamos.get(id);
  if (!p) return;
  prestamos.delete(id);
  p.videoEl.srcObject?.getTracks().forEach(t => t.stop());
  p.videoEl.srcObject = null;
  p.videoEl.remove();
  quads.forEach(q => { if (q.sourceVideo === p.videoEl) { q.sourceVideo = null; q.sourceEl = null; q.prestado = false; } });
  p.proxy.remove();
}

function aplicarFuentesEditor() {
  if (!SALIDA || !fuentesEditor) return;
  const vivos = new Set(fuentesEditor.lista.map(f => f.stream.id));
  for (const id of [...prestamos.keys()]) if (!vivos.has(id)) soltarPrestamo(id);
  if (fuentesEditor.escena !== scenes[currentSceneIndex]?.id) return;   // llega con el próximo pedir
  for (const f of fuentesEditor.lista) {
    const q = quads[f.i];
    if (!q || q.sourceType !== f.tipo) continue;   // la estructura todavía no llega por storage
    let p = prestamos.get(f.stream.id);
    if (p && q.sourceVideo === p.videoEl) continue;
    if (!p) {
      const videoEl = document.createElement('video');
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.style.display = 'none';
      document.body.appendChild(videoEl);
      videoEl.srcObject = f.stream.clone();
      videoEl.play().catch(() => {});
      // Se cortó del lado del editor (dejó de compartir, se cerró): el quad vuelve a negro.
      videoEl.srcObject.getVideoTracks()[0]?.addEventListener('ended', () => soltarPrestamo(f.stream.id));
      p = { videoEl, proxy: createGraphics(512, 512) };
      prestamos.set(f.stream.id, p);
    }
    q.sourceVideo = p.videoEl;
    q.sourceEl = p.proxy;
    q.prestado = true;
  }
}

// Al cerrar el editor, el clon no siempre avisa `ended` (Chromium deja el track vivo y sin
// cuadros): sin editor que preste, se suelta todo.
if (SALIDA) setInterval(() => {
  if (prestamos.size && !editorQueAbrio()) [...prestamos.keys()].forEach(soltarPrestamo);
}, 1000);

// En la salida: el archivo local del editor, por su blob:. Sólo si el quad ya es de ese tipo.
function seguirArchivosLocales(datos) {
  datos.forEach((d, i) => {
    const q = quads[i];
    if (!d.local || !q || q.sourceType !== d.fuente || (d.fuente !== 'video' && d.fuente !== 'image')) return;
    if (q.sourceUrl === d.local) return;
    clearQuadSource(i);
    restoreLocalSource(i, d.local);
  });
}

// El editor guardó: otra escena, otra estructura, otro código Hydra, o sólo puntos y color
// (que normalmente ya llegaron por el estado).
function seguirGuardado() {
  let config;
  try { config = JSON.parse(localStorage.getItem('minimapper_config')); } catch (e) { return; }
  if (!config?.scenes?.length) return;
  const montada = scenes[currentSceneIndex]?.id;
  scenes = config.scenes.map(s => ({ id: s.id, duration_s: s.duration_s || 30, hydraCode: s.hydraCode || '', quads: s.quads || [] }));
  playbackMode = config.playbackMode || 'once';
  montaje = normalizarMontaje(config.montaje);
  actualizarSalidaDOM();
  aplicarResolucionHydra();
  aplicarCorreccion();
  const indice = Math.min(config.currentSceneIndex || 0, scenes.length - 1);
  const escena = scenes[indice];
  currentSceneIndex = indice;   // la misma escena puede cambiar de lugar si se borra otra
  if (escena.id !== montada || firmaEscena(escena) !== firmaMontada) {
    const montar = () => { _applySceneData(scenes[indice]); renderSceneStrip(); };
    // En reproducción, el mismo fundido que advanceScene().
    if (!editorReproduce || escena.id === montada) { montar(); return; }
    const fadeEl = document.getElementById('scene-fade');
    fadeEl.classList.add('fading');
    setTimeout(() => { montar(); fadeEl.classList.remove('fading'); }, 350);
    return;
  }
  escena.quads.forEach((d, i) => {
    const q = quads[i];
    if (q && q.sourceType === 'hydra' && d.hydraCode != null && d.hydraCode !== q.hydraCode) {
      q.hydraCode = d.hydraCode;
      evalHydra(d.hydraCode);
    }
    if (q && q.sourceType === 'p5' && d.p5Code != null && d.p5Code !== q.p5Code) {
      q.p5Code = d.p5Code;
      montarSketchP5(i);
    }
  });
  seguirQuads(escena.quads);
}

if (SALIDA) {
  // firmaMontada en null: setup() todavía no monta la escena, y sin p5 no hay createVector.
  window.addEventListener('storage', e => {
    if (e.key === 'minimapper_config' && firmaMontada !== null) seguirGuardado();
  });
  setInterval(() => {
    const dpr = window.devicePixelRatio || 1;
    if (canalEdicion) canalEdicion.postMessage({ tipo: 'pedir', ventana: VENTANA_ID, id: SALIDA_ID,
      lienzo: { w: window.width || innerWidth, h: window.height || innerHeight },
      // En pixeles físicos: un 1920×1080 al 150% de Windows le dice 1280×720 a la página.
      pantalla: { w: Math.round(screen.width * dpr), h: Math.round(screen.height * dpr) } });
  }, 1000);
} else {
  setInterval(() => {
    const el = document.getElementById('salida-estado');
    if (!el) return;
    const ahora = performance.now();
    for (const [id, s] of salidas) if (ahora - s.visto > 3000) salidas.delete(id);
    const abiertas = [...salidas.values()];
    const rs = regiones();
    if (!rs) {
      // "ventana": como siempre, la salida pone el tamaño.
      const s = abiertas[0];
      el.classList.toggle('vivo', !!s);
      el.textContent = !s ? 'salida cerrada' + (lienzoTrabajo ? ` · vista a ${lienzoTrabajo.w}×${lienzoTrabajo.h}` : '')
        : abiertas.length > 1 ? `${abiertas.length} salidas abiertas`
        : `salida abierta · ${s.lienzo.w}×${s.lienzo.h}`;
      el.title = lienzoTrabajo ? 'En modo edición, el lienzo se dibuja a la escala de la salida: lo que queda dentro del marco ámbar es lo que se proyecta.' : '';
      return;
    }
    // Resolución fija: una línea por salida. En ámbar si la pantalla en la que está la
    // ventana no es la resolución elegida: se va a escalar.
    el.classList.toggle('vivo', abiertas.length > 0);
    el.innerHTML = rs.map(r => {
      const s = abiertas.find(x => x.id === r.id);
      const nombre = rs.length > 1 ? r.id + ' · ' : '';
      if (!s) return `<span>${nombre}${r.w}×${r.h} · cerrada</span>`;
      const p = s.pantalla;
      const distinta = p && (p.w !== r.w || p.h !== r.h);
      return `<span class="${distinta ? 'ambar' : 'vivo'}">${nombre}${r.w}×${r.h} · abierta` +
        (distinta ? ` · su pantalla es ${p.w}×${p.h}: se escala` : '') + '</span>';
    }).join('<br>');
    el.title = 'En modo edición se ve el lienzo entero: cada marco ámbar es lo que proyecta una salida.';
  }, 1000);
}

// Un snapshot por gesto (al apretar el deslizador o una tecla), no por cada paso del arrastre.
function undoColor(e) {
  if (e && e.repeat) return;
  pushUndo();
}

function resetQuadColor(index) {
  pushUndo();
  quads[index].color = { ...COLOR_NEUTRO };
  renderQuadList();
  saveToLocalStorage();
}

// --- CONTEXTO WEBGL PERDIDO ---
// Windows + Chrome tira el contexto al conectar un proyector (cambio de topología de
// pantallas o de GPU). Sin esto, p5 sigue dibujando contra shaders nulos y la consola
// se llena de TypeError. Ver CLAUDE.md, "Pérdida de contexto WebGL".

let glContextLost = false;

function handleContextLost(e) {
  e.preventDefault();          // sin esto el contexto no puede restaurarse nunca
  if (glContextLost) return;
  glContextLost = true;
  noLoop();                    // frena draw() antes de que rompa contra shaders nulos
  saveToLocalStorage();        // datos puros, no toca GL
  const overlay = document.getElementById('glcrash');
  if (overlay) overlay.classList.add('visible');
  console.warn('Contexto WebGL perdido — render detenido. Recargar para continuar.');
}

function setup() {
  let cnv = createCanvas(windowWidth, windowHeight, WEBGL);
  cnv.elt.addEventListener('webglcontextlost', handleContextLost, false);
  // El pinch del trackpad llega como wheel con ctrlKey y el navegador lo lee como
  // zoom de página: cambia windowWidth, dispara windowResized() y el lienzo se
  // redimensiona, pero los puntos son pixeles y no se reescalan. El mapeo se
  // descalibra respecto de la superficie física y nada lo avisa.
  window.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  cnv.style('position', 'fixed');
  cnv.style('top', '0');
  cnv.style('left', '0');
  cnv.style('z-index', '0');
  hc = select("#myCanvas");
  hc.hide();
  window.noise = _hydraNoise; // restore after p5 overwrote it
  for (let i = 0; i < 4; i++) hydraCanvases.push(createGraphics(512, 512));
  aplicarResolucionHydra();   // con dos salidas, apaisada (ver HYDRA CON DOS SALIDAS)
  aplicarCorreccion();        // en la salida, el color guardado de su ventana
  gridGfx = buildGridTexture();
  colorShader = createShader(COLOR_VERT, COLOR_FRAG);

  _applySceneData(scenes[currentSceneIndex]);
  renderSceneStrip();
}

function draw() {
  if (glContextLost) return;
  sincronizarRelojHydra();
  background(0);
  textureMode(NORMAL);


  if (micActive && micAnalyser) {
    micAnalyser.getFloatTimeDomainData(micBuffer);
    let rms = 0;
    for (let i = 0; i < micBuffer.length; i++) rms += micBuffer[i] * micBuffer[i];
    rms = Math.sqrt(rms / micBuffer.length);
    energyAvg = energyAvg * 0.95 + rms * 0.05;
    const now = millis();
    if (rms > energyAvg * onsetRatio && rms > ONSET_MIN && now - lastOnsetTime > ONSET_COOLDOWN) {
      lastOnsetTime = now;
      advanceCarousels();
    }
  }

  // Con una salida abierta, el editor dibuja a su escala (ver "VISTA"). Sin ella, identidad.
  const v = vista();
  push();
  translate(v.ox - width / 2, v.oy - height / 2);
  scale(v.s);

  for (let q = 0; q < quads.length; q++) {
    const quad = quads[q];

    if (quad.sourceVideo && quad.sourceVideo.readyState >= 2) {
      quad.sourceEl.drawingContext.drawImage(quad.sourceVideo, 0, 0, 512, 512);
    }
    if (quad.p5Frame) copiarSketchP5(quad);

    let tex;
    if (quad.sourceType === 'grid') {
      tex = gridGfx;
    } else if (quad.sourceType === 'carousel' && quad.carousel && quad.carousel.length > 0) {
      tex = quad.carousel[quad.carouselIndex].img;
    } else if (quad.sourceType === 'hydra') {
      const _slot = quad.hydraOutput ?? 0;
      hydra.renderFbo({
        tex0: hydra.o[_slot].getCurrent(),
        resolution: [hc.elt.width, hc.elt.height]
      });
      hydraCanvases[_slot].drawingContext.drawImage(hc.elt, 0, 0, hydraCanvases[_slot].width, hydraCanvases[_slot].height);
      tex = hydraCanvases[_slot];
    } else if (quad.sourceEl) {
      tex = quad.sourceEl;
    } else {
      // Sin fuente cargada (video/imagen sin archivo, cámara resolviendo, carrusel vacío):
      // la rejilla, no el canvas crudo de Hydra. Ver CLAUDE.md, "Rejilla de calibración".
      tex = gridGfx;
    }

    const conShader = !colorEsNeutro(quad.color) && colorShader;
    if (conShader) {
      shader(colorShader);
      colorShader.setUniform('uTex', tex);
      const ef = colorEfectivo(quad.color);
      colorShader.setUniform('uNivel', ef.nivel);
      colorShader.setUniform('uSaturacion', ef.saturacion);
      colorShader.setUniform('uTinte', ef.tinte);
    } else {
      texture(tex);
    }

    if (uiVisible) stroke(255, 255, 255, 18);
    else noStroke();

    if (quad.kind === 'freeform') {
      const verts = quad.vertices;
      const n = verts.length;
      if (n < 3) { if (conShader) resetShader(); continue; }
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const v of verts) {
        if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
      }
      const dX = maxX - minX || 1, dY = maxY - minY || 1;
      const ru = quad.recorte ? quad.recorte.u0 : 0, rw = quad.recorte ? quad.recorte.u1 - quad.recorte.u0 : 1;
      const uF = x => ru + (x - minX) / dX * rw;   // el recorte de textura, si hay
      let cx = 0, cy = 0;
      for (const v of verts) { cx += v.x; cy += v.y; }
      cx /= n; cy /= n;
      beginShape(TRIANGLES);
      for (let i = 0; i < n; i++) {
        const a = verts[i], b = verts[(i + 1) % n];
        vertex(cx, cy, uF(cx), (cy - minY) / dY);
        vertex(a.x, a.y, uF(a.x), (a.y - minY) / dY);
        vertex(b.x, b.y, uF(b.x), (b.y - minY) / dY);
      }
      endShape();
    } else {
      const cache = quad.tessCache;
      // El recorte de textura, si hay: u va de ru a ru + rw en vez de 0 a 1.
      const ru = quad.recorte ? quad.recorte.u0 : 0, rw = quad.recorte ? quad.recorte.u1 - quad.recorte.u0 : 1;
      beginShape(TRIANGLES);
      for (let j = 0; j < TESS; j++) {
        for (let i = 0; i < TESS; i++) {
          const u0 = ru + i / TESS * rw, u1 = ru + (i + 1) / TESS * rw;
          const v0 = j / TESS,         v1 = (j + 1) / TESS;
          const p00 = cache[j][i],     p10 = cache[j][i + 1];
          const p11 = cache[j+1][i+1], p01 = cache[j+1][i];
          vertex(p00.x, p00.y, u0, v0);
          vertex(p10.x, p10.y, u1, v0);
          vertex(p11.x, p11.y, u1, v1);
          vertex(p00.x, p00.y, u0, v0);
          vertex(p11.x, p11.y, u1, v1);
          vertex(p01.x, p01.y, u0, v1);
        }
      }
      endShape();
    }
    if (conShader) resetShader();
  }
  pop();
  if (SALIDA) enmascararRegion(v);
  else etiquetarSalidas(v);

  // Control points + crosshair — edit mode only
  if (uiVisible) {
    push();
    resetMatrix();
    translate(-width / 2, -height / 2);

    dibujarMarcoSalida(v);

    noStroke();
    for (let q = 0; q < quads.length; q++) {
      const shape = quads[q];
      const pts = shape.kind === 'freeform' ? shape.vertices : shape.points;
      for (let i = 0; i < pts.length; i++) {
        const { x: sx, y: sy } = aPantalla(pts[i], v);
        const isSelected = selected.quad === q && selected.vert === i;
        if (isSelected) {
          fill(255);
          ellipse(sx, sy, 16, 16);
        } else {
          fill(shape.kind === 'freeform' || CORNERS.has(i) ? color(255, 0, 0) : color(255, 200, 0));
          ellipse(sx, sy, 10, 10);
        }
      }
    }

    stroke(255, 255, 255, 120);
    strokeWeight(1);
    line(0, mouseY, width, mouseY);
    line(mouseX, 0, mouseX, height);

    if (drawingMode && drawStart && drawCurrent) {
      noFill();
      stroke(255, 255, 255, 200);
      strokeWeight(1);
      rect(
        min(drawStart.x, drawCurrent.x),
        min(drawStart.y, drawCurrent.y),
        abs(drawCurrent.x - drawStart.x),
        abs(drawCurrent.y - drawStart.y)
      );
    }

    if (freeformMode && freeformVerts.length > 0) {
      stroke(255, 255, 255, 200);
      strokeWeight(1);
      noFill();
      beginShape();
      for (const fv of freeformVerts) { const p = aPantalla(fv, v); vertex(p.x, p.y); }
      vertex(mouseX, mouseY);
      endShape();
      noStroke();
      for (let i = 0; i < freeformVerts.length; i++) {
        const { x: sx, y: sy } = aPantalla(freeformVerts[i], v);
        const closeable = i === 0 && freeformVerts.length >= 3 && dist(mouseX, mouseY, sx, sy) < 15;
        fill(closeable ? color(0, 220, 80) : color(255, 0, 0));
        ellipse(sx, sy, closeable ? 14 : 10, closeable ? 14 : 10);
      }
    }

    pop();
  }

  dibujarMarcaRemota();
}

// releaseSources=false desmonta el quad sin matar lo que tiene que seguir vivo para volver:
// el blob: de un archivo local y el stream de una captura de pantalla. Lo usa el cambio de
// escena, donde el quad se desarma pero la fuente sigue siendo de alguien.
function clearQuadSource(index, releaseSources = true) {
  const quad = quads[index];
  if (quad.prestado) {
    // En la salida: el <video> y su proxy son del registro de préstamos (aplicarFuentesEditor).
    quad.sourceVideo = null;
    quad.sourceEl = null;
    quad.prestado = false;
    return;
  }
  if (quad.sourceType === 'hydra') {
    releaseHydraSlot(quad.hydraOutput);
    quad.hydraOutput = null;
  }
  if (quad.sourceType === 'carousel') {
    quad.carousel = [];
    quad.carouselIndex = 0;
  }
  if (quad.p5Frame || quad.p5Proxy) desmontarSketchP5(quad);   // el código queda; el sketch se va
  if (quad.sourceUrl) {
    // La salida no crea blob:, sólo abre los del editor: revocarlos se los rompería a él.
    if (releaseSources && !SALIDA && !quad.sourceUrl.startsWith('http')) URL.revokeObjectURL(quad.sourceUrl);
    quad.sourceUrl = null;
  }
  if (quad.sourceVideo) {
    if (!releaseSources && quad.sourceVideo.srcObject) {
      // Cambio de escena sobre una captura viva: se suelta la referencia y ya. El <video>
      // se queda en el DOM recibiendo el stream —no se puede "reanudar" una compartición,
      // sólo mantenerla— y el snapshot se lo guarda para reengancharlo al volver.
      quad.sourceVideo = null;
    } else {
      quad.sourceVideo.pause();
      if (quad.sourceVideo.srcObject) {
        // Una captura de pantalla entra por srcObject. Hay que parar los tracks o el navegador
        // sigue anunciando que la pestaña se comparte, con el stream ya sin destino.
        quad.sourceVideo.srcObject.getTracks().forEach(t => t.stop());
        quad.sourceVideo.srcObject = null;
      } else {
        // Desmontar sin provocar una carga fallida: `src = ''` se resuelve contra la URL de la
        // página, falla y dispara un `error` tardío sobre un elemento que ya no le importa a
        // nadie. removeAttribute + load() vacía el elemento sin intentar cargar nada.
        quad.sourceVideo.removeAttribute('src');
        quad.sourceVideo.load();
      }
      if (quad.sourceVideo.parentNode) quad.sourceVideo.parentNode.removeChild(quad.sourceVideo);
      quad.sourceVideo = null;
    }
  }
  if (quad.sourceType === 'camera' && quad.sourceEl) {
    const vid = quad.sourceEl.elt;
    if (vid && vid.srcObject) {
      vid.srcObject.getTracks().forEach(t => t.stop());
      vid.srcObject = null;
    }
    quad.sourceEl.remove();
  } else if (quad.sourceType === 'video' && quad.sourceEl) {
    quad.sourceEl.remove();
  }
  // p5.Image has no DOM element to remove; GC handles it
  quad.sourceEl = null;   // sin esto el quad queda en negro en vez de volver a la rejilla
}

function deleteQuad(index) {
  clearQuadSource(index);
  quads.splice(index, 1);
  undoStack.length = 0;
  renderQuadList();
  saveToLocalStorage();
  updateCurrentSceneThumbnail();
}

function changeQuadSource(index, type) {
  if (quads[index].sourceType === type) return;
  clearQuadSource(index);
  quads[index].sourceType = type;
  quads[index].sourceEl = null;
  quads[index].urlNote = null;
  if (type === 'hydra') {
    const slot = assignHydraSlot();
    quads[index].hydraOutput = slot;
    if (!quads[index].hydraCode) {
      quads[index].hydraCode = `osc(1, 1, 1).out(o${slot})`;
      evalHydra(quads[index].hydraCode);
    }
    renderQuadList();
  } else if (type === 'carousel') {
    if (!quads[index].carousel) quads[index].carousel = [];
    if (quads[index].carouselIndex == null) quads[index].carouselIndex = 0;
    renderQuadList();
  } else if (type === 'camera') {
    startCamera(index);
  } else if (type === 'p5') {
    if (!quads[index].p5Code) quads[index].p5Code = P5_CODIGO_INICIAL;
    montarSketchP5(index);
    renderQuadList();
  } else {
    renderQuadList();
  }
  saveToLocalStorage();   // sin esto el tipo se perdía al recargar, y la salida no se entera
}

function startCamera(index) {
  if (editorQueAbrio()) return;   // la cámara la presta el editor (ver aplicarFuentesEditor)
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("Tu navegador no soporta acceso a cámara.");
    quads[index].sourceType = 'grid';
    renderQuadList();
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      stream.getTracks().forEach(t => t.stop());
      const cap = createCapture(VIDEO);
      cap.hide();
      quads[index].sourceEl = cap;
      renderQuadList();
    })
    .catch(err => {
      const msg = err.name === 'NotFoundError'
        ? "No se encontró ninguna cámara conectada."
        : err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
        ? "Permiso de cámara denegado."
        : err.name === 'NotReadableError'
        ? "La cámara está en uso por otra aplicación."
        : "No se pudo acceder a la cámara.";
      alert(msg);
      quads[index].sourceType = 'grid';
      renderQuadList();
    });
}

// Captura de pantalla o de otra pestaña como fuente. Es el camino para lo que no entrega
// un archivo —YouTube y compañía— y de paso para cualquier cosa que corra en la máquina:
// otra aplicación, un PDF, otra ventana de minimapper.
//
// Se alimenta de la misma tubería que el video por URL: un <video> oculto del que draw()
// copia cada cuadro a un proxy p5.Graphics. La única diferencia es que el video entra por
// srcObject, así que el desmontaje va por la otra rama de clearQuadSource().
//
// getDisplayMedia() exige un gesto de la usuaria, y por eso vive en un botón y no en el
// selector: elegir "Pantalla" en el desplegable no basta como gesto. Por lo mismo no se
// puede reanudar sola, así que la fuente no sobrevive a recargar ni a cambiar de escena —
// el tipo de fuente sí se guarda, y el botón queda esperando otro clic.
function startScreenCapture(index) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    quads[index].urlNote = { text: 'Este navegador no puede capturar pantalla aquí. Sirve la página con python3 -m http.server en vez de abrir el archivo directo.', ok: false };
    renderQuadList();
    return;
  }
  navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false })
    .then(stream => {
      // El diálogo tarda lo que tarde la usuaria; para cuando vuelve, el quad pudo cambiar
      // de tipo o desaparecer. Sin esto quedaría una pestaña compartiéndose a nadie.
      if (!quads[index] || quads[index].sourceType !== 'pantalla') {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      clearQuadSource(index);
      const videoEl = document.createElement('video');
      videoEl.muted = true;
      videoEl.style.display = 'none';
      document.body.appendChild(videoEl);
      videoEl.srcObject = stream;
      videoEl.play().catch(() => {});
      // Cortar la compartición desde la barra del navegador es un gesto normal, no una
      // falla: el quad vuelve a la rejilla y el botón queda listo para elegir otra vez.
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (quads[index]?.sourceVideo !== videoEl) return;
        clearQuadSource(index);
        quads[index].urlNote = { text: 'Terminó la compartición. Elige pantalla otra vez para seguir.', ok: false };
        renderQuadList();
      });
      quads[index].sourceVideo = videoEl;
      quads[index].sourceEl = createGraphics(512, 512);
      quads[index].urlNote = { text: 'Compartiendo pantalla.', ok: true };
      renderQuadList();
      saveToLocalStorage();
    })
    .catch(err => {
      if (!quads[index]) return;
      // Cancelar el diálogo también llega como NotAllowedError, y cancelar no es un error
      // que valga la pena anunciar.
      quads[index].urlNote = err.name === 'NotAllowedError'
        ? null
        : { text: 'No se pudo capturar la pantalla.', ok: false };
      renderQuadList();
    });
}

function loadQuadSource(index) {
  const type = quads[index].sourceType;
  if (type === 'hydra' || type === 'camera') return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = type === 'video' ? 'video/*' : 'image/*';

  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    clearQuadSource(index);
    quads[index].sourceUrl = url;

    if (type === 'video') {
      let vid = createVideo(url);
      vid.hide();
      vid.volume(0);
      vid.loop();
      quads[index].sourceEl = vid;
    } else {
      loadImage(url, (img) => {
        quads[index].sourceEl = img;
      });
    }
  };

  input.click();
}

function loadQuadSourceFromUrl(index, url) {
  if (!url || !url.startsWith('http')) return;
  const type = quads[index].sourceType;
  if (type === 'hydra' || type === 'camera') return;
  clearQuadSource(index);
  quads[index].sourceUrl = url;
  if (type === 'video') {
    // Create video element with crossOrigin set BEFORE src to avoid tainted-canvas crash
    const videoEl = document.createElement('video');
    videoEl.crossOrigin = 'anonymous';
    videoEl.muted = true;
    videoEl.loop = true;
    videoEl.style.display = 'none';
    document.body.appendChild(videoEl);
    videoEl.addEventListener('error', () => {
      // Un <video> desmontado puede seguir avisando de errores que ya no son de nadie, y el
      // índice para entonces apunta a otro quad — el de la escena a la que se acaba de
      // entrar, o el de la fuente que se acaba de poner encima. Sin esta guarda, ese aviso
      // tardío le borraba el enlace a un quad sano y le dejaba escrito un motivo falso.
      if (quads[index]?.sourceVideo !== videoEl) return;
      console.error('Video decode error (código', videoEl.error?.code, ')— convierte el archivo a H.264/MP4.');
      clearQuadSource(index);
      // El campo se vacía al limpiar la fuente: sin esto, el enlace desaparece y no queda
      // dicho por qué. H.265/HEVC es la causa habitual (ver CLAUDE.md, 2026-04-30).
      quads[index].urlNote = { text: 'El navegador no pudo leer ese video. Tiene que ser H.264/MP4.', ok: false };
      renderQuadList();
    });
    videoEl.src = url;
    videoEl.play().catch(() => {});
    // Proxy canvas: draw video frames here each tick instead of using video as WebGL texture directly
    const pg = createGraphics(512, 512);
    quads[index].sourceVideo = videoEl;
    quads[index].sourceEl = pg;
  } else {
    loadImage(url, (img) => {
      quads[index].sourceEl = img;
    });
  }
  saveToLocalStorage();
}

// Vuelve a enganchar una captura de pantalla que siguió corriendo mientras su escena no
// estaba montada. No rehace nada: el <video> es el mismo, con el mismo stream.
//
// La compartición pudo cortarse en el intervalo —desde la barra del navegador, o porque se
// cerró la pestaña compartida—. El listener de 'ended' no pudo decirlo, porque su guarda de
// identidad lo calla mientras el quad no es suyo, así que se revisa aquí.
function restoreScreenSource(index, saved) {
  const stream = saved.videoEl && saved.videoEl.srcObject;
  const vivo = stream && stream.getVideoTracks().some(t => t.readyState === 'live');
  if (!vivo) {
    if (saved.videoEl && saved.videoEl.parentNode) saved.videoEl.parentNode.removeChild(saved.videoEl);
    quads[index].urlNote = { text: 'Terminó la compartición. Elige pantalla otra vez para seguir.', ok: false };
    return;
  }
  quads[index].sourceVideo = saved.videoEl;
  quads[index].sourceEl = saved.proxy || createGraphics(512, 512);
}

// Para las capturas que sólo viven en escenas que se están tirando. Se salta las que
// cualquier otra escena —o un quad vivo— todavía referencia: al duplicar una escena, las dos
// apuntan al mismo <video>, y borrar una no puede apagarle la fuente a la otra.
function releaseScreenSources(dropped) {
  const enUso = new Set();
  quads.forEach(q => { if (q.sourceVideo) enUso.add(q.sourceVideo); });
  scenes.forEach(sc => (sc.quads || []).forEach(q => { if (q.screenSource) enUso.add(q.screenSource.videoEl); }));
  dropped.forEach(sc => (sc.quads || []).forEach(q => {
    const el = q.screenSource && q.screenSource.videoEl;
    if (!el || enUso.has(el)) return;
    if (el.srcObject) { el.srcObject.getTracks().forEach(t => t.stop()); el.srcObject = null; }
    if (el.parentNode) el.parentNode.removeChild(el);
  }));
}

// Rehace el elemento de un archivo local desde su blob:, que vive mientras viva la
// pestaña. Es el camino de vuelta al cambiar de escena; no sobrevive a recargar.
function restoreLocalSource(index, url) {
  const type = quads[index].sourceType;
  if (type !== 'video' && type !== 'image') return;
  quads[index].sourceUrl = url;
  if (type === 'video') {
    const vid = createVideo(url);
    vid.hide();
    vid.volume(0);
    vid.loop();
    quads[index].sourceEl = vid;
  } else {
    loadImage(url, (img) => { quads[index].sourceEl = img; }, () => { quads[index].sourceEl = null; });
  }
}

// --- NORMALIZADOR DE ENLACES ---
// El campo URL pide la dirección del archivo, pero el botón de compartir de cada sitio da
// otra cosa: la página, un <iframe>, un visor. Traducir eso a mano se comió media sesión de
// clase. Esto lo traduce solo, y cuando el enlace no puede servir lo dice en vez de dejar un
// quad en negro sin explicación.
//
// Pura: no toca el DOM, ni la red, ni el estado. Lo que no reconoce lo devuelve tal cual,
// que es el comportamiento de siempre. Devuelve { url, note, ok }:
//   ok:true  + note null   paso libre, no había nada que traducir
//   ok:true  + note texto  se tradujo; el aviso dice qué se reconoció
//   ok:false + note texto  reconocido y no sirve: no hay nada que cargar

const DIRECT_FILE_RE = /\.(mp4|webm|ogv|mov|m4v|gif|png|jpe?g|webp|avif)$/i;

// Sitios que sirven su video por streaming y nunca entregan un archivo que el navegador
// pueda usar como textura. Reconocerlos ahorra el rato de mirar un quad vacío.
const NO_DIRECT_FILE = [
  { re: /(^|\.)(youtube\.com|youtu\.be)$/i, note: 'YouTube no entrega el archivo. Ponlo en Pantalla y comparte la pestaña, o descarga el video y cárgalo con Archivo.' },
  { re: /(^|\.)vimeo\.com$/i,                 note: 'Vimeo no entrega el archivo. Ponlo en Pantalla y comparte la pestaña, o descarga el video y cárgalo con Archivo.' },
  { re: /(^|\.)instagram\.com$/i,             note: 'Instagram no entrega el archivo. Ponlo en Pantalla y comparte la pestaña, o descarga el video y cárgalo con Archivo.' },
  { re: /(^|\.)tiktok\.com$/i,                note: 'TikTok no entrega el archivo. Ponlo en Pantalla y comparte la pestaña, o descarga el video y cárgalo con Archivo.' },
  { re: /(^|\.)(twitter\.com|x\.com)$/i,      note: 'X no entrega el archivo. Ponlo en Pantalla y comparte la pestaña, o descarga el video y cárgalo con Archivo.' },
  { re: /(^|\.)(drive|docs)\.google\.com$/i,  note: 'Google Drive no sirve el archivo a otra página. Ponlo en Pantalla y comparte la pestaña, o descárgalo y cárgalo con Archivo.' }
];

// El ID es lo único que hace falta de un enlace de Giphy; el resto es decoración.
// Página:  giphy.com/gifs/<slug>-<ID>, /clips/<slug>-<ID>, /stickers/…, /embed/<ID>
// Archivo: media<N>.giphy.com/media/[v1.<blob>/]<ID>/giphy.gif?cid=…  ← el ID es el
//          penúltimo segmento, no el que sigue a /media/
function giphyId(host, path) {
  const segs = path.split('/').filter(Boolean);
  const valid = (s) => /^[A-Za-z0-9]{7,}$/.test(s);
  if (host.startsWith('media')) {
    if (segs.length < 2) return null;
    const last = segs[segs.length - 1];
    const cand = DIRECT_FILE_RE.test(last) ? segs[segs.length - 2] : last;
    return valid(cand) ? cand : null;
  }
  const i = segs.findIndex((s) => ['gifs', 'clips', 'stickers', 'embed', 'media'].includes(s));
  if (i < 0 || !segs[i + 1]) return null;
  const tail = segs[i + 1].split('-').pop();
  return valid(tail) ? tail : null;
}

function normalizeSourceUrl(raw, sourceType) {
  const pass = (url, note = null) => ({ url, note, ok: true });
  const stop = (note) => ({ url: null, note, ok: false });

  const text = (raw || '').trim();
  if (!text) return pass('');

  // Lo pegado puede traer texto alrededor o ser el <iframe> entero del botón Embed
  const found = text.match(/https?:\/\/[^\s"'<>]+/);
  let candidate = found ? found[0] : text;
  if (!/^https?:\/\//i.test(candidate)) {
    if (!/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(candidate)) return pass(text);
    candidate = 'https://' + candidate;
  }

  let u;
  try { u = new URL(candidate); } catch (e) { return pass(text); }
  const host = u.hostname.toLowerCase();

  if (/(^|\.)giphy\.com$/.test(host)) {
    const id = giphyId(host, u.pathname);
    if (!id) return pass(candidate);
    const ext = sourceType === 'image' ? 'gif' : 'mp4';
    return pass(`https://media.giphy.com/media/${id}/giphy.${ext}`, `Giphy → archivo ${ext}`);
  }

  // FileBrowser: /share/<hash> es la página del navegador de archivos; el archivo está
  // detrás de la API pública. /files/ es el explorador privado y no se puede traducir:
  // el hash lo genera el servidor al compartir.
  if (host === 'nube.ocelotl.cc') {
    const share = u.pathname.match(/^\/share\/([^/]+)(\/.*)?$/);
    if (share) return pass(`${u.origin}/api/public/dl/${share[1]}${share[2] || ''}`, 'nube → descarga directa');
    if (u.pathname.startsWith('/files/')) return stop('Ese enlace es del explorador. En la nube usa Compartir y pega el enlace /share/.');
    return pass(candidate);
  }

  // El hash de media.tenor.com no se deriva del ID de la página, y cambia por formato
  if (/(^|\.)tenor\.com$/.test(host) && !host.startsWith('media')) {
    return stop('Tenor no da enlace directo. Usa su botón de descarga y carga el archivo con Archivo.');
  }

  if (/(^|\.)dropbox\.com$/.test(host)) {
    u.searchParams.delete('dl');
    u.searchParams.set('raw', '1');
    return pass(u.toString(), 'Dropbox → archivo directo');
  }

  for (const site of NO_DIRECT_FILE) if (site.re.test(host)) return stop(site.note);

  return pass(candidate);
}

// Punto de entrada del campo URL: traduce, deja dicho qué reconoció y sólo entonces carga.
// loadQuadSourceFromUrl() recibe la URL ya buena, que es la que viaja a la sesión — al
// restaurar no se vuelve a pasar por aquí.
function loadQuadSourceFromInput(index, raw) {
  const quad = quads[index];
  if (!quad) return;
  const res = normalizeSourceUrl(raw, quad.sourceType);

  if (!res.ok) {
    quad.urlNote = { text: res.note, ok: false };
  } else if (res.url.startsWith('http://') && location.protocol === 'https:') {
    quad.urlNote = { text: 'El navegador bloquea un archivo http dentro de una página https. Busca la versión https o usa Archivo.', ok: false };
  } else {
    quad.urlNote = res.note ? { text: res.note, ok: true } : null;
    loadQuadSourceFromUrl(index, res.url);
  }
  renderQuadList();
}

function addCarouselImage(index) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (!quads[index].carousel) quads[index].carousel = [];
    let loaded = 0;
    files.forEach(file => {
      const url = URL.createObjectURL(file);
      loadImage(url, (img) => {
        quads[index].carousel.push({ img, name: file.name });
        loaded++;
        if (loaded === files.length) renderQuadList();
      });
    });
  };
  input.click();
}

function removeCarouselImage(quadIndex, imgIndex) {
  const q = quads[quadIndex];
  if (!q.carousel) return;
  q.carousel.splice(imgIndex, 1);
  if (q.carouselIndex >= q.carousel.length) q.carouselIndex = Math.max(0, q.carousel.length - 1);
  renderQuadList();
}

function advanceCarousels() {
  quads.forEach(q => {
    if (q.sourceType === 'carousel' && q.carousel && q.carousel.length > 0) {
      q.carouselIndex = (q.carouselIndex + 1) % q.carousel.length;
    }
  });
}

function toggleMic() {
  if (micActive) {
    stopMic();
  } else {
    initMic();
  }
}

function initMic() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Tu navegador no soporta acceso al micrófono.');
    return;
  }
  navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    .then(stream => {
      micContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = micContext.createMediaStreamSource(stream);
      micAnalyser = micContext.createAnalyser();
      micAnalyser.fftSize = 1024;
      micBuffer = new Float32Array(micAnalyser.fftSize);
      source.connect(micAnalyser);
      micActive = true;
      energyAvg = 0;
      lastOnsetTime = 0;
      document.querySelectorAll('.mic-btn').forEach(b => b.classList.add('active'));
      document.querySelectorAll('.mic-sensitivity').forEach(el => el.style.display = '');
      micCambio();
    })
    .catch(err => {
      const msg = err.name === 'NotAllowedError' ? 'Permiso de micrófono denegado.'
        : err.name === 'NotFoundError' ? 'No se encontró micrófono.'
        : 'No se pudo acceder al micrófono.';
      alert(msg);
    });
}

function stopMic() {
  if (micContext) { micContext.close(); micContext = null; }
  micAnalyser = null;
  micBuffer = null;
  micActive = false;
  document.querySelectorAll('.mic-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.mic-sensitivity').forEach(el => el.style.display = 'none');
  micCambio();
}

// --- SKETCH DE P5 COMO FUENTE ---
// sourceType 'p5': el código se pega tal cual sale del editor de p5 (modo global) y corre en
// un <iframe srcdoc> propio, con su propio p5. En esta página no cabe: minimapper ya es un
// sketch global, y un segundo setup()/draw() chocaría con el suyo. srcdoc es del mismo
// origen, así que draw() copia el canvas del iframe a un proxy p5.Graphics y de ahí es la
// misma tubería que el video. Un error se queda en el iframe; un bucle infinito no, porque
// comparte el hilo. Es código de quien opera la máquina, como el de Hydra.
// Un iframe por quad. Arranca de cero al montar la escena, al recargar y con ▶.

const P5_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.6.0/p5.min.js';
const P5_CODIGO_INICIAL = `function setup() {
  createCanvas(512, 512);
  noStroke();
}

function draw() {
  background(0, 25);
  const x = width / 2 + 160 * sin(frameCount * 0.021);
  const y = height / 2 + 160 * cos(frameCount * 0.034);
  fill(255, 200, 64);
  // sensor trae las lecturas de la pestaña de interacción
  circle(x, y, 60 + 200 * sensor.volumen);
}`;

// Las líneas del srcdoc antes del código, para que el error diga la línea del textarea.
const P5_PREFIJO = (cdn) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;overflow:hidden;background:#000}</style>
<script>
Object.defineProperty(window, 'sensor', { get: () => parent.sensor });
window.rampa = (...a) => parent.rampa(...a);
window.onerror = (msg, src, linea) => { frameElement && frameElement._p5Error && frameElement._p5Error(msg, linea); };
</script>
<script src="${cdn}"></script>
<script>
`;
const P5_LINEAS_PREFIJO = P5_PREFIJO(P5_CDN).split('\n').length - 1;

function contenedorSketches() {
  let c = document.getElementById('p5-sketches');
  if (!c) {
    // Detrás del lienzo, no oculto: con display:none el navegador frena el requestAnimationFrame
    // del iframe y el sketch deja de dibujar.
    c = document.createElement('div');
    c.id = 'p5-sketches';
    document.body.appendChild(c);
  }
  return c;
}

function desmontarSketchP5(quad) {
  if (quad.p5Frame) { quad.p5Frame._p5Error = null; quad.p5Frame.remove(); quad.p5Frame = null; }
  if (quad.p5Proxy) { quad.p5Proxy.remove(); quad.p5Proxy = null; }
  quad.sourceEl = null;
}

function montarSketchP5(index) {
  const quad = quads[index];
  if (!quad) return;
  desmontarSketchP5(quad);
  quad.p5Error = null;
  const frame = document.createElement('iframe');
  frame.className = 'p5-sketch';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame._p5Error = (msg, linea) => {
    const texto = `${msg}${linea ? ` (línea ${linea - P5_LINEAS_PREFIJO})` : ''}`;
    const i = quads.findIndex(q => q.p5Frame === frame);
    if (i === -1 || quads[i].p5Error === texto) return;   // draw() repite el error cada cuadro
    quads[i].p5Error = texto;
    pintarEstadoP5(i);
  };
  frame.addEventListener('load', () => {
    const i = quads.findIndex(q => q.p5Frame === frame);
    if (i !== -1 && !quads[i].p5Error) pintarEstadoP5(i, true);
  });
  frame.srcdoc = P5_PREFIJO(P5_CDN) + (quad.p5Code || '').replace(/<\/script/gi, '<\\/script') + '\n</script></head><body></body></html>';
  quad.p5Frame = frame;
  quad.p5Proxy = createGraphics(512, 512);
  contenedorSketches().appendChild(frame);
}

// En draw(): el canvas del sketch al proxy. Hasta que haya canvas, el quad sigue en rejilla.
function copiarSketchP5(quad) {
  let lienzo = null;
  try { lienzo = quad.p5Frame.contentDocument?.querySelector('canvas'); } catch (e) { return; }
  if (!lienzo || !lienzo.width || !lienzo.height) return;
  quad.p5Proxy.drawingContext.drawImage(lienzo, 0, 0, quad.p5Proxy.width, quad.p5Proxy.height);
  quad.sourceEl = quad.p5Proxy;
}

function runQuadP5(index) {
  if (!quads[index]) return;
  montarSketchP5(index);
  pintarEstadoP5(index);
  saveToLocalStorage();
}

function stopQuadP5(index) {
  if (!quads[index]) return;
  desmontarSketchP5(quads[index]);
  quads[index].p5Error = null;
  pintarEstadoP5(index);
}

// Sin re-renderizar la lista: el textarea perdería el foco a media escritura.
function pintarEstadoP5(index, listo = false) {
  const el = document.getElementById(`p5-status-${index}`);
  const q = quads[index];
  if (!el || !q) return;
  clearTimeout(el._t);
  if (q.p5Error) { el.textContent = '✗ ' + q.p5Error; el.className = 'p5-status status-error'; return; }
  el.textContent = listo ? '✓' : (q.p5Frame ? '…' : '');
  el.className = 'p5-status status-ok';
  if (listo) el._t = setTimeout(() => { el.textContent = ''; }, 3000);
}

function escaparHTML(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function renderQuadList() {
  const container = document.getElementById("quad-list");
  if (!container) return;
  container.innerHTML = "";

  quads.forEach((q, i) => {
    const div = document.createElement("div");
    div.className = 'quad-item';

    const hasMedia = q.sourceType === 'video' || q.sourceType === 'image';
    const fileBtn = hasMedia ? `<button onclick="loadQuadSource(${i})">Archivo</button>` : '';
    // getDisplayMedia() necesita un gesto propio: el desplegable no cuenta como tal.
    const screenBtn = q.sourceType === 'pantalla'
      ? `<button onclick="startScreenCapture(${i})">Elegir</button>`
      : '';
    const currentUrl = (q.sourceUrl && q.sourceUrl.startsWith('http')) ? q.sourceUrl : '';
    const note = q.urlNote
      ? `<div class="quad-url-note ${q.urlNote.ok ? 'status-ok' : 'status-error'}">${q.urlNote.text}</div>`
      : '';
    const urlRow = hasMedia
      ? `<div class="quad-url-row">
          <input type="text" class="quad-url-input" value="${currentUrl}" placeholder="pega el enlace"
            onkeydown="if(event.key==='Enter')loadQuadSourceFromInput(${i},this.value)">
          <button onclick="loadQuadSourceFromInput(${i},this.parentElement.querySelector('input').value)">URL</button>
        </div>`
      : '';

    const hydraSection = q.sourceType === 'hydra'
      ? `<div class="quad-hydra-section">
          <textarea class="quad-hydra-code" id="hydra-code-${i}"
            oninput="quads[${i}].hydraCode=this.value"
            onkeydown="if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();runQuadHydra(${i});}"
          >${q.hydraCode || ''}</textarea>
          <div class="quad-hydra-actions">
            <button onclick="runQuadHydra(${i})">▶</button>
            <button onclick="stopHydra()">■</button>
            <span id="hydra-status-${i}"></span>
          </div>
        </div>`
      : '';

    const p5Section = q.sourceType === 'p5'
      ? `<div class="quad-hydra-section">
          <textarea class="quad-hydra-code quad-p5-code" id="p5-code-${i}" spellcheck="false"
            oninput="quads[${i}].p5Code=this.value"
            onkeydown="if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();runQuadP5(${i});}"
          >${escaparHTML(q.p5Code || '')}</textarea>
          <div class="quad-hydra-actions">
            <button onclick="runQuadP5(${i})" title="Arrancar el sketch de nuevo (CTRL+Enter)">▶</button>
            <button onclick="stopQuadP5(${i})" title="Detener el sketch">■</button>
            <span id="p5-status-${i}" class="p5-status ${q.p5Error ? 'status-error' : ''}">${q.p5Error ? '✗ ' + escaparHTML(q.p5Error) : ''}</span>
          </div>
        </div>`
      : '';

    const carousel = q.carousel || [];
    const carouselSection = q.sourceType === 'carousel'
      ? `<div class="carousel-list">
          ${carousel.map((item, j) => `
            <div class="carousel-img-row${j === q.carouselIndex ? ' active' : ''}">
              <span class="carousel-img-name">${j + 1} · ${item.name}</span>
              <button onclick="removeCarouselImage(${i},${j})">✕</button>
            </div>`).join('')}
          <button class="carousel-add-btn" onclick="addCarouselImage(${i})">+ imagen</button>
          <div class="carousel-mic-row">
            <button class="mic-btn${micActive ? ' active' : ''}" onclick="toggleMic()" title="Activar/desactivar detección de aplauso">mic</button>
            <div class="mic-sensitivity" style="${micActive ? '' : 'display:none'}">
              <span class="sensitivity-label">sensibilidad</span>
              <input type="range" min="15" max="65" step="5" value="${Math.round(80 - onsetRatio * 10)}"
                oninput="onsetRatio = (80 - this.value) / 10">
            </div>
          </div>
        </div>`
      : '';

    const c = quadColor(q);
    const recorteActual = nombreRecorte(q.recorte);
    const colorSection = `<div class="quad-color">
        <label title="Qué parte de la fuente muestra esta superficie. Con dos proyectores: un quad en cada uno, con su mitad de la misma textura">parte<select onchange="setQuadRecorte(${i}, this.value)">
          ${[['completa', 'completa'], ['izquierda', 'mitad izquierda'], ['derecha', 'mitad derecha'], ...(recorteActual === 'otro' ? [['otro', `${q.recorte.u0}–${q.recorte.u1}`]] : [])].map(([v, t]) =>
            `<option value="${v}" ${recorteActual === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select><span></span></label>
        <label>nivel<input type="range" min="0" max="1.5" step="0.01" value="${c.nivel}" onpointerdown="undoColor()" onkeydown="undoColor(event)"
          oninput="setQuadColor(${i},'nivel',this.value)" onchange="saveToLocalStorage()"><output id="color-nivel-${i}">${c.nivel.toFixed(2)}</output></label>
        <label>saturación<input type="range" min="0" max="2" step="0.01" value="${c.saturacion}" onpointerdown="undoColor()" onkeydown="undoColor(event)"
          oninput="setQuadColor(${i},'saturacion',this.value)" onchange="saveToLocalStorage()"><output id="color-saturacion-${i}">${c.saturacion.toFixed(2)}</output></label>
        <label>tinte<input type="color" value="${c.tinte}" onclick="undoColor()"
          oninput="setQuadColor(${i},'tinte',this.value)" onchange="saveToLocalStorage()"><button onclick="resetQuadColor(${i})" title="Volver a los valores neutros">↺</button></label>
        <label>señal<select onchange="setQuadSenal(${i}, this.value)">
          <option value="" ${!c.senal ? 'selected' : ''}>manual</option>
          ${[...new Set([...Object.keys(sensor), ...(c.senal ? [c.senal] : [])])].map(k =>
            `<option value="${k}" ${c.senal === k ? 'selected' : ''}>${k}</option>`).join('')}
        </select>${c.senal ? `<output id="color-rampa-${i}" title="valor aplicado">${(c.rampa ?? 0).toFixed(2)}</output>` : '<span></span>'}</label>
        ${c.senal ? `
        <label>destino<select onchange="setQuadDestino(${i}, this.value)">
          ${[['nivel', 'nivel'], ['saturacion', 'saturación'], ['tinte', 'tinte']].map(([v, t]) =>
            `<option value="${v}" ${(c.destino || 'nivel') === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select><span></span></label>
        <label>invertir<button class="${c.invertir ? 'activo' : ''}" onclick="toggleQuadInvertir(${i})">${c.invertir ? 'sí' : 'no'}</button><span></span></label>
        ${q.sourceType === 'video' ? `<label title="Sí: el video corre sólo con la señal arriba, y al apagarse se detiene y vuelve al principio. No: corre siempre">reproduce<button class="${c.video ? 'activo' : ''}" onclick="toggleQuadVideo(${i})">${c.video ? 'con señal' : 'siempre'}</button><span></span></label>` : ''}
        ${RAMPA_CAMPOS.map(k => `<label title="${k === 'subida' ? 'Segundos para ir de 0 a 1 cuando la lectura sube' : 'Segundos para volver cuando la lectura baja'}. 0 = de golpe">${k}<input type="range" min="0" max="10" step="0.1" value="${c[k] || 0}" onpointerdown="undoColor()" onkeydown="undoColor(event)"
          oninput="setQuadColor(${i},'${k}',this.value)" onchange="saveToLocalStorage()"><output id="color-${k}-${i}">${segundos(c[k])}</output></label>`).join('')}` : ''}
      </div>`;

    div.innerHTML = `
      <span class="quad-label">${q.kind === 'freeform' ? 'Libre' : 'Quad'} ${i}${q.sourceType === 'hydra' && q.hydraOutput != null ? ` — o${q.hydraOutput}` : ''}</span>
      <div class="quad-controls">
        <select onchange="changeQuadSource(${i}, this.value)">
          <option value="grid"      ${q.sourceType === 'grid'      ? 'selected' : ''}>Rejilla</option>
          <option value="hydra"     ${q.sourceType === 'hydra'     ? 'selected' : ''}>Hydra</option>
          <option value="video"     ${q.sourceType === 'video'     ? 'selected' : ''}>Video</option>
          <option value="image"     ${q.sourceType === 'image'     ? 'selected' : ''}>Imagen</option>
          <option value="camera"    ${q.sourceType === 'camera'    ? 'selected' : ''}>Cámara</option>
          <option value="pantalla"  ${q.sourceType === 'pantalla'  ? 'selected' : ''}>Pantalla</option>
          <option value="carousel"  ${q.sourceType === 'carousel'  ? 'selected' : ''}>Carrusel</option>
          <option value="p5"        ${q.sourceType === 'p5'        ? 'selected' : ''}>Código p5</option>
        </select>
        ${fileBtn}
        ${screenBtn}
        <button onclick="deleteQuad(${i})">✕</button>
      </div>
      ${urlRow}
      ${note}
      ${hydraSection}
      ${p5Section}
      ${carouselSection}
      ${colorSection}
    `;

    container.appendChild(div);
  });
  // Todo cambio de quads pasa por aquí: escena, fuente, alta, baja, señal, deshacer.
  publicarEstado();
}

// --- INTERACCIÓN ---

function mousePressed() {
  if (!uiVisible) return;

  if (freeformMode) {
    if (freeformVerts.length >= 3) {
      const first = freeformVerts[0];
      const p = aPantalla(first);
      if (dist(mouseX, mouseY, p.x, p.y) < 15) {
        finalizeFreeform();
        return;
      }
    }
    const m = aMundo(mouseX, mouseY);
    freeformVerts.push(createVector(m.x, m.y));
    return;
  }

  if (drawingMode) {
    drawStart = { x: mouseX, y: mouseY };
    drawCurrent = { x: mouseX, y: mouseY };
    return;
  }

  const v = vista();
  for (let q = 0; q < quads.length; q++) {
    const shape = quads[q];
    const pts = shape.kind === 'freeform' ? shape.vertices : shape.points;
    for (let i = 0; i < pts.length; i++) {
      const { x: sx, y: sy } = aPantalla(pts[i], v);
      if (dist(mouseX, mouseY, sx, sy) < 10) {
        pushUndo();
        selected = { quad: q, vert: i, move: keyIsDown(77) };
        return;
      }
    }
  }
}

function mouseDragged() {
  if (!uiVisible) return;

  if (drawingMode) {
    if (drawStart) drawCurrent = { x: mouseX, y: mouseY };
    return;
  }

  if (selected.quad != -1) {
    const shape = quads[selected.quad];
    const v = vista();
    if (selected.move) { // M was held at click time — move whole shape
      const dx = (mouseX - pmouseX) / v.s;
      const dy = (mouseY - pmouseY) / v.s;
      const pts = shape.kind === 'freeform' ? shape.vertices : shape.points;
      for (const p of pts) { p.x += dx; p.y += dy; }
      if (shape.kind !== 'freeform') buildTessCache(shape);
    } else {
      const m = aMundo(mouseX, mouseY, v);
      const pt = shape.kind === 'freeform' ? shape.vertices[selected.vert] : shape.points[selected.vert];
      pt.x = m.x;
      pt.y = m.y;
      if (shape.kind !== 'freeform') buildTessCache(shape);
    }
    publicarEstado();   // la salida sigue el arrastre (se junta en un mensaje cada 50 ms)
  }
}

function mouseReleased() {
  if (drawingMode) {
    finalizeQuad();
    return;
  }
  if (selected.quad != -1) {
    saveToLocalStorage();
    updateCurrentSceneThumbnail();
  }
  selected = { quad: -1, vert: -1 };
}

function doubleClicked() {
  if (!uiVisible || !freeformMode) return;
  if (freeformVerts.length >= 3) {
    freeformVerts.pop(); // remove vertex added by second click of double-click
    finalizeFreeform();
  }
}

function windowResized() {
  if (glContextLost) return;
  resizeCanvas(windowWidth, windowHeight);
}

// --- GESTIÓN DE ESCENAS ---

function snapshotCurrentScene() {
  if (!scenes[currentSceneIndex]) return;
  scenes[currentSceneIndex].quads = quads.map(q => {
    // El snapshot en memoria guarda también el blob: de un archivo local, las imágenes
    // del carrusel y el <video> de una captura de pantalla, para que sobrevivan al ir y
    // volver de escena. serializableQuads() los quita antes de guardar: al recargar la
    // página no existe ninguno de los tres.
    const srcUrl = q.sourceUrl || null;
    const data = q.kind === 'freeform'
      ? { kind: 'freeform', vertices: q.vertices.map(v => ({ x: v.x, y: v.y })), sourceType: q.sourceType }
      : { kind: 'quad', points: q.points.map(p => ({ x: p.x, y: p.y })), sourceType: q.sourceType };
    if (srcUrl) data.sourceUrl = srcUrl;
    if (q.sourceType === 'hydra') { data.hydraCode = q.hydraCode || ''; data.hydraOutput = q.hydraOutput ?? 0; }
    if (q.sourceType === 'p5') data.p5Code = q.p5Code || '';
    if (q.carousel && q.carousel.length) { data.carousel = q.carousel; data.carouselIndex = q.carouselIndex || 0; }
    const color = colorParaGuardar(q.color);
    if (color) data.color = color;
    if (q.recorte) data.recorte = q.recorte;
    // Se guarda el elemento entero, no el stream: una compartición no se reanuda, sólo se
    // mantiene. Y con él su proxy, para no dejar un p5.Graphics tirado por cada ida y vuelta.
    if (q.sourceType === 'pantalla' && q.sourceVideo) data.screenSource = { videoEl: q.sourceVideo, proxy: q.sourceEl };
    return data;
  });
}

function _applySceneData(sceneData) {
  firmaMontada = firmaEscena(sceneData);
  quads.forEach((_, i) => clearQuadSource(i, false));
  quads = [];
  hydraSlots = [0, 0, 0, 0];
  const legacyCode = sceneData.hydraCode || '';
  // Se toma el array una vez y se conserva: restaurar una fuente por URL llama a
  // saveToLocalStorage(), que reasigna scenes[cur].quads con lo que hay vivo en ese
  // momento. Leyendo sceneData.quads[i] dentro del bucle, el segundo quad con URL y los
  // que siguen se leían ya pisados y se quedaban sin fuente.
  const sceneQuads = sceneData.quads || [];
  quads = sceneQuads.map(q => {
    const srcType = q.sourceType === 'camera' ? 'camera' : (q.sourceType || 'hydra');
    const hydraCode = q.hydraCode != null ? q.hydraCode : (srcType === 'hydra' ? legacyCode : '');
    let hydraOutput = null;
    if (srcType === 'hydra') {
      const stored = q.hydraOutput ?? -1;
      hydraOutput = (stored >= 0 && stored < 4) ? stored : hydraSlots.indexOf(Math.min(...hydraSlots));
      hydraSlots[hydraOutput]++;
    }
    if (q.kind === 'freeform') {
      return { kind: 'freeform', vertices: (q.vertices || []).map(v => createVector(v.x, v.y)), sourceType: srcType, sourceEl: null, sourceUrl: null, hydraCode, hydraOutput, p5Code: q.p5Code || '', carousel: q.carousel || [], carouselIndex: q.carouselIndex || 0, color: { ...COLOR_NEUTRO, ...q.color }, recorte: normalizarRecorte(q.recorte) };
    }
    const quad = { kind: 'quad', points: (q.points || []).map(p => createVector(p.x, p.y)), sourceType: srcType, sourceEl: null, sourceUrl: null, hydraCode, hydraOutput, p5Code: q.p5Code || '', carousel: q.carousel || [], carouselIndex: q.carouselIndex || 0, color: { ...COLOR_NEUTRO, ...q.color }, recorte: normalizarRecorte(q.recorte) };
    buildTessCache(quad);
    return quad;
  });
  undoStack.length = 0;
  quads.forEach((q, i) => {
    const qData = sceneQuads[i];
    if (qData && qData.sourceUrl && qData.sourceUrl.startsWith('http')) {
      loadQuadSourceFromUrl(i, qData.sourceUrl);
    } else if (qData && qData.sourceUrl) {
      restoreLocalSource(i, qData.sourceUrl);
    } else if (qData && qData.screenSource) {
      restoreScreenSource(i, qData.screenSource);
    } else if (q.sourceType === 'camera') {
      startCamera(i);
    } else if (q.sourceType === 'hydra' && q.hydraCode) {
      evalHydra(q.hydraCode);
    } else if (q.sourceType === 'p5') {
      montarSketchP5(i);
    }
  });
  aplicarFuentesEditor();
  renderQuadList();
}

function switchScene(index) {
  if (index === currentSceneIndex) return;
  snapshotCurrentScene();
  currentSceneIndex = index;
  _applySceneData(scenes[index]);
  saveToLocalStorage();
  renderSceneStrip();
}

function addScene() {
  if (isPlaying) stopPlayback();
  snapshotCurrentScene();
  const newId = scenes.reduce((m, s) => Math.max(m, s.id), 0) + 1;
  const current = scenes[currentSceneIndex];
  scenes.push({
    id: newId,
    duration_s: current.duration_s,
    hydraCode: current.hydraCode || '',
    // Copia todo lo del quad (fuente incluida) y sólo clona las coordenadas, que
    // son lo único que la escena nueva debe poder mover por su cuenta.
    quads: (current.quads || []).map(q => ({
      ...q,
      ...(q.kind === 'freeform'
        ? { vertices: q.vertices.map(v => ({ x: v.x, y: v.y })) }
        : { points: q.points.map(p => ({ x: p.x, y: p.y })) })
    }))
  });
  currentSceneIndex = scenes.length - 1;
  _applySceneData(scenes[currentSceneIndex]);
  saveToLocalStorage();
  renderSceneStrip();
}

function deleteScene(index) {
  if (scenes.length <= 1) return;
  if (isPlaying) stopPlayback();
  const [dropped] = scenes.splice(index, 1);
  if (currentSceneIndex >= scenes.length) currentSceneIndex = scenes.length - 1;
  else if (index < currentSceneIndex) currentSceneIndex--;
  _applySceneData(scenes[currentSceneIndex]);
  // Después de montar la escena que sobrevive: así el recuento de lo que sigue en uso ya
  // es el nuevo, y una captura que era sólo de la escena borrada deja de compartirse.
  releaseScreenSources([dropped]);
  saveToLocalStorage();
  renderSceneStrip();
}

function deleteAllScenes() {
  if (!confirm('¿Eliminar todas las escenas?')) return;
  if (isPlaying) stopPlayback();
  snapshotCurrentScene();
  const current = scenes[currentSceneIndex];
  const dropped = scenes.filter((_, i) => i !== currentSceneIndex);
  scenes = [{ id: 1, duration_s: current.duration_s, hydraCode: current.hydraCode, quads: current.quads }];
  currentSceneIndex = 0;
  releaseScreenSources(dropped);
  saveToLocalStorage();
  renderSceneStrip();
}

function renderSceneThumbnail(canvas, sceneData) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);

  const quadsData = sceneData.quads || [];
  if (quadsData.length === 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 0.5;
    const cx = W / 2, cy = H / 2;
    ctx.beginPath(); ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5); ctx.stroke();
    return;
  }

  const ref = lienzoComposicion();
  const refW = ref.w / 2;
  const refH = ref.h / 2;
  const toTX = x => (x / refW * 0.82 + 1) / 2 * W;
  const toTY = y => (y / refH * 0.82 + 1) / 2 * H;

  quadsData.forEach((q, qi) => {
    const hue = (qi * 73 + 180) % 360;
    ctx.fillStyle = `hsla(${hue},55%,55%,0.22)`;
    ctx.strokeStyle = `hsla(${hue},55%,72%,0.7)`;
    ctx.lineWidth = 0.8;
    if (q.kind === 'freeform') {
      const verts = q.vertices || [];
      if (verts.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(toTX(verts[0].x), toTY(verts[0].y));
      for (let i = 1; i < verts.length; i++) ctx.lineTo(toTX(verts[i].x), toTY(verts[i].y));
      ctx.closePath();
    } else {
      const pts = q.points || [];
      if (pts.length < 9) return;
      ctx.beginPath();
      ctx.moveTo(toTX(pts[0].x), toTY(pts[0].y));
      ctx.lineTo(toTX(pts[2].x), toTY(pts[2].y));
      ctx.lineTo(toTX(pts[8].x), toTY(pts[8].y));
      ctx.lineTo(toTX(pts[6].x), toTY(pts[6].y));
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
  });
}

function updateCurrentSceneThumbnail() {
  snapshotCurrentScene();
  const items = document.querySelectorAll('.scene-item');
  const thumb = items[currentSceneIndex]?.querySelector('.scene-thumb');
  if (thumb) renderSceneThumbnail(thumb, scenes[currentSceneIndex]);
}

function renderSceneStrip() {
  const strip = document.getElementById('scenes-strip');
  if (!strip) return;
  strip.innerHTML = '';

  scenes.forEach((scene, i) => {
    const item = document.createElement('div');
    item.className = 'scene-item' + (i === currentSceneIndex ? ' active' : '');

    const header = document.createElement('div');
    header.className = 'scene-header';
    header.addEventListener('click', () => {
      if (isPlaying) stopPlayback();
      switchScene(i);
    });

    const thumb = document.createElement('canvas');
    thumb.className = 'scene-thumb';
    thumb.width = 56;
    thumb.height = 40;
    renderSceneThumbnail(thumb, scene);
    header.appendChild(thumb);

    const num = document.createElement('span');
    num.className = 'scene-num';
    num.textContent = i + 1;
    header.appendChild(num);

    if (scenes.length > 1) {
      const del = document.createElement('button');
      del.className = 'scene-delete';
      del.textContent = '×';
      del.title = 'eliminar escena';
      del.addEventListener('click', e => { e.stopPropagation(); deleteScene(i); });
      header.appendChild(del);
    }

    item.appendChild(header);

    const durRow = document.createElement('div');
    durRow.className = 'scene-dur-row';
    const durInput = document.createElement('input');
    durInput.type = 'number';
    durInput.className = 'scene-duration';
    durInput.min = 1;
    durInput.max = 9999;
    durInput.value = scene.duration_s;
    durInput.addEventListener('change', () => {
      scene.duration_s = Math.max(1, parseInt(durInput.value) || 30);
      durInput.value = scene.duration_s;
      saveToLocalStorage();
    });
    durInput.addEventListener('click', e => e.stopPropagation());
    const unit = document.createElement('span');
    unit.className = 'scene-unit';
    unit.textContent = 's';
    durRow.appendChild(durInput);
    durRow.appendChild(unit);
    item.appendChild(durRow);

    strip.appendChild(item);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'scene-add-btn';
  addBtn.textContent = '+';
  addBtn.title = 'nueva escena';
  addBtn.addEventListener('click', addScene);
  strip.appendChild(addBtn);

  ['once', 'loop', 'random'].forEach(mode => {
    const btn = document.getElementById('pbtn-' + mode);
    if (btn) btn.classList.toggle('active', isPlaying && playbackMode === mode);
  });
  publicarEstado();   // la salida sabe si el editor reproduce, para el fundido
}

// --- REPRODUCCIÓN ---

function setPlaybackMode(mode) {
  if (isPlaying && playbackMode === mode) { stopPlayback(); return; }
  playbackMode = mode;
  if (!isPlaying) startPlayback();
  else renderSceneStrip();
}

function startPlayback() {
  if (isPlaying) stopPlayback();
  if (uiVisible) toggleEditMode();
  isPlaying = true;
  sceneStartTime = Date.now();
  scheduleAdvance();
  renderSceneStrip();
  updateHUD();
  document.getElementById('playback-hud').classList.add('visible');
  hudInterval = setInterval(updateHUD, 500);
}

function stopPlayback() {
  isPlaying = false;
  clearTimeout(playbackTimeout);
  playbackTimeout = null;
  clearInterval(hudInterval);
  hudInterval = null;
  document.getElementById('playback-hud').classList.remove('visible');
  renderSceneStrip();
}

function updateHUD() {
  const hud = document.getElementById('playback-hud');
  if (!hud) return;
  const elapsed = (Date.now() - sceneStartTime) / 1000;
  const remaining = Math.max(0, Math.ceil(scenes[currentSceneIndex].duration_s - elapsed));
  const icon = { once: '▶', loop: '⟳', random: '⇄' }[playbackMode] || '▶';
  hud.textContent = `${currentSceneIndex + 1} / ${scenes.length}  ·  ${remaining}s  ·  ${icon}`;
}

function scheduleAdvance() {
  playbackTimeout = setTimeout(advanceScene, scenes[currentSceneIndex].duration_s * 1000);
}

function nextPlaybackIndex() {
  const n = scenes.length;
  if (n === 1) return playbackMode === 'once' ? -1 : 0;
  if (playbackMode === 'once') {
    const next = currentSceneIndex + 1;
    return next < n ? next : -1;
  }
  if (playbackMode === 'loop') return (currentSceneIndex + 1) % n;
  if (playbackMode === 'random') {
    const pool = Array.from({ length: n }, (_, i) => i).filter(i => i !== currentSceneIndex);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return -1;
}

function advanceScene() {
  const next = nextPlaybackIndex();
  if (next === -1) { stopPlayback(); return; }
  const fadeEl = document.getElementById('scene-fade');
  fadeEl.classList.add('fading');
  setTimeout(() => {
    snapshotCurrentScene();
    currentSceneIndex = next;
    sceneStartTime = Date.now();
    _applySceneData(scenes[next]);
    saveToLocalStorage();
    renderSceneStrip();
    updateHUD();
    fadeEl.classList.remove('fading');
    if (isPlaying) scheduleAdvance();
  }, 350);
}
