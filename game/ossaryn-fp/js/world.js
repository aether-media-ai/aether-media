// Builds the Ossaryn mid-terrace slice: real geometry near the player, painted vista + hazy dome far away.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BR, archY, LANTERNS, WELL, SHARD, PICKUPS } from './layout.js';

const TL = new THREE.TextureLoader();
export const loading = [];
function tex(p, srgb = true) {
  const t = TL.load(p, undefined, undefined, () => console.warn('missing', p));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const rnd = (() => { let s = 1234567; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const R = (a, b) => a + rnd() * (b - a);

// ---------- canvas textures ----------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const glowTex = canvasTex(128, 128, (g, w) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,0.55)'); r.addColorStop(0.5, 'rgba(255,255,255,0.12)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
const shadowTex = canvasTex(64, 64, (g, w) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,0.75)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w);
});
function noiseCanvas(size, oct = 5, seed = 7) {
  // tileable value noise (fbm)
  const out = new Float32Array(size * size);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const n = 4 << o, grid = []; for (let i = 0; i < n * n; i++) grid.push(Math.abs(Math.sin((i + 1) * 12.9898 * (seed + o) + o * 78.233) * 43758.5453) % 1);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = x / size * n, fy = y / size * n, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const g = (a, b) => grid[((b % n) * n) + (a % n)];
      const v = (g(ix, iy) * (1 - sx) + g(ix + 1, iy) * sx) * (1 - sy) + (g(ix, iy + 1) * (1 - sx) + g(ix + 1, iy + 1) * sx) * sy;
      out[y * size + x] += v * amp;
    }
    tot += amp; amp *= 0.55;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
