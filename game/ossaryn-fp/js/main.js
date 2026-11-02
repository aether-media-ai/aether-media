// The Kept Light: first-person prototype (Chapter I slice). No build step; Three.js r187 vendored in ../lib.
import * as THREE from 'three';
import { PR, EYE, BR, archY, RECTS, REGION_ORDER, PORTALS, START, LANTERNS, WELL, SHARD, OBST, WAVES } from './layout.js';
import { buildWorld, COLL, glowTex } from './world.js';
import { makePost } from './post.js';
import { sfx, startAmbience } from './audio.js';

const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const Q = { high: localStorage.getItem('fpQuality') !== 'low' };

// ---------------- renderer / scene ----------------
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: false, powerPreference: 'high-performance' });
const PIX = () => Math.min(devicePixelRatio || 1, Q.high ? 1.25 : 0.7);
renderer.setPixelRatio(PIX()); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x34444a, 0.0068);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 2600);
camera.rotation.order = 'YXZ'; scene.add(camera);
const W = buildWorld(scene, renderer, Q);
const post = makePost(renderer, scene, camera, Q.high);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); post.setSize(innerWidth, innerHeight); });

// the lantern: a real point light hanging where the viewmodel lantern is drawn
const lamp = new THREE.PointLight(0xffa252, 7, 24, 1.7); lamp.position.set(0.32, -0.3, -0.55); camera.add(lamp);
const fillLamp = new THREE.PointLight(0xff9a4a, 0.0, 9, 2); fillLamp.position.set(0.0, -0.4, 0.3); camera.add(fillLamp);   // soft wrap so the floor under you isn't black

// collision boxes that matter (near the walkable rectangles)
const NEAR = COLL.filter(b => RECTS.some(r => b.x1 > r.x0 - 2 && b.x0 < r.x1 + 2 && b.z1 > r.z0 - 2 && b.z0 < r.z1 + 2));

// ---------------- state ----------------
const G = { mode: 'title', t: 0, playT: 0, lit: 0, shard: false, wellOpen: false, wellAnim: 0, wave: {}, deaths: 0, kills: 0, hitstop: 0, shake: 0, flash: 0, hurt: 0, white: 0, msgs: {}, fps: 60, noLock: false, everLocked: false, endT: 0 };
const P = { pos: new V3(...START.pos), vel: new V3(), vy: 0, yaw: START.yaw, pitch: -0.04, hp: 100, oil: 100, pots: { heal: 2, oil: 2 }, ground: true, bob: 0, stepAcc: 0, strikeT: -1, strikeCd: 0, flareT: -1, flareCd: 0, invuln: 0, cp: { pos: [...START.pos], yaw: START.yaw }, moving: 0 };
const keys = {};
const enemies = [];

// ---------------- collision ----------------
function ground(x, z) { return (z > BR.z0 && z < BR.z1) ? archY(x) : 0; }
function regionOf(x, z) { for (const r of RECTS) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r.name; return null; }
function circles() {
  const c = OBST.map(o => ({ x: o.pos[0], z: o.pos[1], r: o.r }));
  for (const L of W.posts) c.push({ x: L.pos[0], z: L.pos[1], r: 0.3 });
  if (!G.wellOpen) c.push({ x: WELL.pos[0], z: WELL.pos[1], r: WELL.r + 0.75 });
  return c;
}
let CIRC = circles();
function valid(x, z, r = PR) {
  // RECTS are already shrunk by PR; for other radii adjust
  const d = r - PR;
  let inside = false;
  for (const R of RECTS) if (x >= R.x0 + d && x <= R.x1 - d && z >= R.z0 + d && z <= R.z1 - d) { inside = true; break; }
  if (!inside) {   // allow the seams between rects (a point can straddle two)
    for (const R of RECTS) if (x >= R.x0 && x <= R.x1 && z >= R.z0 && z <= R.z1) { inside = true; break; }
    if (!inside) return false;
  }
  for (const b of NEAR) if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return false;
  for (const c of CIRC) { const dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz < (c.r + r) * (c.r + r)) return false; }
  return true;
}
function tryMove(pos, dx, dz, r = PR) {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2)); let blocked = false;
  for (let i = 0; i < n; i++) {
    const sx = dx / n, sz = dz / n;
    if (valid(pos.x + sx, pos.z + sz, r)) { pos.x += sx; pos.z += sz; }
    else if (valid(pos.x + sx, pos.z, r)) { pos.x += sx; blocked = true; }
    else if (valid(pos.x, pos.z + sz, r)) { pos.z += sz; blocked = true; }
    else {   // pressed against a round obstacle head-on: slide along its tangent instead of sticking
      blocked = true; const L = Math.hypot(sx, sz);
      for (const c of CIRC) {
        const ox = pos.x - c.x, oz = pos.z - c.z, od = Math.hypot(ox, oz);
        if (od > c.r + r + 0.25 || od < 1e-4) continue;
        let tx = -oz / od, tz = ox / od; if (tx * sx + tz * sz < 0) { tx = -tx; tz = -tz; }
        if (tx * sx + tz * sz < -0.2 * L) continue;
        const nx = pos.x + tx * L + ox / od * 0.02, nz = pos.z + tz * L + oz / od * 0.02;
        if (valid(nx, nz, r)) { pos.x = nx; pos.z = nz; break; }
      }
    }
  }
  return blocked;
}

