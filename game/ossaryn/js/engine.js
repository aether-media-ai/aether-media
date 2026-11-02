// Renderer, fixed 3/4 orthographic camera, plate <-> ground mapping, plates, occluders, greybox.
import * as THREE from 'three';
import { CAM, PLATE_W, PLATE_H, PPU } from './config.js';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Engine {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
    const y = THREE.MathUtils.degToRad(CAM.yawDeg), e = THREE.MathUtils.degToRad(CAM.elevDeg);
    this.dir = V(Math.sin(y) * Math.cos(e), Math.sin(e), Math.cos(y) * Math.cos(e)); // ground -> camera
    this.camera.position.copy(this.dir).multiplyScalar(400);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
    const m = this.camera.matrixWorld.elements;
    this.r = V(m[0], m[1], m[2]).normalize();
    this.u = V(m[4], m[5], m[6]).normalize();
    this.f = this.dir.clone().negate();
    this.viewH = (PLATE_H * CAM.viewFrac) / PPU; // world units visible vertically
    this.hemi = new THREE.HemisphereLight(0xbcd0e0, 0x2a2018, 1.1);
    this.sun = new THREE.DirectionalLight(0xffe2b8, 1.4);
    this.sun.position.set(-6, 14, 4);
    this.scene.add(this.hemi, this.sun);
    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);
    this.target = V();
    this.shake = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
    const hh = this.viewH / 2, hw = hh * this.aspect;
    Object.assign(this.camera, { left: -hw, right: hw, top: hh, bottom: -hh });
    this.camera.updateProjectionMatrix();
  }
  // plate pixel -> ground point (y = 0)
  p2g(px, py) {
    const P = this.r.clone().multiplyScalar((px - PLATE_W / 2) / PPU).addScaledVector(this.u, (PLATE_H / 2 - py) / PPU);
    const t = -P.y / this.f.y;
    return P.addScaledVector(this.f, t);
  }
  g2p(G) { return [PLATE_W / 2 + G.dot(this.r) * PPU, PLATE_H / 2 - G.dot(this.u) * PPU]; }
  // screen pixel -> ground
  s2g(sx, sy) {
    const nx = (sx / innerWidth) * 2 - 1, ny = -(sy / innerHeight) * 2 + 1;
    const a = nx * (this.camera.right), b = ny * (this.camera.top);
    const cx = this.camPlate[0] + a * PPU, cy = this.camPlate[1] - b * PPU;
    return this.p2g(cx, cy);
  }
  g2s(G) {
    const v = G.clone().project(this.camera);
    return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
  }
  follow(G, dt, snap = false) {
    // clamp view inside the plate (in plate pixels)
    let [px, py] = this.g2p(G);
    const hw = this.camera.right * PPU, hh = this.camera.top * PPU;
    px = Math.min(Math.max(px, hw), PLATE_W - hw);
    py = Math.min(Math.max(py, hh), PLATE_H - hh);
    if (PLATE_W < 2 * hw) px = PLATE_W / 2;
    if (!this.camPlate || snap) this.camPlate = [px, py];
    const k = 1 - Math.exp(-dt * 6);
    this.camPlate[0] += (px - this.camPlate[0]) * k;
    this.camPlate[1] += (py - this.camPlate[1]) * k;
    let [cx, cy] = this.camPlate;
    if (this.shake > 0) { cx += (Math.random() - .5) * this.shake * 30; cy += (Math.random() - .5) * this.shake * 30; this.shake = Math.max(0, this.shake - dt * 2.5); }
    const T = this.p2g(cx, cy);
    this.placeLights(T);
    this.camera.position.copy(T).addScaledVector(this.dir, 400);
    this.camera.lookAt(T);
    this.camera.updateMatrixWorld();
  }
  setLights(l = {}) {
    this.hemi.color.setHex(l.sky ?? 0xbcd0e0); this.hemi.groundColor.setHex(l.ground ?? 0x2a2018); this.hemi.intensity = l.hemi ?? 1.1;
    this.sun.color.setHex(l.key ?? 0xffe2b8); this.sun.intensity = l.keyI ?? 1.4;
    if (!this.rim) { // cool back light: separates the low-poly figures from the dark painted plate
      this.rim = new THREE.DirectionalLight(0xffffff, 1); this.scene.add(this.rim, this.rim.target);
    }
    this.rim.color.setHex(l.rim ?? 0x9fd8d0); this.rim.intensity = l.rimI ?? 1.2;
  }
  // light rigs are placed relative to the camera so key/rim stay consistent while it scrolls
  placeLights(T) {
    this.sun.position.copy(T).add(V(-6, 14, 4)); this.sun.target.position.copy(T); this.sun.target.updateMatrixWorld();
    if (this.rim) { this.rim.position.copy(T).addScaledVector(this.dir, -10).add(V(0, 8, 0)); this.rim.target.position.copy(T); this.rim.target.updateMatrixWorld(); }
  }
  // flat additive ring lying on the ground whose projection matches an ellipse painted on the plate
  plateRing(cx, cy, rx0, ry0, rx1, ry1, color, opacity, n = 64) {
    const pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const A = this.p2g(cx + rx0 * c, cy + ry0 * s), B = this.p2g(cx + rx1 * c, cy + ry1 * s);
      pos.push(A.x, 0.04, A.z, B.x, 0.04, B.z);
      if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    return new THREE.Mesh(geo, mat);
  }
  clearLevel() {
    for (const c of [...this.levelGroup.children]) {
      this.levelGroup.remove(c);
      c.traverse(o => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach(mm => { mm.map?.dispose(); mm.alphaMap?.dispose(); mm.dispose(); }); });
    }
  }
  // camera-facing quad that covers the whole plate, passing through ground point G (for depth)
  plateQuad(material, G = null) {
    const geo = new THREE.PlaneGeometry(PLATE_W / PPU, PLATE_H / PPU);
    const mesh = new THREE.Mesh(geo, material);
    mesh.quaternion.copy(this.camera.quaternion);
    if (G) mesh.position.copy(G).addScaledVector(this.r, -G.dot(this.r)).addScaledVector(this.u, -G.dot(this.u));
    this.levelGroup.add(mesh);
    return mesh;
  }
  setPlate(texture, occluders) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.plateMat = new THREE.MeshBasicMaterial({ map: texture, depthTest: false, depthWrite: false });
    const m = this.plateQuad(this.plateMat);
    m.renderOrder = -100;
    // occluders: same plate, masked to a polygon, placed at the depth of its foot line
    for (const oc of occluders || []) {
      const cv = document.createElement('canvas'); cv.width = PLATE_W / 4; cv.height = PLATE_H / 4;
      const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
      g.fillStyle = '#fff'; g.beginPath(); oc.poly.forEach(([x, y], i) => i ? g.lineTo(x / 4, y / 4) : g.moveTo(x / 4, y / 4)); g.closePath(); g.fill();
      const am = new THREE.CanvasTexture(cv);
      const mat = new THREE.MeshBasicMaterial({ map: texture, alphaMap: am, transparent: true, depthWrite: false });
      const cx = oc.poly.reduce((s, p) => s + p[0], 0) / oc.poly.length;
      this.plateQuad(mat, this.p2g(cx, oc.base)).renderOrder = 10;
    }
  }
}