const mistTex = (() => {
  const S = 256, n = noiseCanvas(S, 5, 3);
  const t = canvasTex(S, S, (g) => {
    const d = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) { const v = Math.max(0, Math.min(1, (n[i] - 0.38) * 2.4)); d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = 255; d.data[i * 4 + 3] = v * v * 255; }
    g.putImageData(d, 0, 0);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
})();
const edgeTex = (() => { const t = canvasTex(128, 128, (g, w) => { const r = g.createRadialGradient(64, 64, 8, 64, 64, 64); r.addColorStop(0, '#fff'); r.addColorStop(0.55, '#bbb'); r.addColorStop(1, '#000'); g.fillStyle = r; g.fillRect(0, 0, w, w); }, false); return t; })();
const rayTex = canvasTex(64, 256, (g, w, h) => {
  const lg = g.createLinearGradient(0, 0, w, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = lg; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.15, 'rgba(0,0,0,1)'); v.addColorStop(0.7, 'rgba(0,0,0,0.5)'); v.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = v; g.fillRect(0, 0, w, h);
});

// ---------- geometry helpers (all merged per material at the end) ----------
const BUCKET = {};
export const COLL = [];   // world AABBs {x0,x1,z0,z1} of visible things that reach into walkable space (pilasters, frames, posts)
function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * t; }
function put(key, geo) { (BUCKET[key] ||= []).push(geo); }
function boxGeo(w, h, d, tile = 3) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile); }
  return g;
}
// axis-aligned box from min/max corners
function B(key, x0, x1, y0, y1, z0, z1, tile = 3, coll = false) {
  if (coll) COLL.push({ x0, x1, z0, z1 });
  const g = boxGeo(x1 - x0, y1 - y0, z1 - z0, tile); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); put(key, g); return g;
}
function cyl(key, r0, r1, h, seg, tile, m) {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1, false), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * Math.max(r0, r1) / tile, uv.getY(i) * h / tile);
  g.applyMatrix4(m); put(key, g);
}
// windows: emissive quads with per-vertex HDR colour
function win(geoList, m, w, h, col) {
  const g = new THREE.PlaneGeometry(w, h); g.applyMatrix4(m);
  const c = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) { c[i] = col[0]; c[i + 1] = col[1]; c[i + 2] = col[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv'); g.deleteAttribute('normal'); geoList.push(g);
}
const WIN = [], WIN_FAR = [];
const amber = k => [2.6 * k, 1.25 * k, 0.42 * k];

// A facade on a wall. Local frame: u along wall, v up (world y), w = outward normal. origin = point on wall at y=0.
function facade(origin, uDir, wDir, u0, u1, opts = {}) {
  const { bay = 7, top = 40, bottom = -40, pipes = true, windows = 1, far = false, ground = 0, collide = false } = opts;
  const O = new THREE.Vector3(...origin), U = new THREE.Vector3(...uDir).normalize(), Wn = new THREE.Vector3(...wDir).normalize(), Vup = new THREE.Vector3(0, 1, 0);
  const basis = new THREE.Matrix4().makeBasis(U, Vup, Wn);
  const M = (u, v, w) => new THREE.Matrix4().copy(basis).setPosition(O.clone().addScaledVector(U, u).addScaledVector(Vup, v).addScaledVector(Wn, w));
  const LB = (key, a0, a1, v0, v1, w0, w1, tile = 3) => {
    const g = boxGeo(a1 - a0, v1 - v0, w1 - w0, tile); g.applyMatrix4(M((a0 + a1) / 2, (v0 + v1) / 2, (w0 + w1) / 2)); put(key, g);
    if (collide && w1 > 0.1 && v0 < ground + 2.2 && v1 > ground) {   // reaches into the walkway at body height -> collision box
      const ps = [[a0, w0], [a1, w0], [a0, w1], [a1, w1]].map(([a, w]) => O.clone().addScaledVector(U, a).addScaledVector(Wn, w));
      COLL.push({ x0: Math.min(...ps.map(p => p.x)), x1: Math.max(...ps.map(p => p.x)), z0: Math.min(...ps.map(p => p.z)), z1: Math.max(...ps.map(p => p.z)) });
    }
  };
  const wl = far ? WIN_FAR : WIN;
  for (let u = u0; u < u1 - 0.1; u += bay) {
    const c = u + bay / 2;
    // pilasters
    LB('basalt', u - 0.55, u + 0.55, bottom, top, 0, 0.75);
    LB('basalt', u - 0.75, u + 0.75, ground + 4.2, ground + 4.9, 0, 0.95);   // cornice knot
    // cornice bands
    LB('basalt', u, u + bay, ground + 4.2, ground + 4.7, 0, 0.45);
    LB('basalt', u, u + bay, ground + 11.5, ground + 12.0, 0, 0.4);
    if (!far) {
      // ground-level arched recess: frame + glowing glass, deep shadowed inset
      LB('basalt', c - 1.5, c - 1.1, ground, ground + 3.4, 0, 0.35);
      LB('basalt', c + 1.1, c + 1.5, ground, ground + 3.4, 0, 0.35);
      LB('basalt', c - 1.5, c + 1.5, ground + 3.4, ground + 3.8, 0, 0.35);
      LB('dark', c - 1.1, c + 1.1, ground, ground + 3.4, 0, 0.05);
      if (rnd() < 0.55 * windows) win(wl, M(c, ground + 1.9, 0.07), 0.9, 1.5, amber(R(0.35, 0.8)));
      // bronze sill + small balcony ledge above
      LB('bronze', c - 1.6, c + 1.6, ground + 3.8, ground + 3.95, 0, 0.5, 1.2);
    }
    // upper windows: narrow slots
    for (let lv = 0; lv < 6; lv++) {
      const v = ground + 6 + lv * 5.6; if (v > top - 3) break;
      for (const du of [-1.6, 1.6]) {
        const lit = rnd() < 0.26 * windows;
        LB('dark', c + du - 0.35, c + du + 0.35, v, v + 2.2, 0, 0.03);
        if (lit) win(wl, M(c + du, v + 1.1, 0.04), 0.5, 1.9, amber(R(0.5, 1.4)));
      }
    }
    // lower (below terrace level) slots, seen from the bridge
    for (let lv = 1; lv < 6; lv++) {
      const v = ground - 6 - lv * 6.5; if (v < bottom + 4) break;
      if (rnd() < 0.5 * windows) win(wl, M(c + R(-2, 2), v, 0.05), 0.45, 1.6, amber(R(0.4, 1.2)));
    }
    if (pipes) {
      // ribbed bronze organ-pipe fins: a cluster of half-buried pipes, uneven heights, pointed caps
      const n = 5 + Math.floor(rnd() * 4), base = ground + 12.2, span = 0.46;
      for (let i = 0; i < n; i++) {
        const pu = c + (i - (n - 1) / 2) * span, r = 0.2 + rnd() * 0.06;
        const h = 10 + Math.sin(i / (n - 1) * Math.PI) * 16 + R(0, 7);
        const mm = M(pu, base + h / 2, 0.18);
        cyl('bronze', r, r, h, 10, 1.2, mm);
        const cone = new THREE.ConeGeometry(r, 1.4 + r * 4, 10); cone.applyMatrix4(M(pu, base + h + 0.7 + r * 2, 0.18)); put('bronze', cone);
        // descending pipes below the cornice (organ-pipe "beard")
        if (i % 2 === 0) { const h2 = 3 + R(0, 5); cyl('bronze', r * 0.8, r * 0.8, h2, 8, 1.2, M(pu, ground + 4.2 - h2 / 2 - 0.1, 0.2)); }
      }
      // bronze band at the foot of the cluster
      LB('bronze', c - n * span / 2 - 0.2, c + n * span / 2 + 0.2, base - 0.35, base + 0.1, 0, 0.55, 1.2);
      // deep pipes below the terrace
      if (bottom < -20) for (let i = 0; i < 4; i++) { const h = R(12, 26); cyl('bronze', 0.24, 0.24, h, 8, 1.2, M(c + (i - 1.5) * 0.5, ground - 3 - h / 2, 0.2)); }
    }
  }
}


// A tapered, tiered basalt spire-tower with ribbed fins and organ-pipe crowns (mid-ground; never reachable)
function gothicTower(x, z, r, top) {
  const tiers = 3 + Math.floor(rnd() * 2); let y0 = -320, rr = r;
  const tierTop = []; for (let i = 0; i < tiers; i++) tierTop.push(-320 + (top + 320) * (i + 1) / tiers);
  for (let i = 0; i < tiers; i++) {
    const y1 = tierTop[i], h = y1 - y0, r1 = rr * 0.86;
    cyl('basalt', r1, rr, h, 8, 8, new THREE.Matrix4().makeRotationY(Math.PI / 8).setPosition(x, y0 + h / 2, z));
    cyl('basalt', r1 * 1.08, r1 * 1.08, 1.6, 8, 4, new THREE.Matrix4().makeRotationY(Math.PI / 8).setPosition(x, y1 - 0.8, z));   // cornice ring
    // vertical rib fins around the tier, rising past its top at staggered heights
    const nf = 16;
    for (let k = 0; k < nf; k++) {
      const a = k / nf * Math.PI * 2, rib = rr * 0.98, fh = h + (i === tiers - 1 ? R(6, 30) : R(2, 9)), fw = 0.35 + rr * 0.025;
      const g = boxGeo(fw, fh, rr * 0.12, 4); g.applyMatrix4(new THREE.Matrix4().makeRotationY(-a + Math.PI / 2).setPosition(x + Math.cos(a) * rib, y0 + fh / 2, z + Math.sin(a) * rib)); put(k % 3 === 0 ? 'bronze' : 'basalt', g);
      const c = new THREE.ConeGeometry(fw * 0.9, fw * 6, 6); c.translate(x + Math.cos(a) * rib, y0 + fh + fw * 3, z + Math.sin(a) * rib); put(k % 3 === 0 ? 'bronze' : 'basalt', c);
    }
    // sparse, clustered windows between ribs (no office grid)
    for (let k = 0; k < nf; k++) {
      if (rnd() > 0.45) continue;
      const a = (k + 0.5) / nf * Math.PI * 2, wr = rr * 0.93 + 0.1;
      const cy = R(Math.max(y0, -60), y1 - 4), n = 1 + Math.floor(rnd() * 4);
      for (let j = 0; j < n; j++) {
        const m = new THREE.Matrix4().makeRotationY(-a + Math.PI / 2).setPosition(x + Math.cos(a) * wr, cy - j * R(2.5, 5), z + Math.sin(a) * wr);
        win(WIN_FAR, m, R(0.5, 0.9), R(1.4, 3.2), amber(R(0.5, 1.6)));
      }
    }
    y0 = y1; rr = r1 * 0.82;
  }
  // crown: organ-pipe cluster + central needle
  for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, d = R(0, rr * 0.8), h = R(10, 45), pr = R(0.5, 1.4); cyl('bronze', pr, pr, h, 10, 3, new THREE.Matrix4().setPosition(x + Math.cos(a) * d, y0 + h / 2, z + Math.sin(a) * d)); const c = new THREE.ConeGeometry(pr, pr * 6, 10); c.translate(x + Math.cos(a) * d, y0 + h + pr * 3, z + Math.sin(a) * d); put('bronze', c); }
  const nh = R(30, 70); const nd = new THREE.ConeGeometry(rr * 0.35, nh, 8); nd.translate(x, y0 + nh / 2, z); put('basalt', nd);
}

