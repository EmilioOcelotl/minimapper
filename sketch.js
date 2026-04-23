// --- MODO EDICIÓN / PRESENTACIÓN ---

let uiVisible = false;
let showHint = true;

function toggleEditMode() {
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
    const infoPanel = document.getElementById('info-panel');
    if (infoPanel.classList.contains('visible')) {
      infoPanel.classList.remove('visible');
    }
    infoBtn.classList.remove('visible');
  }
}

function togglePanelCollapse() {
  const ui = document.getElementById('ui');
  const btn = document.getElementById('panel-collapse');
  ui.classList.toggle('collapsed');
  btn.textContent = ui.classList.contains('collapsed') ? '›' : '‹';
}

function toggleInfoPanel() {
  const infoPanel = document.getElementById('info-panel');
  infoPanel.classList.toggle('visible');
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === 'H') toggleEditMode();
  if (e.key === 'Escape') {
    if (freeformMode) cancelFreeform();
    else if (drawingMode) cancelDrawing();
    else stopHydra();
  }
  if (e.ctrlKey && e.key === 'z' && document.activeElement !== document.getElementById('code')) {
    e.preventDefault();
    undo();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('toggle-btn').classList.add('presentation');
  document.getElementById('info-btn').classList.remove('visible');
  loadFromLocalStorage();
});

// --- HYDRA ---

var hydra = new Hydra({ canvas: document.getElementById("myCanvas") });
// p5 overwrites window.noise at DOMContentLoaded; capture Hydra's version first
var _hydraNoise = window.noise;

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

function setRunStatus(ok, msg) {
  const el = document.getElementById("run-status");
  if (!el) return;
  el.textContent = msg || (ok ? "✓" : "✗");
  el.className = ok ? "status-ok" : "status-error";
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.textContent = ""; el.className = ""; }, 3000);
}

function runHydra() {
  const code = document.getElementById("code").value;
  const blocked = evalHydra(code);
  if (blocked) {
    setRunStatus(false, `✗ bloqueado`);
    console.warn(`Hydra: "${blocked}" no está permitido`);
    return;
  }
  setRunStatus(true);
  saveToLocalStorage();
}

function stopHydra() {
  try {
    hush();
    const el = document.getElementById("run-status");
    if (el) { el.textContent = ""; el.className = ""; }
  } catch (e) {
    console.log("Error al ejecutar hush:", e);
  }
}

// --- SESIÓN ---

function saveSession() {
  const session = {
    version: 1,
    hydraCode: document.getElementById("code").value,
    quads: quads.map(q => {
      let imageData = null;
      if (q.sourceType === 'image' && q.sourceEl && q.sourceEl.canvas) {
        try { imageData = q.sourceEl.canvas.toDataURL('image/png'); } catch (e) {}
      }
      const sourceType = imageData ? q.sourceType : (q.sourceType === 'image' ? 'hydra' : q.sourceType);
      if (q.kind === 'freeform') {
        const data = { kind: 'freeform', vertices: q.vertices.map(v => ({ x: v.x, y: v.y })), sourceType };
        if (imageData) data.imageData = imageData;
        return data;
      } else {
        const data = { kind: 'quad', points: q.points.map(p => ({ x: p.x, y: p.y })), sourceType };
        if (imageData) data.imageData = imageData;
        return data;
      }
    })
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

function applySession(session) {
  quads.forEach((_, i) => clearQuadSource(i));
  quads = [];

  if (session.hydraCode) {
    document.getElementById("code").value = session.hydraCode;
    evalHydra(session.hydraCode);
  }

  if (!session.quads || session.quads.length === 0) {
    renderQuadList();
    saveToLocalStorage();
    return;
  }

  let pending = 0;

  session.quads.forEach((qData, i) => {
    const srcType = qData.sourceType === 'camera' ? 'camera' : 'hydra';
    let quad;
    if (qData.kind === 'freeform') {
      quad = {
        kind: 'freeform',
        vertices: qData.vertices.map(v => createVector(v.x, v.y)),
        sourceType: srcType,
        sourceEl: null,
        sourceUrl: null
      };
    } else {
      const pointsData = qData.points || qData;
      quad = {
        kind: 'quad',
        points: pointsData.map(v => createVector(v.x, v.y)),
        sourceType: srcType,
        sourceEl: null,
        sourceUrl: null
      };
      buildTessCache(quad);
    }
    quads.push(quad);

    if (qData.sourceType === 'image' && qData.imageData) {
      pending++;
      loadImage(qData.imageData, (img) => {
        quads[i].sourceType = 'image';
        quads[i].sourceEl = img;
        pending--;
        if (pending === 0) { renderQuadList(); saveToLocalStorage(); }
      });
    }
  });

  quads.forEach((q, i) => { if (q.sourceType === 'camera') startCamera(i); });
  if (pending === 0) { renderQuadList(); saveToLocalStorage(); }
}

// --- LOCAL STORAGE ---

function saveToLocalStorage() {
  try {
    const config = {
      hydraCode: document.getElementById("code").value,
      quadVertices: quads.map(q =>
        q.kind === 'freeform'
          ? { kind: 'freeform', vertices: q.vertices.map(v => ({ x: v.x, y: v.y })), sourceType: q.sourceType }
          : { kind: 'quad',     points:   q.points.map(p => ({ x: p.x, y: p.y })),   sourceType: q.sourceType }
      )
    };
    localStorage.setItem("minimapper_config", JSON.stringify(config));
  } catch (e) {
    console.error(e);
  }
}

function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem("minimapper_config");
    if (!saved) return;
    const config = JSON.parse(saved);

    if (config.hydraCode) {
      document.getElementById("code").value = config.hydraCode;
      evalHydra(config.hydraCode);
    }

    if (config.quadVertices) {
      quads = config.quadVertices.map(q => {
        const srcType = q.sourceType === 'camera' ? 'camera' : 'hydra';
        if (q.kind === 'freeform') {
          return {
            kind: 'freeform',
            vertices: q.vertices.map(v => createVector(v.x, v.y)),
            sourceType: srcType,
            sourceEl: null,
            sourceUrl: null
          };
        }
        // backward compat: old format stored array of points directly
        const pointsData = Array.isArray(q) ? q : q.points;
        const quad = {
          kind: 'quad',
          points: pointsData.map(v => createVector(v.x, v.y)),
          sourceType: srcType,
          sourceEl: null,
          sourceUrl: null
        };
        buildTessCache(quad);
        return quad;
      });
    }
    renderQuadList();
    quads.forEach((q, i) => { if (q.sourceType === 'camera') startCamera(i); });
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

// --- P5 ---

let hc;
let quads = [];
let selected = { quad: -1, vert: -1 };
let drawingMode = false;
let drawStart = null;
let drawCurrent = null;
let freeformMode = false;
let freeformVerts = [];

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
    sourceType: 'hydra',
    sourceEl: null,
    sourceUrl: null
  };
  quads.push(shape);
  undoStack.length = 0;
  renderQuadList();
  saveToLocalStorage();
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

  const newQuad = { points, sourceType: 'hydra', sourceEl: null, sourceUrl: null };
  buildTessCache(newQuad);
  quads.push(newQuad);
  undoStack.length = 0;
  renderQuadList();
  saveToLocalStorage();
  cancelDrawing();
}

