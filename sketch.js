// --- MODO EDICIÓN / PRESENTACIÓN ---

let uiVisible = false; // Arranca en modo presentación
let showHint = true;


function toggleEditMode() {
  uiVisible = !uiVisible;
  if (showHint) {
    showHint = false; // 🔥 solo vive en esta sesión
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
    // Cerrar panel de información si está abierto al salir del modo edición
    const infoPanel = document.getElementById('info-panel');
    if (infoPanel.classList.contains('visible')) {
      infoPanel.classList.remove('visible');
    }
    infoBtn.classList.remove('visible');
  }
}

// Función para toggle del panel de instrucciones
function toggleInfoPanel() {
  const infoPanel = document.getElementById('info-panel');
  infoPanel.classList.toggle('visible');
}

// Mantener compatibilidad con CTRL+SHIFT+H
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftEq && e.key === 'H') toggleEditMode();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    stopHydra();
  }
});

// Aplicar clase presentation al iniciar (modo presentación por defecto)
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('toggle-btn').classList.add('presentation');
  // El botón info comienza oculto
  document.getElementById('info-btn').classList.remove('visible');
  loadFromLocalStorage(); // Cargar configuración guardada al iniciar
});

// --- HYDRA ---

var hydra = new Hydra({ canvas: document.getElementById("myCanvas") });

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
    saveToLocalStorage(); // Guardar después de ejecutar código
  } catch (e) {
    console.log(e);
  }
}

// --- LOCAL STORAGE ---

function saveToLocalStorage() {
  try {
    const config = {
      hydraCode: document.getElementById("code").value,
      quadVertices: quads.map(quad =>
        quad.points.map(p => ({ x: p.x, y: p.y })))
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

    // Restaurar código Hydra
    if (config.hydraCode) {
      document.getElementById("code").value = config.hydraCode;
      // Ejecutar el código restaurado
      eval(config.hydraCode);
    }

    // Restaurar número de quads y vértices
    if (config.quadVertices) {
      quads = config.quadVertices.map(q => ({
        points: q.map(v => createVector(v.x, v.y))
      }));
    }
    renderQuadList();

    console.log("Configuración cargada");
  } catch (e) {
    console.error("Error al cargar configuración:", e);
  }
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

}

function draw() {
  background(0);

  textureMode(NORMAL);
  texture(hc);
  noStroke(); // base: sin contorno

  for (let q = 0; q < quads.length; q++) {
    let quad = quads[q];
    let pts = quad.points;

    let cols = 3;

    texture(hc);

    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {

        let i = x + y * cols;

        let p0 = pts[i];
        let p1 = pts[i + 1];
        let p2 = pts[i + cols + 1];
        let p3 = pts[i + cols];

        let u0 = x / 2;
        let v0 = y / 2;
        let u1 = (x + 1) / 2;
        let v1 = (y + 1) / 2;

        if (uiVisible) stroke(255);
        else noStroke();

        beginShape();
        vertex(p0.x, p0.y, u0, v0);
        vertex(p1.x, p1.y, u1, v0);
        vertex(p2.x, p2.y, u1, v1);
        vertex(p3.x, p3.y, u0, v1);
        endShape(CLOSE);
      }
    }
  }

  // Puntos de vértices — solo en modo edición
  if (uiVisible) {
    push();
    resetMatrix();
    translate(-width / 2, -height / 2);
    fill(255, 0, 0);
    noStroke();

    for (let q = 0; q < quads.length; q++) {
      let pts = quads[q].points;
      for (let i = 0; i < pts.length; i++) {
        let sx = pts[i].x + width / 2;
        let sy = pts[i].y + height / 2;
        ellipse(sx, sy, 10, 10);
      }
    }
    pop();
  }

  if (uiVisible) {
    push();

    // Volver a coordenadas 2D de pantalla
    resetMatrix();
    translate(-width / 2, -height / 2);

    stroke(255, 255, 255, 120); // blanco semitransparente
    strokeWeight(1);

    // Línea horizontal
    line(0, mouseY, width, mouseY);

    // Línea vertical
    line(mouseX, 0, mouseX, height);

    pop();
  }
}

function addQuad() {
  let size = 200;
  let offset = quads.length * 220;

  let points = [];

  let cols = 3;
  let rows = 3;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let px = map(x, 0, cols - 1, -size, size) + offset;
      let py = map(y, 0, rows - 1, -size, size);

      points.push(createVector(px, py));
    }
  }

  quads.push({ points });
  renderQuadList();
  saveToLocalStorage();
}

function deleteQuad(index) {
  quads.splice(index, 1);
  renderQuadList();
  saveToLocalStorage();
}

function renderQuadList() {
  const container = document.getElementById("quad-list");
  if (!container) return;

  container.innerHTML = "";

  quads.forEach((q, i) => {
    const div = document.createElement("div");
    div.style.marginTop = "6px";

    div.innerHTML = `
      Quad ${i}
      <button onclick="deleteQuad(${i})">x</button>
    `;

    container.appendChild(div);
  });
}

function stopHydra() {
  try {
    hush();
  } catch (e) {
    console.log("Error al ejecutar hush:", e);
  }
}

// --- INTERACCIÓN ---
// Los vértices solo son arrastrables en modo edición

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
  if (selected.quad != -1) {
    saveToLocalStorage(); // Guardar después de soltar un vértice arrastrado
  }
  selected = { quad: -1, vert: -1 };
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}