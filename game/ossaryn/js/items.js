// Loot: bases, affixes, rarity rolls.
import { RARITY } from './config.js';

const BASES = [
  { slot: 'weapon', name: 'Bronze Hook-Staff', dmg: [4, 8], spd: 1.0 },
  { slot: 'weapon', name: 'Basalt Cleaver', dmg: [6, 11], spd: 0.85 },
  { slot: 'weapon', name: "Lamplighter's Pole", dmg: [3, 6], spd: 1.15, spell: 8 },
  { slot: 'lantern', name: 'Frosted Lantern', maxLight: 12 },
  { slot: 'lantern', name: 'Ring-Glass Lantern', spell: 6, maxLight: 5 },
  { slot: 'hood', name: 'Ochre Hood', armor: 2 },
  { slot: 'hood', name: 'Slate Cowl', armor: 3 },
  { slot: 'robe', name: 'Rust Robe', armor: 5 },
  { slot: 'robe', name: 'Verdigris Longcoat', armor: 7 },
  { slot: 'gloves', name: 'Wick Gloves', armor: 1 },
  { slot: 'boots', name: 'Terrace Boots', armor: 1, move: 4 },
  { slot: 'charm', name: 'Moss Charm', regen: 0.6 },
  { slot: 'charm', name: 'Bronze Fin Charm', crit: 3 },
];
const AFFIXES = [
  { stat: 'maxHp', min: 6, max: 18, label: v => `+${v} Life`, pre: 'Hale' },
  { stat: 'maxLight', min: 5, max: 14, label: v => `+${v} Light`, pre: 'Kindled' },
  { stat: 'armor', min: 2, max: 6, label: v => `+${v} Armor`, pre: 'Basalt' },
  { stat: 'dmgFlat', min: 1, max: 4, label: v => `+${v} Damage`, pre: 'Keen' },
  { stat: 'spell', min: 4, max: 12, label: v => `+${v}% Spell Power`, pre: 'Ringbound' },
  { stat: 'crit', min: 2, max: 6, label: v => `+${v}% Critical Chance`, pre: 'Moss-eyed' },
  { stat: 'move', min: 3, max: 8, label: v => `+${v}% Move Speed`, pre: 'Courier' },
  { stat: 'regen', min: 0.3, max: 1.2, dec: 1, label: v => `+${v} Light / s`, pre: 'Wellspring' },
  { stat: 'leech', min: 1, max: 3, label: v => `+${v} Life on Hit`, pre: 'Thirsting' },
];
const SUFFIX = ['of the Seventh Terrace', 'of the Undermere', 'of Kept Summers', 'of the Warden', 'of Banner Avenue', 'of the Fan Gate'];
let uid = 1;
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

export function rollRarity(bonus = 0) {
  const pool = RARITY.filter(r => r.weight > 0).map(r => ({ r, w: r.id === 'worn' ? Math.max(5, r.weight - bonus * 30) : r.weight * (1 + bonus) }));
  let t = Math.random() * pool.reduce((s, p) => s + p.w, 0);
  for (const p of pool) if ((t -= p.w) <= 0) return p.r;
  return pool[0].r;
}

export function makeItem(ilvl = 1, bonus = 0, forceSlot = null) {
  const choices = forceSlot ? BASES.filter(b => b.slot === forceSlot) : BASES;
  const base = choices[ri(0, choices.length - 1)];
  const rar = rollRarity(bonus);
  const it = { uid: uid++, slot: base.slot, base: base.name, rarity: rar.id, color: rar.color, stats: {}, lines: [] };
  const sc = 1 + (ilvl - 1) * 0.15;
  if (base.dmg) { it.stats.dmgMin = Math.round(base.dmg[0] * sc); it.stats.dmgMax = Math.round(base.dmg[1] * sc); it.stats.atkSpd = base.spd; }
  for (const k of ['armor', 'maxLight', 'spell', 'move', 'regen', 'crit']) if (base[k]) it.stats[k] = (it.stats[k] || 0) + Math.round(base[k] * sc * 10) / 10;
  const pool = [...AFFIXES];
  const picked = [];
  for (let i = 0; i < rar.affixes; i++) {
    const a = pool.splice(ri(0, pool.length - 1), 1)[0];
    let v = a.min + Math.random() * (a.max - a.min); v *= rar.id === 'ancient' ? 1.4 : 1; v = a.dec ? Math.round(v * 10) / 10 : Math.round(v);
    it.stats[a.stat] = (it.stats[a.stat] || 0) + v; picked.push(a); it.lines.push(a.label(v));
  }
  it.name = (picked[0] ? picked[0].pre + ' ' : '') + base.name + (picked.length >= 2 ? ' ' + SUFFIX[ri(0, SUFFIX.length - 1)] : '');
  if (rar.id === 'ancient') it.name = 'Ancient ' + it.name;
  return it;
}

export function echoShard(n) {
  return { uid: uid++, slot: 'echo', base: 'Echo Shard', rarity: 'echo', color: '#b98cff', stats: {}, name: `Echo Shard: ${n}`, lines: ['A splinter of kept light. It hums one note.', 'Quest item: the Lantern can hold it (Chapter II).'] };
}

export function describe(it) {
  const s = it.stats, out = [];
  if (s.dmgMin) out.push(`${s.dmgMin}–${s.dmgMax} Damage · speed ${s.atkSpd}`);
  if (s.armor && !it.lines.some(l => l.includes('Armor'))) out.push(`${s.armor} Armor`);
  return out.concat(it.lines);
}