function setup() {
  let cnv = createCanvas(windowWidth, windowHeight, WEBGL);
  cnv.style('position', 'fixed');
  cnv.style('top', '0');
  cnv.style('left', '0');
  cnv.style('z-index', '0');
  hc = select("#myCanvas");
  hc.hide();
  window.noise = _hydraNoise; // restore after p5 overwrote it
}

function draw() {
  background(0);
  textureMode(NORMAL);

  for (let q = 0; q < quads.length; q++) {
    const quad = quads[q];

    if (quad.sourceEl && quad.sourceType !== 'hydra') {
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

function addQuad() {
  let size = 200;
  let ox = random(-60, 60);
  let oy = random(-60, 60);
  let points = [];

  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      points.push(createVector(
        map(x, 0, 2, -size, size) + ox,
        map(y, 0, 2, -size, size) + oy
      ));
    }
  }

  const newQuad = { points, sourceType: 'hydra', sourceEl: null, sourceUrl: null };
  buildTessCache(newQuad);
  quads.push(newQuad);
  renderQuadList();
  saveToLocalStorage();
}

function clearQuadSource(index) {
  const quad = quads[index];
  if (quad.sourceUrl) {
    URL.revokeObjectURL(quad.sourceUrl);
    quad.sourceUrl = null;
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
}

function changeQuadSource(index, type) {
  if (quads[index].sourceType === type) return;
  clearQuadSource(index);
  quads[index].sourceType = type;
  quads[index].sourceEl = null;
  if (type === 'camera') {
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
      vid.loop();
      vid.volume(0);
      vid.play();
      quads[index].sourceEl = vid;
    } else {
      loadImage(url, (img) => {
        quads[index].sourceEl = img;
      });
    }
  };

  input.click();
}

function renderQuadList() {
  const container = document.getElementById("quad-list");
  if (!container) return;
  container.innerHTML = "";

  quads.forEach((q, i) => {
    const div = document.createElement("div");
    div.className = 'quad-item';

    const loadBtn = (q.sourceType === 'video' || q.sourceType === 'image')
      ? `<button onclick="loadQuadSource(${i})">Cargar</button>`
      : '';

    div.innerHTML = `
      <span class="quad-label">${q.kind === 'freeform' ? 'Libre' : 'Quad'} ${i}</span>
      <div class="quad-controls">
        <select onchange="changeQuadSource(${i}, this.value)">
          <option value="hydra"  ${q.sourceType === 'hydra'  ? 'selected' : ''}>Hydra</option>
          <option value="video"  ${q.sourceType === 'video'  ? 'selected' : ''}>Video</option>
          <option value="image"  ${q.sourceType === 'image'  ? 'selected' : ''}>Imagen</option>
          <option value="camera" ${q.sourceType === 'camera' ? 'selected' : ''}>Cámara</option>
        </select>
        ${loadBtn}
        <button onclick="deleteQuad(${i})">✕</button>
      </div>
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
        selected = { quad: q, vert: i };
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
    if (shape.kind === 'freeform') {
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
  if (selected.quad != -1) saveToLocalStorage();
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
  resizeCanvas(windowWidth, windowHeight);
}