// ---------- placeholder plate painter (used when the real plate image is missing) ----------
export function paintPlaceholderPlate(engine, L) {
  const S = 0.5, cv = document.createElement('canvas');
  cv.width = PLATE_W * S; cv.height = PLATE_H * S;
  const g = cv.getContext('2d');
  g.scale(S, S);
  // void / Hollow: haze at top, black depth below
  const bg = g.createLinearGradient(0, 0, 0, PLATE_H);
  bg.addColorStop(0, '#5d6a72'); bg.addColorStop(0.25, '#2b3238'); bg.addColorStop(0.6, '#12161a'); bg.addColorStop(1, '#07090b');
  g.fillStyle = bg; g.fillRect(0, 0, PLATE_W, PLATE_H);
  // distant opposite wall of the Hollow: towers with amber window slots
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const x = rnd() * PLATE_W, w = 20 + rnd() * 60, top = 120 + rnd() * 380, h = 300 + rnd() * 900;
    g.fillStyle = `rgba(${18 + rnd() * 14},${22 + rnd() * 12},${26 + rnd() * 10},0.9)`; g.fillRect(x, top, w, h);
    g.fillStyle = 'rgba(70,95,90,0.5)'; for (let k = 0; k < 4; k++) g.fillRect(x + 3 + k * (w / 4), top - 20, 3, h);
    for (let k = 0; k < 6; k++) if (rnd() < 0.55) { g.fillStyle = `rgba(255,${160 + rnd() * 50},80,${0.35 + rnd() * 0.5})`; g.fillRect(x + rnd() * w, top + rnd() * h * 0.6, 3, 6); }
  }
  // haze bands
  for (let i = 0; i < 5; i++) { const y = 300 + i * 220, hg = g.createLinearGradient(0, y - 120, 0, y + 120); hg.addColorStop(0, 'rgba(150,165,170,0)'); hg.addColorStop(.5, 'rgba(150,165,170,0.10)'); hg.addColorStop(1, 'rgba(150,165,170,0)'); g.fillStyle = hg; g.fillRect(0, y - 120, PLATE_W, 240); }
  if (L.props?.ring) { // Warden Ring far below
    const [rx, ry] = L.props.ring; g.save(); g.translate(rx, ry); g.scale(1, 0.32);
    g.strokeStyle = '#2c2a24'; g.lineWidth = 70; g.beginPath(); g.arc(0, 0, 520, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(255,236,180,0.85)'; g.lineWidth = 5; for (const rr of [490, 520, 552]) { g.beginPath(); g.arc(0, 0, rr, 0, 7); g.stroke(); }
    g.restore();
  }
  // walkable terrace: basalt with projected 1.5 m flagstone grid
  const path = (polys) => { g.beginPath(); for (const poly of polys) poly.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };
  // underside / cliff thickness
  g.save(); g.translate(0, 70); path(L.walk); g.fillStyle = '#15130f'; g.fill(); g.restore();
  path(L.walk); g.fillStyle = '#2a2b2d'; g.fill();
  g.save(); path(L.walk); g.clip();
  const fl = g.createLinearGradient(0, 400, 0, 1400); fl.addColorStop(0, 'rgba(255,190,120,0.06)'); fl.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = fl; g.fillRect(0, 0, PLATE_W, PLATE_H);
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 3;
  for (let a = -40; a <= 40; a += 1.5) {
    for (const axis of [0, 1]) {
      g.beginPath();
      for (let b = -40; b <= 40; b += 2) {
        const G = axis ? V(a, 0, b) : V(b, 0, a); const [x, y] = engine.g2p(G);
        b === -40 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '255,255,255' : '0,0,0'},${rnd() * 0.06})`; g.fillRect(rnd() * PLATE_W, rnd() * PLATE_H, 6 + rnd() * 30, 3 + rnd() * 12); }
  if (L.props?.channel) { // turquoise water channel with moss
    const [[x0, y0], [x1, y1]] = L.props.channel; g.strokeStyle = 'rgba(40,190,170,0.55)'; g.lineWidth = 46; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = 'rgba(120,255,225,0.5)'; g.lineWidth = 6; g.stroke();
  }
  g.restore();
  path(L.walk); g.strokeStyle = '#8a6a3a'; g.lineWidth = 6; g.stroke(); // bronze lip
  for (const b of L.blockers || []) { // the well
    path([b]); const [cx, cy] = b.reduce((s, p) => [s[0] + p[0] / b.length, s[1] + p[1] / b.length], [0, 0]);
    const wg = g.createRadialGradient(cx, cy, 10, cx, cy, 260); wg.addColorStop(0, '#fffbe8'); wg.addColorStop(0.35, '#e9cf8a'); wg.addColorStop(1, '#2a2416');
    g.fillStyle = wg; g.fill(); g.strokeStyle = '#a07a3a'; g.lineWidth = 14; g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = '28px monospace'; g.fillText(`PLACEHOLDER PLATE: ${L.name}`, 40, PLATE_H - 40);
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

// ---------- greybox 3D props, only with the placeholder plate ----------
const basalt = new THREE.MeshStandardMaterial({ color: 0x1d1e21, roughness: 0.85, metalness: 0.1 });
const bronze = new THREE.MeshStandardMaterial({ color: 0x6f5533, roughness: 0.45, metalness: 0.8, emissive: 0x0d1410 });
const verd = new THREE.MeshStandardMaterial({ color: 0x3f6b5e, roughness: 0.6, metalness: 0.6 });
export function buildGreybox(engine, L) {
  const grp = new THREE.Group();
  for (const [px, py] of L.props?.towers || []) {
    const G = engine.p2g(px, py); const h = 9 + (px * 7 % 5);
    const t = new THREE.Mesh(new THREE.BoxGeometry(2.2, h, 2.2), basalt); t.position.set(G.x, h / 2 - 2, G.z); t.rotation.y = Math.PI / 4; grp.add(t);
    for (let k = -2; k <= 2; k++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, h * 0.9, 0.5), k % 2 ? verd : bronze); fin.position.set(k * 0.42, 0, 1.15); t.add(fin); }
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.1), new THREE.MeshBasicMaterial({ color: 0xffb35c })); win.position.set(0.6, 1.5, 1.16); t.add(win);
  }
  if (L.props?.railFrom) {
    const A = engine.p2g(...L.props.railFrom), B = engine.p2g(...L.props.railTo), n = 22;
    for (let i = 0; i <= n; i++) { const P = A.clone().lerp(B, i / n); const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), bronze); post.position.set(P.x, 0.5, P.z); grp.add(post); }
    const len = A.distanceTo(B), bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), bronze);
    bar.position.copy(A).lerp(B, .5).setY(1.0); bar.rotation.y = -Math.atan2(B.z - A.z, B.x - A.x); grp.add(bar);
  }
  engine.levelGroup.add(grp);
}