function lanternPostGeo(group, x, y, z, bronzeMat, glassMat) {
  // a bronze post with a crook and a hanging round frosted lantern
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 2.7, 8), bronzeMat); post.position.set(x, y + 1.35, z); group.add(post);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.32, 0.25, 10), bronzeMat); foot.position.set(x, y + 0.12, z); group.add(foot);
  const arm = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 14, Math.PI), bronzeMat); arm.position.set(x, y + 2.7, z); arm.rotation.set(0, Math.PI / 2, 0); group.add(arm);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.34, 8), glassMat); glass.position.set(x, y + 2.22, z); group.add(glass);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const bar = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.4, 0.025), bronzeMat); bar.position.set(x + Math.cos(a) * 0.16, y + 2.22, z + Math.sin(a) * 0.16); group.add(bar); }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.07, 10), bronzeMat); base.position.set(x, y + 2.03, z); group.add(base);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.22, 10), bronzeMat); cap.position.set(x, y + 2.5, z); group.add(cap);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 16), bronzeMat); ring.position.set(x, y + 2.39, z); ring.rotation.x = Math.PI / 2; group.add(ring);
  return glass;
}

export function buildWorld(scene, renderer, Q) {
  const M = {};
  const basaltMap = tex('assets/tex/basalt.jpg'), basaltN = tex('assets/tex/basalt_n.jpg', false), basaltR = tex('assets/tex/basalt_r.jpg', false);
  const floorMap = tex('assets/tex/floor.jpg'), floorN = tex('assets/tex/floor_n.jpg', false), floorR = tex('assets/tex/floor_r.jpg', false);
  const bronzeMap = tex('assets/tex/bronze.jpg'), bronzeN = tex('assets/tex/bronze_n.jpg', false), bronzeR = tex('assets/tex/bronze_r.jpg', false);
  M.basalt = new THREE.MeshStandardMaterial({ map: basaltMap, normalMap: basaltN, roughnessMap: basaltR, roughness: 1, metalness: 0.08, color: 0xd2d6da, normalScale: new THREE.Vector2(1.5, 1.5) });
  M.floor = new THREE.MeshStandardMaterial({ map: floorMap, normalMap: floorN, roughnessMap: floorR, roughness: 1, metalness: 0.05, color: 0xd8cfc0, normalScale: new THREE.Vector2(1.2, 1.2) });
  M.bronze = new THREE.MeshStandardMaterial({ map: bronzeMap, normalMap: bronzeN, roughnessMap: bronzeR, roughness: 1, metalness: 0.85, color: 0xffc58a, normalScale: new THREE.Vector2(0.8, 0.8) });
  // the source photos are very dark (basalt ~sRGB 30): lift albedo in linear space to a plausible ~0.06-0.09
  M.basalt.color.setRGB(3.1, 3.25, 3.45); M.floor.color.setRGB(2.6, 2.45, 2.2);
  M.dark = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.95, metalness: 0 });
  M.win = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  M.winFar = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });

  // ---------- environment map for metals: dark teal sky, cold opening above, warm amber blobs at the horizon ----------
  {
    const es = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec3 vP; void main(){ float y=vP.y; vec3 c=mix(vec3(0.02,0.025,0.03), vec3(0.09,0.12,0.14), smoothstep(-0.4,0.3,y)); c+=vec3(0.6,0.7,0.75)*pow(max(y,0.),6.); gl_FragColor=vec4(c,1.); }'
    }));
    es.add(sky);
    for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.4, 0.45) })); const a = i / 9 * Math.PI * 2; s.position.set(Math.cos(a) * 40, R(-12, 6), Math.sin(a) * 40); es.add(s); }
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(es, 0.03).texture; scene.environmentIntensity = 0.85; pm.dispose();
  }

  // ---------- sky dome ----------
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color(0xb3c4c8) }, uHor: { value: new THREE.Color(0x3d4c52) }, uBot: { value: new THREE.Color(0x0b1013) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uTop,uHor,uBot; varying vec3 vP;
      void main(){ float y=vP.y; vec3 c = mix(uBot,uHor,smoothstep(-0.35,0.05,y)); c = mix(c, uTop, smoothstep(0.25,0.95,y));
        float hole = smoothstep(0.86,0.99,y); c += vec3(0.55,0.62,0.66)*hole*1.2; gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  dome.renderOrder = -10; scene.add(dome);

  // ---------- painted vista on an inner cylinder (distant city across the void) ----------
  const vt = tex('assets/env/vista.jpg'); vt.wrapS = THREE.MirroredRepeatWrapping; vt.wrapT = THREE.ClampToEdgeWrapping; vt.anisotropy = 4;
  const VR = 480, VY0 = -330, VY1 = 210;
  const vista = new THREE.Mesh(new THREE.CylinderGeometry(VR, VR, VY1 - VY0, 96, 1, true), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, transparent: true,
    uniforms: { map: { value: vt }, uRep: { value: Math.PI }, uHaze: { value: new THREE.Color(0x3a4a50) }, uGain: { value: 1.12 }, uHazeAmt: { value: 0.24 }, uTop: { value: new THREE.Color(0x5d6e74) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform sampler2D map; uniform float uRep,uGain,uHazeAmt; uniform vec3 uHaze,uTop; varying vec2 vUv;
      void main(){ vec2 uv = vec2(vUv.x*uRep*2.0, vUv.y); vec3 c = texture2D(map, uv).rgb*uGain;
        c = mix(c, uHaze, uHazeAmt + 0.45*smoothstep(0.45,0.0,vUv.y));      // deeper = hazier
        float topFade = smoothstep(1.0,0.72,vUv.y); c = mix(uTop, c, 0.35 + 0.65 * topFade);
        gl_FragColor = vec4(c, topFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  vista.position.set(43, (VY0 + VY1) / 2, -40); vista.rotation.y = 0.35; vista.renderOrder = -9; scene.add(vista);

  // ---------- west cliff + terrace ----------
  B('basalt', -90, -4.5, -320, 170, -430, 320, 6);
  facade([-4.5, 0, 6.5], [0, 0, -1], [1, 0, 0], -119, 381, { top: 70, bottom: -60, collide: true });   // u = distance along -z from z=6.5
  // terrace slab + plaza slab (floor), underside corbels
  B('floor', -4.5, 4.9, -1.4, 0, -74.6, 6.5, 2.2);
  B('floor', 4.9, 11.6, -1.4, 0, -74.6, -55.4, 2.2);
  for (let z = 4; z > -72; z -= 7) { const g = boxGeo(1.2, 5, 4.6, 3); g.applyMatrix4(new THREE.Matrix4().makeRotationZ(-0.5)); g.translate(2.6, -3.0, z); put('basalt', g); }
  for (let z = 2; z > -72; z -= 3.5) B('bronze', 4.6, 4.95, -1.6, -1.2, z - 0.15, z + 0.15, 1);
  // parapets: low basalt wall + capstone + posts
  const parapet = (x0, x1, z0, z1) => { B('basalt', x0, x1, 0, 1.0, z0, z1, 2.2); const ex = x1 - x0 > z1 - z0 ? 0 : 0.1, ez = ex ? 0 : 0.1; B('basalt', x0 - ex, x1 + ex, 1.0, 1.16, z0 - ez, z1 + ez, 1.5); };
  parapet(4.3, 4.9, -56, 6.5);
  parapet(4.3, 11.6, -56, -55.4);
  parapet(11, 11.6, -74.6, -67.5); parapet(11, 11.6, -62.5, -55.4);
  for (let z = 6; z > -56; z -= 7) B('basalt', 4.2, 5.0, 0, 1.55, z - 0.4, z + 0.4, 2, true);
  // the closed gate behind the start
  B('basalt', -4.5, 4.9, 0, 9, 6.5, 9, 3);
  B('bronze', -2.2, 2.2, 0, 4.6, 6.4, 6.55, 1.2);
  B('basalt', -2.8, -2.2, 0, 5.2, 6.0, 6.6, 2, true); B('basalt', 2.2, 2.8, 0, 5.2, 6.0, 6.6, 2, true); B('basalt', -2.8, 2.8, 4.6, 5.4, 6.0, 6.6, 2);
  win(WIN, new THREE.Matrix4().makeRotationY(Math.PI).setPosition(0, 4.0, 6.38), 4.0, 0.25, amber(1.2));
  // end buttress tower at the plaza (wall face z=-74, faces +z)
  B('basalt', -4.5, 14, -120, 85, -96, -74, 4);
  facade([-4.5, 0, -74], [1, 0, 0], [0, 0, 1], 0, 18.5, { bay: 6.1, top: 80, bottom: -100, collide: true });
  facade([14, 0, -74], [0, 0, -1], [1, 0, 0], 0, 22, { bay: 7.3, top: 80, bottom: -100 });

  // ---------- the arched bridge ----------
  {
    const sh = new THREE.Shape(), N = 48;
    for (let i = 0; i <= N; i++) { const x = BR.x0 + (BR.x1 - BR.x0) * i / N; i ? sh.lineTo(x, archY(x)) : sh.moveTo(x, archY(x)); }
    for (let i = N; i >= 0; i--) { const x = BR.x0 + (BR.x1 - BR.x0) * i / N, s = Math.sin(Math.PI * i / N); sh.lineTo(x, -16 + 16.0 * Math.pow(s, 0.45)); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: BR.z1 - BR.z0, bevelEnabled: false, steps: 1 });
    g.translate(0, 0, BR.z0);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.4, uv.getY(i) / 2.4);
    // split groups: group 0 = side faces (basalt), group 1 = deck/underside (floor)
    const deck = new THREE.Mesh(g, [M.basalt, M.floor]); scene.add(deck);
    // railings that follow the arch
    const seg = 1.6;
    for (let x = BR.x0; x < BR.x1 - 0.01; x += seg) {
      const xa = x, xb = Math.min(x + seg, BR.x1), ya = archY(xa), yb = archY(xb), len = Math.hypot(xb - xa, yb - ya), ang = Math.atan2(yb - ya, xb - xa);
      for (const zc of [BR.z0 + BR.rail / 2, BR.z1 - BR.rail / 2]) {
        const gg = boxGeo(len + 0.02, 1.0, BR.rail, 2.2); gg.applyMatrix4(new THREE.Matrix4().makeRotationZ(ang)); gg.translate((xa + xb) / 2, (ya + yb) / 2 + 0.5, zc); put('basalt', gg);
        const cap = boxGeo(len + 0.02, 0.14, BR.rail + 0.16, 1.5); cap.applyMatrix4(new THREE.Matrix4().makeRotationZ(ang)); cap.translate((xa + xb) / 2, (ya + yb) / 2 + 1.07, zc); put('basalt', cap);
      }
    }
    // hanging bronze chains / lamps under the arch + piers into the mist
    for (let x = 16; x < 68; x += 6) { const y = -16 + 16 * Math.pow(Math.sin(Math.PI * (x - BR.x0) / (BR.x1 - BR.x0)), 0.45); B('bronze', x - 0.05, x + 0.05, y - 3, y, -65.05, -64.95, 1); win(WIN, new THREE.Matrix4().setPosition(x, y - 3.2, -61.9), 0.25, 0.35, amber(1.4)); win(WIN, new THREE.Matrix4().makeRotationY(Math.PI).setPosition(x, y - 3.2, -68.1), 0.25, 0.35, amber(1.4)); }
  }

  // ---------- east tower with the landing ----------
  B('basalt', 90, 130, -320, 58, -98, -32, 5);
  B('basalt', 74, 90, -320, -2, -84, -46, 5);
  B('floor', 69.4, 90, -2, 0, -80.6, -49.4, 2.2);
  for (let z = -78; z < -50; z += 6) { const g = boxGeo(1.2, 5, 3.6, 3); g.applyMatrix4(new THREE.Matrix4().makeRotationZ(0.5)); g.translate(72.4, -3.6, z); put('basalt', g); }
  parapet(69.4, 90, -80.6, -80); parapet(69.4, 90, -50, -49.4);
  parapet(69.4, 70, -80.6, -67.5); parapet(69.4, 70, -62.5, -49.4);
  facade([90, 0, -32], [0, 0, -1], [-1, 0, 0], 3.3, 66, { bay: 6.6, top: 56, bottom: -200, collide: true });
  facade([90, 0, -98], [1, 0, 0], [0, 0, -1], 0, 40, { bay: 8, top: 56, bottom: -200 });
  facade([130, 0, -32], [-1, 0, 0], [0, 0, 1], 0, 40, { bay: 8, top: 56, bottom: -200 });
  // tower crown: tall organ-pipe spires
  for (let i = 0; i < 16; i++) { const x = 92 + (i % 4) * 9 + R(-2, 2), z = -94 + Math.floor(i / 4) * 16 + R(-3, 3), h = R(18, 48), r = R(0.6, 1.6); cyl('bronze', r, r * 1.05, h, 12, 2, new THREE.Matrix4().setPosition(x, 58 + h / 2, z)); const c = new THREE.ConeGeometry(r, r * 6, 12); c.translate(x, 58 + h + r * 3, z); put('bronze', c); }
  // shard niche in the tower face
  B('basalt', 87.9, 89.3, 0, 1.0, -65.7, -64.3, 1.5); B('bronze', 87.8, 89.4, 1.0, 1.1, -65.8, -64.2, 1);

  // ---------- crates + flasks ----------
  B('dark', -4.3, -2.9, 0, 0.9, -32.3, -30.9); B('bronze', -4.35, -2.85, 0.88, 0.95, -32.35, -30.85, 1);
  B('dark', 8.0, 9.0, 0, 0.8, -73.5, -72.5); B('bronze', 7.95, 9.05, 0.78, 0.84, -73.55, -72.45, 1);
  B('dark', 72.5, 73.5, 0, 0.8, -79.5, -78.5); B('bronze', 72.45, 73.55, 0.78, 0.84, -79.55, -78.45, 1);

  // ---------- mid-ground spires + distant bridges (parallax + depth layers) ----------
  const spires = [[150, -170, 50], [200, 20, 40], [80, -230, 32], [30, 150, 36], [170, -320, 60], [120, 130, 44], [-20, -260, 30], [240, -110, 55], [-30, 200, 34], [260, 120, 60], [205, -235, 38], [-60, -120, 26]];
  for (const [x, z, w] of spires) gothicTower(x, z, w / 2, R(40, 130));
  const farBridge = (x0, x1, z, y, w = 7) => {
    const sh = new THREE.Shape(), N = 30; const ay = x => y + 4 * Math.sin(Math.PI * (x - x0) / (x1 - x0));
    for (let i = 0; i <= N; i++) { const x = x0 + (x1 - x0) * i / N; i ? sh.lineTo(x, ay(x)) : sh.moveTo(x, ay(x)); }
    for (let i = N; i >= 0; i--) { const x = x0 + (x1 - x0) * i / N, s = Math.sin(Math.PI * i / N); sh.lineTo(x, y - 24 + 22 * Math.pow(s, 0.45)); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false }); g.translate(0, 0, z); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 6, uv.getY(i) / 6); g.clearGroups(); put('basalt', g);
    for (let x = x0 + 4; x < x1; x += 4) win(WIN_FAR, new THREE.Matrix4().setPosition(x, ay(x) + 1.2, z + w + 0.05), 0.35, 0.5, amber(2.2));
  };
  farBridge(-4.5, 125, -205, -30); farBridge(-4.5, 175, 125, 14, 8); farBridge(60, 205, -330, -60, 9);

  // ---------- merge buckets ----------
  for (const k in BUCKET) {
    const g = mergeGeometries(BUCKET[k].map(x => x.index ? x.toNonIndexed() : x), false);
    if (k === 'basalt' || k === 'floor' || k === 'bronze') {   // baked tint: teal-green moss on up-facing ledges, colder/darker with depth, faint warm near amber windows is left to lights
      const P = g.attributes.position, N = g.attributes.normal, C = new Float32Array(P.count * 3);
      for (let i = 0; i < P.count; i++) {
        const y = P.getY(i), ny = N.getY(i), px = P.getX(i), pz = P.getZ(i);
        const n = 0.5 + 0.5 * Math.sin(px * 0.37 + pz * 0.21) * Math.sin(pz * 0.29 - y * 0.17);
        const moss = (k === 'basalt' ? smooth(0.55, 0.95, ny) * (0.35 + 0.65 * n) : k === 'floor' ? 0.18 * n * smooth(0.5, 0.9, ny) : 0) * 0.85;
        const deep = smooth(0, -120, y);
        let r = 1, gg = 1, b = 1;
        r = lerp(r, 0.38, moss); gg = lerp(gg, 0.78, moss); b = lerp(b, 0.62, moss);
        r *= 1 - 0.45 * deep; gg *= 1 - 0.35 * deep; b *= 1 - 0.25 * deep;
        C[i * 3] = r; C[i * 3 + 1] = gg; C[i * 3 + 2] = b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    }
    const mat = g.attributes.color && k !== 'dark' ? M[k].clone() : M[k]; if (mat !== M[k]) mat.vertexColors = true;
    const m = new THREE.Mesh(g, mat); scene.add(m);
  }
  const wm = new THREE.Mesh(mergeGeometries(WIN), M.win); scene.add(wm);
  const wf = new THREE.Mesh(mergeGeometries(WIN_FAR), M.winFar); scene.add(wf);

  // ---------- mist: layered noise sheets in the void + vertical curtains ----------
  const mists = [];
  const mistMat = (op, col) => new THREE.MeshBasicMaterial({ map: mistTex.clone(), transparent: true, opacity: op, depthWrite: false, color: col, side: THREE.DoubleSide });
  for (const [y, op, rep] of [[-9, 0.32, 6], [-22, 0.5, 5], [-45, 0.65, 4], [-80, 0.8, 3]]) {
    const m = mistMat(op, 0x8da3ad); m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; m.map.repeat.set(rep, rep); m.map.needsUpdate = true;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), m); p.rotation.x = -Math.PI / 2; p.position.set(43, y, -40); scene.add(p); mists.push({ m: p, sp: R(0.002, 0.006) * (rnd() < 0.5 ? -1 : 1) });
  }
  for (let i = 0; i < 14; i++) {
    const m = mistMat(R(0.1, 0.24), 0x9eb2bb); m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; m.map.repeat.set(2, 1); m.map.needsUpdate = true; m.alphaMap = edgeTex;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(R(80, 200), R(40, 90)), m); const a = R(0, Math.PI * 2), d = R(60, 260);
    p.position.set(43 + Math.cos(a) * d, R(-30, 10), -40 + Math.sin(a) * d); p.lookAt(43, p.position.y, -40); scene.add(p); mists.push({ m: p, sp: R(0.004, 0.01) });
  }
  // ---------- god rays from the sinkhole opening ----------
  const rays = [];
  for (let i = 0; i < 9; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(0.55, 0.66, 0.72), opacity: R(0.05, 0.11), fog: false, side: THREE.DoubleSide });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(R(14, 40), 420), mat);
    p.position.set(R(20, 170), 40, R(-260, 120)); p.rotation.z = R(-0.25, 0.1); scene.add(p); rays.push(p);
  }

  // ---------- mist particles near the player ----------
  const NP = Q.high ? 700 : 250, pp = new Float32Array(NP * 3);
  for (let i = 0; i < NP; i++) { pp[i * 3] = R(-30, 30); pp[i * 3 + 1] = R(-6, 10); pp[i * 3 + 2] = R(-30, 30); }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const motes = new THREE.Points(pg, new THREE.PointsMaterial({ map: glowTex, size: 2.6, transparent: true, opacity: 0.07, depthWrite: false, color: 0xaebfc7 }));
  motes.frustumCulled = false; scene.add(motes);
  const ND = 160, dp = new Float32Array(ND * 3); for (let i = 0; i < ND; i++) { dp[i * 3] = R(-6, 6); dp[i * 3 + 1] = R(-1, 4); dp[i * 3 + 2] = R(-6, 6); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ map: glowTex, size: 0.06, transparent: true, opacity: 0.6, depthWrite: false, color: 0xffc27a, blending: THREE.AdditiveBlending }));
  dust.frustumCulled = false; scene.add(dust);

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0x86a3ad, 0x1a130c, 0.7));
  const moon = new THREE.DirectionalLight(0xb4cbd4, 1.25); moon.position.set(30, 220, -60); scene.add(moon);
  const bounce = new THREE.DirectionalLight(0x7f9aa3, 0.95); bounce.position.set(200, 60, 30); scene.add(bounce);   // cold light off the misty void onto the cliff faces
  const bounce2 = new THREE.DirectionalLight(0x6d858d, 0.6); bounce2.position.set(-150, 40, -80); scene.add(bounce2);
  const accents = [];
  const accent = (x, y, z, inten, dist, col = 0xff9a4a) => { const l = new THREE.PointLight(col, inten, dist, 2); l.position.set(x, y, z); scene.add(l); accents.push(l); return l; };
  accent(0, 3.2, 5.2, 6, 12);            // gate lamp
  accent(-3.2, 2.2, -73, 5, 12);        // plaza corner window
  // ---------- objective lanterns ----------
  const glassOff = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.25, metalness: 0.1, emissive: 0x000000 });
  const posts = LANTERNS.map(L => {
    const grp = new THREE.Group(); scene.add(grp);
    const y = archY(L.pos[0]) * ((L.pos[1] < BR.z1 && L.pos[1] > BR.z0) ? 1 : 0);
    const gm = glassOff.clone();
    const glass = lanternPostGeo(grp, L.pos[0], y, L.pos[1], M.bronze, gm);
    const light = new THREE.PointLight(0xff9440, 0, 20, 2); light.position.copy(glass.position); scene.add(light);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa04a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); halo.scale.set(3.5, 3.5, 1); halo.position.copy(glass.position); scene.add(halo);
    const halo2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff8030, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); halo2.scale.set(11, 11, 1); halo2.position.copy(glass.position); scene.add(halo2);
    // faint cold ember so an unlit lantern is findable in the dark
    const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x7fb6d0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35 })); mark.scale.set(0.9, 0.9, 1); mark.position.copy(glass.position); scene.add(mark);
    return { ...L, y, glass, gm, light, halo, halo2, mark, lit: false };
  });
  // decorative bridge lanterns that chain-light when L3 is lit
  const deco = [];
  for (let x = 16; x < 68; x += 8) for (const z of [BR.z0 + 0.25, BR.z1 - 0.25]) {
    if (Math.abs(x - 40) < 3) continue;
    const y = archY(x) + 1.15, s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa04a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    s.scale.set(2.2, 2.2, 1); s.position.set(x, y + 0.45, z); scene.add(s);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.07, 0.06) })); gl.position.set(x, y + 0.45, z); scene.add(gl);
    const pst = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.5, 6), M.bronze); pst.position.set(x, y + 0.2, z); scene.add(pst);
    deco.push({ s, gl, x, on: 0 });
  }
  // ---------- shard ----------
  const shardMat = new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: new THREE.Color(1.5, 1.25, 0.8), roughness: 0.1, metalness: 0.2 });
  const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), shardMat); shard.scale.set(0.7, 1.5, 0.7); shard.position.set(SHARD.pos[0], 1.55, SHARD.pos[1]); scene.add(shard);
  const shardGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.42 })); shardGlow.scale.set(1.8, 1.8, 1); shardGlow.position.copy(shard.position); scene.add(shardGlow);
  const shardLight = new THREE.PointLight(0xdfe8ff, 3, 9, 2); shardLight.position.set(SHARD.pos[0] - 0.6, 1.7, SHARD.pos[1]); scene.add(shardLight);
  // ---------- the Well of Descent ----------
  const well = new THREE.Group(); well.position.set(WELL.pos[0], 0, WELL.pos[1]); scene.add(well);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(WELL.r, 0.28, 10, 48), M.bronze); rim.rotation.x = Math.PI / 2; rim.position.y = 0.22; well.add(rim);
  const rimStone = new THREE.Mesh(new THREE.CylinderGeometry(WELL.r + 0.55, WELL.r + 0.75, 0.3, 48, 1, true), M.basalt); rimStone.position.y = 0.12; well.add(rimStone);
  const shaftMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: false, uniforms: { uOpen: { value: 0 }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float uOpen,uT; varying vec2 vUv;
      void main(){ float d = 1.0 - vUv.y; vec3 stone = vec3(0.03,0.032,0.035)*(1.0-d);
        float bands = 0.5+0.5*sin(vUv.x*80.0)*0.3 + 0.2*sin(d*60.0 - uT*3.0);
        vec3 glow = vec3(3.2,2.7,1.8)*pow(d, 3.0)*(0.6+0.4*bands);
        gl_FragColor = vec4(stone + glow*mix(0.12,1.0,uOpen), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(WELL.r - 0.05, WELL.r - 0.05, 40, 40, 1, true), shaftMat); shaft.position.y = -20; well.add(shaft);
  // seal: bronze iris plates that slide out when opened
  const plates = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.CircleGeometry(WELL.r - 0.05, 12, i / 8 * Math.PI * 2, Math.PI * 2 / 8); const p = new THREE.Mesh(g, M.bronze); p.rotation.x = -Math.PI / 2; p.position.y = 0.05;
    const piv = new THREE.Group(); piv.add(p); well.add(piv); plates.push({ piv, a: i / 8 * Math.PI * 2 + Math.PI / 8 });
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(WELL.r * 0.8, WELL.r * 0.95, 60, 32, 1, true), new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(1.0, 0.9, 0.65), side: THREE.DoubleSide, fog: false }));
  beam.position.y = 28; well.add(beam);
  const wellLight = new THREE.PointLight(0xfff0c8, 0, 30, 1.6); wellLight.position.y = 1.0; well.add(wellLight);
  const sealGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0c8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.12 })); sealGlow.scale.set(7, 7, 1); sealGlow.position.y = 0.6; well.add(sealGlow);
  // ---------- pickups ----------
  const pickups = PICKUPS.map(p => {
    const col = p.kind === 'oil' ? 0xffb050 : 0xc0442a;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.3, 10), new THREE.MeshStandardMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(0.6), roughness: 0.2, metalness: 0.1 }));
    const top = 0.95; m.position.set(p.pos[0], top + 0.16, p.pos[1]); scene.add(m);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 })); s.scale.set(0.9, 0.9, 1); s.position.copy(m.position); scene.add(s);
    return { ...p, mesh: m, glow: s, taken: false };
  });

  return {
    M, posts, deco, shard, shardGlow, shardLight, well: { group: well, shaftMat, plates, beam, wellLight, sealGlow, open: 0 }, pickups, mists, rays, motes, dust, accents, vista, shadowTex,
    update(t, dt, cam) {
      for (const m of mists) { const mp = m.m.material.map; mp.offset.x += m.sp * dt; mp.offset.y += m.sp * 0.6 * dt; }
      for (const r of rays) { r.lookAt(cam.position.x, r.position.y, cam.position.z); }
      // particles recentre around the camera (wrap)
      const a = motes.geometry.attributes.position, cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
      for (let i = 0; i < a.count; i++) {
        let x = a.getX(i) + dt * 0.35, y = a.getY(i) + Math.sin(t * 0.3 + i) * dt * 0.05, z = a.getZ(i) + dt * 0.12;
        if (x - cx > 30) x -= 60; if (x - cx < -30) x += 60; if (z - cz > 30) z -= 60; if (z - cz < -30) z += 60; if (y - cy > 10) y -= 16; if (y - cy < -6) y += 16;
        const ddx = x - cx, ddy = y - cy, ddz = z - cz, dd = Math.hypot(ddx, ddy, ddz); if (dd < 5) { const k = 5 / (dd || 1); x = cx + ddx * k; y = cy + ddy * k; z = cz + ddz * k; }   // never let a big soft mote sit on the lens
        a.setXYZ(i, x, y, z);
      }
      a.needsUpdate = true;
      const d = dust.geometry.attributes.position;
      for (let i = 0; i < d.count; i++) {
        let x = d.getX(i) + Math.sin(t * 0.7 + i * 1.3) * dt * 0.15, y = d.getY(i) + Math.cos(t * 0.5 + i) * dt * 0.1, z = d.getZ(i) + Math.sin(t * 0.4 + i * 0.7) * dt * 0.15;
        if (x - cx > 6) x -= 12; if (x - cx < -6) x += 12; if (z - cz > 6) z -= 12; if (z - cz < -6) z += 12; if (y - cy > 2.5) y -= 4.5; if (y - cy < -2) y += 4.5;
        const ddx = x - cx, ddy = y - cy, ddz = z - cz, dd = Math.hypot(ddx, ddy, ddz); if (dd < 0.9) { const k = 0.9 / (dd || 1); x = cx + ddx * k; y = cy + ddy * k; z = cz + ddz * k; }
        d.setXYZ(i, x, y, z);
      }
      d.needsUpdate = true;
      shard.rotation.y += dt * 1.2; shard.position.y = 1.55 + Math.sin(t * 2) * 0.06; shardGlow.position.y = shard.position.y;
      this.well.shaftMat.uniforms.uT.value = t;
    },
  };
}
