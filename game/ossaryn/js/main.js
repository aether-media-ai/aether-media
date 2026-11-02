// The Aether Realms: The Kept Light. Vertical slice game loop.
import * as THREE from 'three';
import { HERO_NAME, ASSETS, LEVELS, ENEMIES, SPELLS, QUESTS, DIALOGUE, CUTSCENE_TEXT, SLOTS, RARITY, ICON_GRID, PLATE_W, PLATE_H } from './config.js';
import { Engine, V, paintPlaceholderPlate, buildGreybox } from './engine.js';
import { makeHero, makeNPC, makeEnemy, makeLanternPost, lightLantern, makeLoot, makeRing, makeOrb, makeBeam } from './meshes.js';
import { makeItem, echoShard, describe } from './items.js';
import { sfx, startAmbience } from './audio.js';

const $ = id => document.getElementById(id);
const engine = new Engine($('gl'));
const rand = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.round(rand(a, b));
const flat = v => new THREE.Vector3(v.x, 0, v.z);

// ---------------- assets (only files listed in assets/manifest.json are requested) ----------------
let MANIFEST = new Set();
const has = p => p && MANIFEST.has(p);
const texCache = {};
function loadTex(p) {
  if (!has(p)) return Promise.resolve(null);
  if (texCache[p]) return Promise.resolve(texCache[p]);
  return new Promise(res => new THREE.TextureLoader().load(p, t => res(texCache[p] = t), undefined, () => res(null)));
}

// ---------------- game state ----------------
const G = {
  mode: 'title', level: null, L: null, time: 0,
  enemies: [], projs: [], loot: [], fx: [], posts: [], npcs: [], rifts: [],
  quests: { q1: { n: 0, of: 3 }, q2: { n: 0, of: 2 }, q3: { n: 0, of: 1 }, q4: { n: 0, of: 1 } },
  active: 'q1', bossSpawned: false, bossDead: false, talked: {}, dialog: null, keys: {}, mouse: { x: 0, y: 0, down: false },
};
const P = {
  pos: V(), mesh: makeHero(), lvl: 1, xp: 0, hp: 60, light: 50, facing: 0,
  moveTo: null, target: null, interact: null, atkT: 0, swing: 0, cds: { lance: 0, flare: 0 }, pots: { hp: 3, lp: 2 },
  equip: {}, bag: [], st: {}, invuln: 0, jumping: null,
};
engine.scene.add(P.mesh);

function recalc() {
  const s = { maxHp: 60 + 9 * (P.lvl - 1), maxLight: 50 + 5 * (P.lvl - 1), armor: 0, dmgMin: 2, dmgMax: 4, atkSpd: 1, dmgFlat: 0, spell: 0, crit: 5, move: 0, regen: 2.2, leech: 0 };
  for (const it of Object.values(P.equip)) {
    if (!it) continue;
    for (const [k, v] of Object.entries(it.stats)) {
      if (k === 'dmgMin' || k === 'dmgMax' || k === 'atkSpd') s[k] = v; else s[k] = (s[k] || 0) + v;
    }
  }
  s.speed = 5.0 * (1 + s.move / 100);
  P.st = s; P.hp = Math.min(P.hp, s.maxHp); P.light = Math.min(P.light, s.maxLight);
}
function startingGear() {
  P.equip = {}; P.bag = [];
  const w = makeItem(1, 0, 'weapon'); Object.assign(w, { base: 'Bronze Hook-Staff', name: 'Bronze Hook-Staff', rarity: 'worn', color: RARITY[0].color, lines: [], stats: { dmgMin: 4, dmgMax: 8, atkSpd: 1 } });
  const l = makeItem(1, 0, 'lantern'); Object.assign(l, { name: 'Frosted Lantern', base: 'Frosted Lantern', rarity: 'worn', color: RARITY[0].color, lines: [], stats: { maxLight: 10 } });
  const r = makeItem(1, 0, 'robe'); Object.assign(r, { name: 'Rust Robe', base: 'Rust Robe', rarity: 'worn', color: RARITY[0].color, lines: [], stats: { armor: 5 } });
  P.equip = { weapon: w, lantern: l, robe: r };
  P.lvl = 1; P.xp = 0; P.pots = { hp: 3, lp: 2 }; recalc(); P.hp = P.st.maxHp; P.light = P.st.maxLight;
}

