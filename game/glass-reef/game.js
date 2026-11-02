// The Aether Realms — The Glass Reef (playable prototype)
// Vanilla JS + Canvas 2D. Logical view height is 720 units; width follows the screen aspect.
(() => {
'use strict';
const H = 720;
const PLATE_W = 1920;            // reef_panorama.jpg width (logical units)
const WORLD_W = 3900;            // sailing area width
const ARCH = { x: 1571, y: 455, base: 548 }; // arch opening in plate coordinates
const D_Y0 = 566, D_Y1 = 690;    // waterline y at far (d=0) and near (d=1)
const LINES = {
  intro: 'Past the edge of the frozen sea, the reef of Ithmere still glows from the inside.',
  echoes: [
    'Ithmere was never built. It grew — one ring of ice for every winter, for ten thousand winters.',
    'The light inside is not the aurora’s. The reef has kept it from a summer no one living remembers.',
    'Rowers who rest their oars here swear the ice is humming. Always three notes. Always counting.',
    'Return the echoes, they say, and the reef will remember the way through.'
  ],
  open: 'The reef remembers. The arch is open.'
};
const SHARDS_DEF = [ { x: 820, d: 0.62 }, { x: 1620, d: 0.08 }, { x: 2380, d: 0.95 }, { x: 3060, d: 0.42 } ];

const $ = (id) => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d', { alpha: false });
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// ---------- assets ----------
const IMG = {};
function loadImg(name, src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => { IMG[name] = i; res(); }; i.onerror = () => rej(new Error('Failed to load ' + src)); i.src = src; });
}
function makeCanvas(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; }
function glowSprite(rgb, hard = 0) {
  return makeCanvas(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.15 + hard * 0.3, `rgba(${rgb},${0.6 + hard * 0.3})`);
    gr.addColorStop(0.45, `rgba(${rgb},0.18)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
}
const SPR = {
  amber: glowSprite('255,170,70'), warm: glowSprite('255,210,150', 0.4),
  blue: glowSprite('140,175,255'), violet: glowSprite('170,120,255'), white: glowSprite('235,240,255', 0.5),
  mist: makeCanvas(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(200,215,240,0.9)'); gr.addColorStop(0.5, 'rgba(190,205,235,0.35)'); gr.addColorStop(1, 'rgba(190,205,235,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }),
  aurora: makeCanvas(4, 256, (g) => { const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(150,80,255,0)'); gr.addColorStop(0.3, 'rgba(160,90,255,0.55)'); gr.addColorStop(0.62, 'rgba(70,255,160,0.9)');
    gr.addColorStop(0.75, 'rgba(90,255,170,0.5)'); gr.addColorStop(1, 'rgba(60,255,150,0)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); }),
  vignette: makeCanvas(256, 144, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h * 0.55, h * 0.35, w / 2, h * 0.55, w * 0.62);
    gr.addColorStop(0, 'rgba(2,4,14,0)'); gr.addColorStop(1, 'rgba(2,4,14,0.62)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); })
};

// ---------- view / resize ----------
let VW = 1280, K = 1, renderScale = 1, dpr = 1;
function resize() {
  const w = innerWidth, h = innerHeight;
  let cw = w, ch = h; const a = w / h;
  if (a > 2.4) cw = h * 2.4; else if (a < 1.33) ch = w / 1.33;
  dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 1.75);
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  canvas.width = Math.round(cw * dpr * renderScale); canvas.height = Math.round(ch * dpr * renderScale);
  K = canvas.height / H; VW = canvas.width / K;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  $('rotate').classList.toggle('hidden', !(isTouch && h > w));
}
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 200));

// ---------- state ----------
const S = {
  state: 'loading', t: 0, camX: 0, archOpen: 0, opened: false, found: 0, endT: 0,
  skiff: { x: 260, d: 0.55, vx: 0, vd: 0, face: 1, faceS: 1, alpha: 1, shrink: 1 },
  shards: [], wake: [], sparks: [], bursts: [], keys: {}, pointer: null, hintArch: false
};
function resetWorld() {
  Object.assign(S, { archOpen: 0, opened: false, found: 0, endT: 0, camX: 0, hintArch: false, wake: [], sparks: [], bursts: [] });
  Object.assign(S.skiff, { x: 260, d: 0.55, vx: 0, vd: 0, face: 1, faceS: 1, alpha: 1, shrink: 1 });
  S.shards = SHARDS_DEF.map((s, i) => ({ ...s, i, got: false, ph: i * 1.7 }));
  $('pips').innerHTML = SHARDS_DEF.map(() => '<span></span>').join('');
}

// ambient particles
const rnd = (a, b) => a + Math.random() * (b - a);
const stars = Array.from({ length: 170 }, () => ({ x: rnd(0, PLATE_W), y: rnd(0, 420) ** 1 * 1, s: rnd(0.6, 1.8), ph: rnd(0, 6.28), sp: rnd(0.6, 2.4) }));
const snow = Array.from({ length: 150 }, () => ({ x: rnd(0, 2000), y: rnd(0, H), z: rnd(0.3, 1.3), ph: rnd(0, 6.28) }));
const mistFar = Array.from({ length: 11 }, (_, i) => ({ x: i * 260 + rnd(-80, 80), y: rnd(505, 575), w: rnd(420, 820), h: rnd(70, 130), a: rnd(0.08, 0.15), sp: rnd(4, 10) }));
const mistNear = Array.from({ length: 6 }, (_, i) => ({ x: i * 700 + rnd(-100, 100), y: rnd(660, 740), w: rnd(700, 1100), h: rnd(90, 150), a: rnd(0.05, 0.09), sp: rnd(8, 16) }));
const ripples = Array.from({ length: 170 }, () => ({ u: rnd(0, 6000), d: Math.pow(Math.random(), 0.8) * 1.25, ph: rnd(0, 6.28), l: rnd(0.6, 1.4) }));
const ICE_CHUNKS = [[0, 372], [372, 760], [760, 1050], [1050, 1277]];
const iceFg = [ { fx: 250, c: 0 }, { fx: 1350, c: 2 }, { fx: 2150, c: 1 }, { fx: 3150, c: 3 }, { fx: 3900, c: 0 }, { fx: 4700, c: 2 } ];
const ICE_PF = 1.35, ICE_SCALE = 0.6;

// ---------- helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const yOf = (d) => D_Y0 + d * (D_Y1 - D_Y0);
const scOf = (d) => 0.075 + Math.max(d, -0.2) * 0.3;
const camMax = () => Math.max(0, WORLD_W - VW);
const plateF = () => (PLATE_W - VW) / Math.max(1, WORLD_W - VW);
const plateOff = () => S.camX * plateF();
const archScreenX = () => ARCH.x - plateOff();
function spr(img, x, y, r, a, sy = 1) { if (a <= 0.002) return; ctx.globalAlpha = a; ctx.drawImage(img, x - r, y - r * sy, r * 2, r * 2 * sy); }

// ---------- UI ----------
const loreEl = $('lore'), hintEl = $('hint');
let loreQ = [], loreBusy = false;
function lore(text, ms = 6500) { loreQ.push([text, ms]); if (!loreBusy) nextLore(); }
function nextLore() {
  const n = loreQ.shift(); if (!n) { loreBusy = false; return; }
  loreBusy = true; loreEl.textContent = n[0]; loreEl.classList.add('show');
  setTimeout(() => { loreEl.classList.remove('show'); setTimeout(nextLore, 1500); }, n[1]);
}
let hintTimer = 0;
function hint(text, ms = 5000) { hintEl.textContent = text; hintEl.classList.add('show'); clearTimeout(hintTimer); hintTimer = setTimeout(() => hintEl.classList.remove('show'), ms); }
function updateMuteBtn() { $('btnMute').classList.toggle('off', ReefAudio.isMuted()); }

function begin() {
  if (S.state !== 'title') return;
  ReefAudio.start(); updateMuteBtn();
  S.state = 'play'; $('title').classList.add('fade'); setTimeout(() => $('title').classList.add('hidden'), 1300);
  $('hud').classList.remove('hidden');
  setTimeout(() => lore(LINES.intro, 6000), 900);
  setTimeout(() => hint(isTouch ? 'Touch and drag to sail' : 'Arrow keys / WASD to sail  ·  or click and hold', 6500), 1800);
  setTimeout(() => { if (S.found === 0) hint('Find the four echoes hidden in the reef', 6000); }, 10500);
}
$('title').addEventListener('pointerdown', (e) => { e.preventDefault(); begin(); });
$('btnMute').addEventListener('pointerdown', (e) => { e.stopPropagation(); ReefAudio.start(); ReefAudio.toggleMute(); updateMuteBtn(); syncVideoMute(); });
$('btnFull').addEventListener('pointerdown', (e) => { e.stopPropagation(); toggleFull(); });
function toggleFull() {
  const d = document;
  if (!d.fullscreenElement && !d.webkitFullscreenElement) {
    const el = d.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) Promise.resolve(req.call(el)).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
  } else (d.exitFullscreen || d.webkitExitFullscreen).call(d);
}
addEventListener('keydown', (e) => {
  S.keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (S.state === 'title' && (e.code === 'Enter' || e.code === 'Space')) begin();
  if (e.code === 'KeyM') { ReefAudio.start(); ReefAudio.toggleMute(); updateMuteBtn(); syncVideoMute(); }
  if (e.code === 'KeyF') toggleFull();
});
addEventListener('keyup', (e) => { S.keys[e.code] = false; });
addEventListener('blur', () => { S.keys = {}; S.pointer = null; });
function toLogical(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * VW, y: (e.clientY - r.top) / r.height * H }; }
canvas.addEventListener('pointerdown', (e) => { if (S.state === 'title') return begin(); S.pointer = toLogical(e); canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (S.pointer) S.pointer = toLogical(e); });
['pointerup', 'pointercancel'].forEach((ev) => canvas.addEventListener(ev, () => { S.pointer = null; }));

// ---------- ending ----------
const video = $('endVideo');
function syncVideoMute() { video.muted = ReefAudio.isMuted(); }
function startEnding() {
  S.state = 'ending'; S.endT = 0; hint('', 1); loreEl.classList.remove('show');
  ReefAudio.open();
}
function showVideo() {
  $('hud').classList.add('hidden');
  $('ending').classList.remove('hidden'); $('flash').classList.remove('on');
  syncVideoMute(); video.currentTime = 0;
  const p = video.play();
  if (p && p.catch) p.catch(() => { video.muted = true; video.play().catch(() => showCard()); });
  setTimeout(() => $('skip').classList.remove('hidden'), 1200);
}
function showCard() {
  if (S.state === 'card') return;
  S.state = 'card'; video.pause();
  $('ending').classList.add('hidden'); $('skip').classList.add('hidden'); $('card').classList.remove('hidden');
  ReefAudio.fadeIn();
}
video.addEventListener('ended', showCard);
$('skip').addEventListener('click', showCard);
$('again').addEventListener('click', () => {
  $('card').classList.add('hidden'); resetWorld(); S.state = 'play'; $('hud').classList.remove('hidden');
  setTimeout(() => hint('Find the four echoes hidden in the reef', 5000), 600);
});

// ---------- update ----------
function collect(sh) {
  sh.got = true; const n = S.found++;
  $('pips').children[n].classList.add('on');
  ReefAudio.shard(n);
  lore(LINES.echoes[n], 7000);
  const sx = sh.x - S.camX, sy = yOf(sh.d) - 40 * scOf(sh.d) / 0.3;
  S.bursts.push({ x: sh.x, y: sy, t: 0 });
  for (let i = 0; i < 46; i++) S.sparks.push({ wx: sh.x + rnd(-10, 10), y: sy + rnd(-10, 10), cx: rnd(-200, 200), cy: rnd(-260, -60), p: -rnd(0, 0.5), sp: rnd(0.35, 0.6), r: rnd(6, 14) });
  if (S.found === SHARDS_DEF.length) setTimeout(() => { S.opened = true; ReefAudio.open(); lore(LINES.open, 6000); hint('Sail into the light of the arch', 8000); }, 2600);
}
function update(dt) {
  S.t += dt;
  const sk = S.skiff;
  if (S.state === 'play') {
    let ax = 0, ad = 0; const k = S.keys;
    if (k.ArrowLeft || k.KeyA) ax -= 1; if (k.ArrowRight || k.KeyD) ax += 1;
    if (k.ArrowUp || k.KeyW) ad -= 1; if (k.ArrowDown || k.KeyS) ad += 1;
    if (S.pointer) {
      const tx = S.camX + S.pointer.x, td = (S.pointer.y - D_Y0) / (D_Y1 - D_Y0);
      ax = clamp((tx - sk.x) / 140, -1, 1); if (Math.abs(tx - sk.x) < 12) ax = 0;
      ad = clamp((td - sk.d) / 0.18, -1, 1); if (Math.abs(td - sk.d) < 0.03) ad = 0;
    }
    const depthF = 0.45 + 0.55 * clamp(sk.d, 0, 1);
    sk.vx += ax * 420 * depthF * dt; sk.vx *= Math.pow(0.35, dt);
    const vmax = 250 * depthF; sk.vx = clamp(sk.vx, -vmax, vmax);
    sk.vd += ad * 1.6 * dt; sk.vd *= Math.pow(0.08, dt); sk.vd = clamp(sk.vd, -0.45, 0.45);
    sk.x = clamp(sk.x + sk.vx * dt, 90, WORLD_W - 50);
    sk.d = clamp(sk.d + sk.vd * dt, 0, 1);
    for (const sh of S.shards) {
      if (sh.got) continue;
      const s = scOf(sh.d) / 0.3;
      if (Math.abs(sh.x - sk.x) < 55 + 80 * s && Math.abs(sh.d - sk.d) < 0.17) collect(sh);
    }
    const asx = archScreenX(), ssx = sk.x - S.camX;
    if (Math.abs(asx - ssx) < 70 && sk.d < 0.2) {
      if (S.opened && S.archOpen > 0.6) startEnding();
      else if (!S.hintArch) { S.hintArch = true; hint('The arch is sealed. Find the echoes first.', 5000); setTimeout(() => S.hintArch = false, 9000); }
    }
  } else if (S.state === 'ending') {
    S.endT += dt;
    const tx = S.camX + archScreenX();
    sk.x = lerp(sk.x, tx, 1 - Math.pow(0.2, dt)); sk.d = lerp(sk.d, -0.12, 1 - Math.pow(0.3, dt));
    sk.vx = (tx - sk.x) * 0.5; sk.shrink = lerp(sk.shrink, 0.55, 1 - Math.pow(0.4, dt));
    sk.alpha = clamp(1 - (S.endT - 1.6) / 1.6, 0, 1);
    if (S.endT > 1.2 && !$('flash').classList.contains('on')) { $('flash').classList.add('on'); ReefAudio.fadeOut(2.5); }
    if (S.endT > 3.6 && $('ending').classList.contains('hidden') && S.state === 'ending') { S.state = 'video'; showVideo(); }
  } else if (S.state === 'title' || S.state === 'loading') {
    sk.vx = 18; sk.x = 260 + Math.sin(S.t * 0.2) * 30;
  }
  if (Math.abs(sk.vx) > 12) sk.face = Math.sign(sk.vx);
  sk.faceS = lerp(sk.faceS, sk.face, 1 - Math.pow(0.004, dt));
  ReefAudio.setMotion(clamp(Math.abs(sk.vx) / 250, 0, 1));

  // camera
  const target = S.state === 'title' || S.state === 'loading' ? 120 + Math.sin(S.t * 0.12) * 120 : sk.x - VW * 0.42;
  S.camX = lerp(S.camX, clamp(target, 0, camMax()), 1 - Math.pow(0.08, dt));
  if (S.opened) S.archOpen = Math.min(1, S.archOpen + dt / 4);

  // wake
  S.wakeT = (S.wakeT || 0) + dt;
  if (Math.abs(sk.vx) > 25 && S.wakeT > 0.06 && sk.alpha > 0.3) {
    S.wakeT = 0; const sc = scOf(sk.d);
    S.wake.push({ x: sk.x - sk.face * 330 * sc, d: sk.d, age: 0, life: 2.4, k: clamp(Math.abs(sk.vx) / 250, 0.3, 1) });
  }
  for (const w of S.wake) w.age += dt; S.wake = S.wake.filter((w) => w.age < w.life);
  for (const s of S.sparks) s.p += dt * s.sp; S.sparks = S.sparks.filter((s) => s.p < 1);
  for (const b of S.bursts) b.t += dt; S.bursts = S.bursts.filter((b) => b.t < 1.6);
}

// ---------- draw ----------
function drawPlate(t) {
  const off = plateOff(), P = IMG.plate;
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(P, off, 0, VW, H, 0, 0, VW, H);
  // water shimmer: re-draw the water band in thin, sideways-wobbling strips
  for (let y = ARCH.base + 2; y < H; y += 4) {
    const k = (y - ARCH.base) / (H - ARCH.base), amp = 1 + k * 5;
    const ox = Math.sin(y * 0.23 + t * 1.8) * amp + Math.sin(y * 0.071 - t * 0.9) * amp * 0.6;
    ctx.drawImage(P, off, y, VW, 4.6, ox, y, VW, 4.6);
  }
}
function drawStars(t) {
  const off = plateOff(); ctx.fillStyle = '#eef2ff';
  for (const s of stars) {
    const x = s.x - off; if (x < -2 || x > VW + 2) continue;
    const a = 0.25 + 0.75 * Math.max(0, Math.sin(t * s.sp + s.ph)); if (a < 0.35) continue;
    ctx.globalAlpha = a * 0.8; ctx.fillRect(x, s.y, s.s, s.s);
  }
}
function drawAurora(t) {
  const off = plateOff() * 0.8, N = 56, w = VW / N + 1;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < N; i++) {
    const x = i * VW / N, wx = x + off;
    const top = 30 + Math.sin(wx * 0.0034 + t * 0.13) * 55 + Math.sin(wx * 0.011 - t * 0.37) * 16;
    const a = 0.075 * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(wx * 0.021 - t * 0.85))) * (0.55 + 0.45 * Math.sin(wx * 0.0042 + t * 0.21));
    ctx.globalAlpha = a; ctx.drawImage(SPR.aurora, x, top, w, 330);
  }
  ctx.globalCompositeOperation = 'source-over';
}
function drawArchLight(t) {
  const x = archScreenX(); if (x < -400 || x > VW + 400) return;
  const o = S.archOpen, pulse = 0.85 + 0.15 * Math.sin(t * 1.4);
  ctx.globalCompositeOperation = 'lighter';
  spr(SPR.violet, x, ARCH.y, 150 + 120 * o, (0.10 + 0.35 * o) * pulse);
  spr(SPR.blue, x, ARCH.y + 25, 90 + 90 * o, (0.06 + 0.45 * o) * pulse, 1.3);
  if (o > 0) {
    spr(SPR.white, x, ARCH.y + 30, 40 + 70 * o, 0.75 * o * pulse, 1.5);
    spr(SPR.white, x, ARCH.base + 8, 60 + 60 * o, 0.5 * o, 0.25);
    // light column reflected on the water
    spr(SPR.blue, x, (ARCH.base + H) / 2, 60 + 30 * o, 0.35 * o * (0.8 + 0.2 * Math.sin(t * 3)), (H - ARCH.base) / 120);
  }
  ctx.globalCompositeOperation = 'source-over';
}
function drawMist(list, pf, t) {
  ctx.globalCompositeOperation = 'screen';
  const span = 3000;
  for (const m of list) {
    let x = ((m.x + t * m.sp - S.camX * pf) % span + span) % span - 600;
    ctx.globalAlpha = m.a * (0.75 + 0.25 * Math.sin(t * 0.2 + m.x)); ctx.drawImage(SPR.mist, x, m.y - m.h / 2, m.w, m.h);
  }
  ctx.globalCompositeOperation = 'source-over';
}
function drawRipples(t) {
  const f = plateF(); ctx.fillStyle = '#c9d8ff';
  for (const r of ripples) {
    const pf = lerp(f, 1.15, Math.min(1, r.d) ** 1.4), span = VW + 300;
    const x = ((r.u - S.camX * pf) % span + span) % span - 150;
    const y = r.d <= 1 ? yOf(r.d) : D_Y1 + (r.d - 1) * 130;
    const a = 0.13 * Math.max(0, Math.sin(t * 0.9 + r.ph)) * (0.4 + 0.6 * Math.min(1, r.d));
    if (a < 0.01) continue;
    ctx.globalAlpha = a; ctx.fillRect(x, y, (10 + 46 * r.d) * r.l, 0.8 + r.d);
  }
}
function drawShard(sh, t) {
  const sc = scOf(sh.d), s = sc / 0.3, x = sh.x - S.camX;
  if (x < -150 || x > VW + 150) return;
  const wy = yOf(sh.d), y = wy - (38 + 6 * Math.sin(t * 1.6 + sh.ph)) * s, pulse = 0.75 + 0.25 * Math.sin(t * 2.2 + sh.ph);
  ctx.globalCompositeOperation = 'lighter';
  spr(SPR.violet, x, y, 95 * s, 0.35 * pulse);
  spr(SPR.blue, x, y, 50 * s, 0.6 * pulse);
  spr(SPR.blue, x, wy + 18 * s, 32 * s, 0.35 * pulse, 2.2); // reflection
  ctx.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(0.25, Math.abs(Math.cos(t * 0.9 + sh.ph))) * s, s);
  ctx.globalAlpha = 0.95; const g = ctx.createLinearGradient(0, -24, 0, 24);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#bcd0ff'); g.addColorStop(1, '#9a7bff');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(9, -4); ctx.lineTo(4, 22); ctx.lineTo(-6, 18); ctx.lineTo(-9, -6); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.6; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(3, -2); ctx.lineTo(-2, 16); ctx.lineTo(-9, -6); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawWake() {
  ctx.strokeStyle = '#d6e2ff'; ctx.lineWidth = 1.2;
  for (const w of S.wake) {
    const x = w.x - S.camX, s = scOf(w.d) / 0.3, y = yOf(w.d) + 2 * s, rx = (14 + w.age * 46) * s;
    ctx.globalAlpha = 0.32 * w.k * (1 - w.age / w.life);
    ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.16, 0, 0, Math.PI * 2); ctx.stroke();
  }
}
const SKIFF_AX = 436, SKIFF_WL = 238, LANTERN = { x: -8, y: -128 };
function skiffPose(t) {
  const sk = S.skiff, sc = scOf(sk.d) * sk.shrink;
  const x = sk.x - S.camX, wy = yOf(sk.d) + Math.sin(t * 1.7) * 2.2 * sc / 0.3;
  const rot = Math.sin(t * 1.15) * 0.022 + clamp(sk.vx / 250, -1, 1) * 0.015;
  return { sc, x, wy, rot, fs: Math.abs(sk.faceS) < 0.05 ? 0.05 * Math.sign(sk.faceS || 1) : sk.faceS };
}
function drawSkiff(t) {
  const p = skiffPose(t), sk = S.skiff, img = IMG.skiff;
  if (sk.alpha <= 0) return;
  // reflection (two offset passes for a wavy feel)
  for (let i = 0; i < 2; i++) {
    ctx.save(); ctx.translate(p.x + Math.sin(t * 2.3 + i * 2) * 3 * p.sc / 0.3, p.wy + 2); ctx.rotate(-p.rot); ctx.scale(p.sc * p.fs, -p.sc * 0.75);
    ctx.globalAlpha = 0.16 * sk.alpha; ctx.drawImage(img, 0, 0, img.width, SKIFF_WL, -SKIFF_AX, -SKIFF_WL, img.width, SKIFF_WL); ctx.restore();
  }
  ctx.save(); ctx.translate(p.x, p.wy); ctx.rotate(p.rot); ctx.scale(p.sc * p.fs, p.sc);
  ctx.globalAlpha = sk.alpha; ctx.drawImage(img, 0, 0, img.width, SKIFF_WL + 6, -SKIFF_AX, -SKIFF_WL, img.width, SKIFF_WL + 6);
  ctx.restore();
  // waterline foam
  ctx.globalAlpha = 0.22 * sk.alpha; ctx.fillStyle = '#cfdcff';
  ctx.beginPath(); ctx.ellipse(p.x, p.wy + 3 * p.sc / 0.3, 300 * p.sc, 4 * p.sc / 0.3, 0, 0, Math.PI * 2); ctx.fill();
}
function drawLantern(t) {
  const p = skiffPose(t), sk = S.skiff; if (sk.alpha <= 0) return;
  const lx = p.x + LANTERN.x * p.sc * p.fs, ly = p.wy + LANTERN.y * p.sc, s = p.sc / 0.3;
  const fl = 1 + 0.06 * Math.sin(t * 13.7) + 0.04 * Math.sin(t * 7.1) + 0.03 * Math.sin(t * 23);
  ctx.globalCompositeOperation = 'lighter';
  spr(SPR.amber, lx, ly, 330 * s * fl, 0.16 * sk.alpha);
  spr(SPR.amber, lx, ly, 120 * s * fl, 0.38 * sk.alpha);
  spr(SPR.warm, lx, ly, 26 * s * fl, 0.85 * sk.alpha);
  spr(SPR.amber, lx, p.wy + 26 * s, 150 * s * fl, 0.32 * sk.alpha, 0.22); // on the water
  spr(SPR.amber, lx, p.wy + 70 * s, 40 * s, 0.22 * sk.alpha, 1.6);      // reflection streak
  ctx.globalCompositeOperation = 'source-over';
}
function drawIce(t) {
  const img = IMG.ice, h = img.height * ICE_SCALE, base = H + 26;
  for (const c of iceFg) {
    const [sx0, sx1] = ICE_CHUNKS[c.c], w = (sx1 - sx0) * ICE_SCALE * 1.35, x = c.fx - S.camX * ICE_PF;
    if (x > VW + 20 || x + w < -20) continue;
    ctx.globalAlpha = 1; ctx.drawImage(img, sx0, 0, sx1 - sx0, img.height, x, base - h * 1.35, w, h * 1.35);
  }
}
function drawSnow(t, dt) {
  ctx.fillStyle = '#eef3ff'; const dc = S.camX - (S.lastCam ?? S.camX); S.lastCam = S.camX;
  for (const p of snow) {
    p.y += (14 + 26 * p.z) * dt; p.x += (-6 + Math.sin(t * 0.7 + p.ph) * 8) * p.z * dt - dc * p.z;
    if (p.y > H + 4) { p.y = -4; p.x = rnd(0, VW + 100); }
    if (p.x < -10) p.x += VW + 20; else if (p.x > VW + 10) p.x -= VW + 20;
    ctx.globalAlpha = 0.25 + 0.45 * Math.min(1, p.z); const s = 0.8 + p.z * 1.6; ctx.fillRect(p.x, p.y, s, s);
  }
}
function drawSparks(t) {
  const ax = archScreenX(), ay = ARCH.y + 20;
  ctx.globalCompositeOperation = 'lighter';
  for (const b of S.bursts) { const x = b.x - S.camX; spr(SPR.white, x, b.y, 40 + b.t * 220, 0.7 * (1 - b.t / 1.6)); }
  for (const s of S.sparks) {
    if (s.p < 0) continue; const p = s.p * s.p * (3 - 2 * s.p);
    const x0 = s.wx - S.camX, cx = (x0 + ax) / 2 + s.cx, cy = Math.min(s.y, ay) + s.cy;
    const x = (1 - p) * (1 - p) * x0 + 2 * (1 - p) * p * cx + p * p * ax, y = (1 - p) * (1 - p) * s.y + 2 * (1 - p) * p * cy + p * p * ay;
    spr(SPR.blue, x, y, s.r, 0.8 * Math.sin(Math.PI * s.p));
  }
  ctx.globalCompositeOperation = 'source-over';
}
function drawIndicators(t) {
  if (S.state !== 'play') return;
  const sx = S.skiff.x;
  let targets = S.shards.filter((s) => !s.got).sort((a, b) => Math.abs(a.x - sx) - Math.abs(b.x - sx)).slice(0, 1)
    .map((s) => ({ x: s.x - S.camX, y: yOf(s.d) - 40 * scOf(s.d) / 0.3 }));
  if (S.opened) targets.push({ x: archScreenX(), y: ARCH.y + 40 });
  const a = 0.35 + 0.25 * Math.sin(t * 3);
  for (const g of targets) {
    if (g.x > -20 && g.x < VW + 20) continue;
    const right = g.x > VW, x = right ? VW - 26 : 26, y = clamp(g.y, 120, H - 40);
    ctx.globalCompositeOperation = 'lighter'; spr(SPR.blue, x, y, 34, a); ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a + 0.3; ctx.strokeStyle = '#dfe8ff'; ctx.lineWidth = 2;
    ctx.beginPath(); const dx = right ? 1 : -1; ctx.moveTo(x - 6 * dx, y - 10); ctx.lineTo(x + 6 * dx, y); ctx.lineTo(x - 6 * dx, y + 10); ctx.stroke();
  }
}
function render(t, dt) {
  ctx.setTransform(K, 0, 0, K, 0, 0);
  drawPlate(t); drawStars(t); drawAurora(t); drawArchLight(t);
  drawMist(mistFar, plateF() + 0.08, t);
  drawRipples(t);
  const sk = S.skiff;
  for (const sh of S.shards) if (!sh.got && sh.d < sk.d) drawShard(sh, t);
  drawWake(); drawSkiff(t);
  for (const sh of S.shards) if (!sh.got && sh.d >= sk.d) drawShard(sh, t);
  drawIce(t); drawLantern(t);
  drawMist(mistNear, 1.25, t); drawSnow(t, dt); drawSparks(t);
  ctx.globalAlpha = 1; ctx.drawImage(SPR.vignette, 0, 0, VW, H);
  drawIndicators(t);
  ctx.globalAlpha = 1;
}

// ---------- loop with adaptive resolution ----------
let last = performance.now(), slow = 0, fast = 0;
function frame(now) {
  const raw = (now - last) / 1000; last = now; const dt = Math.min(0.05, raw);
  if (raw > 0.024 && raw < 0.2) slow++; else slow = Math.max(0, slow - 1);
  if (slow > 90 && renderScale > 0.6) { renderScale -= 0.15; slow = 0; resize(); }
  update(dt); render(S.t, dt);
  requestAnimationFrame(frame);
}
resize(); resetWorld();
Promise.all([loadImg('plate', 'assets/reef_panorama.jpg'), loadImg('skiff', 'assets/skiff.png'), loadImg('ice', 'assets/ice_fg.png')])
  .then(() => { S.state = 'title'; $('begin').textContent = isTouch ? 'Tap to begin' : 'Click to begin'; requestAnimationFrame(frame); })
  .catch((e) => { $('begin').textContent = 'Could not load the reef. Please reload.'; console.error(e); });

// debug/QC hook
window.__reef = { S, bench: (n = 60) => { const t0 = performance.now(); for (let i = 0; i < n; i++) { update(1 / 60); render(S.t, 1 / 60); } ctx.getImageData(0, 0, 1, 1); return (performance.now() - t0) / n; }, collectAll: () => S.shards.forEach((s) => !s.got && collect(s)), begin, startEnding, showCard, get VW() { return VW; }, archScreenX };
})();