// ---------------- enemies: the Drowned (billboard sprites lit by the scene lights) ----------------
const TL = new THREE.TextureLoader();
const drTex = TL.load('assets/sprites/drowned.png'); drTex.colorSpace = THREE.SRGBColorSpace; drTex.anisotropy = 4;
const drEmit = TL.load('assets/sprites/drowned_emit.png'); drEmit.colorSpace = THREE.SRGBColorSpace;
const DR_ASPECT = 427 / 921;
function drownedMat() {
  const u = { uFlash: { value: 0 }, uBurn: { value: 0 } };
  const m = new THREE.MeshStandardMaterial({ map: drTex, emissiveMap: drEmit, emissive: new THREE.Color(2.4, 2.6, 3.0), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.25, color: 0xd8dde4 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uFlash = u.uFlash; sh.uniforms.uBurn = u.uBurn;
    sh.fragmentShader = 'uniform float uFlash; uniform float uBurn;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n totalEmissiveRadiance += uFlash * diffuseColor.rgb * 5.0 + uBurn * vec3(1.6,0.6,0.15) * (0.25 + diffuseColor.rgb * 3.0);');
  };
  m.customProgramCacheKey = () => 'drowned';
  m.userData.u = u; return m;
}
const shGeo = new THREE.PlaneGeometry(1, 1); shGeo.rotateX(-Math.PI / 2);
let EID = 0;
function spawnEnemy(spec, wave) {
  const hulk = !!spec.hulk, H = hulk ? 3.4 : 2.25;
  const g = new THREE.PlaneGeometry(H * DR_ASPECT, H); g.translate(0, H / 2, 0);
  const mat = drownedMat(), mesh = new THREE.Mesh(g, mat); scene.add(mesh);
  const shadow = new THREE.Mesh(shGeo, new THREE.MeshBasicMaterial({ map: W.shadowTex, transparent: true, depthWrite: false, opacity: 0.8 })); shadow.scale.set(H * 0.55, 1, H * 0.35); scene.add(shadow);
  const e = { id: ++EID, wave, hulk, H, mesh, mat, shadow, hp: hulk ? 240 : 100, max: hulk ? 240 : 100, state: spec.well ? 'rise' : 'climb', t: 0,
    from: new V3(spec.from[0], 0, spec.from[1]), to: new V3(spec.to[0], 0, spec.to[1]), pos: new V3(spec.from[0], -2.4, spec.from[1]), kb: new V3(), stun: 0, burn: 0, flash: 0, cd: 0.8 + Math.random() * 0.6, spd: (hulk ? 2.3 : 3.0) * (0.9 + Math.random() * 0.2), phase: Math.random() * 6 };
  enemies.push(e); return e;
}
function spawnWave(id, delay = 1.0) {
  G.wave[id] = { spawned: false, t: delay, list: [] };
}
function aliveIn(id) { return enemies.filter(e => e.wave === id && e.state !== 'dead').length; }
function damageEnemy(e, dmg, kbDir, kb, stun) {
  if (e.state === 'dead' || e.state === 'dying') return;
  e.hp -= dmg; e.flash = 1; if (kbDir) e.kb.addScaledVector(kbDir, kb * (e.hulk ? 0.4 : 1)); e.stun = Math.max(e.stun, stun * (e.hulk ? 0.5 : 1));
  if (e.state === 'windup') e.state = 'chase';
  burst(e.pos.x, e.pos.y + e.H * 0.6, e.pos.z, 10, [0.9, 0.9, 0.85], 2.5);
  if (e.hp <= 0) { e.state = 'dying'; e.t = 0; G.kills++; sfx('die'); burst(e.pos.x, e.pos.y + e.H * 0.5, e.pos.z, 40, [0.8, 0.82, 0.8], 3.5); }
}
function updateEnemies(dt) {
  const pp = P.pos;
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    e.t += dt; e.flash = Math.max(0, e.flash - dt * 6); e.phase += dt;
    const gy = ground(e.pos.x, e.pos.z);
    if (e.state === 'climb') {
      // climb up from below the parapet, hop over, land inside
      const k = e.t;
      if (k < 0.9) { const s = k / 0.9; e.pos.set(e.from.x, lerp(-2.6, 1.05, s * s * (3 - 2 * s)) + ground(e.from.x, e.from.z), e.from.z); }
      else if (k < 1.5) { const s = (k - 0.9) / 0.6; e.pos.x = lerp(e.from.x, e.to.x, s); e.pos.z = lerp(e.from.z, e.to.z, s); e.pos.y = ground(e.pos.x, e.pos.z) + 1.05 * (1 - s) + Math.sin(s * Math.PI) * 0.5; }
      else { e.pos.copy(e.to); e.pos.y = ground(e.to.x, e.to.z); e.state = 'chase'; sfx('growl'); }
    } else if (e.state === 'rise') {
      const k = e.t;
      if (k < 1.6) { const s = k / 1.6; e.pos.set(e.from.x, lerp(-4.5, 0.3, s), e.from.z); }
      else if (k < 2.6) { const s = (k - 1.6); e.pos.x = lerp(e.from.x, e.to.x, s); e.pos.z = lerp(e.from.z, e.to.z, s); e.pos.y = 0.3 * (1 - s) + Math.sin(s * Math.PI) * 0.8; }
      else { e.pos.copy(e.to); e.state = 'chase'; sfx('growl'); }
    } else if (e.state === 'dying') {
      e.mat.userData.u.uBurn.value = Math.min(1.2, e.t * 3);
      e.mesh.scale.set(1 + e.t * 0.4, Math.max(0.01, 1 - e.t * 1.4), 1); e.pos.y = gy - e.t * 0.4;
      if (e.t > 0.7) { e.state = 'dead'; e.mesh.visible = false; e.shadow.visible = false; }
    } else {
      // knockback + stun
      if (e.kb.lengthSq() > 0.0001) { tryMove(e.pos, e.kb.x * dt, e.kb.z * dt, 0.4); e.kb.multiplyScalar(Math.pow(0.02, dt)); }
      e.stun = Math.max(0, e.stun - dt); e.cd = Math.max(0, e.cd - dt);
      // lit lanterns burn the Drowned
      let burning = false;
      for (const L of W.posts) if (L.lit && Math.hypot(e.pos.x - L.pos[0], e.pos.z - L.pos[1]) < 5.5) burning = true;
      if (burning) { e.hp -= 7 * dt; if (e.hp <= 0) damageEnemy(e, 1); }
      e.burn = Math.max(0, e.burn - dt); if (e.burn > 0) { e.hp -= 9 * dt; if (e.hp <= 0) damageEnemy(e, 1); }
      e.mat.userData.u.uBurn.value = Math.max(burning ? 0.25 + 0.1 * Math.sin(G.t * 9) : 0, e.burn > 0 ? 0.8 : 0);
      const dx = pp.x - e.pos.x, dz = pp.z - e.pos.z, dist = Math.hypot(dx, dz), reach = e.hulk ? 2.6 : 1.9;
      if (e.state === 'chase' && e.stun <= 0) {
        // steer: straight at the player, or to the portal between regions
        let tx = pp.x, tz = pp.z;
        const ra = regionOf(e.pos.x, e.pos.z), rb = regionOf(pp.x, pp.z);
        if (ra && rb && ra !== rb) { const ia = REGION_ORDER.indexOf(ra), ib = REGION_ORDER.indexOf(rb), nx = REGION_ORDER[ia + Math.sign(ib - ia)]; const key = [ra, nx].sort((a, b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b)).join('|'); const p = PORTALS[key]; if (p && Math.hypot(p[0] - e.pos.x, p[1] - e.pos.z) > 0.6) { tx = p[0]; tz = p[1]; } }
        const sx = tx - e.pos.x, sz = tz - e.pos.z, sl = Math.hypot(sx, sz) || 1;
        const slow = (burning ? 0.6 : 1) * (P.oil < 1 ? 1.25 : 1);
        if (dist > reach * 0.85) {
          const step = e.spd * slow * dt; let moved = false;
          for (const a of [0, 0.7 * (e.side || 1), -0.7 * (e.side || 1), 1.4 * (e.side || 1), -1.4 * (e.side || 1)]) {
            const ca = Math.cos(a), sa = Math.sin(a), mx = (sx * ca - sz * sa) / sl, mz = (sx * sa + sz * ca) / sl;
            const bx = e.pos.x, bz = e.pos.z; tryMove(e.pos, mx * step, mz * step, 0.4);
            const prog = (e.pos.x - bx) * sx / sl + (e.pos.z - bz) * sz / sl;
            if (prog > step * 0.25) { moved = true; if (a) e.side = Math.sign(a); break; }
            e.pos.x = bx; e.pos.z = bz;
          }
          if (!moved) tryMove(e.pos, sx / sl * step, sz / sl * step, 0.4);
          // watchdog: a Drowned that cannot get closer for 5 s re-emerges at its landing spot, then dissolves (never a softlock)
          if (dist < (e.bestD ?? 1e9) - 0.4) { e.bestD = dist; e.stuckT = 0; } else e.stuckT = (e.stuckT || 0) + dt;
          if (e.stuckT > 5) {
            e.stuckT = 0; e.bestD = 1e9; e.unstuck = (e.unstuck || 0) + 1;
            if (e.unstuck === 1 && valid(e.to.x, e.to.z, 0.4) && Math.hypot(e.to.x - e.pos.x, e.to.z - e.pos.z) > 1) { burst(e.pos.x, 1, e.pos.z, 20, [0.6, 0.7, 0.75], 2); e.pos.copy(e.to); }
            else if (e.unstuck >= 2) { e.state = 'dying'; e.t = 0; G.kills++; }
          }
        } else { e.bestD = dist; e.stuckT = 0; }
        if (dist < reach && e.cd <= 0) { e.state = 'windup'; e.t = 0; sfx('growl'); }
      } else if (e.state === 'windup') {
        const wt = e.hulk ? 0.85 : 0.55;
        if (e.t >= wt) {
          e.state = 'recover'; e.t = 0; e.cd = e.hulk ? 1.6 : 1.25;
          // lunge
          if (dist > 0.01) tryMove(e.pos, dx / dist * 0.5, dz / dist * 0.5, 0.4);
          if (Math.hypot(pp.x - e.pos.x, pp.z - e.pos.z) < reach + 0.6 && P.invuln <= 0 && G.mode === 'play') hurtPlayer((e.hulk ? 22 : 13) * (P.oil < 1 ? 1.4 : 1), e);
        }
      } else if (e.state === 'recover') { if (e.t > 0.5) e.state = 'chase'; }
      // separation
      for (const o of enemies) if (o !== e && o.state !== 'dead' && o.state !== 'climb' && o.state !== 'rise') { const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z, d = Math.hypot(ox, oz); if (d < 1.0 && d > 0.001) tryMove(e.pos, ox / d * (1.0 - d) * 0.5, oz / d * (1.0 - d) * 0.5, 0.4); }
      // keep off the player
      const d2 = Math.hypot(pp.x - e.pos.x, pp.z - e.pos.z); if (d2 < 0.85 && d2 > 0.001) tryMove(e.pos, -(pp.x - e.pos.x) / d2 * (0.85 - d2), -(pp.z - e.pos.z) / d2 * (0.85 - d2), 0.4);
      e.pos.y = ground(e.pos.x, e.pos.z);
    }
    // render: cylindrical billboard + idle sway + windup lean
    const m = e.mesh; m.position.copy(e.pos);
    m.rotation.y = Math.atan2(camera.position.x - e.pos.x, camera.position.z - e.pos.z);
    if (e.state !== 'dying') {
      const wind = e.state === 'windup' ? e.t / (e.hulk ? 0.85 : 0.55) : 0;
      const sway = (e.state === 'chase' ? 0.05 : 0.02) * Math.sin(e.phase * (e.state === 'chase' ? 7 : 2));
      m.rotation.z = sway + wind * 0.12; m.scale.set(1 + wind * 0.1, 1 - wind * 0.05 + (e.state === 'chase' ? Math.abs(Math.sin(e.phase * 7)) * 0.03 : 0), 1);
      if (e.state === 'recover' && e.t < 0.15) m.scale.set(0.9, 1.08, 1);
    }
    e.mat.userData.u.uFlash.value = e.flash * 0.6 + (e.state === 'windup' ? 0.15 : 0);
    e.mat.emissive.setRGB(2.4, 2.6, 3.0).multiplyScalar(e.state === 'windup' ? 2.5 : 1);
    e.shadow.position.set(e.pos.x, ground(e.pos.x, e.pos.z) + 0.03, e.pos.z); e.shadow.visible = e.pos.y > ground(e.pos.x, e.pos.z) - 0.5;
  }
}

