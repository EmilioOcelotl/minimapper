// --- MODO EDICIÓN / PRESENTACIÓN ---

let uiVisible = false;
let showHint = true;

// index.html?salida es la ventana que va al proyector: sólo el resultado. Nunca
// entra a edición, no muestra ✦, hint, ayuda, HUD ni cursor, ignora el teclado y
// no escribe en localStorage, para no pisar lo que se edita en otra ventana. Empieza a
// guardar cuando control/ le manda el primer color: desde ahí es la dueña del estado.
const SALIDA = new URLSearchParams(location.search).has('salida');
let salidaGuarda = false;

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

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('toggle-btn').classList.add('presentation');
  document.getElementById('info-btn').classList.remove('visible');
  loadFromLocalStorage();
  if (SALIDA) { document.body.classList.add('salida'); return; }
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
            const color = colorParaGuardar(q.color);
            if (color) data.color = color;
            return data;
          })
        : serializableQuads(s.quads)
    })),
    currentSceneIndex,
    playbackMode
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
      playbackMode: session.playbackMode || 'once'
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
      quad = { kind: 'freeform', vertices: (qData.vertices || []).map(v => createVector(v.x, v.y)), sourceType: srcType, sourceEl: null, sourceUrl: null, hydraCode, hydraOutput, color: { ...COLOR_NEUTRO, ...qData.color } };
    } else {
      const pts = qData.points || qData;
      quad = { kind: 'quad', points: pts.map(p => createVector(p.x, p.y)), sourceType: srcType, sourceEl: null, sourceUrl: null, hydraCode, hydraOutput, color: { ...COLOR_NEUTRO, ...qData.color } };
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
  publicarEstado();   // un color movido en el panel también le llega a control/
  if (SALIDA && !salidaGuarda) return;
  try {
    snapshotCurrentScene();
    const config = {
      scenes: scenes.map(s => ({ id: s.id, duration_s: s.duration_s, hydraCode: s.hydraCode || '', quads: serializableQuads(s.quads) })),
      currentSceneIndex,
      playbackMode
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
  const color = (q) => { if (!q.color) return null; const { rampa, ...c } = q.color; return c; };
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

  const x0 = min(drawStart.x, drawCurrent.x) - width / 2;
  const x2 = max(drawStart.x, drawCurrent.x) - width / 2;
  const y0 = min(drawStart.y, drawCurrent.y) - height / 2;
  const y2 = max(drawStart.y, drawCurrent.y) - height / 2;

  if (abs(x2 - x0) < 10 || abs(y2 - y0) < 10) { cancelDrawing(); return; }

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
  if (c.senal) Object.assign(out, { senal: c.senal, destino: c.destino || 'nivel', invertir: !!c.invertir });
  return out;
}

function setQuadColor(index, campo, valor) {
  const c = quadColor(quads[index]);
  c[campo] = campo === 'tinte' ? valor : parseFloat(valor);
  const out = document.getElementById(`color-${campo}-${index}`);
  if (out && campo !== 'tinte') out.textContent = c[campo].toFixed(2);
}

// Conectar el nivel a una lectura de control/ ('' = manual). Con señal, el deslizador
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

function toggleQuadInvertir(index) {
  pushUndo();
  const c = quadColor(quads[index]);
  c.invertir = !c.invertir;
  renderQuadList();
  saveToLocalStorage();
}

// --- CONTROL: LECTURAS DESDE OTRA VENTANA ---
// control/ lee la cámara y publica números de 0 a 1 por un BroadcastChannel. Sólo
// conecta entre páginas del mismo origen: la versión en línea, o un servidor local
// en la carpeta del repo (no file://). Aquí se guardan en el global `sensor`, que
// Hydra puede leer: osc(10, 0.1, () => sensor.cercania * 2).out(o0)

// Arranca con las lecturas de control/ en 0: así un sketch con () => sensor.cercania
// funciona aunque control no esté abierto, y la lista no se redibuja al llegar la primera.
var sensor = { cercania: 0, cerca: 0 };
let sensorUltimo = 0;
const SENSOR_CANAL = 'minimapper-control';

try {
  const canal = new BroadcastChannel(SENSOR_CANAL);
  canal.onmessage = (e) => {
    const lecturas = e.data && e.data.lecturas;
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
    if (nuevas && typeof renderQuadList === 'function') renderQuadList();
  };
} catch (e) {
  console.warn('BroadcastChannel no disponible: control/ no puede conectarse.', e);
}

function sensorVivo() {
  return performance.now() - sensorUltimo < 1500;
}

// Lo que sale del quad: los valores manuales o, si hay señal, el destino por la lectura.
// Sin suavizado: subida y bajada se quitaron mientras se decide cómo darles forma
// (una envolvente gráfica). Con una lectura de 0/1 (un evento) el cambio es en seco.
// El deslizador del destino marca el máximo: nivel y saturación se multiplican por la
// lectura (0 = negro, 0 = gris); el tinte va de blanco (sin teñir) al color elegido.
function colorEfectivo(c) {
  const tinte = tinteRGB(c.tinte);
  if (!c.senal) return { nivel: c.nivel, saturacion: c.saturacion, tinte };
  let meta = sensorVivo() ? (sensor[c.senal] ?? 0) : 0;
  if (c.invertir) meta = 1 - meta;
  c.rampa = meta;
  const destino = c.destino || 'nivel';
  return {
    nivel: destino === 'nivel' ? c.nivel * c.rampa : c.nivel,
    saturacion: destino === 'saturacion' ? c.saturacion * c.rampa : c.saturacion,
    tinte: destino === 'tinte' ? tinte.map(v => 1 + (v - 1) * c.rampa) : tinte,
  };
}

setInterval(() => {
  const el = document.getElementById('control-estado');
  if (!el) return;
  const claves = Object.keys(sensor);
  const vivo = sensorVivo();
  el.classList.toggle('vivo', vivo);
  el.textContent = vivo
    ? 'control · ' + claves.map(k => `${k} ${sensor[k].toFixed(2)}`).join(' · ')
    : (sensorUltimo ? 'control · sin señal' : 'control · abre control/ en otra ventana');
  quads.forEach((q, i) => {
    const out = document.getElementById(`color-rampa-${i}`);
    if (out && q.color && q.color.senal) out.textContent = (q.color.rampa ?? 0).toFixed(2);
  });
}, 200);

// --- CONTROL: EDICIÓN DESDE OTRA VENTANA ---
// Un canal aparte de las lecturas, que tienen el contrato fijo. minimapper publica qué
// quads hay y su color; control/ los muestra y manda cambios. La dueña del estado es
// esta ventana: control no guarda nada, y cerrarlo no pierde nada. Ver control/NOTAS.md.
//   control → { tipo: 'pedir' }                      (al abrir y cada 2 s)
//   aquí    → { tipo: 'estado', ventana, salida, escena, numero, lienzo: { w, h },
//               quads: [{ i, nombre, kind, fuente, puntos: [{ x, y }], color }] }
//   control → { tipo: 'color', escena, i, cambios: { nivel: 0.8 }, inicio }
//   control → { tipo: 'vertices', escena, i, k, puntos: [{ x, y }], inicio }   (todos los del quad)
//   control → { tipo: 'deshacer', escena }
//   control → { tipo: 'escena', id }  ·  { tipo: 'duracion', id, segundos }
//   control → { tipo: 'reproducir', modo }  ·  { tipo: 'detener' }
//   aquí    → { tipo: 'aplicado', ventana, escena, valores: { i: 0..1 } }   (cada 200 ms, con señal)
// `ventana` es un id por pestaña: si control oye a dos, avisa. Los puntos van en las
// coordenadas de siempre (centradas, en pixeles de esta ventana); `lienzo` le dice a
// control a qué escala dibujarlos. `k` es el punto que se arrastra (-1 = la superficie
// entera): sólo sirve para marcarlo en la proyección.

const EDICION_CANAL = 'minimapper-edicion';
const VENTANA_ID = Math.random().toString(36).slice(2, 10);
let canalEdicion = null;
let estadoPendiente = false;
let guardarRemoto = null;
let guardarVertices = null;

function estadoParaControl() {
  return {
    tipo: 'estado', ventana: VENTANA_ID, salida: SALIDA,
    escena: scenes[currentSceneIndex]?.id, numero: currentSceneIndex + 1,
    escenas: scenes.map(s => ({ id: s.id, duracion: s.duration_s })),
    reproduccion: { activa: isPlaying, modo: playbackMode },
    lienzo: { w: window.width || innerWidth, h: window.height || innerHeight },
    quads: quads.map((q, i) => {
      const c = quadColor(q);
      const libre = q.kind === 'freeform';
      return {
        i, nombre: `${libre ? 'Libre' : 'Quad'} ${i}`, kind: libre ? 'freeform' : 'quad', fuente: q.sourceType,
        puntos: (libre ? q.vertices : q.points).map(p => ({ x: p.x, y: p.y })),
        color: { nivel: c.nivel, saturacion: c.saturacion, tinte: c.tinte,
                 senal: c.senal || '', destino: c.destino || 'nivel', invertir: !!c.invertir },
      };
    }),
  };
}

// Se junta en un solo mensaje lo que cambie en el mismo instante (renderQuadList se
// llama varias veces seguidas al montar una escena).
function publicarEstado() {
  if (!canalEdicion || estadoPendiente) return;
  estadoPendiente = true;
  setTimeout(() => {
    estadoPendiente = false;
    canalEdicion.postMessage(estadoParaControl());
  }, 50);
}

// Mismas reglas que el panel: rangos de los deslizadores, sólo nombres simples de lectura.
// Un mensaje para otra escena o un quad que ya no existe se descarta, y el estado que se
// publica en respuesta corrige a control.
function aplicarColorRemoto(m) {
  const quad = quads[m.i];
  if (m.escena !== scenes[currentSceneIndex]?.id || !quad || !m.cambios) { publicarEstado(); return; }
  const ch = m.cambios;
  const c = quadColor(quad);
  const num = (v, max) => (typeof v === 'number' && isFinite(v)) ? Math.min(max, Math.max(0, v)) : null;
  if (m.inicio) pushUndo();
  let estructura = false;
  if ('nivel' in ch && num(ch.nivel, 1.5) != null) setQuadColor(m.i, 'nivel', num(ch.nivel, 1.5));
  if ('saturacion' in ch && num(ch.saturacion, 2) != null) setQuadColor(m.i, 'saturacion', num(ch.saturacion, 2));
  if ('tinte' in ch && /^#[0-9a-f]{6}$/i.test(ch.tinte)) setQuadColor(m.i, 'tinte', ch.tinte);
  if ('senal' in ch && (ch.senal === '' || /^[a-z_][a-z0-9_]*$/i.test(ch.senal))) {
    c.senal = ch.senal;
    if (c.senal && c.invertir == null) c.invertir = false;
    estructura = true;
  }
  if ('destino' in ch && ['nivel', 'saturacion', 'tinte'].includes(ch.destino)) { c.destino = ch.destino; estructura = true; }
  if ('invertir' in ch && typeof ch.invertir === 'boolean') { c.invertir = ch.invertir; estructura = true; }
  salidaGuarda = true;
  // Guardar y redibujar el panel al soltar, no en cada paso del arrastre.
  clearTimeout(guardarRemoto);
  guardarRemoto = setTimeout(() => { saveToLocalStorage(); renderQuadList(); }, estructura ? 0 : 300);
}

// control manda todos los puntos del quad, no un delta: arrastrar un vértice y mover la
// superficie entera (M) son el mismo mensaje. Se descarta si no coincide el número de
// puntos —el quad cambió de forma mientras tanto— o si algún punto se fue muy lejos.
function aplicarVerticesRemoto(m) {
  const quad = quads[m.i];
  if (m.escena !== scenes[currentSceneIndex]?.id || !quad || !Array.isArray(m.puntos)) { publicarEstado(); return; }
  const libre = quad.kind === 'freeform';
  const pts = libre ? quad.vertices : quad.points;
  const lejos = 4 * Math.max(width, height);
  const valido = v => typeof v === 'number' && isFinite(v) && Math.abs(v) < lejos;
  if (m.puntos.length !== pts.length || !m.puntos.every(p => p && valido(p.x) && valido(p.y))) { publicarEstado(); return; }
  if (m.inicio) pushUndo();
  m.puntos.forEach((p, k) => { pts[k].x = p.x; pts[k].y = p.y; });
  if (!libre) buildTessCache(quad);
  marcaRemota = { i: m.i, k: Number.isInteger(m.k) ? m.k : -1, visto: performance.now() };
  salidaGuarda = true;
  clearTimeout(guardarVertices);
  guardarVertices = setTimeout(() => { saveToLocalStorage(); updateCurrentSceneThumbnail(); }, 300);
}

// Escenas y reproducción, con las mismas funciones que el strip del panel. Las escenas
// se nombran por id: el índice cambia si se borra una en otra ventana. Cambiar de escena
// o reproducir no hace que ?salida empiece a guardar —es tocar, no editar—; la duración sí.
function aplicarEscenaRemota(m) {
  const indice = scenes.findIndex(s => s.id === m.id);
  if (m.tipo === 'escena' && indice !== -1) {
    if (isPlaying) stopPlayback();
    switchScene(indice);
  } else if (m.tipo === 'duracion' && indice !== -1 && typeof m.segundos === 'number' && isFinite(m.segundos)) {
    scenes[indice].duration_s = Math.min(9999, Math.max(1, Math.round(m.segundos)));
    salidaGuarda = true;
    saveToLocalStorage();
    renderSceneStrip();
  } else if (m.tipo === 'reproducir' && ['once', 'loop', 'random'].includes(m.modo)) {
    playbackMode = m.modo;
    startPlayback();
  } else if (m.tipo === 'detener') {
    if (isPlaying) stopPlayback();
  }
  publicarEstado();
}

try {
  canalEdicion = new BroadcastChannel(EDICION_CANAL);
  canalEdicion.onmessage = (e) => {
    const m = e.data;
    if (!m) return;
    if (m.tipo === 'pedir') publicarEstado();
    else if (m.tipo === 'color') aplicarColorRemoto(m);
    else if (m.tipo === 'vertices') aplicarVerticesRemoto(m);
    else if (m.tipo === 'deshacer' && m.escena === scenes[currentSceneIndex]?.id) { salidaGuarda = true; undo(); }
    else if (['escena', 'duracion', 'reproducir', 'detener'].includes(m.tipo)) aplicarEscenaRemota(m);
  };
} catch (e) {
  canalEdicion = null;
}

// El valor que sale de cada quad con señal (lo que el panel muestra en `color-rampa`).
// Va aparte del estado para no redibujar el mapa de control cinco veces por segundo.
setInterval(() => {
  if (!canalEdicion) return;
  const valores = {};
  quads.forEach((q, i) => { if (q.color && q.color.senal) valores[i] = q.color.rampa ?? 0; });
  if (Object.keys(valores).length) {
    canalEdicion.postMessage({ tipo: 'aplicado', ventana: VENTANA_ID, escena: scenes[currentSceneIndex]?.id, valores });
  }
}, 200);

// Mientras control arrastra, la proyección marca el punto tomado (o los de la superficie
// entera, con M): con video encima no se ve dónde cae una esquina en el muro. Se va sola
// un segundo después del último mensaje. En modo edición no hace falta: los puntos ya se ven.
let marcaRemota = null;
const MARCA_DURA = 1000;

function dibujarMarcaRemota() {
  if (!marcaRemota || uiVisible) return;
  const quad = quads[marcaRemota.i];
  if (!quad || performance.now() - marcaRemota.visto > MARCA_DURA) { marcaRemota = null; return; }
  const pts = quad.kind === 'freeform' ? quad.vertices : quad.points;
  const cuales = marcaRemota.k >= 0 && pts[marcaRemota.k] ? [pts[marcaRemota.k]] : pts;
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
  gridGfx = buildGridTexture();
  colorShader = createShader(COLOR_VERT, COLOR_FRAG);

  _applySceneData(scenes[currentSceneIndex]);
  renderSceneStrip();
}

function draw() {
  if (glContextLost) return;
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

  for (let q = 0; q < quads.length; q++) {
    const quad = quads[q];

    if (quad.sourceVideo && quad.sourceVideo.readyState >= 2) {
      quad.sourceEl.drawingContext.drawImage(quad.sourceVideo, 0, 0, 512, 512);
    }

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
      hydraCanvases[_slot].drawingContext.drawImage(hc.elt, 0, 0, 512, 512);
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
      let cx = 0, cy = 0;
      for (const v of verts) { cx += v.x; cy += v.y; }
      cx /= n; cy /= n;
      beginShape(TRIANGLES);
      for (let i = 0; i < n; i++) {
        const a = verts[i], b = verts[(i + 1) % n];
        vertex(cx, cy, (cx - minX) / dX, (cy - minY) / dY);
        vertex(a.x, a.y, (a.x - minX) / dX, (a.y - minY) / dY);
        vertex(b.x, b.y, (b.x - minX) / dX, (b.y - minY) / dY);
      }
      endShape();
    } else {
      const cache = quad.tessCache;
      beginShape(TRIANGLES);
      for (let j = 0; j < TESS; j++) {
        for (let i = 0; i < TESS; i++) {
          const u0 = i / TESS,         u1 = (i + 1) / TESS;
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

  // Control points + crosshair — edit mode only
  if (uiVisible) {
    push();
    resetMatrix();
    translate(-width / 2, -height / 2);

    noStroke();
    for (let q = 0; q < quads.length; q++) {
      const shape = quads[q];
      const pts = shape.kind === 'freeform' ? shape.vertices : shape.points;
      for (let i = 0; i < pts.length; i++) {
        const sx = pts[i].x + width / 2;
        const sy = pts[i].y + height / 2;
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
      for (const v of freeformVerts) vertex(v.x + width / 2, v.y + height / 2);
      vertex(mouseX, mouseY);
      endShape();
      noStroke();
      for (let i = 0; i < freeformVerts.length; i++) {
        const sx = freeformVerts[i].x + width / 2;
        const sy = freeformVerts[i].y + height / 2;
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
  if (quad.sourceType === 'hydra') {
    releaseHydraSlot(quad.hydraOutput);
    quad.hydraOutput = null;
  }
  if (quad.sourceType === 'carousel') {
    quad.carousel = [];
    quad.carouselIndex = 0;
  }
  if (quad.sourceUrl) {
    if (releaseSources && !quad.sourceUrl.startsWith('http')) URL.revokeObjectURL(quad.sourceUrl);
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
  } else {
    renderQuadList();
  }
}

function startCamera(index) {
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
    const colorSection = `<div class="quad-color">
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
        <label>invertir<button class="${c.invertir ? 'activo' : ''}" onclick="toggleQuadInvertir(${i})">${c.invertir ? 'sí' : 'no'}</button><span></span></label>` : ''}
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
        </select>
        ${fileBtn}
        ${screenBtn}
        <button onclick="deleteQuad(${i})">✕</button>
      </div>
      ${urlRow}
      ${note}
      ${hydraSection}
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
      if (dist(mouseX, mouseY, first.x + width / 2, first.y + height / 2) < 15) {
        finalizeFreeform();
        return;
      }
    }
    freeformVerts.push(createVector(mouseX - width / 2, mouseY - height / 2));
    return;
  }

  if (drawingMode) {
    drawStart = { x: mouseX, y: mouseY };
    drawCurrent = { x: mouseX, y: mouseY };
    return;
  }

  for (let q = 0; q < quads.length; q++) {
    const shape = quads[q];
    const pts = shape.kind === 'freeform' ? shape.vertices : shape.points;
    for (let i = 0; i < pts.length; i++) {
      const sx = pts[i].x + width / 2;
      const sy = pts[i].y + height / 2;
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
    if (selected.move) { // M was held at click time — move whole shape
      const dx = mouseX - pmouseX;
      const dy = mouseY - pmouseY;
      const pts = shape.kind === 'freeform' ? shape.vertices : shape.points;
      for (const p of pts) { p.x += dx; p.y += dy; }
      if (shape.kind !== 'freeform') buildTessCache(shape);
    } else if (shape.kind === 'freeform') {
      shape.vertices[selected.vert].x = mouseX - width / 2;
      shape.vertices[selected.vert].y = mouseY - height / 2;
    } else {
      const pt = shape.points[selected.vert];
      pt.x = mouseX - width / 2;
      pt.y = mouseY - height / 2;
      buildTessCache(shape);
    }
    publicarEstado();   // control/ sigue el arrastre (se junta en un mensaje cada 50 ms)
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
  publicarEstado();   // control/ dibuja los puntos a la escala de este lienzo
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
    if (q.carousel && q.carousel.length) { data.carousel = q.carousel; data.carouselIndex = q.carouselIndex || 0; }
    const color = colorParaGuardar(q.color);
    if (color) data.color = color;
    // Se guarda el elemento entero, no el stream: una compartición no se reanuda, sólo se
    // mantiene. Y con él su proxy, para no dejar un p5.Graphics tirado por cada ida y vuelta.
    if (q.sourceType === 'pantalla' && q.sourceVideo) data.screenSource = { videoEl: q.sourceVideo, proxy: q.sourceEl };
    return data;
  });
}

function _applySceneData(sceneData) {
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
      return { kind: 'freeform', vertices: (q.vertices || []).map(v => createVector(v.x, v.y)), sourceType: srcType, sourceEl: null, sourceUrl: null, hydraCode, hydraOutput, carousel: q.carousel || [], carouselIndex: q.carouselIndex || 0, color: { ...COLOR_NEUTRO, ...q.color } };
    }
    const quad = { kind: 'quad', points: (q.points || []).map(p => createVector(p.x, p.y)), sourceType: srcType, sourceEl: null, sourceUrl: null, hydraCode, hydraOutput, carousel: q.carousel || [], carouselIndex: q.carouselIndex || 0, color: { ...COLOR_NEUTRO, ...q.color } };
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
    }
  });
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

  const refW = (typeof width !== 'undefined' ? width : 1280) / 2;
  const refH = (typeof height !== 'undefined' ? height : 720) / 2;
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
  publicarEstado();   // control/ ve las escenas y si se está reproduciendo
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
