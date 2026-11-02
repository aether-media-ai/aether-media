// The Kept Light: 2D side-scrolling concept (Three.js orthographic, painted parallax layers, dynamic lantern light).
import * as THREE from 'three';
import { makePost } from './post.js';
import { buildWorld, tex, quad } from './world.js';
import { litMat, fxMat, LIGHTS, MAXL, SHARED } from './lit.js';
import { makeNerith, LANTERNS as LANTERN_DEFS } from './rig.js';
import { ISLANDS, LANTERNS, GEAR, SHARD, WELL, PICKUPS, WAVES, VISTAS, START, surfaceY, GS, WALKY } from './level.js';
import { sfx, startAmbience } from './audio.js';

const $ = id => document.getElementById(id);
const qs = new URLSearchParams(location.search);
let quality = localStorage.getItem('side_q') || 'high';
if (qs.get('q')) quality = qs.get('q');
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-960, 960, 540, -540, -1000, 1000); camera.position.z = 10;
let post;
function resize() {
  const dpr = quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 1) * 0.75;
  renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
  if (post) { const s = renderer.getDrawingBufferSize(new THREE.Vector2()); post.setSize(s.x, s.y); }
}
resize(); addEventListener('resize', resize);
post = makePost(renderer, scene, camera, true); resize();
const W = buildWorld(scene);
const PLAY = W.layer.play.g;
let ro = W.playBase;   // render order counter for play-layer props
const nextRO = (n = 1) => { const r = ro; ro += n; return r; };

// ---------------------------------------------------------------- game state
const G = { mode: 'title', t: 0, playT: 0, hp: 100, oil: 100, pots: { heal: 2, oil: 1 }, lit: [false, false, false], gearGot: {}, shard: false, wellOpen: false,
  kills: 0, deaths: 0, falls: 0, wave: {}, checkpoint: { x: START.x }, island: 0, msg: '', hitstop: 0, shake: 0, flash: 0, hurtV: 0, white: 0, bars: 0, sepia: 0,
  fps: 60, inv: false, memory: 0, flareCd: 0, endT: 0, areaShown: {} };
const P = { x: START.x, y: 0, vx: 0, vy: 0, ground: true, facing: 1, coyote: 0, jumpBuf: 0, attackT: 0, attackDur: 0.36, attackN: 0, comboT: 0, hitDone: false,
  hurtT: 0, inv: 0, dodgeT: 0, dodgeCd: 0, landT: 0, airDodge: true, surf: null, lock: 0 };
let nerith = null;

// ---------------------------------------------------------------- props
const props = [];   // interactables
function islandAt(x) { return W.surfaces.find(s => x >= s.x0 - 40 && x <= s.x1 + 40); }
function groundAt(x) { const s = W.surfaces.find(s => x >= s.x0 && x <= s.x1); return s ? surfaceY(s, x) : null; }
const posts = LANTERNS.map((L, i) => {
  const y = groundAt(L.x); const g = new THREE.Group(); g.position.set(L.x, y - 6, 0); PLAY.add(g);
  const sc = 1.9, w = 114 * sc, h = 288 * sc;
  const unlit = quad(litMat(tex('post_unlit.png'), { amb: 0x8d9a9c, lightAmt: 1 }), w, h, 0, 0, 0.5, 0); g.add(unlit); unlit.renderOrder = nextRO();
  const lit = quad(litMat(tex('post_lit.png'), { amb: 0x8d9a9c, lightAmt: 1, emis: 1.4, emisT: 0.5 }), w, h, 0, 0, 0.5, 0); g.add(lit); lit.renderOrder = nextRO(); lit.visible = false;
  const glow = quad(fxMat(tex('glow.png'), new THREE.Color(0xffa040), 0.0), 520, 520, 50, h * 0.74); g.add(glow); glow.renderOrder = nextRO();
  const p = { kind: 'lantern', i, x: L.x, y, g, lit, unlit, glow, text: 'Relight the lantern', head: new THREE.Vector2(L.x + 48, y + h * 0.74) };
  props.push(p); return p;
});
const items = GEAR.map(Gd => {
  const y = groundAt(Gd.x); const t = Gd.id === 'warden_set' ? 'item_warden.png' : 'item_greaves.png';
  const g = new THREE.Group(); g.position.set(Gd.x, y, 0); PLAY.add(g);
  const shaft = quad(fxMat(tex('shaft.png'), new THREE.Color(0x9fe0d4), 0.32), 240, 900, 0, -40, 0.5, 0); g.add(shaft); shaft.renderOrder = nextRO();
  const glow = quad(fxMat(tex('glow.png'), new THREE.Color(0x7fd8c8), 0.55), 360, 360, 0, 120); g.add(glow); glow.renderOrder = nextRO();
  const spr = quad(litMat(tex(t), { amb: 0xb8c4c4, lightAmt: 0.6, emis: 0.4 }), Gd.id === 'warden_set' ? 150 : 90, Gd.id === 'warden_set' ? 205 : 185, 0, 120); g.add(spr); spr.renderOrder = nextRO();
  const p = { kind: 'gear', gear: Gd, x: Gd.x, y, g, spr, glow, shaft, text: 'Take ' + Gd.name };
  props.push(p); return p;
});
// echo shard: procedural crystal sprite
function shardTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
  const gr = x.createLinearGradient(30, 0, 100, 256); gr.addColorStop(0, '#fffaf0'); gr.addColorStop(0.45, '#bfeee6'); gr.addColorStop(1, '#5aa79e');
  x.fillStyle = gr; x.beginPath(); x.moveTo(64, 4); x.lineTo(104, 90); x.lineTo(78, 250); x.lineTo(46, 250); x.lineTo(22, 96); x.closePath(); x.fill();
  x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.moveTo(64, 4); x.lineTo(70, 120); x.lineTo(56, 248); x.lineTo(46, 250); x.lineTo(22, 96); x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const shardP = (() => {
  const y = groundAt(SHARD.x); const g = new THREE.Group(); g.position.set(SHARD.x, y, 0); PLAY.add(g);
  const shaft = quad(fxMat(tex('shaft.png'), new THREE.Color(0xdff4ee), 0.4), 320, 1100, 0, -30, 0.5, 0); g.add(shaft); shaft.renderOrder = nextRO();
  const glow = quad(fxMat(tex('glow.png'), new THREE.Color(0xbff0e6), 0.7), 300, 300, 0, 150); g.add(glow); glow.renderOrder = nextRO();
  const spr = quad(litMat(shardTex(), { amb: 0xffffff, emis: 1.2, emisT: 0.2 }), 40, 80, 0, 150); g.add(spr); spr.renderOrder = nextRO();
  const p = { kind: 'shard', x: SHARD.x, y, g, spr, glow, shaft, text: 'Touch the Echo Shard' }; props.push(p); return p;
})();
const pickups = PICKUPS.map(pk => {
  const y = groundAt(pk.x); const g = new THREE.Group(); g.position.set(pk.x, y, 0); PLAY.add(g);
  const glow = quad(fxMat(tex('glow.png'), new THREE.Color(pk.kind === 'heal' ? 0xff6a50 : 0xffb04a), 0.5), 140, 140, 0, 34); g.add(glow); glow.renderOrder = nextRO();
  const c = document.createElement('canvas'); c.width = 64; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = pk.kind === 'heal' ? '#a8321f' : '#d58a2a'; x.beginPath(); x.ellipse(32, 62, 22, 28, 0, 0, 7); x.fill(); x.fillStyle = '#3a2a1a'; x.fillRect(25, 14, 14, 22); x.fillStyle = 'rgba(255,240,210,.5)'; x.beginPath(); x.ellipse(24, 56, 6, 12, -0.3, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const spr = quad(litMat(t, { amb: 0xaaaaaa, lightAmt: 1, emis: 0.3 }), 32, 48, 0, 24, 0.5, 0.5); g.add(spr); spr.renderOrder = nextRO();
  const p = { kind: 'pickup', pk, x: pk.x, y, g, text: pk.kind === 'heal' ? 'Take Rust Draught' : 'Take Lamp Oil' }; props.push(p); return p;
});
// the Well of Descent: sealed curtain + rising beam at the end of the last terrace
const wellP = (() => {
  const isl = ISLANDS[ISLANDS.length - 1]; const y = isl.y; const g = new THREE.Group(); g.position.set(WELL.x, y, 0); PLAY.add(g);
  const beam = quad(fxMat(tex('shaft.png'), new THREE.Color(0x7fe0d0), 0.25), 900, 2600, 380, -1700, 0.5, 0); g.add(beam); beam.renderOrder = nextRO();
  const beam2 = quad(fxMat(tex('shaft.png'), new THREE.Color(0xffb060), 0.12), 500, 2200, 380, -1500, 0.5, 0); g.add(beam2); beam2.renderOrder = nextRO();
  const seal = quad(fxMat(tex('shaft.png'), new THREE.Color(0xffc070), 0.55), 160, 700, WELL.sealX - WELL.x, -40, 0.5, 0); g.add(seal); seal.renderOrder = nextRO();
  const sealGlow = quad(fxMat(tex('glow.png'), new THREE.Color(0xffa040), 0.4), 420, 700, WELL.sealX - WELL.x, 250); g.add(sealGlow); sealGlow.renderOrder = nextRO();
  return { g, beam, beam2, seal, sealGlow, y, open: 0 };
})();
props.push({ kind: 'well', x: WELL.sealX - 60, y: wellP.y, text: '' });

// ---------------------------------------------------------------- particles
function points(n, color, size, opacity, add = true) {
  const geo = new THREE.BufferGeometry(); const pos = new Float32Array(n * 3); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ map: tex('glow.png'), color, size, sizeAttenuation: false, transparent: true, opacity, depthWrite: false, depthTest: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(geo, m); pts.frustumCulled = false; return { pts, pos, n, data: Array.from({ length: n }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1 })) };
}
const embers = points(260, 0xffa050, 7, 0.9); PLAY.add(embers.pts); embers.pts.renderOrder = W.playBase + 450;
const sparks = points(160, 0xffd9a0, 9, 1); PLAY.add(sparks.pts); sparks.pts.renderOrder = W.playBase + 451;
const motes = points(220, 0xcfe2e0, 4, 0.55); PLAY.add(motes.pts); motes.pts.renderOrder = W.playBase + 452;
const dark = points(200, 0x0a1418, 14, 0.85, false); PLAY.add(dark.pts); dark.pts.renderOrder = W.playBase + 449;
for (const d of motes.data) { d.x = R(-1200, 1200); d.y = R(-500, 700); d.life = 1; }
function R(a, b) { return a + Math.random() * (b - a); }
function emit(sys, x, y, n, spd, life, up = 0, spread = Math.PI * 2) {
  for (let i = 0; i < n; i++) { const d = sys.data.find(d => d.life <= 0) || sys.data[(Math.random() * sys.n) | 0]; const a = R(0, spread) - spread / 2 + (spread < 6 ? Math.PI / 2 : 0), s = R(0.3, 1) * spd; d.x = x + R(-8, 8); d.y = y + R(-8, 8); d.vx = Math.cos(a) * s; d.vy = Math.sin(a) * s + up; d.life = d.max = life * R(0.6, 1.2); }
}
// rain: line streaks around the camera
const RAIN_N = 420; const rainGeo = new THREE.BufferGeometry(); const rainPos = new Float32Array(RAIN_N * 6); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9fb6bf, transparent: true, opacity: 0.11, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })); rain.frustumCulled = false; scene.add(rain); rain.renderOrder = 100000;
const rainD = Array.from({ length: RAIN_N }, () => ({ x: R(-1300, 1300), y: R(-800, 800), s: R(0.6, 1.4) }));

