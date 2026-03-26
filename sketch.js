// --- MODO EDICIÓN / PRESENTACIÓN ---

let uiVisible = false; // Arranca en modo presentación

function toggleEditMode() {
  uiVisible = !uiVisible;

  const panel = document.getElementById('ui');
  const btn   = document.getElementById('toggle-btn');

  if (uiVisible) {
    panel.classList.add('visible');
    btn.classList.remove('presentation');
  } else {
    panel.classList.remove('visible');
    btn.classList.add('presentation');
  }
}

// Mantener compatibilidad con CTRL+SHIFT+H
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftEq && e.key === 'H') toggleEditMode();
});

// Aplicar clase presentation al iniciar (modo presentación por defecto)
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('toggle-btn').classList.add('presentation');
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
      quadCount: quads.length,
      quadVertices: quads.map(quad => 
        quad.map(vertex => ({ x: vertex.x, y: vertex.y }))
      )
    };
    localStorage.setItem("minimapper_config", JSON.stringify(config));
    console.log("Configuración guardada");
  } catch (e) {
    console.error("Error al guardar configuración:", e);
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
    if (config.quadCount && config.quadVertices) {
      // Actualizar el select visualmente
      const quadSelect = document.getElementById("quadCount");
      quadSelect.value = config.quadCount;
      
      // Restaurar quads con sus vértices
      quads = [];
      for (let i = 0; i < config.quadCount; i++) {
        const savedQuad = config.quadVertices[i];
        if (savedQuad && savedQuad.length === 4) {
          quads.push(savedQuad.map(v => createVector(v.x, v.y)));
        } else {
          // Fallback a posición por defecto si los datos están corruptos
          let spacing = 500;
          let totalWidth = (config.quadCount - 1) * spacing;
          let xOffset = i * spacing - totalWidth / 2;
          quads.push([
            createVector(-200 + xOffset, -200),
            createVector(200 + xOffset, -200),
            createVector(200 + xOffset,  200),
            createVector(-200 + xOffset,  200)
          ]);
        }
      }
    }
    
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
    setQuadCount(1);
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

function setQuadCount(n) {
  n = int(n);
  quads = [];
  let spacing = 500;
  let totalWidth = (n - 1) * spacing;

  for (let i = 0; i < n; i++) {
    let xOffset = i * spacing - totalWidth / 2;
    quads.push([
      createVector(-200 + xOffset, -200),
      createVector(200 + xOffset, -200),
      createVector(200 + xOffset,  200),
      createVector(-200 + xOffset,  200)
    ]);
  }
  saveToLocalStorage(); // Guardar después de cambiar número de quads
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