// ---------------- particles (sparks / sand) ----------------
const NPART = 400, partPos = new Float32Array(NPART * 3), partCol = new Float32Array(NPART * 3), partV = new Float32Array(NPART * 3), partL = new Float32Array(NPART);
const partGeo = new THREE.BufferGeometry(); partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3)); partGeo.setAttribute('color', new THREE.BufferAttribute(partCol, 3));
const parts = new THREE.Points(partGeo, new THREE.PointsMaterial({ map: glowTex, size: 0.14, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); parts.frustumCulled = false; scene.add(parts);
let partI = 0;
function burst(x, y, z, n, col, spd, up = 1) {
  for (let i = 0; i < n; i++) {
    const k = partI = (partI + 1) % NPART;
    partPos[k * 3] = x; partPos[k * 3 + 1] = y; partPos[k * 3 + 2] = z;
    partV[k * 3] = (Math.random() - 0.5) * spd; partV[k * 3 + 1] = (Math.random() * 0.8 + 0.2) * spd * up; partV[k * 3 + 2] = (Math.random() - 0.5) * spd;
    partL[k] = 0.6 + Math.random() * 0.7; partCol[k * 3] = col[0]; partCol[k * 3 + 1] = col[1]; partCol[k * 3 + 2] = col[2];
  }
}
function updateParts(dt) {
  for (let k = 0; k < NPART; k++) {
    if (partL[k] <= 0) { partPos[k * 3 + 1] = -9999; continue; }
    partL[k] -= dt; partV[k * 3 + 1] -= 4 * dt;
    partPos[k * 3] += partV[k * 3] * dt; partPos[k * 3 + 1] += partV[k * 3 + 1] * dt; partPos[k * 3 + 2] += partV[k * 3 + 2] * dt;
    const f = Math.min(1, partL[k] * 2); partCol[k * 3] *= 0.985; partCol[k * 3 + 1] *= 0.98; partCol[k * 3 + 2] *= 0.975;
    if (f < 1) { partCol[k * 3] *= f; partCol[k * 3 + 1] *= f; partCol[k * 3 + 2] *= f; }
  }
  partGeo.attributes.position.needsUpdate = true; partGeo.attributes.color.needsUpdate = true;
}

// ---------------- player actions ----------------
const fwd = () => new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
function hurtPlayer(d, src) {
  P.hp -= d; P.invuln = 0.35; G.hurt = 1; G.shake = 0.35; sfx('hurt');
  if (src) { const k = new V3(P.pos.x - src.pos.x, 0, P.pos.z - src.pos.z).normalize(); tryMove(P.pos, k.x * 0.6, k.z * 0.6); }
  if (P.hp < 45) hint('hp', 'Press <b>1</b> to drink a Rust Draught', 5);
  if (P.hp <= 0) die();
}
function strike() {
  if (P.strikeCd > 0 || G.mode !== 'play') return;
  P.strikeT = 0; P.strikeCd = 0.55; P.struck = false; sfx('swing');
}
function doStrikeHit() {
  const f = fwd(); let hit = false;
  for (const e of enemies) {
    if (e.state === 'dead' || e.state === 'dying' || (e.state === 'climb' && e.t < 0.6) || (e.state === 'rise' && e.t < 1.0)) continue;
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz), reach = 2.9 + (e.hulk ? 0.6 : 0);
    if (d > reach) continue;
    const ang = Math.acos(clamp((dx * f.x + dz * f.z) / (d || 1), -1, 1));
    if (ang < 0.62 || d < 1.2) { damageEnemy(e, 34, new V3(dx / d, 0, dz / d), 5, 0.35); hit = true; }
  }
  if (hit) { sfx('hit'); G.hitstop = 0.06; G.shake = Math.max(G.shake, 0.12); }
}
function flare() {
  if (G.mode !== 'play' || P.flareCd > 0) return;
  if (P.oil < 20) { toast('Not enough lamp oil for a flare (20)'); sfx('strikeMiss'); return; }
  P.oil -= 20; P.flareT = 0; P.flareCd = 2.2; sfx('flare'); G.flash = 0.45;
  const f = fwd();
  const lp = lampWorld();
  for (let i = 0; i < 60; i++) burst(lp.x, lp.y, lp.z, 1, [2.2, 1.2, 0.4], 6, 0.5);
  for (const e of enemies) {
    if (e.state === 'dead' || e.state === 'dying') continue;
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    const ang = Math.acos(clamp((dx * f.x + dz * f.z) / (d || 1), -1, 1));
    if (d < 3.5 || (d < 9.5 && ang < 1.1)) { e.burn = 2.2; damageEnemy(e, 45, new V3(dx / (d || 1), 0, dz / (d || 1)), 9, 1.3); }
  }
}
function lampWorld() { return lamp.getWorldPosition(new V3()); }
function drink(kind) {
  if (G.mode !== 'play') return;
  if (P.pots[kind] <= 0) { toast(kind === 'heal' ? 'No Rust Draughts left' : 'No Lamp Oil left'); return; }
  if (kind === 'heal') { if (P.hp >= 100) { toast('Already at full life'); return; } P.hp = Math.min(100, P.hp + 45); }
  else { if (P.oil >= 99) { toast('Lantern already full'); return; } P.oil = Math.min(100, P.oil + 60); }
  P.pots[kind]--; sfx('drink'); toast(kind === 'heal' ? 'Rust Draught: +45 life' : 'Lamp Oil: lantern refilled');
}

// ---------------- objectives / interaction ----------------
function lightLantern(L, quiet = false) {
  if (L.lit) return; L.lit = true; G.lit++; L.litT = 0; sfx('light');
  L.mark.material.opacity = 0; P.cp = { pos: [L.cp[0], 0, L.cp[1]], yaw: P.yaw };
  burst(L.glass.position.x, L.glass.position.y, L.glass.position.z, 40, [2.2, 1.1, 0.35], 3);
  if (L.id === 'L3') G.decoChain = 0;
  if (!quiet && WAVES[L.id]) {
    spawnWave(L.id, 1.4);
    if (L.id === 'L1') say('<i>Nerith:</i> The light draws them… they\'re climbing the parapet.', 5);
    if (L.id === 'L2') say('<i>Nerith:</i> More of them. Stay in the lantern\'s glow. It burns them.', 5);
    if (L.id === 'L3') say('<i>Nerith:</i> The whole bridge is waking. Hold the crest.', 5);
  } else if (!quiet) say('', 0);
  toast(`Lantern relit (${G.lit}/3). Checkpoint`);
}
function takeShard(quiet = false) {
  if (G.shard) return; G.shard = true; sfx('shard'); W.shard.visible = false; W.shardGlow.visible = false; W.shardLight.intensity = 0;
  burst(SHARD.pos[0], 1.5, SHARD.pos[1], 60, [2, 2, 1.8], 3);
  P.cp = { pos: [74.5, 0, -65], yaw: -Math.PI / 2 };
  G.flash = 0.25;
  toast('Echo Shard: “The First Note”');
  if (!quiet) { spawnWave('SHARD', 1.8); say('<i>Nerith:</i> The shard sings… and something answers from the Well.', 5); }
}
function openWell() {
  if (G.wellOpen) return; G.wellOpen = true; CIRC = circles(); sfx('open'); G.shake = 0.6;
  say('The Well of Descent opens. The way down is the way on. <i>Jump.</i>', 7);
}
function interactables() {
  const out = [];
  for (const L of W.posts) if (!L.lit) out.push({ kind: 'lantern', ref: L, x: L.pos[0], z: L.pos[1], text: 'Relight the lantern' });
  for (const p of W.pickups) if (!p.taken) out.push({ kind: 'pickup', ref: p, x: p.pos[0], z: p.pos[1], text: p.kind === 'oil' ? 'Take Lamp Oil' : 'Take Rust Draught' });
  if (!G.shard) out.push({ kind: 'shard', x: SHARD.pos[0], z: SHARD.pos[1], text: 'Take the Echo Shard', range: 4.2 });
  out.push({ kind: 'well', x: WELL.pos[0], z: WELL.pos[1], text: G.wellOpen ? 'Leap into the Well of Descent' : null, info: G.wellOpen ? null : 'The Well is sealed', range: WELL.r + 2.6 });
  return out;
}
let focus = null;
function pickFocus() {
  const f = fwd(); let best = null, bs = 1e9;
  for (const it of interactables()) {
    const dx = it.x - P.pos.x, dz = it.z - P.pos.z, d = Math.hypot(dx, dz), range = it.range || 3.3;
    if (d > range) continue;
    const ang = Math.acos(clamp((dx * f.x + dz * f.z) / (d || 1), -1, 1));
    if (ang > 0.95 && d > 1.7) continue;
    const s = d + ang * 2; if (s < bs) { bs = s; best = it; }
  }
  return best;
}
function interact() {
  if (G.mode !== 'play' || !focus) return;
  const it = focus;
  if (it.kind === 'lantern') lightLantern(it.ref);
  else if (it.kind === 'pickup') { it.ref.taken = true; it.ref.mesh.visible = false; it.ref.glow.visible = false; P.pots[it.ref.kind]++; sfx('pickup'); toast(it.ref.kind === 'oil' ? 'Lamp Oil +1' : 'Rust Draught +1'); }
  else if (it.kind === 'shard') takeShard();
  else if (it.kind === 'well') { if (G.wellOpen) startFall(); else { sfx('strikeMiss'); toast(objectiveText()); } }
}
function objectiveText() {
  if (G.lit < 3) return `Relight the terrace lanterns (${G.lit}/3)`;
  if (!G.shard) return 'Take the Echo Shard from the tower niche';
  if (!G.wellOpen) return aliveIn('SHARD') ? `Drive back the Drowned (${aliveIn('SHARD')} left)` : 'The Well stirs…';
  return 'Leap into the Well of Descent';
}
function objectiveTarget() {
  for (const L of W.posts) if (!L.lit) return [L.pos[0], archY(L.pos[0]) * (L.pos[1] > BR.z0 && L.pos[1] < BR.z1 ? 1 : 0) + 2.3, L.pos[1]];
  if (!G.shard) return [SHARD.pos[0], 1.6, SHARD.pos[1]];
  if (G.wellOpen) return [WELL.pos[0], 0.6, WELL.pos[1]];
  return null;
}

// ---------------- UI helpers ----------------
let subT = 0, hintT = 0, toastT = 0;
function say(html, secs) { $('sub').innerHTML = html; $('sub').style.opacity = html ? 1 : 0; subT = secs; }
function hint(id, html, secs = 6) { if (G.msgs[id]) return; G.msgs[id] = 1; $('hint').innerHTML = html; $('hint').classList.add('on'); hintT = secs; }
function toast(t) { $('toast').textContent = t; $('toast').classList.add('on'); toastT = 2.4; }
function setQuality(high) {
  Q.high = high; localStorage.setItem('fpQuality', high ? 'high' : 'low');
  renderer.setPixelRatio(PIX()); renderer.setSize(innerWidth, innerHeight); post.setSize(innerWidth, innerHeight); post.bloom.enabled = high;
  for (const id of ['qualT', 'qualP']) $(id).textContent = 'Quality: ' + (high ? 'High' : 'Low');
}
setQuality(Q.high);
$('qualT').onclick = () => setQuality(!Q.high); $('qualP').onclick = () => setQuality(!Q.high);
$('pauseKeys').innerHTML = document.querySelector('#title .keys').innerHTML;

// ---------------- cutscenes / cards ----------------
let cutDone = null;
function playCut(src, done) {
  G.mode = 'cut'; const v = $('cutVideo'); $('cut').classList.remove('hidden'); cutDone = done;
  v.src = src; v.currentTime = 0; v.muted = false;
  v.play().catch(() => { v.muted = true; v.play().catch(() => endCut()); });
}
function endCut() {
  const v = $('cutVideo'); v.pause(); $('cut').classList.add('hidden'); const d = cutDone; cutDone = null; if (d) d();
}
$('cutVideo').addEventListener('ended', endCut); $('cutVideo').addEventListener('error', () => cutDone && endCut());
$('cutSkip').onclick = e => { e.stopPropagation(); endCut(); };
function showCard(lines, done) {
  G.mode = 'card'; $('card').classList.remove('hidden');
  const el = $('cardLines'); el.innerHTML = lines.map(l => `<p class="${l.startsWith('“') || l.includes('“') ? 'q' : ''}">${l}</p>`).join('');
  const ps = [...el.children]; ps.forEach((p, i) => setTimeout(() => p.classList.add('on'), 300 + i * 1500));
  setTimeout(() => $('cardGo').classList.add('on'), 300 + ps.length * 1500);
  $('card').onclick = () => { ps.forEach(p => p.classList.add('on')); $('card').classList.add('hidden'); $('card').onclick = null; done(); };
}
function lockPointer() {
  const c = $('gl');
  if (G.noLock || !c.requestPointerLock) return;
  try { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => { G.noLock = true; }); } catch (e) { G.noLock = true; }
}
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) { G.everLocked = true; if (G.mode === 'pause') resume(); }
  else if (G.mode === 'play' && G.everLocked) pause();
});
document.addEventListener('pointerlockerror', () => { G.noLock = true; });
function pause() { G.mode = 'pause'; $('pause').classList.remove('hidden'); }
function resume() { $('pause').classList.add('hidden'); G.mode = 'play'; lockPointer(); }
$('resume').onclick = e => { e.stopPropagation(); resume(); };