// ---------------------------------------------------------------- enemies
const enemies = [];
const drownT = tex('drowned.png');
function spawnEnemy(x, big = false, wave = null, delay = 0) {
  const surf = islandAt(x); if (!surf) return;
  const y = surfaceY(surf, x);
  const sc = big ? 0.7 : 0.48, w = 240, h = 485;
  const mat = litMat(drownT, { deform: true, rim: true, w, h, tw: w, th: h, amb: 0x6f7c82, lightAmt: 1, rimCol: 0x3f7f8a, emis: 0.6, emisT: 0.5 });
  const geo = new THREE.PlaneGeometry(w, h, 8, 16); geo.translate(0, h / 2 - 8, 0);
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.scale.set(sc, sc, 1); m.visible = false; PLAY.add(m);
  const e = { m, mat, x, y: y - 300, ty: y, surf, hp: big ? 14 : 4, max: big ? 14 : 4, big, wave, state: 'wait', t: -delay, facing: -1, vx: 0, cd: R(0.6, 1.4), stun: 0, burn: 0, ph: R(0, 6), hitFlash: 0, sc };
  m.renderOrder = W.deckOrder0 - 1;
  enemies.push(e); return e;
}
function spawnWave(id) {
  if (G.wave[id]) return; G.wave[id] = { spawned: true, t: G.t };
  for (const s of WAVES[id]) spawnEnemy(s.x, !!s.big, id, s.d || 0);
}
function aliveIn(id) { return enemies.filter(e => e.wave === id && e.state !== 'dead' && e.state !== 'dying').length; }
function hurtEnemy(e, dmg, kx) {
  if (e.state === 'dying' || e.state === 'dead' || e.state === 'wait' || e.state === 'rise') return false;
  e.hp -= dmg; e.hitFlash = 1; e.vx = kx * (e.big ? 160 : 420); if (e.state !== 'stun') { e.state = 'hurt'; e.t = 0; }
  emit(sparks, e.x, e.y + 120 * e.sc / 0.48, 10, 520, 0.35);
  emit(dark, e.x, e.y + 120, 8, 200, 0.8);
  sfx('hit'); G.hitstop = 0.05; G.shake = Math.max(G.shake, 6);
  if (e.hp <= 0) { e.state = 'dying'; e.t = 0; G.kills++; sfx('die'); emit(dark, e.x, e.y + 100, 40, 260, 1.4); }
  return true;
}
function updateEnemies(dt) {
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    e.t += dt; e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
    const dx = P.x - e.x, adx = Math.abs(dx), sameIsland = islandAt(P.x) === e.surf && Math.abs(P.y - e.ty) < 260;
    if (e.state === 'wait') { if (e.t >= 0) { e.state = 'rise'; e.t = 0; e.m.visible = true; sfx('rise'); } continue; }
    if (e.state === 'rise') { const k = Math.min(1, e.t / 1.3); e.y = e.ty - 300 * (1 - k * k * (3 - 2 * k)); if (k >= 1) { e.state = 'chase'; e.t = 0; e.y = e.ty; e.m.renderOrder = W.playBase + 200 + enemies.indexOf(e); } }
    else if (e.state === 'dying') { if (e.t > 1.0) { e.state = 'dead'; e.m.visible = false; } }
    else {
      // lit lanterns burn and repel
      for (const p of posts) if (G.lit[p.i] && Math.abs(p.x - e.x) < 380) { e.hp -= dt * 1.2; e.vx += Math.sign(e.x - p.x) * 40; if (Math.random() < dt * 8) emit(embers, e.x, e.y + 100, 1, 80, 0.8, 60); if (e.hp <= 0) { e.state = 'dying'; e.t = 0; G.kills++; sfx('die'); emit(dark, e.x, e.y + 100, 40, 260, 1.4); } }
      if (e.burn > 0) { e.burn -= dt; e.hp -= dt * 1.0; if (Math.random() < dt * 20) emit(embers, e.x + R(-30, 30), e.y + R(40, 200), 1, 60, 0.7, 80); if (e.hp <= 0 && e.state !== 'dying') { e.state = 'dying'; e.t = 0; G.kills++; sfx('die'); emit(dark, e.x, e.y + 100, 40, 260, 1.4); } }
      if (e.state === 'stun') { if (e.t > 1.6) { e.state = 'chase'; e.t = 0; } }
      else if (e.state === 'hurt') { if (e.t > 0.28) { e.state = 'chase'; e.t = 0; } }
      else if (e.state === 'chase') {
        if (sameIsland) e.facing = Math.sign(dx) || e.facing;
        e.cd -= dt;
        const reach = e.big ? 190 : 140, spd = e.big ? 120 : 175;
        if (sameIsland && adx > reach * 0.8) e.vx += (Math.sign(dx) * spd - e.vx) * Math.min(1, dt * 4);
        else e.vx *= Math.max(0, 1 - dt * 6);
        if (sameIsland && adx < reach && e.cd <= 0 && G.mode === 'play') { e.state = 'windup'; e.t = 0; sfx('growl'); }
      } else if (e.state === 'windup') { e.vx *= 0.85; if (e.t > (e.big ? 0.75 : 0.55)) { e.state = 'lunge'; e.t = 0; e.vx = e.facing * (e.big ? 520 : 620); e.hitDone = false; } }
      else if (e.state === 'lunge') {
        if (!e.hitDone && Math.abs(P.x - (e.x + e.facing * 60)) < (e.big ? 150 : 110) && Math.abs(P.y - e.y) < 160) { e.hitDone = true; hurtPlayer(e.big ? 24 : 14, Math.sign(P.x - e.x) || e.facing); }
        if (e.t > 0.25) { e.state = 'recover'; e.t = 0; }
      } else if (e.state === 'recover') { e.vx *= 0.88; if (e.t > (e.big ? 0.9 : 0.6)) { e.state = 'chase'; e.t = 0; e.cd = R(0.5, 1.2); } }
      e.vx *= Math.max(0, 1 - dt * 1.5);
      e.x += e.vx * dt; e.x = Math.max(e.surf.x0 + 40, Math.min(e.surf.x1 - 40, e.x));
      e.y = surfaceY(e.surf, e.x);
      // separation
      for (const o of enemies) if (o !== e && o.state !== 'dead' && o.state !== 'dying' && Math.abs(o.x - e.x) < 70) e.x += Math.sign(e.x - o.x || 1) * 60 * dt;
    }
    // visuals
    const U = e.mat.uniforms; const moving = Math.min(1, Math.abs(e.vx) / 170);
    e.ph += dt * (3 + Math.abs(e.vx) * 0.02);
    U.uDef0.value.set(e.ph, 0.06 * moving, 0.02 * moving, 0.004);
    const lean = e.state === 'windup' ? 0.1 : e.state === 'lunge' ? -0.16 : e.state === 'stun' ? 0.05 * Math.sin(G.t * 20) : -0.03 * moving;
    U.uDef1.value.set(0, 0, lean, Math.sin(G.t * 2 + e.ph));
    U.uDef2.value.set(1, 1 + (e.state === 'windup' ? 0.04 : 0), 0.45, 0);
    U.uFlash.value = e.hitFlash * 0.8 + (e.state === 'windup' ? 0.25 + 0.25 * Math.sin(G.t * 30) : 0);
    U.uTint.value.setRGB(e.state === 'stun' ? 1.3 : 1, e.state === 'stun' ? 1.1 : 1, 1);
    U.uAlpha.value = e.state === 'dying' ? Math.max(0, 1 - e.t) : 1;
    e.m.position.set(e.x, e.y - (e.state === 'dying' ? e.t * 60 : 0), 0); e.m.scale.x = -e.facing * e.sc;
  }
}

