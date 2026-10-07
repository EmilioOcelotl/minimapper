// Imágenes de minimapper para el README y el sitio: siembra escenas en localStorage,
// abre la app servida en Chromium headless y saca una captura por toma.
//
//   cd tools/imagenes && npm install
//   node imagenes.mjs              # todas las tomas
//   node imagenes.mjs hero focus   # sólo algunas
//
// Levanta su propio servidor en la raíz del repo (python3 -m http.server). Deja el PNG a
// 3200×1600 en out/ y, si hay ImageMagick, el JPG de 1600×800 en assets/img/ — el formato
// 2:1 del carrusel del sitio. Para el sitio se copian a mano a static/img/; la tarjeta
// (minimapper-r.jpg, 600×300) sale de la portada. CHROMIUM cambia el ejecutable.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';

const ROOT = new URL('../../', import.meta.url).pathname;
const PORT = 8765;
const APP = `http://localhost:${PORT}/index.html`;
const OUT = new URL('./out/', import.meta.url).pathname;
const IMG = `${ROOT}assets/img/`;
fs.mkdirSync(OUT, { recursive: true });
const W = 1600, H = 800;

// --- geometría ---------------------------------------------------------------
// Quad desde 4 esquinas (coordenadas centradas) más desplazamientos de los atractores.
function quad(tl, tr, bl, br, off = {}) {
  const mid = (a, b, o = [0, 0]) => ({ x: (a.x + b.x) / 2 + o[0], y: (a.y + b.y) / 2 + o[1] });
  const P = (p) => ({ x: p[0], y: p[1] });
  [tl, tr, bl, br] = [tl, tr, bl, br].map(P);
  const c = mid(mid(tl, br), mid(tr, bl), off.c);
  return [tl, mid(tl, tr, off.t), tr, mid(tl, bl, off.l), c, mid(tr, br, off.r), bl, mid(bl, br, off.b), br];
}
const poly = (pts) => pts.map(([x, y]) => ({ x, y }));

// --- patches -----------------------------------------------------------------
const PATCH = [
  `osc(10, 0.1, 1.2)
  .color(1.2, 0.9, 1.4)
  .modulate(noise(2), 0.4)
  .modulate(src(o0), 0.5)
  .saturate(2)
  .out(o0)`,
  `voronoi(8, 0.3, 0.2)
  .mult(osc(20, 0.05, 1.5).rotate(0.8))
  .modulateScale(noise(1.5), 0.6)
  .color(1.4, 0.6, 0.3)
  .out(o1)`,
  `shape(4, 0.5, 0.01)
  .repeat(6, 10)
  .modulate(noise(1.2, 0.1), 0.15)
  .color(1, 0.8, 0.2)
  .diff(gradient(0.3).color(0.9, 0.1, 0.5))
  .out(o2)`,
  `noise(3, 0.1)
  .color(0.2, 0.7, 1.2)
  .diff(osc(30, 0.03, 1.4).rotate(0.9))
  .contrast(1.3)
  .out(o3)`,
];
const hydraQ = (slot, geom, kind = 'quad') => ({
  kind, [kind === 'freeform' ? 'vertices' : 'points']: geom,
  sourceType: 'hydra', hydraOutput: slot, hydraCode: PATCH[slot],
});
const gridQ = (geom, kind = 'quad') => ({
  kind, [kind === 'freeform' ? 'vertices' : 'points']: geom, sourceType: 'grid',
});

// --- escenas ----------------------------------------------------------------
// dx desplaza la composición (en edición el panel ocupa 300 px a la izquierda).
function heroScene(dx = 0, k = 1) {
  const s = (p) => [p[0] * k + dx, p[1] * k];
  return [
    // vela grande, curvada
    hydraQ(0, quad(s([-640, -340]), s([-150, -290]), s([-600, 150]), s([-170, 120]),
      { t: [0, 75], b: [10, -55], l: [70, 0], r: [-55, 10], c: [30, 10] })),
    // columna: bordes superior e inferior en arco, como un cilindro visto desde arriba
    hydraQ(1, quad(s([-40, -330]), s([180, -330]), s([-40, 310]), s([180, 310]),
      { t: [0, 40], b: [0, 40], c: [0, 30] })),
    // plano en perspectiva
    hydraQ(2, quad(s([280, -230]), s([650, -320]), s([280, 230]), s([650, 340]),
      { c: [10, 0] })),
    // forma libre
    hydraQ(3, poly([[-700, 215], [-520, 195], [-400, 260], [-210, 180], [-130, 365], [-660, 370]].map(s)), 'freeform'),
  ];
}

function gridScene(dx = 150) {
  const s = (p) => [p[0] + dx, p[1]];
  return [
    gridQ(quad(s([-520, -270]), s([-60, -230]), s([-520, 260]), s([-60, 230]),
      { r: [-25, 0], l: [-25, 0], c: [-35, 0] })),
    gridQ(quad(s([10, -320]), s([250, -320]), s([10, 300]), s([250, 300]),
      { t: [0, 40], b: [0, 40], c: [0, 30] })),
    hydraQ(2, quad(s([310, -200]), s([560, -270]), s([310, 220]), s([560, 310]))),
  ];
}

function focusScene() {
  return [
    hydraQ(0, quad([-60, -290], [540, -250], [-20, 300], [500, 260],
      { t: [0, 120], b: [30, -80], l: [110, 0], r: [-70, 20], c: [40, 30] })),
  ];
}

// toma → nombre del archivo publicado (assets/img/minimapper-<nombre>.jpg)
const NAMES = { hero: 'portada', edit: 'edicion', grid: 'calibracion', focus: 'codigo' };

