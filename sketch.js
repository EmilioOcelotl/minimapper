// --- MODO EDICIÓN / PRESENTACIÓN ---

let uiVisible = false;
let showHint = true;

function toggleEditMode() {
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
            return data;
          })
        : s.quads
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
  scenes = normalized.scenes;
  currentSceneIndex = Math.min(normalized.currentSceneIndex, scenes.length - 1);
  playbackMode = normalized.playbackMode;

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
      quad = { kind: 'freeform', vertices: (qData.vertices || []).map(v => createVector(v.x, v.y)), sourceType: srcType, sourceEl: null, sourceUrl: null, hydraCode, hydraOutput };
    } else {
      const pts = qData.points || qData;
      quad = { kind: 'quad', points: pts.map(p => createVector(p.x, p.y)), sourceType: srcType, sourceEl: null, sourceUrl: null, hydraCode, hydraOutput };
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

function saveToLocalStorage() {
  try {
    snapshotCurrentScene();
    const config = {
      scenes: scenes.map(s => ({ id: s.id, duration_s: s.duration_s, hydraCode: s.hydraCode || '', quads: s.quads || [] })),
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
  undoStack.push(quads.map(q =>
    q.kind === 'freeform'
      ? { kind: 'freeform', data: q.vertices.map(v => ({ x: v.x, y: v.y })) }
      : { kind: 'quad',     data: q.points.map(p => ({ x: p.x, y: p.y })) }
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
  });
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
    hydraOutput: null
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

  const newQuad = { points, sourceType: 'grid', sourceEl: null, sourceUrl: null, hydraCode: '', hydraOutput: null };
  buildTessCache(newQuad);
  quads.push(newQuad);
  undoStack.length = 0;
  renderQuadList();
  saveToLocalStorage();
  updateCurrentSceneThumbnail();
  cancelDrawing();
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
  cnv.style('position', 'fixed');
  cnv.style('top', '0');
  cnv.style('left', '0');
  cnv.style('z-index', '0');
  hc = select("#myCanvas");
  hc.hide();
  window.noise = _hydraNoise; // restore after p5 overwrote it
  for (let i = 0; i < 4; i++) hydraCanvases.push(createGraphics(512, 512));
  gridGfx = buildGridTexture();

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

    if (quad.sourceType === 'grid') {
      texture(gridGfx);
    } else if (quad.sourceType === 'carousel' && quad.carousel && quad.carousel.length > 0) {
      texture(quad.carousel[quad.carouselIndex].img);
    } else if (quad.sourceType === 'hydra') {
      const _slot = quad.hydraOutput ?? 0;
      hydra.renderFbo({
        tex0: hydra.o[_slot].getCurrent(),
        resolution: [hc.elt.width, hc.elt.height]
      });
      hydraCanvases[_slot].drawingContext.drawImage(hc.elt, 0, 0, 512, 512);
      texture(hydraCanvases[_slot]);
    } else if (quad.sourceEl) {
      texture(quad.sourceEl);
    } else {
      texture(hc);
    }

    if (uiVisible) stroke(255, 255, 255, 18);
    else noStroke();

    if (quad.kind === 'freeform') {
      const verts = quad.vertices;
      const n = verts.length;
      if (n < 3) continue;
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
}

function clearQuadSource(index) {
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
    if (!quad.sourceUrl.startsWith('http')) URL.revokeObjectURL(quad.sourceUrl);
    quad.sourceUrl = null;
  }
  if (quad.sourceVideo) {
    quad.sourceVideo.pause();
    quad.sourceVideo.src = '';
    if (quad.sourceVideo.parentNode) quad.sourceVideo.parentNode.removeChild(quad.sourceVideo);
    quad.sourceVideo = null;
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
    quads[index].sourceType = 'hydra';
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
      quads[index].sourceType = 'hydra';
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
      console.error('Video decode error (código', videoEl.error?.code, ')— convierte el archivo a H.264/MP4.');
      clearQuadSource(index);
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
    const currentUrl = (q.sourceUrl && q.sourceUrl.startsWith('http')) ? q.sourceUrl : '';
    const urlRow = hasMedia
      ? `<div class="quad-url-row">
          <input type="text" class="quad-url-input" value="${currentUrl}" placeholder="https://..."
            onkeydown="if(event.key==='Enter')loadQuadSourceFromUrl(${i},this.value.trim())">
          <button onclick="loadQuadSourceFromUrl(${i},this.parentElement.querySelector('input').value.trim())">URL</button>
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

    div.innerHTML = `
      <span class="quad-label">${q.kind === 'freeform' ? 'Libre' : 'Quad'} ${i}${q.sourceType === 'hydra' && q.hydraOutput != null ? ` — o${q.hydraOutput}` : ''}</span>
      <div class="quad-controls">
        <select onchange="changeQuadSource(${i}, this.value)">
          <option value="grid"      ${q.sourceType === 'grid'      ? 'selected' : ''}>Rejilla</option>
          <option value="hydra"     ${q.sourceType === 'hydra'     ? 'selected' : ''}>Hydra</option>
          <option value="video"     ${q.sourceType === 'video'     ? 'selected' : ''}>Video</option>
          <option value="image"     ${q.sourceType === 'image'     ? 'selected' : ''}>Imagen</option>
          <option value="camera"    ${q.sourceType === 'camera'    ? 'selected' : ''}>Cámara</option>
          <option value="carousel"  ${q.sourceType === 'carousel'  ? 'selected' : ''}>Carrusel</option>
        </select>
        ${fileBtn}
        <button onclick="deleteQuad(${i})">✕</button>
      </div>
      ${urlRow}
      ${hydraSection}
      ${carouselSection}
    `;

    container.appendChild(div);
  });
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
    const srcUrl = (q.sourceUrl && q.sourceUrl.startsWith('http')) ? q.sourceUrl : null;
    const data = q.kind === 'freeform'
      ? { kind: 'freeform', vertices: q.vertices.map(v => ({ x: v.x, y: v.y })), sourceType: q.sourceType }
      : { kind: 'quad', points: q.points.map(p => ({ x: p.x, y: p.y })), sourceType: q.sourceType };
    if (srcUrl) data.sourceUrl = srcUrl;
    if (q.sourceType === 'hydra') { data.hydraCode = q.hydraCode || ''; data.hydraOutput = q.hydraOutput ?? 0; }
    return data;
  });
}

function _applySceneData(sceneData) {
  quads.forEach((_, i) => clearQuadSource(i));
  quads = [];
  hydraSlots = [0, 0, 0, 0];
  const legacyCode = sceneData.hydraCode || '';
  quads = (sceneData.quads || []).map(q => {
    const srcType = q.sourceType === 'camera' ? 'camera' : (q.sourceType || 'hydra');
    const hydraCode = q.hydraCode != null ? q.hydraCode : (srcType === 'hydra' ? legacyCode : '');
    let hydraOutput = null;
    if (srcType === 'hydra') {
      const stored = q.hydraOutput ?? -1;
      hydraOutput = (stored >= 0 && stored < 4) ? stored : hydraSlots.indexOf(Math.min(...hydraSlots));
      hydraSlots[hydraOutput]++;
    }
    if (q.kind === 'freeform') {
      return { kind: 'freeform', vertices: (q.vertices || []).map(v => createVector(v.x, v.y)), sourceType: srcType, sourceEl: null, sourceUrl: null, hydraCode, hydraOutput };
    }
    const quad = { kind: 'quad', points: (q.points || []).map(p => createVector(p.x, p.y)), sourceType: srcType, sourceEl: null, sourceUrl: null, hydraCode, hydraOutput };
    buildTessCache(quad);
    return quad;
  });
  undoStack.length = 0;
  quads.forEach((q, i) => {
    const qData = sceneData.quads[i];
    if (qData && qData.sourceUrl && qData.sourceUrl.startsWith('http')) {
      loadQuadSourceFromUrl(i, qData.sourceUrl);
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
    quads: (current.quads || []).map(q =>
      q.kind === 'freeform'
        ? { kind: 'freeform', vertices: q.vertices.map(v => ({ x: v.x, y: v.y })), sourceType: q.sourceType, hydraCode: q.hydraCode || '', hydraOutput: q.hydraOutput ?? null }
        : { kind: 'quad', points: q.points.map(p => ({ x: p.x, y: p.y })), sourceType: q.sourceType, hydraCode: q.hydraCode || '', hydraOutput: q.hydraOutput ?? null }
    )
  });
  currentSceneIndex = scenes.length - 1;
  _applySceneData(scenes[currentSceneIndex]);
  saveToLocalStorage();
  renderSceneStrip();
}

function deleteScene(index) {
  if (scenes.length <= 1) return;
  if (isPlaying) stopPlayback();
  scenes.splice(index, 1);
  if (currentSceneIndex >= scenes.length) currentSceneIndex = scenes.length - 1;
  else if (index < currentSceneIndex) currentSceneIndex--;
  _applySceneData(scenes[currentSceneIndex]);
  saveToLocalStorage();
  renderSceneStrip();
}

function deleteAllScenes() {
  if (!confirm('¿Eliminar todas las escenas?')) return;
  if (isPlaying) stopPlayback();
  snapshotCurrentScene();
  const current = scenes[currentSceneIndex];
  scenes = [{ id: 1, duration_s: current.duration_s, hydraCode: current.hydraCode, quads: current.quads }];
  currentSceneIndex = 0;
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