function enterPlay() {
  G.mode = 'play'; $('hud').classList.remove('hidden'); $('vm').classList.remove('hidden'); lockPointer();
  hint('move', '<b>WASD</b> move · <b>Mouse</b> look · <b>Shift</b> sprint · <b>Space</b> jump', 7);
  say('<i>Elder Teyth (far below):</i> “Nerith! Keep the terrace lit, then find the Well!”', 6);
}
$('begin').onclick = () => {
  startAmbience(); $('title').classList.add('hidden');
  playCut('assets/cutscenes/cs01_the_ring_wakes.mp4', () => showCard([
    'For a thousand years the Warden Ring slept beneath the Undermere.',
    'Tonight it woke. One by one the lanterns of the seventh terrace went out, and the Drowned began to climb out of the Forgotten Depths.',
    'Elder Teyth: “Nerith. Keep the terrace lit. Then find the Well.”',
  ], enterPlay));
};
function die() {
  G.mode = 'dead'; G.deaths++; $('death').classList.remove('hidden'); if (document.pointerLockElement) document.exitPointerLock();
}
function respawn() {
  $('death').classList.add('hidden'); P.hp = 100; P.oil = Math.max(P.oil, 70); toCheckpoint();
  for (const e of enemies) if (e.state !== 'dead') { e.state = 'chase'; e.stun = 1.5; e.kb.set(0, 0, 0); if (e.state !== 'climb') { /* pull back a little */ const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz) || 1; if (d < 6) tryMove(e.pos, dx / d * (6 - d), dz / d * (6 - d), 0.4); } }
  G.mode = 'play'; lockPointer();
}
$('revive').onclick = e => { e.stopPropagation(); respawn(); };
function toCheckpoint() { P.pos.set(P.cp.pos[0], ground(P.cp.pos[0], P.cp.pos[2]), P.cp.pos[2]); P.vel.set(0, 0, 0); P.vy = 0; }
function startFall() {
  G.mode = 'fall'; G.fallT = 0; G.fallFrom = P.pos.clone(); sfx('jump'); $('prompt').classList.add('hidden');
}
function endGame() {
  G.mode = 'end'; $('hud').classList.add('hidden'); $('vm').classList.add('hidden'); $('end').classList.remove('hidden');
  const m = Math.floor(G.playT / 60), s = Math.floor(G.playT % 60);
  $('endStats').innerHTML = `Echo Shard taken: <i>The First Note</i><br>Lanterns relit: ${G.lit}/3 · Drowned destroyed: ${G.kills} · Falls: ${G.deaths}<br>Time: ${m}:${String(s).padStart(2, '0')}`;
  if (document.pointerLockElement) document.exitPointerLock();
}
$('again').onclick = () => location.reload();