const SHOTS = {
  hero:  { scene: heroScene(30),  edit: false },
  edit:  { scene: heroScene(170, 0.78), edit: true, select: [0, 1], mouse: true, tall: true },
  grid:  { scene: gridScene(150), edit: true, select: [1, 2], mouse: true, tall: true },
  focus: { scene: focusScene(),   edit: true,  annotate: true, select: [0, 1], mouse: true, tall: true },
};

// --- captura ------------------------------------------------------------------
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
process.on('exit', () => server.kill());
await new Promise(r => setTimeout(r, 800));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
         '--autoplay-policy=no-user-gesture-required'],
});

const which = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
for (const name of which) {
  const shot = SHOTS[name];
  const page = await browser.newPage();
  page.on('pageerror', e => console.log(`[${name}] pageerror`, e.message));
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
  const config = { scenes: [{ id: 1, duration_s: 30, hydraCode: '', quads: shot.scene }], currentSceneIndex: 0, playbackMode: 'once' };
  if (shot.scenes) config.scenes = shot.scenes;
  await page.evaluateOnNewDocument((cfg) => {
    localStorage.setItem('minimapper_welcomed', '1');
    localStorage.setItem('minimapper_config', JSON.stringify(cfg));
  }, config);
  await page.goto(APP, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => typeof quads !== 'undefined' && quads.length > 0);

  if (shot.edit) {
    await page.evaluate(() => toggleEditMode());
    await new Promise(r => setTimeout(r, 600));
  } else {
    // presentación limpia: sin hint ni ✦
    await page.addStyleTag({ content: '#hint, #toggle-btn, #panel-collapse { display: none !important; }' });
  }
  if (shot.tall) await page.evaluate(() => document.querySelectorAll('.quad-hydra-code').forEach(t => { t.style.height = (t.scrollHeight + 14) + 'px'; }));
  if (shot.extraScenes) await page.evaluate(shot.extraScenes);
  if (shot.select) {
    const [q, v] = shot.select;
    const pt = await page.evaluate((q, v) => {
      selected = { quad: q, vert: v };
      const p = quads[q].points[v];
      return { x: p.x + width / 2, y: p.y + height / 2 };
    }, q, v);
    if (shot.mouse) await page.mouse.move(pt.x, pt.y);
  }
  if (shot.annotate) await annotate(page);

  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: `${OUT}${name}.png` });
  exportJpg(name);
  await page.close();
}
await browser.close();
server.kill();

function exportJpg(name) {
  const jpg = `${IMG}minimapper-${NAMES[name]}.jpg`;
  try {
    execFileSync('convert', [`${OUT}${name}.png`, '-filter', 'Lanczos', '-resize', `${W}x${H}`,
      '-sampling-factor', '4:4:4', '-quality', '90', '-strip', jpg]);
    console.log('ok', name, '→', jpg.slice(ROOT.length));
  } catch {
    console.log('ok', name, '→', `out/${name}.png (sin ImageMagick, no se exportó el JPG)`);
  }
}

async function annotate(page) {
  await page.evaluate(() => {
    const q = quads[0];
    const scr = (p) => [p.x + width / 2, p.y + height / 2];
    const ta = document.getElementById('hydra-code-0').getBoundingClientRect();
    const corner = scr(q.points[2]);
    const attr = scr(q.points[1]);
    const ctr = scr(q.points[4]);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    Object.assign(svg.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: 60, pointerEvents: 'none' });
    const A = '#ffc840';
    document.body.appendChild(svg);
    const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.appendChild(e); return e; };
    const label = (x, y, lines, anchor = 'start') => {
      lines.forEach((t, i) => {
        const e = el('text', { x, y: y + i * 17, fill: i ? 'rgba(255,255,255,0.72)' : A, 'font-family': 'monospace', 'font-size': i ? 12 : 13, 'text-anchor': anchor });
        e.textContent = t;
      });
    };
    // marco del código
    el('rect', { x: ta.left - 4, y: ta.top - 4, width: ta.width + 8, height: ta.height + 8, fill: 'none', stroke: A, 'stroke-width': 1.2, rx: 3 });
    // del código a la superficie: termina en un punto de la textura, no en un control
    const end = scr({ x: (q.points[3].x + q.points[4].x) / 2, y: (q.points[3].y + q.points[4].y) / 2 + 90 });
    const x0 = ta.right + 4, y0 = ta.top + ta.height / 2;
    el('path', { d: `M${x0},${y0} C${x0 + 200},${y0} ${end[0] - 240},${end[1]} ${end[0] - 6},${end[1]}`, fill: 'none', stroke: A, 'stroke-width': 1.2, 'stroke-dasharray': '4 4' });
    el('circle', { cx: end[0], cy: end[1], r: 4, fill: A });
    label(x0 + 26, ta.top - 2, ['el código es de la superficie', 'cada quad Hydra tiene su', 'propio output (o0–o3)']);
    // esquina
    el('line', { x1: corner[0] + 8, y1: corner[1] - 8, x2: corner[0] + 40, y2: corner[1] - 40, stroke: A, 'stroke-width': 1.2 });
    label(corner[0] + 46, corner[1] - 58, ['esquina', 'está sobre la superficie']);
    // atractor (el seleccionado): etiqueta arriba, fuera de la textura
    el('line', { x1: attr[0], y1: attr[1] - 14, x2: attr[0], y2: 64, stroke: A, 'stroke-width': 1.2 });
    label(attr[0] + 10, 40, ['atractor', 'curva el borde sin tocarlo']);
  });
}
