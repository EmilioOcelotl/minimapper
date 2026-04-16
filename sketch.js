// --- MODO EDICIÓN / PRESENTACIÓN ---

let uiVisible = false;
let showHint = true;

function toggleEditMode() {
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

function toggleInfoPanel() {
  const infoPanel = document.getElementById('info-panel');
  infoPanel.classList.toggle('visible');
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'H') toggleEditMode();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') stopHydra();
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

function runHydra() {
  let code = document.getElementById("code").value;
  const found = BLOCKED.find(word => code.includes(word));
  if (found) {
    alert(`"${found}" no está permitido`);
    return;
  }
  try {
    eval(code);
    saveToLocalStorage();
  } catch (e) {
    console.log(e);
  }
}

function stopHydra() {
  try {
    hush();
  } catch (e) {
    console.log("Error al ejecutar hush:", e);
  }
}

// --- LOCAL STORAGE ---

function saveToLocalStorage() {
  try {
    const config = {
      hydraCode: document.getElementById("code").value,
      quadVertices: quads.map(quad => ({
        points: quad.points.map(p => ({ x: p.x, y: p.y })),
        sourceType: quad.sourceType
      }))
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
      eval(config.hydraCode);
    }

    if (config.quadVertices) {
      quads = config.quadVertices.map(q => {
        // backward compat: old format stored array of points directly
        const pointsData = Array.isArray(q) ? q : q.points;
        return {
          points: pointsData.map(v => createVector(v.x, v.y)),
          sourceType: 'hydra', // video/image files don't survive page reload
          sourceEl: null
        };
      });
    }
    renderQuadList();
    console.log("Configuración cargada");
  } catch (e) {
    console.error("Error al cargar configuración:", e);
  }
}

// --- BEZIER PATCH ---
// Each quad is a 3×3 grid of control points (quadratic tensor-product Bezier surface).
// Corners are on the surface; edge/center points act as attractors.

const TESS = 8;

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

// --- P5 ---

let hc;
let quads = [];
let selected = { quad: -1, vert: -1 };

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
    let quad = quads[q];
    let pts = quad.points;

    if (quad.sourceType === 'video' && quad.sourceEl) {
      texture(quad.sourceEl);
    } else if (quad.sourceType === 'image' && quad.sourceEl) {
      texture(quad.sourceEl);
    } else {
      texture(hc);
    }

    if (uiVisible) stroke(255);
    else noStroke();

    for (let j = 0; j < TESS; j++) {
      for (let i = 0; i < TESS; i++) {
        let u0 = i / TESS,     u1 = (i+1) / TESS;
        let v0 = j / TESS,     v1 = (j+1) / TESS;

        let p00 = evalPatch(pts, u0, v0);
        let p10 = evalPatch(pts, u1, v0);
        let p11 = evalPatch(pts, u1, v1);
        let p01 = evalPatch(pts, u0, v1);

        beginShape();
        vertex(p00.x, p00.y, u0, v0);
        vertex(p10.x, p10.y, u1, v0);
        vertex(p11.x, p11.y, u1, v1);
        vertex(p01.x, p01.y, u0, v1);
        endShape(CLOSE);
      }
    }
  }

  // Control points — edit mode only
  if (uiVisible) {
    push();
    resetMatrix();
    translate(-width / 2, -height / 2);
    noStroke();

    for (let q = 0; q < quads.length; q++) {
      let pts = quads[q].points;
      for (let i = 0; i < pts.length; i++) {
        let sx = pts[i].x + width / 2;
        let sy = pts[i].y + height / 2;
        // Corners (indices 0,2,6,8) are on the surface — red; others are control attractors — yellow
        fill([0,2,6,8].includes(i) ? color(255, 0, 0) : color(255, 200, 0));
        ellipse(sx, sy, 10, 10);
      }
    }
    pop();
  }

  // Crosshair — edit mode only
  if (uiVisible) {
    push();
    resetMatrix();
    translate(-width / 2, -height / 2);
    stroke(255, 255, 255, 120);
    strokeWeight(1);
    line(0, mouseY, width, mouseY);
    line(mouseX, 0, mouseX, height);
    pop();
  }
}

function addQuad() {
  let size = 200;
  let offset = quads.length * 220;
  let points = [];

  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      points.push(createVector(
        map(x, 0, 2, -size, size) + offset,
        map(y, 0, 2, -size, size)
      ));
    }
  }

  quads.push({ points, sourceType: 'hydra', sourceEl: null });
  renderQuadList();
  saveToLocalStorage();
}

function deleteQuad(index) {
  if (quads[index].sourceType === 'video' && quads[index].sourceEl) {
    quads[index].sourceEl.remove();
  }
  quads.splice(index, 1);
  renderQuadList();
  saveToLocalStorage();
}

function changeQuadSource(index, type) {
  if (quads[index].sourceType === type) return;
  if (quads[index].sourceType === 'video' && quads[index].sourceEl) {
    quads[index].sourceEl.remove();
  }
  quads[index].sourceType = type;
  quads[index].sourceEl = null;
  renderQuadList();
}

function loadQuadSource(index) {
  const type = quads[index].sourceType;
  if (type === 'hydra') return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = type === 'video' ? 'video/*' : 'image/*';

  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);

    if (type === 'video') {
      if (quads[index].sourceEl) quads[index].sourceEl.remove();
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
    div.style.marginTop = "6px";

    const loadBtn = q.sourceType !== 'hydra'
      ? `<button onclick="loadQuadSource(${i})">Cargar</button>`
      : '';

    div.innerHTML = `
      Quad ${i}
      <select onchange="changeQuadSource(${i}, this.value)">
        <option value="hydra"  ${q.sourceType === 'hydra'  ? 'selected' : ''}>Hydra</option>
        <option value="video"  ${q.sourceType === 'video'  ? 'selected' : ''}>Video</option>
        <option value="image"  ${q.sourceType === 'image'  ? 'selected' : ''}>Imagen</option>
      </select>
      ${loadBtn}
      <button onclick="deleteQuad(${i})">✕</button>
    `;

    container.appendChild(div);
  });
}

// --- INTERACCIÓN ---

function mousePressed() {
  if (!uiVisible) return;

  for (let q = 0; q < quads.length; q++) {
    let pts = quads[q].points;
    for (let i = 0; i < pts.length; i++) {
      let sx = pts[i].x + width / 2;
      let sy = pts[i].y + height / 2;
      if (dist(mouseX, mouseY, sx, sy) < 10) {
        selected = { quad: q, vert: i };
        return;
      }
    }
  }
}

function mouseDragged() {
  if (!uiVisible) return;
  if (selected.quad != -1) {
    let pt = quads[selected.quad].points[selected.vert];
    pt.x = mouseX - width / 2;
    pt.y = mouseY - height / 2;
  }
}

function mouseReleased() {
  if (selected.quad != -1) saveToLocalStorage();
  selected = { quad: -1, vert: -1 };
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
