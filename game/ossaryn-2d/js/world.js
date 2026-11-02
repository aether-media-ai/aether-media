// The Hollow of Ossaryn as 7 parallax depths + atmosphere. Layer content lives in "layer space"; each frame the
// group is placed so a point q appears at C + s*(q - C*f) with s = zoom^(f-1): far layers barely move or zoom,
// the play layer is 1:1, the foreground overshoots. Camera zoom-outs therefore *reveal* the Hollow.
import * as THREE from 'three';
import { litMat, fxMat } from './lit.js';
import { GS, SEG, WALKY, buildPieces } from './level.js';
const TL = new THREE.TextureLoader();
const texCache = {};
export function tex(name, srgb = true) {
  if (texCache[name]) return texCache[name];
  const t = TL.load('assets/img/' + name); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return (texCache[name] = t);
}
let rngS = 7; const R = (a = 0, b = 1) => { rngS = (rngS * 16807) % 2147483647; return a + (b - a) * (rngS / 2147483647); };
export function quad(mat, w, h, x, y, ax = 0.5, ay = 0.5) {
  const g = new THREE.PlaneGeometry(w, h); g.translate(w * (0.5 - ax), h * (0.5 - ay), 0);
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, 0); m.frustumCulled = false; return m;
}
export function buildWorld(scene) {
  const layers = [];
  let order = 0;
  const L = (f, name) => { const g = new THREE.Group(); g.name = name; scene.add(g); const l = { g, f, name, items: [] }; layers.push(l); return l; };
  const add = (l, m) => { m.renderOrder = order++; l.g.add(m); l.items.push(m); return m; };
  const FOG = 0x3a4c52;
  // 0 sky / vista
  const sky = L(0.02, 'sky');
  add(sky, quad(litMat(tex('env_vista.jpg'), { amb: 0xc8d3d6, emis: 0.5, emisT: 0.45 }), 3900, 2194, 300, 380));
  // 1 far wall: three tiles, alternate flips + different scale/offset, soft crossfaded seams, haze on top
  const far = L(0.07, 'far');
  for (let i = 0; i < 3; i++) {
    const sc = [2.55, 2.75, 2.6][i], w = 1280 * sc, h = 720 * sc, flip = i === 1;
    const m = add(far, quad(litMat(tex('env_far.jpg'), { amb: 0xd2dcdc, emis: 0.7, emisT: 0.5, fog: FOG, fogAmt: 0.12, edge: [0.08, 0.08, 0.0, 0.1] }), w, h, -900 + i * 2950, [120, 60, 160][i]));
    if (flip) m.scale.x = -1;
  }
  // light shafts from the sinkhole mouth (far)
  const shafts = [];
  for (let i = 0; i < 7; i++) { const m = add(far, quad(fxMat(tex('shaft.png'), new THREE.Color(0x9fb6bc), 0.16), R(260, 520), 2600, -600 + i * 1050 + R(-200, 200), 500, 0.5, 0.3)); m.rotation.z = R(0.12, 0.3); shafts.push(m); m.userData.ph = R(0, 6); }
  const mistMat = (c, o) => { const t = TL.load('assets/img/mist.png'); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return fxMat(t, new THREE.Color(c), o, false); };
  const mists = [];
  const mist = (l, y, h, c, o, speed, x0 = -3000, w = 14000) => { const m = add(l, quad(mistMat(c, o), w, h, x0 + w / 2, y)); m.material.map.repeat.set(w / 2400, 1); m.userData.speed = speed; mists.push(m); return m; };
  mist(far, -650, 900, 0x6f8a92, 0.38, 0.004);
  // 2 mid towers (keyed painted layer)
  const mid = L(0.2, 'mid');
  for (let i = 0; i < 4; i++) { const sc = 1.9 + R(-0.15, 0.2), m = add(mid, quad(litMat(tex('env_mid.png'), { amb: 0xa9b8bc, emis: 0.9, emisT: 0.45, fog: FOG, fogAmt: 0.34 }), 1280 * sc, 650 * sc, -800 + i * 2300 + R(-200, 200), -260 + R(-60, 60))); if (i % 2) m.scale.x = -1; }
  mist(mid, -700, 700, 0x5d757c, 0.45, 0.008);
  mist(mid, 300, 900, 0x8aa1a6, 0.12, 0.003);
  // 3 mid-near spires (same art, larger, darker, less fog)
  const near = L(0.38, 'near');
  for (let i = 0; i < 4; i++) { const sc = 2.9 + R(-0.2, 0.3), m = add(near, quad(litMat(tex('env_mid.png'), { amb: 0x7d8b8f, emis: 1.1, emisT: 0.45, fog: 0x2b393e, fogAmt: 0.42 }), 1280 * sc, 650 * sc, -400 + i * 3200 + R(-300, 300), -560 + R(-60, 40))); if (i % 2 === 0) m.scale.x = -1; }
  for (let i = 0; i < 6; i++) { const m = add(near, quad(fxMat(tex('shaft.png'), new THREE.Color(0xb8c8c4), 0.11), R(320, 640), 2400, i * 1800 + R(-300, 300), 300, 0.5, 0.3)); m.rotation.z = R(0.1, 0.28); shafts.push(m); m.userData.ph = R(0, 6); }
  mist(near, -900, 800, 0x51676d, 0.55, 0.012);
  // 4 back terraces: ground pieces at 0.5 scale, dark, with a few distant warm lamps
  const back = L(0.62, 'back');
  const backGlows = [];
  for (let i = 0; i < 18; i++) {
    const k = 'ABCD'[i % 4], s = SEG[k], sc = 0.95, x = i * 760 + R(-120, 120), y = -380 + Math.sin(i * 1.7) * 160;
    add(back, quad(litMat(tex('g_' + k + '.png'), { amb: 0x55636a, fog: 0x2c3b40, fogAmt: 0.55 }), s.w * sc, s.h * sc, x, y, 0, 0));
    if (i % 3 === 1) { const gl = add(back, quad(fxMat(tex('glow.png'), new THREE.Color(0xffa24a), 0.55), 150, 150, x + 90, y + s.h * sc * 0.62)); backGlows.push(gl); }
  }
  mist(back, -560, 600, 0x4d6268, 0.5, 0.02);
  // 5 play layer
  const play = L(1.0, 'play');
  const { pieces, surfaces } = buildPieces();
  const wallT = tex('g_wall.png');
  for (const p of pieces) {
    // stone pillar below the walk deck, fading into the abyss (skipped on the bridge)
    if (!p.island.bridge) for (let r = 0; r < 4; r++) {
      const mat = litMat(wallT, { amb: 0x8d9a9c, lightAmt: 1, fog: 0x1c272b, fogAmt: 0.25 + r * 0.22 });
      add(play, quad(mat, p.w + 6, 170 * GS, p.x - 3, p.y - (530 - WALKY) * GS + 40 - r * 170 * GS * 0.96, 0, 1));
    }
  }
  const deckMats = []; const deckOrder0 = order;
  for (const p of pieces) {
    const mat = litMat(tex("g_" + p.k + ".png"), { amb: 0xa3aeb0, lightAmt: 1, emis: 0.0 });
    const m = add(play, quad(mat, p.w, p.h, p.x + p.w / 2, p.y + WALKY * GS, 0.5, 1)); if (p.flip) m.scale.x = -1;
    deckMats.push(mat);
  }
  const playBase = order; order += 500;   // props/characters get renderOrder >= playBase
  // abyss mist in front of the deck pillars
  const front = L(1.0, 'front');
  mist(front, -900, 700, 0x4a5f66, 0.5, 0.03, -2000, 24000);
  // 6 foreground props (fast parallax, near-black silhouettes with a sliver of rim)
  const fg = L(1.55, 'fg');
  const fgItems = { column: ['fg_column.png', 328, 703, 1.45], chain: ['fg_chain.png', 116, 614, 1.25], vine: ['fg_vine.png', 163, 261, 1.9], vines: ['fg_vine_s.png', 101, 215, 2.0] };
  const fgSeq = ['vine', 'chain', 'column', 'vines', 'vine', 'chain', 'vines', 'column'];
  for (let i = 0; i < 26; i++) {
    const [n, w, h, sc] = fgItems[fgSeq[i % fgSeq.length]], x = 1400 + i * 1150 + R(-250, 250);
    const top = n !== 'fg_column.png';
    const m = add(fg, quad(litMat(tex(n), { amb: 0x1c2326, lightAmt: 0.3, fog: 0x0b1013, fogAmt: 0.2 }), w * sc, h * sc, x, top ? 640 + R(0, 120) : -560 - R(0, 160), 0.5, top ? 1 : 0));
    if (R() < 0.5) m.scale.x = -1;
  }
  scene.background = new THREE.Color(0x0c1316);
  return { layers, layer: Object.fromEntries(layers.map(l => [l.name, l])), pieces, surfaces, mists, shafts, backGlows, playBase, deckMats, deckOrder0,
    update(C, zoom, t) {
      for (const l of layers) { const s = Math.pow(zoom, l.f - 1); l.g.scale.set(s, s, 1); l.g.position.set(C.x * (1 - l.f * s), C.y * (1 - l.f * s), 0); }
      for (const m of mists) m.material.map.offset.x = (t * m.userData.speed) % 1;
      for (const m of shafts) m.material.opacity = (m.parent === layers[1].g ? 0.13 : 0.09) * (0.7 + 0.3 * Math.sin(t * 0.4 + m.userData.ph));
    } };
}
