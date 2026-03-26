// --- MODO EDICIÓN / PRESENTACIÓN ---

let uiVisible = false; // Arranca en modo presentación

function toggleEditMode() {
  uiVisible = !uiVisible;

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
        quad.map(v => ({ x: v.x, y: v.y }))
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

    // Restaurar código Hydra
    if (config.hydraCode) {
      document.getElementById("code").value = config.hydraCode;
      // Ejecutar el código restaurado
      eval(config.hydraCode);
    }

    // Restaurar número de quads y vértices
    if (config.quadVertices) {
      quads = config.quadVertices.map(q =>
        q.map(v => createVector(v.x, v.y))
      );
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
  createCanvas(windowWidth, windowHeight, WEBGL);
  hc = select("#myCanvas");
  hc.hide();
  // Solo crear quads por defecto si no hay configuración guardada
  if (quads.length === 0) {
    addQuad();
  }
}

function draw() {
  background(0);

  textureMode(NORMAL);
  texture(hc);
  noStroke(); // base: sin contorno

  for (let q = 0; q < quads.length; q++) {
    let v = quads[q];

    // En modo edición: contorno blanco
    if (uiVisible) stroke(255);
    else noStroke();

    beginShape();
    vertex(v[0].x, v[0].y, 0, 0);
    vertex(v[1].x, v[1].y, 1, 0);
    vertex(v[2].x, v[2].y, 1, 1);
    vertex(v[3].x, v[3].y, 0, 1);
    endShape(CLOSE);
  }

  // Puntos de vértices — solo en modo edición
  if (uiVisible) {
    push();
    resetMatrix();
    translate(-width / 2, -height / 2);
    fill(255, 0, 0);
    noStroke();

    for (let q = 0; q < quads.length; q++) {
      let v = quads[q];
      for (let i = 0; i < v.length; i++) {
        let sx = v[i].x + width / 2;
        let sy = v[i].y + height / 2;
        ellipse(sx, sy, 12, 12);
      }
    }
    pop();
  }
}

function addQuad() {
  let size = 200;
  let offset = quads.length * 220;

  let quad = [
    createVector(-size + offset, -size),
    createVector(size + offset, -size),
    createVector(size + offset, size),
    createVector(-size + offset, size)
  ];

  quads.push(quad);
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
  if (!uiVisible) return; // bloquear en modo presentación

  for (let q = 0; q < quads.length; q++) {
    let v = quads[q];
    for (let i = 0; i < v.length; i++) {
      let sx = v[i].x + width / 2;
      let sy = v[i].y + height / 2;
      if (dist(mouseX, mouseY, sx, sy) < 12) {
        selected = { quad: q, vert: i };
        return;
      }
    }
  }
}

function mouseDragged() {
  if (!uiVisible) return;
  if (selected.quad != -1) {
    let v = quads[selected.quad][selected.vert];
    v.x = mouseX - width / 2;
    v.y = mouseY - height / 2;
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