function debugSkip() {
  for (const e of enemies) if (e.state !== 'dead') { e.state = 'dead'; e.mesh.visible = false; e.shadow.visible = false; }
  for (const k in G.wave) G.wave[k].spawned = true;
  const L = W.posts.find(l => !l.lit);
  if (L) { lightLantern(L, true); P.pos.set(L.cp[0], ground(L.cp[0], L.cp[1]), L.cp[1]); toast('Debug: skipped to ' + L.id); return; }
  if (!G.shard) { takeShard(true); P.pos.set(84, 0, -65); toast('Debug: shard taken'); return; }
  if (!G.wellOpen) { openWell(); P.pos.set(74, 0, -65); toast('Debug: well opened'); return; }
  P.pos.set(WELL.pos[0] - WELL.r - 1.3, 0, WELL.pos[1]); P.yaw = -Math.PI / 2; toast('Debug: at the well');
}

// ---------------- input ----------------
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (G.mode === 'cut' && (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space')) { endCut(); return; }
  if (G.mode === 'card' && (e.code === 'Enter' || e.code === 'Space')) { $('card').onclick && $('card').onclick(); return; }
  if (G.mode === 'dead' && e.code === 'Enter') { respawn(); return; }
  if (G.mode === 'pause' && e.code === 'Enter') { resume(); return; }
  if (e.code === 'Escape' && G.mode === 'play' && !document.pointerLockElement) { pause(); return; }
  if (e.code === 'KeyO') { setQuality(!Q.high); toast('Quality: ' + (Q.high ? 'High' : 'Low')); }
  if (e.code === 'F3') { $('fps').classList.toggle('hidden'); e.preventDefault(); }
  if (G.mode !== 'play') return;
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyQ') flare();
  if (e.code === 'Digit1') drink('heal');
  if (e.code === 'Digit2') drink('oil');
  if (e.code === 'KeyK') { toCheckpoint(); toast('Unstuck: back to the last checkpoint'); }
  if (e.code === 'KeyN' && e.shiftKey) debugSkip();
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const SENS = 0.0022;
let lastMX = null, lastMY = null;
addEventListener('mousemove', e => {
  if (G.mode !== 'play') { lastMX = e.clientX; lastMY = e.clientY; return; }
  let mx, my;
  if (document.pointerLockElement) { mx = e.movementX; my = e.movementY; }
  else { mx = lastMX === null ? 0 : e.clientX - lastMX; my = lastMY === null ? 0 : e.clientY - lastMY; }   // fallback when pointer lock is unavailable
  lastMX = e.clientX; lastMY = e.clientY;
  if (Math.abs(mx) > 400 || Math.abs(my) > 400) return;   // ignore jumps
  P.yaw -= mx * SENS; P.pitch = clamp(P.pitch - my * SENS, -1.35, 1.25);
});
addEventListener('mousedown', e => {
  if (G.mode === 'play') {
    if (!document.pointerLockElement && !G.noLock) lockPointer();
    if (e.button === 0) strike(); else if (e.button === 2) flare();
  }
});
addEventListener('contextmenu', e => e.preventDefault());

// ---------------- frame loop ----------------
const vmEl = $('vm'), vmGlow = $('vmGlow');
let last = performance.now(), fpsLast = last, fpsAcc = 0, fpsN = 0;
const proj = new V3();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = Math.max(last, now);
  fpsAcc += Math.max(0, now - fpsLast) / 1000; fpsLast = Math.max(fpsLast, now); fpsN++; if (fpsAcc > 0.5) { G.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; $('fps').textContent = G.fps + ' fps · ' + (Q.high ? 'high' : 'low'); }
  G.t += dt;
  if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.15; }
  const playing = G.mode === 'play';
  if (playing) update(dt);
  else if (G.mode === 'fall') updateFall(dt);
  updateCommon(dt);
  if (G.mode !== 'title' && G.mode !== 'cut' && G.mode !== 'end') post.comp.render(dt);
  else if (G.mode === 'title' && !G.titleDrawn) { post.comp.render(dt); G.titleDrawn = true; }
}
function update(dt) {
  G.playT += dt;
  // movement
  const f = fwd(), r = new V3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  const iz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  if (keys.ArrowLeft) P.yaw += 2.2 * dt; if (keys.ArrowRight) P.yaw -= 2.2 * dt;
  const sprint = keys.ShiftLeft || keys.ShiftRight;
  const spd = (sprint ? 6.6 : 4.2) * (iz < 0 ? 0.75 : 1);
  const want = new V3().addScaledVector(f, iz).addScaledVector(r, ix); if (want.lengthSq() > 1) want.normalize(); want.multiplyScalar(spd);
  const acc = P.ground ? 12 : 3; P.vel.x = lerp(P.vel.x, want.x, 1 - Math.exp(-acc * dt)); P.vel.z = lerp(P.vel.z, want.z, 1 - Math.exp(-acc * dt));
  tryMove(P.pos, P.vel.x * dt, P.vel.z * dt);
  const gy = ground(P.pos.x, P.pos.z);
  if (keys.Space && P.ground) { P.vy = 4.8; P.ground = false; }
  P.vy -= 14 * dt; P.pos.y += P.vy * dt;
  if (P.pos.y <= gy) { if (!P.ground && P.vy < -3) sfx('step'); P.pos.y = gy; P.vy = 0; P.ground = true; }
  else if (P.ground && P.pos.y - gy < 0.25) { P.pos.y = gy; P.vy = 0; } else P.ground = false;
  const hs = Math.hypot(P.vel.x, P.vel.z); P.moving = hs;
  if (P.ground && hs > 0.5) { P.bob += hs * dt * 1.55; P.stepAcc += hs * dt; if (P.stepAcc > (sprint ? 2.2 : 1.7)) { P.stepAcc = 0; sfx('step'); } }
  // timers
  P.strikeCd = Math.max(0, P.strikeCd - dt); P.flareCd = Math.max(0, P.flareCd - dt); P.invuln = Math.max(0, P.invuln - dt);
  if (P.strikeT >= 0) { P.strikeT += dt; if (!P.struck && P.strikeT > 0.13) { P.struck = true; doStrikeHit(); } if (P.strikeT > 0.45) P.strikeT = -1; }
  if (P.flareT >= 0) { P.flareT += dt; if (P.flareT > 0.8) P.flareT = -1; }
  // oil: drains slowly; refills by a lit lantern (rest by the flame)
  let nearFlame = false; for (const L of W.posts) if (L.lit && Math.hypot(P.pos.x - L.pos[0], P.pos.z - L.pos[1]) < 6) nearFlame = true;
  if (nearFlame) { P.oil = Math.min(100, P.oil + 10 * dt); P.hp = Math.min(100, P.hp + 2.5 * dt); } else P.oil = Math.max(0, P.oil - 0.45 * dt);
  if (P.oil < 35) hint('oil', 'Lamp oil is low: stand by a lit lantern or press <b>2</b>', 6);
  // waves
  for (const id in G.wave) { const w = G.wave[id]; if (!w.spawned) { w.t -= dt; if (w.t <= 0) { w.spawned = true; for (const s of WAVES[id]) w.list.push(spawnEnemy(s, id)); sfx('rise'); hint('fight', '<b>LMB</b> staff strike · <b>RMB</b> / <b>Q</b> Lantern Flare burns the Drowned (costs oil)', 7); } } }
  if (G.shard && !G.wellOpen && G.lit >= 3 && G.wave.SHARD && G.wave.SHARD.spawned && aliveIn('SHARD') === 0) openWell();
  updateEnemies(dt);
  // interaction focus + prompt
  focus = pickFocus();
  const pr = $('prompt');
  if (focus && (focus.text || focus.info)) { pr.classList.remove('hidden'); pr.classList.toggle('info', !focus.text); pr.innerHTML = focus.text ? `<b>E</b>${focus.text}` : `${focus.info}: ${objectiveText().toLowerCase()}`; }
  else pr.classList.add('hidden');
  // well trigger by walking in
  if (G.wellOpen && Math.hypot(P.pos.x - WELL.pos[0], P.pos.z - WELL.pos[1]) < WELL.r - 0.3) startFall();
}
function updateFall(dt) {
  G.fallT += dt; const t = G.fallT;
  const c = new V3(WELL.pos[0], 0, WELL.pos[1]);
  if (t < 0.6) { P.pos.lerpVectors(G.fallFrom, c, t / 0.6); P.pos.y = Math.sin(t / 0.6 * Math.PI) * 0.9; P.pitch = lerp(P.pitch, -0.6, dt * 4); }
  else { P.pos.x = c.x; P.pos.z = c.z; P.pos.y = -(t - 0.6) * (t - 0.6) * 9; P.pitch = lerp(P.pitch, -1.45, dt * 3); P.yaw += dt * 0.6; }
  G.white = clamp((t - 0.9) / 1.4, 0, 1);
  if (t > 2.4 && !G.fallDone) { G.fallDone = true; $('hud').classList.add('hidden'); $('vm').classList.add('hidden'); if (document.pointerLockElement) document.exitPointerLock(); playCut('assets/cutscenes/cs03_the_fall.mp4', endGame); }
}
function updateCommon(dt) {
  const t = G.t;
  // camera
  const bobY = Math.sin(P.bob * 2) * 0.045 * Math.min(1, P.moving / 4), bobX = Math.sin(P.bob) * 0.03 * Math.min(1, P.moving / 4);
  G.shake = Math.max(0, G.shake - dt); const sh = G.shake * G.shake * 0.25;
  camera.position.set(P.pos.x + bobX * Math.cos(P.yaw), P.pos.y + EYE + bobY, P.pos.z - bobX * Math.sin(P.yaw));
  camera.rotation.set(P.pitch + (Math.random() - 0.5) * sh, P.yaw + (Math.random() - 0.5) * sh, 0);
  // lantern light: flicker, oil-dependent reach, flare pulse
  const fl = 0.86 + 0.08 * Math.sin(t * 13.1) + 0.06 * Math.sin(t * 27.3 + 1.3) + 0.04 * Math.sin(t * 5.7);
  const oilK = 0.32 + 0.68 * (P.oil / 100);
  const flareK = P.flareT >= 0 ? Math.max(0, 1 - P.flareT / 0.8) : 0;
  lamp.intensity = (7 * oilK * fl) + flareK * 60; lamp.distance = 9 + 16 * oilK + flareK * 20;
  fillLamp.intensity = 0.9 * oilK * fl;
  // world lanterns
  for (const L of W.posts) {
    const lt = L.lit ? Math.min(1, (L.litT = (L.litT || 0) + dt) / 0.8) : 0;
    const f2 = 0.88 + 0.07 * Math.sin(t * 11 + L.pos[1]) + 0.05 * Math.sin(t * 23 + L.pos[0]);
    L.light.intensity = 22 * lt * f2; L.halo.material.opacity = 0.75 * lt * f2; L.halo2.material.opacity = 0.16 * lt * f2;
    L.gm.emissive.setRGB(2.4 * lt * f2, 1.0 * lt * f2, 0.26 * lt * f2);
    if (!L.lit) L.mark.material.opacity = 0.25 + 0.2 * Math.sin(t * 2.5);
  }
  // bridge chain-light after L3
  if (G.decoChain !== undefined) {
    G.decoChain += dt;
    for (const d of W.deco) { const k = clamp((G.decoChain - Math.abs(d.x - 40.5) * 0.06) / 0.5, 0, 1); d.s.material.opacity = 0.8 * k * (0.9 + 0.1 * Math.sin(t * 9 + d.x)); d.gl.material.color.setRGB(0.08 + 2.6 * k, 0.07 + 1.3 * k, 0.06 + 0.4 * k); }
  }
  // well
  const w = W.well; if (G.wellOpen) w.open = Math.min(1, w.open + dt * 0.45);
  w.shaftMat.uniforms.uOpen.value = w.open; w.beam.material.opacity = 0.32 * w.open; w.wellLight.intensity = 30 * w.open;
  w.sealGlow.material.opacity = 0.12 + 0.45 * w.open + 0.05 * Math.sin(t * 2);
  for (const p of w.plates) { p.piv.position.set(Math.cos(p.a) * w.open * 3.4, -w.open * 0.25, -Math.sin(p.a) * w.open * 3.4); p.piv.scale.setScalar(1 - w.open * 0.55); }
  if (w.open > 0 && w.open < 1 && Math.random() < 0.6) burst(WELL.pos[0] + (Math.random() - 0.5) * 4, 0.3, WELL.pos[1] + (Math.random() - 0.5) * 4, 1, [2, 1.8, 1.3], 4, 1.5);
  if (w.open >= 1 && Math.random() < 0.3) burst(WELL.pos[0] + (Math.random() - 0.5) * 3, -1, WELL.pos[1] + (Math.random() - 0.5) * 3, 1, [1.6, 1.4, 1.0], 3, 2);
  W.update(t, dt, camera);
  updateParts(dt);
  // post uniforms
  G.hurt = Math.max(0, G.hurt - dt * 2.2); G.flash = Math.max(0, G.flash - dt * 1.6);
  const U = post.U; U.uT.value = t; U.uHurt.value = G.hurt * 0.6; U.uFlash.value = G.flash * 0.35 + flareK * 0.08;
  U.uDark.value = Math.pow(1 - P.oil / 100, 2) * 0.55; U.uWhite.value = G.white; U.uGrain.value = Q.high ? 0.045 : 0.03;
  // viewmodel: bob, strike swing, flare thrust, lighting tie-in
  if (G.mode === 'play' || G.mode === 'pause' || G.mode === 'dead') {
    const mv = Math.min(1, P.moving / 4);
    let tx = Math.sin(P.bob) * 10 * mv, ty = Math.abs(Math.cos(P.bob)) * 9 * mv + Math.sin(t * 1.6) * 3, rot = Math.sin(P.bob) * 0.8 * mv, sc = 1;
    if (P.strikeT >= 0) {
      const s = P.strikeT;
      const k = s < 0.08 ? s / 0.08 : s < 0.2 ? 1 + (s - 0.08) / 0.12 : 2 + (s - 0.2) / 0.25;  // 0..1 windup, 1..2 swing, 2..3 recover
      let a, x, y;
      if (k < 1) { a = 9 * k; x = 30 * k; y = 10 * k; }
      else if (k < 2) { const u = k - 1; a = 9 - 52 * u; x = 30 - 250 * u; y = 10 - 50 * u; }
      else { const u = Math.min(1, k - 2), e2 = 1 - (1 - u) * (1 - u); a = -43 * (1 - e2); x = -220 * (1 - e2); y = -40 * (1 - e2); }
      rot += a; tx += x; ty += y;
    }
    if (flareK > 0) { const u = Math.sin(Math.min(1, P.flareT / 0.8) * Math.PI); tx -= 60 * u; ty -= 50 * u; sc += 0.06 * u; rot -= 6 * u; }
    if (G.mode === 'dead') ty += 300;
    vmEl.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
    const br = 0.5 + 0.42 * oilK * fl + flareK * 0.5;
    vmEl.style.filter = `brightness(${br.toFixed(3)}) saturate(0.9)`;
    vmGlow.style.opacity = (0.35 + 0.65 * oilK * fl + flareK * 1.2).toFixed(3);
    vmGlow.style.transform = `translate(-50%,-50%) scale(${(0.7 + 0.5 * oilK + flareK * 2).toFixed(3)})`;
  }
  // HUD
  if (G.mode === 'play') {
    $('hpFill').style.width = clamp(P.hp, 0, 100) + '%'; $('oilFill').style.width = clamp(P.oil, 0, 100) + '%';
    $('nHeal').textContent = P.pots.heal; $('nOil').textContent = P.pots.oil; $('cdFlare').textContent = P.flareCd > 0 ? P.flareCd.toFixed(1) : (P.oil >= 20 ? '' : '—');
    $('objText').textContent = objectiveText();
    const tg = objectiveTarget(), mk = $('marker');
    if (tg) {
      proj.set(...tg).project(camera); const d = Math.hypot(tg[0] - P.pos.x, tg[2] - P.pos.z);
      let x = proj.x, y = proj.y; const behind = proj.z > 1;
      if (behind) { x = -x; y = -1; }
      const m = 0.92; const out = Math.abs(x) > m || Math.abs(y) > m || behind;
      if (out) { const s = m / Math.max(Math.abs(x), Math.abs(y), 0.001); x *= s; y *= s; }
      mk.style.display = d < 2.5 ? 'none' : 'block'; mk.style.left = ((x * 0.5 + 0.5) * innerWidth) + 'px'; mk.style.top = ((-y * 0.5 + 0.5) * innerHeight) + 'px';
      mk.querySelector('span').textContent = Math.round(d) + ' m'; mk.style.opacity = out ? 0.55 : 0.85;
    } else mk.style.display = 'none';
  }
  if (subT > 0) { subT -= dt; if (subT <= 0) $('sub').style.opacity = 0; }
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('hint').classList.remove('on'); }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('on'); }
}
requestAnimationFrame(frame);