// ---------------------------------------------------------------- player
const K = {}, Kp = {}; let mouseL = false, mouseR = false;
addEventListener('keydown', e => { if (!K[e.code]) Kp[e.code] = true; K[e.code] = true; if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3'].includes(e.code)) e.preventDefault(); onKey(e); });
addEventListener('keyup', e => { K[e.code] = false; });
canvas.addEventListener('mousedown', e => { if (e.button === 0) Kp.Mouse0 = true; if (e.button === 2) Kp.Mouse2 = true; startAmbience(); });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('blur', () => { for (const k in K) K[k] = false; });
function hurtPlayer(dmg, dir) {
  if (P.inv > 0 || P.dodgeT > 0 || G.mode !== 'play') return;
  G.hp = Math.max(0, G.hp - dmg); P.hurtT = 0.35; P.inv = 0.9; P.vx = dir * 420; P.vy = 380; P.ground = false; G.hurtV = 0.8; G.shake = 14; sfx('hurt');
  if (G.hp <= 0) die('The Drowned drag the flame down…');
}
function die(msg) { G.mode = 'dead'; G.deaths++; $('deathSub').textContent = msg; $('death').classList.remove('hidden'); }
function revive() {
  $('death').classList.add('hidden'); G.hp = 100; G.oil = Math.max(G.oil, 60);
  for (const e of enemies) if (e.state !== 'dead') { e.state = 'dead'; e.m.visible = false; }
  if (G.lit[2] && !G.wellOpen) { delete G.wave.L3; setTimeout(() => spawnWave('L3'), 1500); }
  respawn(); G.mode = 'play';
}
function respawn() { const x = G.checkpoint.x; P.x = x; P.y = groundAt(x) ?? 0; P.vx = P.vy = 0; P.ground = true; P.inv = 1.2; G.white = 0.4; }
function nearestProp() {
  let best = null, bd = 1e9;
  for (const p of props) {
    if (p.done) continue; if (p.kind === 'lantern' && G.lit[p.i]) continue;
    const d = Math.abs(p.x - P.x), dy = Math.abs((p.y ?? 0) - P.y);
    const r = p.kind === 'well' ? 260 : p.kind === 'pickup' ? 120 : 175;
    if (d < r && dy < 140 && d < bd) { best = p; bd = d; }
  }
  return best;
}
function interact(p) {
  if (!p) return;
  if (p.kind === 'lantern') lightLantern(p.i);
  else if (p.kind === 'gear') takeGear(p);
  else if (p.kind === 'shard') touchShard();
  else if (p.kind === 'pickup') { p.done = true; p.g.visible = false; G.pots[p.pk.kind]++; sfx('pickup'); toast(p.pk.kind === 'heal' ? 'Rust Draught +1 (press 1)' : 'Lamp Oil +1 (press 2)'); }
  else if (p.kind === 'well' && G.wellOpen) { P.vx = 520; P.vy = 700; P.ground = false; P.lock = 2; }
}
function lightLantern(i) {
  if (G.lit[i]) return; G.lit[i] = true; const p = posts[i]; p.lit.visible = true; p.unlit.visible = false; sfx('light'); G.flash = 0.35;
  emit(embers, p.head.x, p.head.y, 60, 380, 1.4, 120); G.checkpoint = { x: p.x + 120 };
  const n = G.lit.filter(Boolean).length;
  say(['<i>Nerith:</i> One flame back. The terrace remembers.', '<i>Nerith:</i> Two. The mist pulls away from the light.', '<i>Nerith:</i> The last lantern. Now the Well will listen.'][n - 1] || '', 4);
  spawnWave(LANTERNS[i].id);
}
function takeGear(p) {
  p.done = true; p.g.visible = false; G.gearGot[p.gear.id] = true;
  for (const [slot, set] of Object.entries(p.gear.slots)) { nerith.equip(slot, set); }
  sfx('level'); G.flash = 0.5; G.flashCol = [0.5, 0.95, 0.85]; emit(sparks, P.x, P.y + 120, 50, 500, 0.8);
  gearToast(p.gear.name, p.gear.id === 'warden_set' ? 'Slate-blue wardcloth and a ribbed bronze pauldron. Equipped (I to view).' : 'Bronze greaves of the old Warden. Equipped (I to view).');
  if (p.gear.id === 'warden_set') spawnWave('NICHE_AFTER');
}
let memTimer = null;
function touchShard() {
  if (G.shard) return; G.shard = true; shardP.done = true; shardP.spr.visible = false; sfx('shard');
  G.mode = 'memory'; G.memory = 0; $('memory').classList.add('on');
  const lines = ['<p class="q">— an echo, kept in glass —</p>', '<p>A woman in a slate-blue cloak climbs the Seventh Terrace. Her lantern burns with two flames.</p>', '<p class="q">“The Ring sleeps while one light is kept. Keep it, Warden.”</p>', '<p>She kept it for ninety years. Then the oil ran dry, and the Drowned learned to climb.</p>', '<p>The echo settles into your lantern. Its flame splits in two.</p>'];
  $('memLines').innerHTML = lines.join('');
  const ps = [...$('memLines').children]; ps.forEach((el, i) => setTimeout(() => el.classList.add('on'), 600 + i * 1700));
  memTimer = setTimeout(endMemory, 600 + lines.length * 1700 + 1600);
}
function endMemory() {
  if (G.mode !== 'memory') return; clearTimeout(memTimer);
  $('memory').classList.remove('on'); G.mode = 'play';
  nerith.equip('lantern', 'warden'); G.gearGot.kept_light = true; G.flash = 0.6; G.flashCol = [0.4, 1, 0.9];
  gearToast('The Kept Light', 'Your lantern now burns with a twin flame: wider light, a stronger flare.');
  G.checkpoint = { x: SHARD.x + 100 };
  spawnWave('SHARD_AFTER');
}
WAVES.NICHE_AFTER = [{ x: 7100, d: 0.6 }]; WAVES.SHARD_AFTER = [{ x: 15100, d: 0.8 }];
function flare() {
  if (G.flareCd > 0 || G.oil < 22) { if (G.oil < 22) toast('Not enough lamp oil (press 2)'); return; }
  G.oil -= 22; G.flareCd = 1.1; sfx('flare'); const up = nerith.gear.lantern === 'warden';
  G.flareT = 0.5; G.flash = 0.25;
  emit(embers, lantPos.x, lantPos.y, 70, up ? 700 : 520, 0.9);
  for (const e of enemies) if (['chase', 'windup', 'lunge', 'recover', 'hurt', 'stun'].includes(e.state) && Math.hypot(e.x - P.x, e.y - P.y) < (up ? 480 : 380)) { e.state = 'stun'; e.t = 0; e.burn = up ? 3 : 2; e.vx = Math.sign(e.x - P.x) * 300; }
}
const lantPos = new THREE.Vector3();
function updatePlayer(dt) {
  const left = K.KeyA || K.ArrowLeft, right = K.KeyD || K.ArrowRight;
  let ix = (right ? 1 : 0) - (left ? 1 : 0);
  const busy = G.mode !== 'play' || P.lock > 0; if (busy) ix = 0;
  if (P.lock > 0) P.lock -= dt;
  P.hurtT -= dt; P.inv -= dt; P.dodgeT -= dt; P.dodgeCd -= dt; P.coyote -= dt; P.jumpBuf -= dt; P.landT = Math.max(0, P.landT - dt * 4); P.comboT -= dt;
  if (!busy) {
    if (Kp.Space || Kp.KeyW && false) P.jumpBuf = 0.13;
    if ((Kp.ShiftLeft || Kp.ShiftRight) && P.dodgeCd <= 0 && (P.ground || P.airDodge)) { P.dodgeT = 0.26; P.dodgeCd = 0.55; P.inv = Math.max(P.inv, 0.3); if (!P.ground) { P.airDodge = false; P.vy = Math.max(P.vy, 60); } if (ix) P.facing = ix; sfx('blade'); ghosts(); }
    if ((Kp.KeyJ || Kp.Mouse0) && P.attackT <= 0.08) { P.attackN = P.comboT > 0 ? P.attackN + 1 : 0; P.attackDur = P.attackN % 3 === 2 ? 0.46 : 0.34; P.attackT = P.attackDur; P.comboT = P.attackDur + 0.32; P.hitDone = false; sfx('swing'); if (ix) P.facing = ix; }
    if (Kp.KeyK || Kp.Mouse2) flare();
    if (Kp.Digit1) { if (G.pots.heal > 0 && G.hp < 100) { G.pots.heal--; G.hp = Math.min(100, G.hp + 45); sfx('drink'); toast('Rust Draught: +45 life'); } }
    if (Kp.Digit2) { if (G.pots.oil > 0 && G.oil < 100) { G.pots.oil--; G.oil = Math.min(100, G.oil + 60); sfx('drink'); toast('Lamp Oil: +60 oil'); } }
    if (Kp.KeyE) interact(nearestProp());
  }
  const accel = P.ground ? 3200 : 2000, maxv = 440;
  if (P.dodgeT > 0) { P.vx = P.facing * 980; }
  else if (P.hurtT > 0) { }
  else { const target = ix * maxv * (P.attackT > 0 && P.ground ? 0.35 : 1); P.vx += Math.sign(target - P.vx) * Math.min(Math.abs(target - P.vx), accel * dt); if (ix) P.facing = ix; }
  // jump
  if (P.jumpBuf > 0 && (P.ground || P.coyote > 0) && !busy) { P.vy = 1060; P.ground = false; P.coyote = 0; P.jumpBuf = 0; sfx('step'); emit(motes, P.x, P.y, 6, 120, 0.6); }
  if (!(K.Space) && P.vy > 400 && !P.ground && P.lock <= 0) P.vy = 400 + (P.vy - 400) * Math.pow(0.0001, dt);   // variable height
  const grav = P.dodgeT > 0 ? 600 : 2700; P.vy -= grav * dt; P.vy = Math.max(P.vy, -1800);
  // horizontal move with walls (higher surfaces block)
  const feet = P.y;
  let nx = P.x + P.vx * dt;
  const gNew = groundAt(nx);
  if (gNew !== null && gNew > feet + 46) { nx = P.x; P.vx = 0; }
  if (!G.wellOpen && nx > WELL.sealX - 30 && nx > P.x) { nx = Math.min(nx, WELL.sealX - 30); P.vx = Math.min(P.vx, 0); }
  P.x = nx;
  // vertical
  const g = groundAt(P.x); let ny = P.y + P.vy * dt;
  const was = P.ground;
  if (g !== null && ny <= g && P.y >= g - 50 && P.vy <= 0) { if (!was && P.vy < -900) { P.landT = 0.25; G.shake = Math.max(G.shake, 4); } if (!was) { emit(motes, P.x, g, 8, 160, 0.5); sfx('step'); } ny = g; P.vy = 0; P.ground = true; P.airDodge = true; }
  else { if (P.ground) P.coyote = 0.1; P.ground = false; }
  if (P.ground && g !== null) ny = g;
  P.y = ny;
  if (P.attackT > 0) {
    P.attackT -= dt; const k = 1 - P.attackT / P.attackDur;
    if (!P.hitDone && k > 0.3) { P.hitDone = true; let hit = false; for (const e of enemies) { const ex = (e.x - P.x) * P.facing; if (ex > -30 && ex < (e.big ? 230 : 200) && Math.abs(e.y - P.y) < 170) hit = hurtEnemy(e, P.attackN % 3 === 2 ? 2 : 1, P.facing) || hit; } if (!hit) sfx('strikeMiss'); }
  }
  // island change: checkpoint + area title
  const isl = islandAt(P.x); if (isl && P.ground) { const idx = ISLANDS.indexOf(isl.island); if (idx !== G.island) { G.island = idx; } if (!G.areaShown[idx]) { G.areaShown[idx] = true; area(isl.island.name); } if (G.checkpoint.x < isl.x0 || idx > (G.cpIsland ?? -1)) { if (idx > (G.cpIsland ?? -1)) { G.cpIsland = idx; G.checkpoint = { x: Math.max(isl.x0 + 160, Math.min(P.x, isl.x0 + 400)) }; } } }
  // fell into the abyss
  if (P.y < -1300 && !(G.wellOpen && P.x > WELL.x - 80)) { G.falls++; G.hp = Math.max(1, G.hp - 15); respawn(); say('<i>Nerith:</i> The mist gives me back… this time.', 3); }
  if (G.wellOpen && P.x > WELL.x - 60 && P.y < wellP.y - 380 && G.mode === 'play') startFall();
  G.oil = Math.min(100, G.oil + dt * 2.2); G.flareCd -= dt;
}
const ghostsArr = [];
function ghosts() {
  const t = nerith.body.material.uniforms.map.value;
  for (let i = 0; i < 3; i++) setTimeout(() => { if (!nerith) return; const m = quad(new THREE.MeshBasicMaterial({ map: t, color: 0x6fd8d0, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }), 312 * 0.38, 576 * 0.38, P.x, P.y, (105 / 312), (4 / 576)); m.scale.x = -P.facing; m.renderOrder = W.playBase + 99; PLAY.add(m); ghostsArr.push({ m, t: 0.3 }); }, i * 60);
}

// ---------------------------------------------------------------- camera
const cam = { x: START.x + 300, y: 260, zoom: 1, look: 0, targetZoom: 1 };
function updateCamera(dt, snap = false) {
  let tz = 1, dy = 0, bars = 0;
  for (const v of VISTAS) if (P.x > v.x0 && P.x < v.x1) { const e = Math.min(1, (P.x - v.x0) / 500, (v.x1 - P.x) / 500); tz = 1 + (v.zoom - 1) * e; dy = v.dy * e; bars = v.name ? e : 0; }
  if (G.mode === 'memory') { tz = 0.78; bars = 1; }
  cam.look += ((P.facing * 220 + P.vx * 0.25) - cam.look) * Math.min(1, dt * 1.6);
  const tx = P.x + cam.look, ty = P.y + 280 + dy + (P.vy < -900 ? -140 : 0);
  const k = snap ? 1 : Math.min(1, dt * 3.2), ky = snap ? 1 : Math.min(1, dt * 2.4);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * ky; cam.zoom += (tz - cam.zoom) * (snap ? 1 : Math.min(1, dt * 0.9));
  G.bars += (bars - G.bars) * Math.min(1, dt * 2);
  const sh = G.shake; G.shake = Math.max(0, G.shake - dt * 40);
  const asp = innerWidth / innerHeight, h = 1080 / cam.zoom, w = h * asp;
  camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2; camera.updateProjectionMatrix();
  camera.position.x = cam.x + (Math.random() - 0.5) * sh; camera.position.y = cam.y + (Math.random() - 0.5) * sh;
}

// ---------------------------------------------------------------- lights
function setLights() {
  const L = []; const up = nerith && nerith.gear.lantern === 'warden'; const def = LANTERN_DEFS[up ? 'warden' : 'base'];
  const fl = 0.92 + 0.08 * Math.sin(G.t * 13) * Math.sin(G.t * 7.3);
  const flareK = Math.max(0, G.flareT || 0) * 2;
  L.push([lantPos.x, lantPos.y, def.radius * (1 + flareK * 0.8), def.inten * fl * (1 + flareK * 2), ...def.col]);
  if (def.col2) L.push([lantPos.x - 10, lantPos.y + 10, def.radius * 0.7, 0.8 * fl, ...def.col2]);
  L.push([P.x - P.facing * 140, P.y + 260, 300, 0.25, 0.4, 0.6, 0.7]);  // soft cool fill behind her (rim support)
  for (const p of posts) if (G.lit[p.i]) L.push([p.head.x, p.head.y, 820, 1.2 * (0.95 + 0.05 * Math.sin(G.t * 9 + p.i)), 1.0, 0.62, 0.28]);
  for (const it of items) if (!it.done) L.push([it.x, it.y + 120, 420, 0.8, 0.45, 0.95, 0.85]);
  if (!G.shard) L.push([SHARD.x, shardP.y + 150, 520, 1.0, 0.75, 1.0, 0.95]);
  L.push([WELL.x + 380, wellP.y - 200, 1400, G.wellOpen ? 1.2 : 0.45, 0.45, 0.9, 0.85]);
  if (!G.wellOpen) L.push([WELL.sealX, wellP.y + 250, 500, 0.6, 1.0, 0.7, 0.35]);
  for (const e of enemies) if (e.state !== 'dead' && e.state !== 'wait' && L.length < MAXL - 1) L.push([e.x - e.facing * 25 * e.sc / 0.48, e.y + 205 * e.sc / 0.48, 150, e.state === 'windup' ? 1.2 : 0.45, 0.35, 0.75, 1.0]);
  // sort by distance to camera, keep MAXL
  L.sort((a, b) => Math.abs(a[0] - cam.x) - Math.abs(b[0] - cam.x));
  LIGHTS.n.value = Math.min(MAXL, L.length);
  for (let i = 0; i < LIGHTS.n.value; i++) { const l = L[i]; LIGHTS.pos[i].set(l[0], l[1], l[2], l[3]); LIGHTS.col[i].set(l[4], l[5], l[6]); }
}

// ---------------------------------------------------------------- HUD helpers
let subT = 0, toastT = 0, areaT = 0, gearT = 0;
function say(html, s = 4) { $('sub').innerHTML = html; $('sub').style.opacity = 1; subT = s; }
function toast(t) { $('toast').textContent = t; $('toast').classList.add('on'); toastT = 2.2; }
function area(name) { $('area').innerHTML = `<small>Ossaryn</small>${name}`; $('area').classList.add('on'); areaT = 3.2; }
function gearToast(n, d) { $('gearName').textContent = n; $('gearDesc').textContent = d; $('gearToast').classList.add('on'); gearT = 4.5; }
function objective() {
  const n = G.lit.filter(Boolean).length;
  if (n < 3) return `Relight the terrace lanterns (${n}/3)`;
  if (!G.wellOpen) return `Drive back the Drowned (${aliveIn('L3')} left)`;
  return 'The Well of Descent is open: leap in';
}
function updateHUD(dt) {
  $('hpFill').style.width = G.hp + '%'; $('oilFill').style.width = G.oil + '%';
  $('nHeal').textContent = G.pots.heal; $('nOil').textContent = G.pots.oil; $('cdFlare').textContent = G.flareCd > 0 ? Math.ceil(G.flareCd) : '';
  $('objText').textContent = objective();
  const p = G.mode === 'play' ? nearestProp() : null; const pr = $('prompt');
  let txt = '';
  if (p) {
    if (p.kind === 'well') txt = G.wellOpen ? '<b>E</b>Leap into the Well of Descent' : (G.lit.filter(Boolean).length < 3 ? '<span class="info">The Well is sealed: relight all three terrace lanterns</span>' : '<span class="info">The seal holds while the Drowned remain</span>');
    else txt = `<b>E</b>${p.text}`;
  }
  if (txt) { pr.innerHTML = txt; pr.classList.remove('hidden'); } else pr.classList.add('hidden');
  if ((subT -= dt) <= 0) $('sub').style.opacity = 0;
  if ((toastT -= dt) <= 0) $('toast').classList.remove('on');
  if ((areaT -= dt) <= 0) $('area').classList.remove('on');
  if ((gearT -= dt) <= 0) $('gearToast').classList.remove('on');
}
// inventory
const SLOT_INFO = {
  cloak: { label: 'Cloak', base: 'Bearer\u2019s wool cloak', warden: 'Warden\u2019s slate cloak', need: 'warden_set' },
  shoulders: { label: 'Shoulders', base: 'Wool mantle', warden: 'Ribbed bronze pauldron', need: 'warden_set' },
  legs: { label: 'Legs', base: 'Travel boots', warden: 'Warden greaves', need: 'greaves' },
  lantern: { label: 'Lantern', base: 'Bearer\u2019s lantern', warden: 'The Kept Light (twin flame)', need: 'kept_light' },
};
function drawInv() {
  const d = $('invDoll').getContext('2d'); d.clearRect(0, 0, 312, 576); d.drawImage(nerith.cv, 0, 0);
  const li = new Image(); li.onload = () => { d.drawImage(li, -60 + (114 - 240) / 2 + 60, 236 / 2 - 0, 52, 130); }; li.src = `assets/img/n_lantern_${nerith.gear.lantern}.png`;
  const st = new Image(); st.onload = () => { d.drawImage(st, -60, 55, 126, 265); d.drawImage(li, (114 - 240) / 2, 118, 52, 130); }; st.src = 'assets/img/n_staff.png';
  $('slots').innerHTML = Object.entries(SLOT_INFO).map(([s, I]) => {
    const cur = nerith.gear[s], owned = G.gearGot[I.need];
    const icon = s === 'lantern' ? `assets/img/n_lantern_${cur}.png` : `assets/img/ico_${s}_${cur}.png`;
    return `<div class="slot" data-s="${s}"><div class="ico" style="background-image:url(${icon});background-size:contain;background-position:center"></div><div><div class="s">${I.label}</div><div class="n ${cur === 'warden' ? 'new' : ''}">${I[cur]}</div><div class="o">${owned ? 'Owned: ' + I.base + ' · ' + I.warden : 'Owned: ' + I.base}</div></div></div>`;
  }).join('');
  for (const el of $('slots').children) el.onclick = () => { const s = el.dataset.s, I = SLOT_INFO[s]; if (!G.gearGot[I.need]) return; nerith.equip(s, nerith.gear[s] === 'warden' ? 'base' : 'warden'); sfx('equip'); drawInv(); };
}
function toggleInv(on) { G.inv = on ?? !G.inv; $('inv').classList.toggle('hidden', !G.inv); if (G.inv) drawInv(); }

// ---------------------------------------------------------------- flow
function onKey(e) {
  if (e.code === 'F3') $('fps').classList.toggle('hidden');
  if (e.code === 'KeyO') setQuality(quality === 'high' ? 'low' : 'high');
  if (G.mode === 'title' && (e.code === 'Enter')) begin();
  if (G.mode === 'dead' && e.code === 'Enter') revive();
  if (G.mode === 'cut' && (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space')) endCut();
  if (G.mode === 'card' && (e.code === 'Enter' || e.code === 'Space')) startPlay();
  if (G.mode === 'memory' && (e.code === 'Escape' || e.code === 'Enter')) endMemory();
  if (G.mode === 'play' || G.mode === 'pause') {
    if (e.code === 'KeyI') toggleInv();
    if (e.code === 'Escape') { if (G.inv) toggleInv(false); else if (G.mode === 'play') { G.mode = 'pause'; $('pause').classList.remove('hidden'); } else { G.mode = 'play'; $('pause').classList.add('hidden'); } }
    if (e.code === 'KeyR' && G.mode === 'play') { respawn(); toast('Back to the last checkpoint'); }
    if (e.code === 'KeyN' && e.shiftKey && G.mode === 'play') debugSkip();
  }
}
function setQuality(q) { quality = q; localStorage.setItem('side_q', q); post.bloom.enabled = q === 'high'; resize(); for (const b of ['qualT', 'qualP']) $(b).textContent = 'Quality: ' + (q === 'high' ? 'High' : 'Low'); }
setQuality(quality);
$('qualT').onclick = $('qualP').onclick = () => setQuality(quality === 'high' ? 'low' : 'high');
$('begin').onclick = () => begin();
$('resume').onclick = () => { G.mode = 'play'; $('pause').classList.add('hidden'); };
$('revive').onclick = () => revive();
$('again').onclick = () => location.reload();
$('cutSkip').onclick = () => endCut();
$('card').onclick = () => { if (G.mode === 'card') startPlay(); };
let cutNext = null;
function playCut(src, next) {
  G.mode = 'cut'; cutNext = next; const v = $('cutVideo'); $('cut').classList.remove('hidden'); v.src = src; v.currentTime = 0; v.muted = false;
  v.play().catch(() => { v.muted = true; v.play().catch(() => endCut()); }); v.onended = () => endCut();
}
function endCut() { if (G.mode !== 'cut') return; const v = $('cutVideo'); v.pause(); $('cut').classList.add('hidden'); const n = cutNext; cutNext = null; n && n(); }
function begin() { startAmbience(); $('title').classList.add('hidden'); playCut('assets/cutscenes/cs01_the_ring_wakes.mp4', showCard); }
function showCard() {
  G.mode = 'card'; $('card').classList.remove('hidden');
  $('cardLines').innerHTML = ['For a thousand years the Warden Ring slept beneath the Undermere.', 'Tonight it woke. One by one the lanterns of the seventh terrace went out, and the Drowned began to climb out of the Hollow.', '<span class="q">Elder Teyth: “Nerith. Keep the terrace lit. Then find the Well.”</span>'].map(l => `<p>${l}</p>`).join('');
  [...$('cardLines').children].forEach((p, i) => setTimeout(() => p.classList.add('on'), 300 + i * 900)); setTimeout(() => $('cardGo').classList.add('on'), 2600);
}
function startPlay() { $('card').classList.add('hidden'); $('hud').classList.remove('hidden'); G.mode = 'play'; area(ISLANDS[0].name); G.areaShown[0] = true; say('<i>Nerith:</i> Three lanterns dark. The Drowned will be climbing.', 4.5); updateCamera(0, true); }
function debugSkip() {
  const n = G.lit.filter(Boolean).length;
  if (n < 1) { P.x = LANTERNS[0].x - 120; lightLantern(0); }
  else if (!G.gearGot.warden_set) { P.x = GEAR[0].x - 60; takeGear(items[0]); }
  else if (n < 2) { P.x = LANTERNS[1].x - 120; lightLantern(1); }
  else if (!G.gearGot.greaves) { P.x = GEAR[1].x - 60; takeGear(items[1]); }
  else if (!G.shard) { P.x = SHARD.x - 80; touchShard(); endMemory(); }
  else if (n < 3) { P.x = LANTERNS[2].x - 120; lightLantern(2); }
  else if (!G.wellOpen) { for (const e of enemies) if (e.state !== 'dead') { e.state = 'dead'; e.m.visible = false; } }
  else { P.x = WELL.sealX + 40; }
  for (const e of enemies) if (e.state !== 'dead' && e.wave !== 'L3') { e.state = 'dead'; e.m.visible = false; }
  P.y = groundAt(P.x) ?? P.y; P.vx = P.vy = 0; P.ground = true; toast('Debug: skipped ahead');
}
function openWell() { G.wellOpen = true; sfx('open'); G.flash = 0.4; G.flashCol = [0.5, 1, 0.9]; say('<i>Nerith:</i> The seal breaks. The Well breathes in.', 4); G.checkpoint = { x: WELL.sealX - 200 }; }
// ---------------------------------------------------------------- the fall down the Well
const fallG = new THREE.Group(); fallG.visible = false; scene.add(fallG);
const wellTiles = [];
for (let i = 0; i < 4; i++) { const m = quad(litMat(tex('env_well.jpg'), { amb: 0xd8e2e2, emis: 0.8, emisT: 0.45, edge: [0.12, 0.12, 0.04, 0.04] }), 1500, 2667, 0, -i * 2600); if (i % 2) m.scale.x = -1; m.renderOrder = 200000 + i; fallG.add(m); wellTiles.push(m); }
const fallMist = quad(fxMat(tex('mist.png'), new THREE.Color(0x9fc8c4), 0.25, false), 3000, 1400, 0, 0); fallMist.renderOrder = 200010; fallG.add(fallMist);
function startFall() {
  G.mode = 'fall'; G.fallT = 0; $('hud').classList.add('hidden'); sfx('jump');
  for (const l of W.layers) l.g.visible = false; rain.visible = false; fallG.visible = true;
  PLAY.visible = true; for (const c of PLAY.children) c.visible = false; nerith.root.visible = true; embers.pts.visible = true;
  P.fx = 0; P.fy = 0; nerith.root.renderOrder = 0;
  for (const m of [nerith.body]) m.renderOrder = 200020;
  nerith.root.traverse(o => { if (o.isMesh) o.renderOrder = 200020 + (o.renderOrder - W.playBase) % 10; });
  embers.pts.renderOrder = 200030;
  W.layer.play.g.scale.set(1, 1, 1); W.layer.play.g.position.set(0, 0, 0);
}
function updateFall(dt) {
  G.fallT += dt; const t = G.fallT;
  P.x = Math.sin(t * 0.9) * 90; P.y = -t * 1100 - 200; P.vx = Math.cos(t * 0.9) * 80; P.vy = -1400; P.ground = false;
  cam.x = 0; cam.y = P.y + 120; cam.zoom = 0.7;
  for (let i = 0; i < wellTiles.length; i++) { const m = wellTiles[i]; const base = Math.floor((cam.y) / 2600) * 2600; m.position.y = base + 2600 - i * 2600; }
  fallMist.position.y = cam.y - 300 + Math.sin(t) * 40;
  if (Math.random() < 0.8) emit(embers, R(-700, 700), cam.y - 900, 3, 120, 2.0, 1400);
  G.white = Math.max(0, (t - 4.6) / 1.0);
  if (t > 5.8 && G.mode === 'fall') { G.mode = 'cut'; playCut('assets/cutscenes/cs03_the_fall.mp4', showEnd); G.mode = 'cut'; }
}
function showEnd() {
  G.mode = 'end'; G.white = 0; $('end').classList.remove('hidden');
  const t = Math.round(G.playT); const gears = ['warden_set', 'greaves', 'kept_light'].filter(g => G.gearGot[g]).length;
  $('endStats').innerHTML = `Lanterns relit: ${G.lit.filter(Boolean).length}/3 · Gear found: ${gears}/3 · Drowned destroyed: ${G.kills} · Falls: ${G.falls} · Deaths: ${G.deaths}<br>Time: ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- loop
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsLast = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = Math.max(last, now);
  fpsN++; if (now - fpsLast > 1000) { G.fps = Math.round(fpsN * 1000 / (now - fpsLast)); fpsN = 0; fpsLast = now; $('fps').textContent = G.fps + ' fps · ' + quality; }
  if (!nerith) { return; }
  if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.15; }
  const active = G.mode === 'play' || G.mode === 'memory' || G.mode === 'fall';
  if (G.inv || G.mode === 'pause') dt = 0;
  G.t += dt; SHARED.uTime.value = G.t;
  if (G.mode === 'play') G.playT += dt;
  if (G.mode === 'fall') updateFall(dt);
  else if (active) { updatePlayer(dt); updateEnemies(dt); }
  if (G.lit.every(Boolean) && G.wave.L3 && !G.wellOpen && aliveIn('L3') === 0 && enemies.some(e => e.wave === 'L3')) openWell();
  for (const k in Kp) delete Kp[k];
  // rig
  const r = nerith.update(dt, G.t, { ...P, landT: P.landT });
  lantPos.copy(r.lantern);
  if (G.mode !== 'fall') updateCamera(dt);
  else { const asp = innerWidth / innerHeight, h = 1080 / cam.zoom, w = h * asp; camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2; camera.updateProjectionMatrix(); camera.position.set(cam.x, cam.y, 10); }
  if (G.mode !== 'fall') W.update(camera.position, cam.zoom, G.t);
  setLights();
  // props animation
  for (const p of posts) p.glow.material.opacity = G.lit[p.i] ? 0.5 + 0.06 * Math.sin(G.t * 9 + p.i) : 0;
  for (const it of items) if (!it.done) { it.spr.position.y = 120 + Math.sin(G.t * 2) * 10; it.glow.material.opacity = 0.45 + 0.1 * Math.sin(G.t * 3); }
  if (!G.shard) { shardP.spr.position.y = 150 + Math.sin(G.t * 1.6) * 12; shardP.spr.rotation.z = Math.sin(G.t * 0.7) * 0.1; }
  wellP.open += ((G.wellOpen ? 1 : 0) - wellP.open) * Math.min(1, dt * 1.5);
  wellP.seal.material.opacity = 0.55 * (1 - wellP.open) * (0.8 + 0.2 * Math.sin(G.t * 5)); wellP.sealGlow.material.opacity = 0.4 * (1 - wellP.open);
  wellP.beam.material.opacity = 0.18 + 0.3 * wellP.open; wellP.beam2.material.opacity = 0.08 + 0.15 * wellP.open;
  // particles
  for (const p of posts) if (G.lit[p.i] && Math.random() < dt * 6) emit(embers, p.head.x + R(-10, 10), p.head.y, 1, 40, 2.4, 70, 1.2);
  if (Math.random() < dt * 5) emit(embers, lantPos.x, lantPos.y + 10, 1, 30, 1.6, 50, 1);
  for (const sys of [embers, sparks, dark]) {
    for (let i = 0; i < sys.n; i++) { const d = sys.data[i]; if (d.life > 0) { d.life -= dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 1 - dt * 1.2; if (sys === sparks) d.vy -= 900 * dt; else d.vy += (sys === dark ? 30 : 10) * dt; d.x += Math.sin(G.t * 2 + i) * 12 * dt; } sys.pos[i * 3] = d.x; sys.pos[i * 3 + 1] = d.life > 0 ? d.y : -99999; }
    sys.pts.geometry.attributes.position.needsUpdate = true;
  }
  for (let i = 0; i < motes.n; i++) { const d = motes.data[i]; d.x += Math.sin(G.t * 0.3 + i) * 10 * dt; d.y += Math.cos(G.t * 0.2 + i * 1.3) * 8 * dt;
    const vw = 1200 / cam.zoom; if (d.x < cam.x - vw) d.x += vw * 2; if (d.x > cam.x + vw) d.x -= vw * 2; if (d.y < cam.y - 700 / cam.zoom) d.y += 1400 / cam.zoom; if (d.y > cam.y + 700 / cam.zoom) d.y -= 1400 / cam.zoom;
    motes.pos[i * 3] = d.x; motes.pos[i * 3 + 1] = d.y; }
  motes.pts.geometry.attributes.position.needsUpdate = true;
  if (rain.visible) { const vw = 1100 / cam.zoom, vh = 650 / cam.zoom; for (let i = 0; i < RAIN_N; i++) { const d = rainD[i]; d.y -= 1500 * d.s * dt; d.x -= 260 * d.s * dt; let x = cam.x + ((d.x - cam.x) % (vw * 2) + vw * 3) % (vw * 2) - vw, y = cam.y + ((d.y - cam.y) % (vh * 2) + vh * 3) % (vh * 2) - vh; rainPos[i * 6] = x; rainPos[i * 6 + 1] = y; rainPos[i * 6 + 3] = x + 5 * d.s; rainPos[i * 6 + 4] = y + 28 * d.s; } rainGeo.attributes.position.needsUpdate = true; }
  for (let i = ghostsArr.length - 1; i >= 0; i--) { const g = ghostsArr[i]; g.t -= dt; g.m.material.opacity = Math.max(0, g.t) * 1.2; if (g.t <= 0) { PLAY.remove(g.m); ghostsArr.splice(i, 1); } }
  // post uniforms
  const U = post.U; U.uT.value = G.t; G.flash = Math.max(0, G.flash - dt * 1.6); G.hurtV = Math.max(0, G.hurtV - dt * 1.8); G.flareT = Math.max(0, (G.flareT || 0) - dt);
  U.uFlash.value = G.flash * 0.5; if (G.flashCol) U.uFlashCol.value.setRGB(...G.flashCol); if (G.flash <= 0) G.flashCol = null, U.uFlashCol.value.setRGB(1, 0.62, 0.25);
  U.uHurt.value = G.hurtV; U.uWhite.value = G.white; G.white = G.mode === 'fall' ? G.white : Math.max(0, G.white - dt * 1.5);
  U.uBars.value = G.bars; G.sepia += ((G.mode === 'memory' ? 0.55 : 0) - G.sepia) * Math.min(1, dt * 1.5); U.uSepia.value = G.sepia;
  if (G.mode === 'play' || G.mode === 'memory') updateHUD(dt);
  post.comp.render();
}
// ---------------------------------------------------------------- boot
(async () => {
  nerith = await makeNerith(W.playBase + 100);
  PLAY.add(nerith.root);
  // dev-only lookdev hook: ?x=..&lit=n&gear=1&greaves=1&shard=1&open=1&noenemy&mode=play
  if (qs.get('x')) {
    $('title').classList.add('hidden'); $('hud').classList.remove('hidden'); G.mode = 'play';
    P.x = +qs.get('x'); P.y = groundAt(P.x) ?? 0; if (qs.get('face')) P.facing = +qs.get('face');
    const n = +(qs.get('lit') || 0); for (let i = 0; i < n; i++) { G.lit[i] = true; posts[i].lit.visible = true; posts[i].unlit.visible = false; }
    if (qs.get('gear')) { items[0].done = true; items[0].g.visible = false; G.gearGot.warden_set = true; nerith.equip('cloak', 'warden'); nerith.equip('shoulders', 'warden'); }
    if (qs.get('greaves')) { items[1].done = true; items[1].g.visible = false; G.gearGot.greaves = true; nerith.equip('legs', 'warden'); }
    if (qs.get('shard')) { G.shard = true; shardP.spr.visible = false; G.gearGot.kept_light = true; nerith.equip('lantern', 'warden'); }
    if (qs.get('open')) G.wellOpen = true;
    if (qs.get('enemy')) for (const s of qs.get('enemy').split(';')) { const [x, big] = s.split(','); const e = spawnEnemy(+x, big === 'big'); e.state = 'chase'; e.y = e.ty; e.m.visible = true; e.m.renderOrder = W.playBase + 200; }
    nerith.setFlash(0); G.areaShown = Object.fromEntries(ISLANDS.map((_, i) => [i, true]));
    for (let i = 0; i < 30; i++) updateCamera(0.1); updateCamera(0, true);
  }
  requestAnimationFrame(frame);
})();
window.__sideProbe = () => ({
  mode: G.mode, t: +G.t.toFixed(2), pos: [Math.round(P.x), Math.round(P.y)], vel: [Math.round(P.vx), Math.round(P.vy)], ground: P.ground, facing: P.facing,
  hp: Math.round(G.hp), oil: Math.round(G.oil), pots: { ...G.pots }, gear: nerith ? { ...nerith.gear } : null, gearGot: { ...G.gearGot }, lit: [...G.lit], shard: G.shard, wellOpen: G.wellOpen,
  objective: objective(), prompt: $('prompt').classList.contains('hidden') ? '' : $('prompt').textContent, checkpoint: G.checkpoint.x, island: G.island,
  cam: { x: Math.round(cam.x), y: Math.round(cam.y), zoom: +cam.zoom.toFixed(2) }, inv: G.inv, kills: G.kills, deaths: G.deaths, falls: G.falls, fps: G.fps, quality,
  enemies: enemies.filter(e => e.state !== 'dead').map(e => ({ x: Math.round(e.x), y: Math.round(e.y), state: e.state, hp: +e.hp.toFixed(1), big: e.big, wave: e.wave, dx: Math.round(e.x - P.x) })),
  props: props.filter(p => !p.done).map(p => ({ kind: p.kind, x: Math.round(p.x) })), wellX: WELL.x, sealX: WELL.sealX, fallT: G.fallT || 0, area: $('area').textContent,
});