// ---------------- geometry helpers ----------------
function pip(x, y, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
function walkable(Gp) {
  const [x, y] = engine.g2p(Gp), L = G.L;
  return L.walk.some(p => pip(x, y, p)) && !(L.blockers || []).some(p => pip(x, y, p));
}
function tryMove(pos, dx, dz) {
  const n = V(pos.x + dx, 0, pos.z + dz);
  if (walkable(n)) { pos.copy(n); return true; }
  const a = V(pos.x + dx, 0, pos.z); if (Math.abs(dx) > 1e-4 && walkable(a)) { pos.copy(a); return true; }
  const b = V(pos.x, 0, pos.z + dz); if (Math.abs(dz) > 1e-4 && walkable(b)) { pos.copy(b); return true; }
  return false;
}
const pg = (xy) => engine.p2g(xy[0], xy[1]);

// ---------------- level loading ----------------
async function loadLevel(id, spawnPlate) {
  G.level = id; const L = G.L = LEVELS[id];
  engine.clearLevel();
  for (const e of G.enemies) engine.scene.remove(e.mesh);
  for (const o of [...G.loot, ...G.projs, ...G.fx]) engine.scene.remove(o.mesh);
  clearFloaters();
  G.enemies = []; G.loot = []; G.projs = []; G.fx = []; G.posts = []; G.npcs = []; G.rifts = [];
  const tex = await loadTex(ASSETS.plates[id]);
  if (tex) { engine.setPlate(tex, L.occluders); }
  else { engine.setPlate(paintPlaceholderPlate(engine, L), []); buildGreybox(engine, L); }
  engine.setLights(L.light);
  P.pos.copy(pg(spawnPlate || L.spawn)); P.moveTo = null; P.target = null; P.interact = null;
  engine.follow(P.pos, 0, true); G.exitArmed = false;
  // lanterns (q1)
  (L.lanterns || []).forEach((xy, i) => { const m = makeLanternPost(); m.position.copy(pg(xy)); engine.levelGroup.add(m); const post = { mesh: m, pos: m.position.clone(), lit: G.quests.q1.n > i || G.quests.q1.done, kind: 'lantern', i }; if (post.lit) lightLantern(m); G.posts.push(post); });
  for (const n of L.npcs || []) { const m = makeNPC(); m.position.copy(pg(n.at)); m.rotation.y = 0.8; engine.levelGroup.add(m); G.npcs.push({ ...n, mesh: m, pos: m.position.clone() }); }
  for (const xy of L.rifts || []) if (!(G.quests.q2.done)) spawnEnemy('rift', pg(xy));
  for (const pk of L.packs || []) {
    if ((id === 'a2' && G.quests.q2.done) || (id === 'a3' && G.bossDead)) continue;
    const c = pg(pk.at);
    for (let i = 0; i < pk.n; i++) { const p = c.clone().add(V(rand(-1.5, 1.5), 0, rand(-1.5, 1.5))); if (walkable(p)) spawnEnemy(pk.kind, p); }
  }
  if (L.well) {
    const { at: [cx, cy], rx, ry } = L.well; G.wellPos = pg(L.well.at);
    const ring = engine.plateRing(cx, cy, rx - 6, ry - 4, rx + 26, ry + 18, 0xfff0c4, G.bossDead ? 0.55 : 0.08); engine.levelGroup.add(ring); G.wellRing = ring;
    G.wellRad = Math.max(...[0, 1, 2, 3, 4, 5, 6, 7].map(i => pg([cx + rx * Math.cos(i * Math.PI / 4), cy + ry * Math.sin(i * Math.PI / 4)]).distanceTo(G.wellPos))) + 1.4;
  } else { G.wellPos = null; G.wellRing = null; }
  showArea(L.name, L.sub);
  updateQuestUI();
}

// ---------------- entities ----------------
function spawnEnemy(kind, pos) {
  const d = ENEMIES[kind], mesh = makeEnemy(kind);
  mesh.position.copy(pos); mesh.scale.setScalar(d.scale === 1 ? 1 : 1); engine.scene.add(mesh);
  if (kind === 'unsealed') mesh.scale.setScalar(1.9);
  const e = { kind, d, mesh, pos: mesh.position, hp: d.hp * (1 + (P.lvl - 1) * 0.12), maxHp: 0, state: 'idle', t: rand(0, 1), cd: rand(0.3, 1.2), facing: 0, spawned: 0, r: kind === 'unsealed' ? 1.4 : kind === 'stepwalker' ? 0.75 : kind === 'rift' ? 1.0 : 0.45, aggroed: false, phase: 0 };
  e.maxHp = e.hp; G.enemies.push(e);
  if (kind === 'rift') G.rifts.push(e);
  return e;
}
function damageEnemy(e, amt, crit = false, knock = null) {
  if (e.dead) return;
  e.hp -= amt; e.aggroed = true; e.hitT = 0.12;
  floater(e.pos.clone().setY(1.6 * (e.kind === 'unsealed' ? 2.2 : 1)), Math.round(amt) + (crit ? '!' : ''), crit ? '#ffd46a' : '#f1ece2', crit ? 24 : 18);
  if (knock && e.d.speed > 0 && !e.d.boss) tryMove(e.pos, knock.x, knock.z);
  if (P.st.leech) P.hp = Math.min(P.st.maxHp, P.hp + P.st.leech);
  sfx('hit');
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  e.dead = true; e.deathT = 0.6; gainXp(e.d.xp); sfx('die');
  if (e.kind === 'rift') { G.quests.q2.n++; checkQuests(); }
  if (e.kind === 'unsealed') { G.bossDead = true; $('bossbar').classList.add('hidden'); dropItem(e.pos, makeItem(P.lvl + 1, 1.5)); dropItem(e.pos, makeItem(P.lvl + 1, 3)); dropItem(e.pos, echoShard('The First Note')); G.quests.q3.n = 1; checkQuests(); if (G.wellRing) G.wellRing.material.opacity = 0.55; engine.shake = 1; }
  else {
    const chance = { dustling: 0.18, wick: 0.4, stepwalker: 0.75, rift: 1 }[e.kind] || 0.3;
    if (Math.random() < chance) dropItem(e.pos, makeItem(P.lvl, e.kind === 'rift' ? 0.6 : 0));
    if (Math.random() < 0.14) dropPotion(e.pos, Math.random() < 0.55 ? 'hp' : 'lp');
  }
}
function dropItem(pos, item) {
  const m = makeLoot(item.color), p = pos.clone().add(V(rand(-0.8, 0.8), 0, rand(-0.8, 0.8)));
  if (!walkable(p)) p.copy(pos); m.position.copy(p); engine.scene.add(m);
  const lbl = document.createElement('div'); lbl.className = 'lootlbl'; lbl.textContent = item.name; lbl.style.color = item.color; $('floaters').appendChild(lbl);
  const L = { mesh: m, pos: m.position, item, lbl }; lbl.onmousedown = ev => { ev.stopPropagation(); P.interact = L; P.moveTo = L.pos.clone(); }; G.loot.push(L);
}
function dropPotion(pos, kind) {
  const m = makeOrb(kind === 'hp' ? 0xd04a30 : 0xffb040, 0.12); m.position.copy(pos).setY(0.25); engine.scene.add(m);
  G.loot.push({ mesh: m, pos: m.position, potion: kind });
}
function gainXp(x) {
  P.xp += x; const need = () => 40 + (P.lvl - 1) * 55;
  while (P.xp >= need()) { P.xp -= need(); P.lvl++; recalc(); P.hp = P.st.maxHp; P.light = P.st.maxLight; floater(P.pos.clone().setY(2.2), 'Level ' + P.lvl, '#ffe2a0', 26); sfx('level'); const r = makeRing(0xffc070, 0.2, 0.6, 0.8); r.position.copy(P.pos).setY(0.05); engine.scene.add(r); G.fx.push({ mesh: r, t: 0, life: 0.9, grow: 4 }); }
}
function hurtPlayer(amt, src) {
  if (P.invuln > 0 || G.mode !== 'play') return;
  const red = P.st.armor / (P.st.armor + 40 + P.lvl * 6); const d = Math.max(1, Math.round(amt * (1 - red)));
  P.hp -= d; floater(P.pos.clone().setY(2.0), '-' + d, '#e0644a', 18); engine.shake = Math.min(1, engine.shake + 0.25); sfx('hurt');
  if (P.hp <= 0) { P.hp = 0; die(); }
}
function die() { G.mode = 'dead'; $('death').classList.remove('hidden'); }

// ---------------- combat: player ----------------
function rollDmg() { const s = P.st; let d = rand(s.dmgMin, s.dmgMax) + s.dmgFlat; const crit = Math.random() * 100 < s.crit; if (crit) d *= 1.75; return [d, crit]; }
function swing(dir) {
  if (P.atkT > 0) return false;
  P.atkT = 0.72 / (P.st.atkSpd || 1); P.swing = 0.25; P.facing = Math.atan2(dir.x, dir.z); sfx('swing');
  const arc = makeRing(0xffc890, 0.9, 1.9, 0.0); arc.position.copy(P.pos).setY(0.06); arc.material.opacity = 0.35;
  arc.geometry.dispose(); arc.geometry = new THREE.RingGeometry(0.6, 1.9, 24, 1, -Math.PI / 3, 2 * Math.PI / 3);
  arc.rotation.z = P.facing - Math.PI / 2; engine.scene.add(arc); G.fx.push({ mesh: arc, t: 0, life: 0.18 });
  for (const e of G.enemies) {
    if (e.dead) continue; const to = flat(e.pos).sub(P.pos); const dist = to.length() - e.r;
    if (dist < 1.6 && to.normalize().dot(dir) > 0.25) { const [d, c] = rollDmg(); damageEnemy(e, d, c, to.multiplyScalar(0.25)); }
  }
  return true;
}
function castLance(dir) {
  const s = SPELLS.lance; if (P.cds.lance > 0) return; if (P.light < s.cost) return noLight();
  P.light -= s.cost; P.cds.lance = s.cd; P.facing = Math.atan2(dir.x, dir.z); sfx('cast');
  const m = makeOrb(0xffb050, 0.13); m.position.copy(P.pos).setY(1.0); engine.scene.add(m);
  G.projs.push({ mesh: m, pos: m.position, vel: dir.clone().multiplyScalar(s.speed), life: s.range / s.speed, friendly: true, hit: new Set(), dmg: rand(...s.dmg) * (1 + P.st.spell / 100) * (1 + (P.lvl - 1) * 0.1) });
}
function castFlare() {
  const s = SPELLS.flare; if (P.cds.flare > 0) return; if (P.light < s.cost) return noLight();
  P.light -= s.cost; P.cds.flare = s.cd; sfx('flare'); engine.shake = 0.4;
  const r = makeRing(0xffb050, 0.3, 0.8, 0.9); r.position.copy(P.pos).setY(0.06); engine.scene.add(r); G.fx.push({ mesh: r, t: 0, life: 0.45, grow: s.radius / 0.8 });
  const fl = new THREE.PointLight(0xffa040, 120, 12, 1.4); fl.position.copy(P.pos).setY(1.2); engine.scene.add(fl); G.fx.push({ mesh: fl, t: 0, life: 0.5, light: 120 });
  for (const e of G.enemies) { if (e.dead) continue; const to = flat(e.pos).sub(P.pos); if (to.length() - e.r < s.radius) { damageEnemy(e, rand(...s.dmg) * (1 + P.st.spell / 100) * (1 + (P.lvl - 1) * 0.1), false, to.normalize().multiplyScalar(1.2)); e.burn = 2.5; } }
}
function noLight() { hint('Not enough Light', 1); }
function usePotion(k) {
  if (P.pots[k] <= 0) return hint(k === 'hp' ? 'No Rust Draughts' : 'No Lamp Oil', 1);
  P.pots[k]--; sfx('drink');
  if (k === 'hp') P.regenHp = { left: 2.0, rate: P.st.maxHp * 0.6 / 2.0 }; else P.light = Math.min(P.st.maxLight, P.light + P.st.maxLight * 0.6);
}

// ---------------- AI ----------------
function updateEnemy(e, dt) {
  const d = e.d, toP = flat(P.pos).sub(e.pos), dist = toP.length();
  const body = e.mesh.userData.body;
  e.t += dt; e.cd -= dt;
  if (e.hitT > 0) { e.hitT -= dt; body.scale.setScalar(1 + e.hitT * 1.2); } else body.scale.setScalar(1);
  if (e.burn > 0) { e.burn -= dt; e.hp -= dt * 3; if (e.hp <= 0) killEnemy(e); }
  if (G.mode !== 'play') return;
  if (dist < d.aggro || e.aggroed) e.aggroed = true; else { if (e.kind === 'wick') animWick(e); return; }
  if (e.kind === 'rift') {
    if (e.cd <= 0 && G.enemies.filter(x => x.parent === e && !x.dead).length < 4) {
      e.cd = d.cd; const p = e.pos.clone().add(V(rand(-1, 1), 0, rand(-1, 1))); if (walkable(p)) { const c = spawnEnemy('dustling', p); c.parent = e; c.aggroed = true; }
      const r = makeRing(0xeef6ff, 0.3, 0.6, 0.6); r.position.copy(e.pos).setY(0.05); engine.scene.add(r); G.fx.push({ mesh: r, t: 0, life: 0.6, grow: 3 });
    }
    e.mesh.userData.light.intensity = 8 + Math.sin(e.t * 6) * 3; return;
  }
  if (e.kind === 'unsealed') return updateBoss(e, dt, toP, dist);
  if (e.state === 'windup') {
    e.wind -= dt; if (e.tele) e.tele.material.opacity = 0.2 + (1 - e.wind / d.windup) * 0.5;
    if (e.wind <= 0) { strike(e, toP, dist); e.state = 'chase'; e.cd = d.cd; if (e.tele) { engine.scene.remove(e.tele); e.tele = null; } }
  } else {
    let want = 0; const dir = toP.clone().normalize();
    if (d.ranged) { if (dist > d.range) want = 1; else if (dist < d.keep) want = -0.7; }
    else if (dist > d.range + e.r * 0.5) want = 1;
    if (want) { tryMove(e.pos, dir.x * want * d.speed * dt, dir.z * want * d.speed * dt); }
    e.facing = Math.atan2(dir.x, dir.z);
    if (e.cd <= 0 && dist < d.range + 0.6 + e.r * 0.5) {
      e.state = 'windup'; e.wind = d.windup;
      if (d.slam) { e.tele = makeRing(0xeef6ff, 0.1, d.slam, 0.2); e.tele.position.copy(e.pos).setY(0.05); engine.scene.add(e.tele); }
    }
  }
  e.mesh.rotation.y = e.facing;
  if (e.kind === 'wick') animWick(e);
  if (e.kind === 'dustling') body.position.y = Math.abs(Math.sin(e.t * 14)) * 0.06;
  if (e.kind === 'stepwalker') { body.rotation.z = Math.sin(e.t * 3) * 0.04; for (const c of body.children) if (c.userData.arm) c.rotation.x = e.state === 'windup' ? -2.2 * (1 - e.wind / d.windup) : Math.sin(e.t * 3 + c.userData.arm) * 0.2; }
}
function animWick(e) { const b = e.mesh.userData.body; for (const c of b.children) if (c.userData.orbit !== undefined) { const a = e.t * 1.8 + c.userData.orbit * 1.047; c.position.set(Math.cos(a) * 0.5, 1.4 + Math.sin(a * 2) * 0.15, Math.sin(a) * 0.5); c.rotation.y = a; } b.position.y = Math.sin(e.t * 2) * 0.1; }
function strike(e, toP, dist) {
  const d = e.d;
  if (d.ranged) { const dir = toP.clone().normalize(); const m = makeOrb(0xe8f2ff, 0.11); m.position.copy(e.pos).setY(1.4); engine.scene.add(m); G.projs.push({ mesh: m, pos: m.position, vel: dir.multiplyScalar(9), life: 1.4, friendly: false, dmg: rand(...d.dmg) }); sfx('enemyCast'); return; }
  if (d.slam) { if (dist < d.slam) hurtPlayer(rand(...d.dmg)); engine.shake = 0.5; sfx('slam'); return; }
  if (dist < d.range + 0.5) hurtPlayer(rand(...d.dmg));
}
function updateBoss(e, dt, toP, dist) {
  const d = e.d, body = e.mesh.userData.body, gate = e.mesh.userData.gate;
  const frac = e.hp / e.maxHp; $('bossFill').style.width = (Math.max(0, frac) * 100) + '%';
  if (e.phase === 0 && frac < 0.66 || e.phase === 1 && frac < 0.33) { e.phase++; for (let i = 0; i < 4; i++) { const p = e.pos.clone().add(V(rand(-3, 3), 0, rand(-3, 3))); if (walkable(p)) spawnEnemy('dustling', p).aggroed = true; } hint('The Unsealed calls up the dust', 2); }
  if (e.state === 'slamWind' || e.state === 'bladeWind') {
    e.wind -= dt; const k = 1 - e.wind / e.windMax;
    if (e.tele) e.tele.material.opacity = 0.15 + k * 0.5;
    if (gate) { gate.l.position.x = -0.2 - k * 0.25 * (e.state === 'bladeWind'); gate.r.position.x = 0.2 + k * 0.25 * (e.state === 'bladeWind'); }
    if (e.wind <= 0) {
      if (e.state === 'slamWind') { if (dist < d.slam) hurtPlayer(rand(...d.dmg)); engine.shake = 0.9; sfx('slam'); }
      else { // narrow cold blade along facing
        const f = V(Math.sin(e.facing), 0, Math.cos(e.facing)), rel = flat(P.pos).sub(e.pos), along = rel.dot(f), side = Math.abs(rel.x * f.z - rel.z * f.x);
        if (along > 0 && along < 14 && side < 0.9) hurtPlayer(rand(24, 32)); sfx('blade'); engine.shake = 0.6;
        const b = makeBeam(0xffffff, 14, 0.5); b.material.opacity = 0.9; b.position.copy(e.pos).addScaledVector(f, 7).setY(0.3); b.rotation.y = e.facing; engine.scene.add(b); G.fx.push({ mesh: b, t: 0, life: 0.35, fadeOnly: true });
      }
      if (e.tele) { engine.scene.remove(e.tele); e.tele = null; } e.state = 'chase'; e.cd = d.cd; if (gate) { gate.l.position.x = -0.2; gate.r.position.x = 0.2; }
    }
    return;
  }
  const dir = toP.clone().normalize(); e.facing = Math.atan2(dir.x, dir.z); e.mesh.rotation.y = e.facing;
  if (dist > d.range) tryMove(e.pos, dir.x * d.speed * dt, dir.z * d.speed * dt);
  body.rotation.z = Math.sin(e.t * 2) * 0.03;
  if (e.cd <= 0) {
    if (dist < d.slam + 0.5 && Math.random() < 0.6) { e.state = 'slamWind'; e.wind = e.windMax = d.windup; e.tele = makeRing(0xeef6ff, 0.1, d.slam, 0.15); e.tele.position.copy(e.pos).setY(0.05); engine.scene.add(e.tele); }
    else { e.state = 'bladeWind'; e.wind = e.windMax = 1.2; e.tele = makeBeam(0xdfe8ff, 14, 1.8); e.tele.material.opacity = 0.15; e.tele.position.copy(e.pos).addScaledVector(dir, 7); e.tele.rotation.y = e.facing; engine.scene.add(e.tele); }
  }
}

// ---------------- quests / interaction ----------------
function checkQuests() {
  const q = G.quests;
  if (!q.q1.done && q.q1.n >= 3) { q.q1.done = true; G.active = 'q2'; hint('The terrace holds. The way to the Banner Steps is open.', 3); sfx('quest'); }
  if (!q.q2.done && q.q2.n >= 2) { q.q2.done = true; G.active = 'q3'; hint('The rifts are closed. Go down to the Well of Descent.', 3); sfx('quest'); }
  if (!q.q3.done && q.q3.n >= 1) { q.q3.done = true; G.active = 'q4'; hint('The well is open. Jump.', 3); sfx('quest'); }
  updateQuestUI();
}
function updateQuestUI() {
  const Q = QUESTS[G.active], q = G.quests[G.active];
  $('qTitle').textContent = Q.title; $('qStep').textContent = Q.steps + (q.of > 1 ? ` (${q.n}/${q.of})` : '');
}
function doInteract(o) {
  if (o.kind === 'lantern' && !o.lit) {
    o.lit = true; lightLantern(o.mesh); G.quests.q1.n++; sfx('light'); floater(o.pos.clone().setY(2.6), 'Relit', '#ffd38a', 20);
    if (G.quests.q1.n === 2) for (let i = 0; i < 3; i++) { const p = o.pos.clone().add(V(rand(-4, 4), 0, rand(-3, 3))); if (walkable(p)) spawnEnemy('dustling', p).aggroed = true; }
    checkQuests();
  } else if (o.id === 'teyth') { say(G.quests.q1.done ? DIALOGUE.teythDone : DIALOGUE.teyth); }
  else if (o.potion) { P.pots[o.potion]++; sfx('pickup'); removeLoot(o); floater(P.pos.clone().setY(2), o.potion === 'hp' ? '+Rust Draught' : '+Lamp Oil', '#ffd38a', 16); }
  else if (o.item) { if (P.bag.length >= 32) return hint('Your pack is full', 1.5); P.bag.push(o.item); removeLoot(o); sfx('pickup'); renderInv(); }
  else if (o.kind === 'well') { if (G.quests.q3.done) jump(); else hint('The well is sealed by something below the rim', 2); }
}
function removeLoot(o) { engine.scene.remove(o.mesh); o.lbl?.remove(); G.loot.splice(G.loot.indexOf(o), 1); }
function interactables() {
  const list = [...G.posts.filter(p => !p.lit), ...G.npcs];
  if (G.wellPos) list.push({ kind: 'well', pos: G.wellPos, rad: G.wellRad });
  return list;
}
function say(lines) { G.dialog = { lines, i: 0 }; $('dialog').classList.remove('hidden'); $('dlgText').textContent = lines[0]; }
function advanceDialog() { const d = G.dialog; if (!d) return; d.i++; if (d.i >= d.lines.length) { G.dialog = null; $('dialog').classList.add('hidden'); } else $('dlgText').textContent = d.lines[d.i]; }

// ---------------- jump-down portal ----------------
async function jump() {
  if (P.jumping) return; G.mode = 'cut';
  const c = G.wellPos, start = P.pos.clone(); P.jumping = { t: 0, start, c }; sfx('jump');
  await wait(1300);
  $('fade').style.background = '#fff6dc'; $('fade').style.opacity = 1; await wait(800);
  await playCutscene('fall');
  $('fade').style.opacity = 0; $('fade').style.background = '#000';
  $('end').classList.remove('hidden'); $('hud').classList.add('hidden'); G.mode = 'end';
}
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------------- cutscenes ----------------
function playCutscene(key) {
  const cs = ASSETS.cutscenes[key], lines = CUTSCENE_TEXT[key] || [];
  const el = $('cut'), vid = $('cutVideo'), still = $('cutStill'), txt = $('cutText');
  el.classList.remove('hidden'); txt.textContent = ''; vid.classList.add('hidden'); still.classList.add('hidden');
  return new Promise(resolve => {
    let done = false, timers = [];
    const finish = () => { if (done) return; done = true; timers.forEach(clearTimeout); vid.pause(); vid.removeAttribute('src'); vid.load(); el.classList.add('hidden'); el.onclick = null; G.skipCut = null; resolve(); };
    G.skipCut = finish; el.onclick = finish;
    const showLines = (dur) => lines.forEach((l, i) => { timers.push(setTimeout(() => { txt.style.opacity = 0; timers.push(setTimeout(() => { txt.textContent = l; txt.style.opacity = 1; }, 400)); }, 300 + i * dur / lines.length)); });
    if (has(cs.video)) {
      vid.classList.remove('hidden'); vid.src = cs.video; vid.muted = false; vid.onended = finish; vid.onerror = finish;
      vid.play().catch(() => { vid.muted = true; vid.play().catch(finish); });
      vid.onloadedmetadata = () => showLines((vid.duration || 10) * 1000);
    } else {
      still.classList.remove('hidden', 'kb'); void still.offsetWidth; still.classList.add('kb');
      still.style.backgroundImage = has(cs.still) ? `url(${cs.still})` : placeholderArt(key);
      const dur = 2600 + lines.length * 2600; showLines(dur); timers.push(setTimeout(finish, dur + 900));
    }
  });
}
function placeholderArt(key) {
  const g = { opening: 'radial-gradient(ellipse at 50% 80%, rgba(255,240,196,.55), rgba(40,36,28,.9) 35%, #050505 70%)', opening2: 'radial-gradient(ellipse at 50% 70%, rgba(230,240,255,.35), #0c0d10 45%, #000 80%)', boss: 'radial-gradient(ellipse at 50% 50%, rgba(240,246,255,.5), #15161a 40%, #000 75%)', fall: 'radial-gradient(circle at 50% 50%, #fff6dc, #d9b867 20%, #2a2010 55%, #000 85%)' };
  return g[key] || '#000';
}

// ---------------- UI ----------------
function floater(pos3, text, color, size = 18) {
  const el = document.createElement('div'); el.className = 'fl'; el.textContent = text; el.style.color = color; el.style.fontSize = size + 'px'; $('floaters').appendChild(el);
  G.fx.push({ el, pos3: pos3.clone(), t: 0, life: 1.0 });
}
function clearFloaters() { $('floaters').innerHTML = ''; }
let hintT = 0; function hint(t, s = 2) { $('hint').textContent = t; $('hint').classList.add('show'); hintT = s; }
let areaT = 0; function showArea(n, s) { $('areaName').textContent = n; $('areaSub').textContent = s; $('area').classList.add('show'); areaT = 3.5; }
function iconStyle(sheet, idx) { const p = ASSETS.ui[sheet]; if (!has(p)) return ''; const x = idx % 3, y = Math.floor(idx / 3); return `background-image:url(${p});background-position:${x * 50}% ${y * 50}%;`; }
function setIcon(id, sheet, idx, glyph) { const el = $(id); const st = iconStyle(sheet, idx); if (st) { el.setAttribute('style', st); el.textContent = ''; } else el.textContent = glyph; }
function initIcons() {
  setIcon('icAttack', 'iconsItems', ICON_GRID.items.weapon, '⚔'); setIcon('icLance', 'iconsSpells', ICON_GRID.spells.lance, '➶'); setIcon('icFlare', 'iconsSpells', ICON_GRID.spells.flare, '✺');
  setIcon('icHpot', 'iconsItems', ICON_GRID.items.hpot, '♥'); setIcon('icLpot', 'iconsItems', ICON_GRID.items.lpot, '✦'); setIcon('icBag', 'iconsItems', ICON_GRID.items.robe, '▣');
  if (has(ASSETS.ui.bossPortrait)) $('bossPortrait').style.backgroundImage = `url(${ASSETS.ui.bossPortrait})`;
  if (has(ASSETS.ui.title)) $('titleBg').style.backgroundImage = `url(${ASSETS.ui.title})`; if (has(ASSETS.ui.title)) $('title').classList.add('art');
  $('heroName').textContent = HERO_NAME;
  if (has(ASSETS.ui.chapter2)) { $('end').style.background = `#000 url(${ASSETS.ui.chapter2}) center/cover`; $('end').classList.add('art'); }
  if (has(ASSETS.ui.portrait)) { const im = document.createElement('div'); im.id = 'portrait'; im.style.backgroundImage = `url(${ASSETS.ui.portrait})`; document.querySelector('#inv .ph').prepend(im); }
}
function itemCell(it, slotName) {
  const c = document.createElement('div'); c.className = 'cell' + (it ? ' filled' : '');
  const idx = ICON_GRID.items[it ? (it.slot === 'echo' ? 'charm' : it.slot) : slotName];
  if (it) { c.style.borderColor = it.color; const st = iconStyle('iconsItems', idx); if (st) c.setAttribute('style', st + `border-color:${it.color}`); else c.textContent = it.slot === 'echo' ? '◆' : it.base.split(' ').pop().slice(0, 6); c.style.color = it.color; }
  else c.textContent = slotName;
  c.onmouseenter = ev => it && showTip(it, ev); c.onmousemove = ev => it && moveTip(ev); c.onmouseleave = hideTip;
  return c;
}
function renderInv() {
  const eq = $('equip'); eq.innerHTML = '';
  for (const s of SLOTS) { const c = itemCell(P.equip[s], s); c.onclick = () => { const it = P.equip[s]; if (it && P.bag.length < 32) { P.bag.push(it); P.equip[s] = null; recalc(); renderInv(); hideTip(); } }; eq.appendChild(c); }
  const bag = $('bag'); bag.innerHTML = '';
  for (let i = 0; i < 32; i++) {
    const it = P.bag[i], c = itemCell(it, '');
    if (it) c.onclick = ev => { if (ev.shiftKey) { P.bag.splice(i, 1); sfx('pickup'); } else if (it.slot !== 'echo') { const old = P.equip[it.slot]; P.equip[it.slot] = it; P.bag.splice(i, 1); if (old) P.bag.splice(i, 0, old); recalc(); sfx('equip'); } renderInv(); hideTip(); };
    bag.appendChild(c);
  }
  const s = P.st;
  $('stats').innerHTML = [['Level', P.lvl], ['Life', `${Math.ceil(P.hp)}/${s.maxHp}`], ['Light', `${Math.floor(P.light)}/${s.maxLight}`], ['Damage', `${s.dmgMin + s.dmgFlat}–${s.dmgMax + s.dmgFlat}`], ['Armor', s.armor], ['Spell Power', `+${s.spell}%`], ['Critical', `${s.crit}%`], ['Move', `+${s.move}%`]].map(([a, b]) => `<div>${a}: <b>${b}</b></div>`).join('');
}
function showTip(it, ev) {
  const r = RARITY.find(x => x.id === it.rarity), t = $('tooltip');
  const cmp = it.slot !== 'echo' && P.equip[it.slot] && P.equip[it.slot] !== it ? `<div class="tr">Equipped: ${P.equip[it.slot].name}</div>` : '';
  t.innerHTML = `<div class="tn" style="color:${it.color}">${it.name}</div><div class="tr">${r.name} ${it.slot}</div>${describe(it).map(l => `<div>${l}</div>`).join('')}${cmp}`;
  t.classList.remove('hidden'); moveTip(ev);
}
function moveTip(ev) { const t = $('tooltip'); t.style.left = Math.min(innerWidth - 310, ev.clientX + 14) + 'px'; t.style.top = Math.min(innerHeight - t.offsetHeight - 8, ev.clientY + 14) + 'px'; }
function hideTip() { $('tooltip').classList.add('hidden'); }
function toggleInv(force) { const el = $('inv'); const show = force ?? el.classList.contains('hidden'); el.classList.toggle('hidden', !show); if (show) renderInv(); else hideTip(); }

function updateHUD(dt) {
  const s = P.st;
  $('hpFill').style.height = (P.hp / s.maxHp * 100) + '%'; $('hpTxt').textContent = Math.ceil(P.hp);
  $('lightFill').style.height = (P.light / s.maxLight * 100) + '%'; $('lightTxt').textContent = Math.floor(P.light);
  $('xpFill').style.width = (P.xp / (40 + (P.lvl - 1) * 55) * 100) + '%'; $('lvl').textContent = `Level ${P.lvl} · ${HERO_NAME}`;
  $('cdLance').style.height = (P.cds.lance / SPELLS.lance.cd * 100) + '%'; $('cdFlare').style.height = (P.cds.flare / SPELLS.flare.cd * 100) + '%'; $('cdAttack').style.height = (Math.max(0, P.atkT) / 0.72 * 100) + '%';
  $('nHpot').textContent = P.pots.hp; $('nLpot').textContent = P.pots.lp;
  if (hintT > 0 && (hintT -= dt) <= 0) $('hint').classList.remove('show');
  if (areaT > 0 && (areaT -= dt) <= 0) $('area').classList.remove('show');
  // darkness: the world is dimming; your lantern (Light) sets how far you see
  const [sx, sy] = engine.g2s(P.pos.clone().setY(1)); const k = 0.55 + 0.45 * (P.light / s.maxLight);
  const r0 = Math.min(innerWidth, innerHeight) * 0.28 * k, r1 = Math.min(innerWidth, innerHeight) * 0.85 * k;
  const amb = G.L.light?.amb ?? 0.6;
  $('dark').style.background = `radial-gradient(circle at ${sx}px ${sy}px, rgba(255,214,160,1) ${r0}px, rgba(${Math.round(255 * amb)},${Math.round(235 * amb)},${Math.round(215 * amb)},1) ${r1}px)`;
  // loot labels + enemy hp
  const placed = [];
  for (const l of G.loot) if (l.lbl) {
    let [x, y] = engine.g2s(l.pos.clone().setY(0.4)); const w = l.lbl.offsetWidth || 120;
    for (let k = 0; k < 8; k++) { const hit = placed.find(p => Math.abs(p[0] - x) < (p[2] + w) / 2 && Math.abs(p[1] - y) < 20); if (!hit) break; y = hit[1] - 21; }
    placed.push([x, y, w]); l.lbl.style.left = x + 'px'; l.lbl.style.top = y + 'px';
  }
}

// ---------------- input ----------------
const cv = $('gl');
function pickEnemy(sx, sy) {
  let best = null, bd = 1e9;
  for (const e of G.enemies) { if (e.dead) continue; const h = e.kind === 'unsealed' ? 2.2 : e.kind === 'rift' ? 0.2 : e.kind === 'stepwalker' ? 1.0 : 0.6; const [x, y] = engine.g2s(e.pos.clone().setY(h)); const d = Math.hypot(x - sx, y - sy); const rad = 34 * (e.kind === 'unsealed' ? 2.5 : e.kind === 'stepwalker' ? 1.6 : 1); if (d < rad && d < bd) { bd = d; best = e; } }
  return best;
}
function pickInteract(Gp) { let best = null, bd = 1e9; for (const o of [...interactables(), ...G.loot]) { const d = flat(o.pos).distanceTo(Gp); if (d < (o.rad || 1.0) && d < bd) { bd = d; best = o; } } return best; }
function cursorDir() { const Gp = engine.s2g(G.mouse.x, G.mouse.y); const d = Gp.sub(P.pos); d.y = 0; return d.lengthSq() < 1e-4 ? V(Math.sin(P.facing), 0, Math.cos(P.facing)) : d.normalize(); }
function onPress(sx, sy) {
  if (G.mode !== 'play' || G.dialog) { if (G.dialog) advanceDialog(); return; }
  const e = pickEnemy(sx, sy); if (e) { P.target = e; P.moveTo = null; P.interact = null; return; }
  const Gp = engine.s2g(sx, sy); const o = pickInteract(Gp);
  if (o) { P.interact = o; P.target = null; P.moveTo = flat(o.pos); return; }
  P.target = null; P.interact = null; P.moveTo = Gp;
}
cv.addEventListener('pointerdown', ev => {
  G.mouse.x = ev.clientX; G.mouse.y = ev.clientY;
  if (ev.button === 2) { if (G.mode === 'play') castLance(cursorDir()); return; }
  G.mouse.down = true; onPress(ev.clientX, ev.clientY);
});
addEventListener('pointermove', ev => { G.mouse.x = ev.clientX; G.mouse.y = ev.clientY; if (G.editor) edMove(); });
addEventListener('pointerup', () => { G.mouse.down = false; });
cv.addEventListener('contextmenu', ev => ev.preventDefault());
addEventListener('keydown', ev => {
  const k = ev.key.toLowerCase(); G.keys[k] = true;
  if (G.mode === 'cut' && (k === 'escape' || k === ' ')) { G.skipCut?.(); return; }
  if (k === 'f2') { ev.preventDefault(); toggleEditor(); return; }
  if (G.mode !== 'play') return;
  if (k === 'e') castLance(cursorDir());
  else if (k === 'q') castFlare();
  else if (k === ' ') { ev.preventDefault(); swing(cursorDir()); }
  else if (k === '1') usePotion('hp'); else if (k === '2') usePotion('lp');
  else if (k === 'i' || k === 'tab') { ev.preventDefault(); toggleInv(); }
  else if (k === 'escape') { toggleInv(false); if (G.dialog) { G.dialog = null; $('dialog').classList.add('hidden'); } }
  else if (k === 'f') { if (G.dialog) advanceDialog(); else { let best = null, bd = 2.5; for (const o of [...interactables(), ...G.loot]) { const d = flat(o.pos).distanceTo(P.pos); if (d < Math.max(bd, o.rad || 0)) { bd = d; best = o; } } if (best) doInteract(best); } }
});
addEventListener('keyup', ev => { G.keys[ev.key.toLowerCase()] = false; });
$('dialog').onclick = advanceDialog;
$('invClose').onclick = () => toggleInv(false);
const slotAct = { I: () => toggleInv(), E: () => castLance(cursorDir()), Q: () => castFlare(), 1: () => usePotion('hp'), 2: () => usePotion('lp'), LMB: () => swing(cursorDir()) };
document.querySelectorAll('#slots .slot').forEach(el => el.addEventListener('pointerdown', ev => { ev.stopPropagation(); if (G.mode === 'play') slotAct[el.dataset.k]?.(); }));

// ---------------- editor (F2): trace walk polygons on a real plate ----------------
function toggleEditor() { G.editor = !G.editor; $('editor').classList.toggle('hidden', !G.editor); $('edInfo').classList.toggle('hidden', !G.editor); G.edPts = G.edPts || []; drawEditor(); }
function edMove() { drawEditor(); }
addEventListener('pointerdown', ev => { if (!G.editor || ev.button !== 0 || !ev.altKey) return; const [x, y] = engine.g2p(engine.s2g(ev.clientX, ev.clientY)); G.edPts.push([Math.round(x), Math.round(y)]); drawEditor(); }, true);
function drawEditor() {
  if (!G.editor || !G.L) return;
  const toS = ([x, y]) => engine.g2s(engine.p2g(x, y)).map(Math.round).join(',');
  const poly = (pts, col) => `<polygon points="${pts.map(toS).join(' ')}" fill="${col}22" stroke="${col}" stroke-width="2"/>`;
  $('editor').innerHTML = G.L.walk.map(p => poly(p, '#5fd6c6')).join('') + (G.L.blockers || []).map(p => poly(p, '#ff5050')).join('') + (G.L.occluders || []).map(o => poly(o.poly, '#ffcc00')).join('') + (G.edPts.length ? `<polyline points="${G.edPts.map(toS).join(' ')}" fill="none" stroke="#fff" stroke-width="2"/>` : '');
  const [px, py] = engine.g2p(engine.s2g(G.mouse.x, G.mouse.y));
  $('edInfo').textContent = `EDITOR (F2) level ${G.level}  cursor plate px: ${Math.round(px)}, ${Math.round(py)}\nAlt+click adds a point. Copy the array into LEVELS.${G.level}.walk in js/config.js\n${JSON.stringify(G.edPts)}`;
}

// ---------------- main loop ----------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; G.time += dt;
  if (G.mode === 'play' || G.mode === 'cut') update(dt);
  engine.renderer.render(engine.scene, engine.camera);
  requestAnimationFrame(frame);
}
function update(dt) {
  const s = P.st;
  // timers & regen
  P.atkT -= dt; P.swing = Math.max(0, P.swing - dt); P.invuln -= dt;
  for (const k in P.cds) P.cds[k] = Math.max(0, P.cds[k] - dt);
  P.light = Math.min(s.maxLight, P.light + s.regen * dt);
  if (P.regenHp) { P.hp = Math.min(s.maxHp, P.hp + P.regenHp.rate * dt); if ((P.regenHp.left -= dt) <= 0) P.regenHp = null; }
  if (G.mode === 'play') {
    // WASD (camera-relative)
    const fw = V(-engine.u.x, 0, -engine.u.z).normalize().negate(), rt = V(engine.r.x, 0, engine.r.z).normalize();
    const mv = V(); if (G.keys.w || G.keys.arrowup) mv.add(fw); if (G.keys.s || G.keys.arrowdown) mv.sub(fw); if (G.keys.d || G.keys.arrowright) mv.add(rt); if (G.keys.a || G.keys.arrowleft) mv.sub(rt);
    if (G.mouse.down && !P.target && !P.interact && !G.dialog) P.moveTo = engine.s2g(G.mouse.x, G.mouse.y);
    let moving = false;
    if (mv.lengthSq() > 0) { mv.normalize(); P.moveTo = null; P.target = null; P.interact = null; tryMove(P.pos, mv.x * s.speed * dt, mv.z * s.speed * dt); P.facing = Math.atan2(mv.x, mv.z); moving = true; }
    else if (P.target) {
      const e = P.target; if (e.dead) P.target = null; else {
        const to = flat(e.pos).sub(P.pos), d = to.length(); to.normalize();
        if (d > 1.4 + e.r) { tryMove(P.pos, to.x * s.speed * dt, to.z * s.speed * dt); P.facing = Math.atan2(to.x, to.z); moving = true; }
        else { swing(to); if (!G.mouse.down && P.atkT > 0.6 / (s.atkSpd || 1)) {} }
      }
    } else if (P.moveTo) {
      const to = P.moveTo.clone().sub(P.pos); to.y = 0; const d = to.length();
      const reach = P.interact ? Math.max(1.1, (P.interact.rad || 0) - 0.3) : 0.1;
      if (d > reach) { to.normalize(); const step = Math.min(d, s.speed * dt); if (!tryMove(P.pos, to.x * step, to.z * step)) P.moveTo = null; P.facing = Math.atan2(to.x, to.z); moving = true; }
      else { P.moveTo = null; if (P.interact) { const o = P.interact; P.interact = null; doInteract(o); } }
    }
    // auto-pick potions; first-time NPC greeting
    for (const l of [...G.loot]) if (l.potion && flat(l.pos).distanceTo(P.pos) < 0.9) doInteract(l);
    for (const n of G.npcs) if (!G.talked[n.id] && n.pos.distanceTo(P.pos) < 3) { G.talked[n.id] = true; doInteract(n); }
    // boss trigger
    if (G.L.boss && !G.bossSpawned && P.pos.distanceTo(pg(G.L.boss.at)) < 10) spawnBoss();
    // exits
    const inEx = (G.L.exits || []).filter(ex => flat(pg(ex.at)).distanceTo(P.pos) < ex.r / 64 + 0.6);
    if (!inEx.length) G.exitArmed = true;
    if (G.exitArmed) for (const ex of inEx) {
      if (ex.needs && !G.quests[ex.needs].done) { if (!G.exitHintT || G.time - G.exitHintT > 3) { hint('The way is barred until ' + QUESTS[ex.needs].title.toLowerCase() + ' is done', 2); G.exitHintT = G.time; } }
      else { transition(ex.to, ex.spawn); break; }
    }
    P.walk = moving ? P.walk + dt * 9 : 0;
  }
  // hero mesh
  const ud = P.mesh.userData;
  if (P.jumping) { // leap into the well and drop
    const j = P.jumping; j.t += dt; const k = Math.min(1, j.t / 0.6);
    const xz = j.start.clone().lerp(j.c, k); P.pos.set(xz.x, 0, xz.z);
    P.mesh.position.set(xz.x, k < 1 ? Math.sin(k * Math.PI) * 1.2 : -(j.t - 0.6) * (j.t - 0.6) * 18, xz.z);
  } else P.mesh.position.copy(P.pos);
  P.mesh.rotation.y = P.facing;
  ud.body.position.y = Math.abs(Math.sin(P.walk || 0)) * 0.06;
  ud.arm.rotation.x = P.swing > 0 ? -1.8 + (0.25 - P.swing) * 12 : Math.sin(P.walk || 0) * 0.3;
  ud.lant.position.y = ud.lantY + Math.sin(G.time * 3) * 0.02; ud.lant.rotation.z = Math.sin(G.time * 2.1) * 0.12;
  ud.light.intensity = 3 + 3 * (P.light / s.maxLight) + Math.sin(G.time * 11) * 0.3;
  // enemies
  for (const e of G.enemies) {
    if (e.dead) { e.deathT -= dt; e.mesh.scale.multiplyScalar(0.92); e.mesh.position.y -= dt; if (e.deathT <= 0) engine.scene.remove(e.mesh); continue; }
    updateEnemy(e, dt);
  }
  G.enemies = G.enemies.filter(e => !e.dead || e.deathT > 0);
  // separation
  for (let i = 0; i < G.enemies.length; i++) for (let j = i + 1; j < G.enemies.length; j++) { const a = G.enemies[i], b = G.enemies[j]; if (a.dead || b.dead || !a.d.speed || !b.d.speed) continue; const d = flat(a.pos).sub(b.pos); const l = d.length(), m = a.r + b.r; if (l > 1e-3 && l < m) { d.multiplyScalar((m - l) / l * 0.5); tryMove(a.pos, d.x, d.z); tryMove(b.pos, -d.x, -d.z); } }
  // projectiles
  for (const p of G.projs) {
    p.pos.addScaledVector(p.vel, dt); p.life -= dt;
    if (p.friendly) { for (const e of G.enemies) if (!e.dead && !p.hit.has(e) && flat(e.pos).distanceTo(flat(p.pos)) < e.r + 0.35) { p.hit.add(e); damageEnemy(e, p.dmg, false, p.vel.clone().normalize().multiplyScalar(0.3)); } }
    else if (flat(P.pos).distanceTo(flat(p.pos)) < 0.5) { hurtPlayer(p.dmg); p.life = 0; }
    if (p.life <= 0) engine.scene.remove(p.mesh);
  }
  G.projs = G.projs.filter(p => p.life > 0);
  // fx
  for (const f of G.fx) {
    f.t += dt; const k = f.t / f.life;
    if (f.el) { const [x, y] = engine.g2s(f.pos3); f.el.style.left = x + 'px'; f.el.style.top = (y - k * 40) + 'px'; f.el.style.opacity = 1 - k * k; if (k >= 1) f.el.remove(); continue; }
    if (f.grow) f.mesh.scale.setScalar(1 + k * (f.grow - 1));
    if (f.light) f.mesh.intensity = f.light * (1 - k); else if (f.mesh.material) f.mesh.material.opacity = (f.fadeOnly ? 0.9 : 0.8) * (1 - k);
    if (k >= 1) engine.scene.remove(f.mesh);
  }
  G.fx = G.fx.filter(f => f.t < f.life);
  for (const l of G.loot) if (l.mesh.userData.beam) l.mesh.userData.beam.material.opacity = 0.3 + Math.sin(G.time * 3 + l.pos.x) * 0.12;
  if (G.wellRing && G.bossDead) G.wellRing.material.opacity = 0.45 + 0.15 * Math.sin(G.time * 2.2);
  engine.follow(P.jumping ? P.jumping.c : P.pos, dt);
  updateHUD(dt);
  if (G.editor) drawEditor();
}
async function spawnBoss() {
  G.bossSpawned = true; G.mode = 'cut';
  await playCutscene('boss');
  const b = spawnEnemy('unsealed', pg(G.L.boss.at)); b.aggroed = true; b.cd = 1.5;
  $('bossbar').classList.remove('hidden'); G.mode = 'play'; engine.shake = 0.8; sfx('slam');
}
let transitioning = false;
async function transition(to, spawn) {
  if (transitioning) return; transitioning = true; G.mode = 'cut';
  $('fade').style.opacity = 1; await wait(750);
  await loadLevel(to, spawn);
  $('fade').style.opacity = 0; G.mode = 'play'; transitioning = false;
}
$('revive').onclick = () => { $('death').classList.add('hidden'); P.hp = P.st.maxHp; P.light = P.st.maxLight; P.invuln = 2; G.mode = 'play'; P.pos.copy(pg(G.L.spawn)); };
$('again').onclick = () => location.reload();

// ---------------- boot ----------------
async function boot() {
  try { const r = await fetch('assets/manifest.json', { cache: 'no-cache' }); if (r.ok) MANIFEST = new Set((await r.json()).files); } catch (e) { /* no manifest: placeholders everywhere */ }
  initIcons(); startingGear();
  await loadLevel('a1');
  $('hud').classList.add('hidden');
  requestAnimationFrame(frame);
  window.__arpg = { G, P, engine, doInteract, damageEnemy, usePotion, loadLevel, spawnEnemy, dropItem, makeItem, playCutscene, jump, transition, castFlare, castLance, swing, toggleInv, pg, checkQuests, recalc };
  $('title').onclick = async () => {
    $('title').classList.add('hidden'); startAmbience(); G.mode = 'cut';
    await playCutscene('opening'); await playCutscene('opening2');
    $('hud').classList.remove('hidden'); G.mode = 'play'; showArea(G.L.name, G.L.sub);
  };
}
boot();