// ---------------- read-only probe for QC ----------------
const ray = new THREE.Raycaster();
window.__fpProbe = () => ({
  mode: G.mode, pos: [+P.pos.x.toFixed(2), +P.pos.y.toFixed(2), +P.pos.z.toFixed(2)], yaw: +P.yaw.toFixed(4), pitch: +P.pitch.toFixed(3), hp: Math.round(P.hp), oil: Math.round(P.oil), pots: { ...P.pots },
  lit: W.posts.map(l => l.lit), shard: G.shard, wellOpen: G.wellOpen, objective: objectiveText(), target: objectiveTarget(), region: regionOf(P.pos.x, P.pos.z),
  prompt: $('prompt').classList.contains('hidden') ? null : $('prompt').textContent, locked: !!document.pointerLockElement, noLock: G.noLock,
  enemies: enemies.filter(e => e.state !== 'dead').map(e => ({ id: e.id, wave: e.wave, hulk: e.hulk, pos: [+e.pos.x.toFixed(2), +e.pos.z.toFixed(2)], hp: Math.round(e.hp), state: e.state, dist: +Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z).toFixed(2) })),
  pickups: W.pickups.filter(p => !p.taken).map(p => ({ id: p.id, kind: p.kind, pos: p.pos })),
  lanterns: W.posts.map(l => ({ id: l.id, pos: l.pos, lit: l.lit })), shardPos: SHARD.pos, wellPos: WELL.pos,
  fps: G.fps, deaths: G.deaths, kills: G.kills, playT: +G.playT.toFixed(1), quality: Q.high ? 'high' : 'low', cp: P.cp.pos,
});
// distance from the player's body to the nearest visible geometry in a horizontal direction (for the invisible-wall check)
window.__fpRay = (dx, dz) => {
  const out = [];
  for (const h of [0.4, 1.0]) { ray.set(new V3(P.pos.x, P.pos.y + h, P.pos.z), new V3(dx, 0, dz).normalize()); ray.far = 20; const list = []; scene.traverse(o => { if (o.isMesh && o.visible && !(o.material && o.material.transparent) && !o.userData.noRay) list.push(o); }); const hit = ray.intersectObjects(list, false)[0]; out.push(hit ? +hit.distance.toFixed(2) : null); }
  return out;
};

