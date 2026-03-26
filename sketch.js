// --- HYDRA ---

let uiVisible = true;

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'H') {
    uiVisible = !uiVisible;
    document.getElementById('ui').style.display = uiVisible ? 'block' : 'none';
  }
});

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
  } catch (e) {
    console.log(e);
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
  setQuadCount(1);
}

function draw() {
  background(0);

  textureMode(NORMAL);
  texture(hc);

  if (!uiVisible) noStroke();
  else stroke(255);

  for (let q = 0; q < quads.length; q++) {
    let v = quads[q];
    beginShape();
    vertex(v[0].x, v[0].y, 0, 0);
    vertex(v[1].x, v[1].y, 1, 0);
    vertex(v[2].x, v[2].y, 1, 1);
    vertex(v[3].x, v[3].y, 0, 1);
    endShape(CLOSE);
  }

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
      createVector(200 + xOffset, 200),
      createVector(-200 + xOffset, 200)
    ]);
  }
}

function mousePressed() {
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
  if (selected.quad != -1) {
    let v = quads[selected.quad][selected.vert];
    v.x = mouseX - width / 2;
    v.y = mouseY - height / 2;
  }
}

function mouseReleased() {
  selected = { quad: -1, vert: -1 };
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}