// ---------------- dev look-dev hook: ?pose=x,z,yawDeg,pitchDeg[&lit=n][&open=1][&enemy=x,z] (skips title; NOT used by the human QC) ----------------
{
  const q = new URLSearchParams(location.search);
  if (q.has('pose')) {
    const [x, z, yd, pd] = q.get('pose').split(',').map(Number);
    $('title').classList.add('hidden'); G.noLock = true; enterPlay(); say('', 0); $('hint').classList.remove('on');
    const n = +(q.get('lit') || 0); for (let i = 0; i < n; i++) lightLantern(W.posts[i], true);
    if (q.get('open')) { takeShard(true); openWell(); W.well.open = 1; }
    P.pos.set(x, ground(x, z), z); P.yaw = yd * Math.PI / 180; P.pitch = (pd || 0) * Math.PI / 180;
    if (q.get('oil')) P.oil = +q.get('oil');
    for (const s of (q.get('enemy') || '').split(';').filter(Boolean)) { const [ex, ez, h] = s.split(',').map(Number); const e = spawnEnemy({ from: [ex, ez], to: [ex, ez], hulk: !!h }, 'dev'); e.state = 'chase'; e.pos.set(ex, ground(ex, ez), ez); e.stun = 999; }
    if (q.get('freeze')) G.freeze = true;
    window.__dbg = { scene, post, renderer, W, THREE };
  }
}
