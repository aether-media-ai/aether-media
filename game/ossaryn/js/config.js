// The Aether Realms: ARPG vertical slice. All tunables and level data live here.
// Swap placeholder art by dropping files at the paths in ASSETS (see ASSET_LIST.md).

export const HERO_NAME = 'Nerith'; // chosen by Mads (one fixed lantern-bearer class for now)

// Camera: fixed orthographic 3/4 view. Plates must be painted from roughly this angle.
export const CAM = { yawDeg: 45, elevDeg: 50, viewFrac: 0.8 }; // viewFrac = share of plate height visible on screen
// Logical plate space (every plate image is stretched to this, whatever its real resolution).
export const PLATE_W = 2560, PLATE_H = 1440;
export const PPU = 64; // plate pixels per world metre (a 1.75 m figure is ~72 plate px tall)

export const ASSETS = {
  plates: {
    a1: 'assets/env/a1_lantern_terrace_plate.jpg',
    a2: 'assets/env/a2_banner_steps_plate.jpg',
    a3: 'assets/env/a3_well_of_descent_plate.jpg',
  },
  ui: {
    title: 'assets/ui/title_bg.jpg',
    chapter2: 'assets/ui/chapter2_card.jpg', // end-of-slice teaser card
    portrait: 'assets/ui/portrait_bearer.jpg',
    bossPortrait: 'assets/ui/portrait_unsealed.jpg',
    iconsItems: 'assets/ui/icons_items.jpg',   // 3x3 grid, see ICON_GRID
    iconsSpells: 'assets/ui/icons_spells.jpg', // 3x3 grid
  },
  cutscenes: {
    opening: { video: 'assets/cutscenes/cs01_the_ring_wakes.mp4', still: 'assets/cutscenes/cs01a_ring_wakes_kf.jpg' },
    opening2: { video: 'assets/cutscenes/cs01b_lights_go_out.mp4', still: 'assets/cutscenes/cs01b_lights_go_out_kf.jpg' },
    boss: { video: null, still: 'assets/cutscenes/cs02_the_unsealed_kf.jpg' },
    fall: { video: 'assets/cutscenes/cs03_the_fall.mp4', still: 'assets/cutscenes/cs03_the_fall_kf.jpg' },
  },
};

// Icon sheet cells (row-major, 3x3).
export const ICON_GRID = {
  items: { weapon: 0, lantern: 1, hood: 2, robe: 3, gloves: 4, boots: 5, charm: 6, hpot: 7, lpot: 8 },
  spells: { flare: 0, lance: 1, mend: 2, step: 3, chime: 4, kept: 5 },
};

export const CUTSCENE_TEXT = {
  opening: [
    'For a thousand years the Warden Ring slept beneath the Undermere.',
    'Tonight, as the last lanterns of Ossaryn burned low, it woke.',
  ],
  opening2: [
    'The light is leaving the world. Something below has noticed.',
    'Nerith. Keep the terrace lit.',
  ],
  boss: ['Something built to keep the gate shut has opened itself.'],
  fall: ['The well does not end. It only changes what it is falling through.', 'Chapter II: The Forgotten Depths'],
};

export const RARITY = [
  { id: 'worn', name: 'Worn', color: '#c9c3b6', affixes: 0, weight: 60 },
  { id: 'fine', name: 'Fine', color: '#5fd6c6', affixes: 1, weight: 28 },
  { id: 'rare', name: 'Rare', color: '#f0b04a', affixes: 2, weight: 10 },
  { id: 'ancient', name: 'Ancient', color: '#fff0c4', affixes: 3, weight: 2 },
  { id: 'echo', name: 'Echo', color: '#b98cff', affixes: 0, weight: 0 }, // quest / echo shards only
];

export const SLOTS = ['weapon', 'lantern', 'hood', 'robe', 'gloves', 'boots', 'charm'];

export const SPELLS = {
  flare: { name: 'Lantern Flare', key: 'Q', cost: 22, cd: 4.0, radius: 3.6, dmg: [14, 20], desc: 'Amber burst around you. Knocks back and burns.' },
  lance: { name: 'Wick Lance', key: 'RMB / E', cost: 10, cd: 0.55, speed: 18, range: 13, dmg: [9, 13], desc: 'A piercing bolt of lantern fire toward the cursor.' },
};

// Enemy archetypes from the Forgotten Depths (visuals built procedurally in entities.js).
export const ENEMIES = {
  dustling: { name: 'Dustling', hp: 22, speed: 3.6, dmg: [3, 5], range: 1.1, windup: 0.35, cd: 1.0, aggro: 9, xp: 6, scale: 0.6 },
  wick: { name: 'Pale Wick', hp: 30, speed: 2.4, dmg: [5, 7], range: 7.5, windup: 0.7, cd: 2.2, aggro: 11, xp: 11, ranged: true, keep: 5.5, scale: 0.9 },
  stepwalker: { name: 'Stepwalker', hp: 95, speed: 1.6, dmg: [11, 15], range: 1.9, windup: 0.9, cd: 2.4, aggro: 8, xp: 26, slam: 2.4, scale: 1.25 },
  rift: { name: 'Seam Rift', hp: 70, speed: 0, dmg: [0, 0], range: 0, windup: 0, cd: 5.5, aggro: 10, xp: 20, spawner: true, scale: 1 },
  unsealed: { name: 'The Unsealed', hp: 520, speed: 1.4, dmg: [16, 22], range: 2.4, windup: 1.0, cd: 2.0, aggro: 14, xp: 160, boss: true, slam: 3.2, scale: 2.2 },
};

// Levels. All coordinates are in plate pixels (0..PLATE_W, 0..PLATE_H), traced on the real plates.
// walk: walkable polygons. blockers: holes (well, lamp posts, stalls). occluders: plate regions redrawn
// in front of characters standing behind `base` (plate y of the occluder's foot line).
// Retrace with the editor (press F2 in game) if a plate is regenerated.
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const oct = (cx, cy, rx, ry = rx * 0.7) => Array.from({ length: 8 }, (_, i) => [Math.round(cx + rx * Math.cos(i * Math.PI / 4)), Math.round(cy + ry * Math.sin(i * Math.PI / 4))]);
const ellipse = (cx, cy, rx, ry, n = 20) => Array.from({ length: n }, (_, i) => [Math.round(cx + rx * Math.cos(i / n * Math.PI * 2)), Math.round(cy + ry * Math.sin(i / n * Math.PI * 2))]);
// a street lamp painted on the plate: head + pole, as an occluder polygon
const lamp = (x, top, foot, head = 36, pole = 14) => ({ poly: [[x - head, top], [x + head, top], [x + head, top + (foot - top) * 0.38], [x + pole, top + (foot - top) * 0.42], [x + pole, foot - 26], [x + 30, foot - 18], [x + 30, foot + 6], [x - 30, foot + 6], [x - 30, foot - 18], [x - pole, foot - 26], [x - pole, top + (foot - top) * 0.42], [x - head, top + (foot - top) * 0.38]], base: foot });
// the A1 terrace railing, cut into short segments so each sits at its own depth
const railY = x => 1440 - 0.59 * (x - 650);
const railing = () => { const out = []; for (let x = 560; x < 2460; x += 160) { const x1 = x + 160; out.push({ poly: [[x, railY(x) - 66], [x1, railY(x1) - 66], [x1, railY(x1) + 10], [x, railY(x) + 10]], base: Math.round((railY(x) + railY(x1)) / 2) + 6 }); } return out; };

export const LEVELS = {
  a1: {
    name: 'Lantern Terrace', sub: 'Ossaryn, the seventh terrace',
    light: { sky: 0x8a9cb0, ground: 0x1c1712, hemi: 0.85, key: 0xffb36b, keyI: 1.1, rim: 0x7fd8c8, rimI: 1.6, amb: 0.8 },
    walk: [[[30, 1440], [60, 1330], [250, 1235], [500, 1065], [750, 880], [1100, 705], [1300, 590], [1625, 478], [1950, 425], [2200, 362], [2330, 330], [2440, 330], [2420, 372], [2000, 618], [1500, 913], [1000, 1208], [650, 1415], [620, 1440]]],
    blockers: [],
    occluders: railing(),
    spawn: [300, 1320],
    exits: [{ to: 'a2', at: [2380, 345], r: 100, spawn: [1000, 1150], needs: 'q1' }],
    lanterns: [[1050, 1110], [1600, 790], [2100, 495]],
    npcs: [{ id: 'teyth', name: 'Elder Teyth', at: [560, 1150] }],
    packs: [
      { at: [1150, 920], kind: 'dustling', n: 3 },
      { at: [1650, 660], kind: 'dustling', n: 4 },
      { at: [2050, 480], kind: 'wick', n: 1 },
    ],
    props: { towers: [[300, 420], [800, 380], [1300, 360], [1850, 340], [2350, 330]], railFrom: [650, 1440], railTo: [2450, 380] },
  },
  a2: {
    name: 'The Banner Steps', sub: 'Ossaryn, market quarter',
    light: { sky: 0x8a9cb0, ground: 0x1c1610, hemi: 0.85, key: 0xff9a5c, keyI: 1.2, rim: 0x6fd8d0, rimI: 1.5, amb: 0.8 },
    walk: [[[540, 1110], [760, 1040], [900, 860], [1100, 760], [1300, 650], [1480, 570], [1620, 478], [1720, 405], [1800, 335], [1880, 290], [2060, 300], [2110, 420], [2050, 560], [1990, 700], [1920, 840], [1860, 950], [1790, 1080], [1750, 1200], [1740, 1330], [1700, 1440], [800, 1440], [620, 1300]]],
    blockers: [oct(925, 800, 42), oct(1387, 558, 38), oct(1580, 434, 34), oct(1967, 676, 40), oct(1742, 1020, 44), oct(1487, 1395, 46)],
    occluders: [lamp(925, 545, 805), lamp(1387, 345, 562, 30, 12), lamp(1580, 275, 437, 28, 11), lamp(1967, 465, 680), lamp(1742, 735, 1025, 40, 15), lamp(1487, 1095, 1400, 44, 16)],
    spawn: [1000, 1150],
    exits: [{ to: 'a3', at: [1960, 320], r: 100, spawn: [840, 1270], needs: 'q2' }, { to: 'a1', at: [720, 1330], r: 90, spawn: [2200, 425] }],
    rifts: [[1075, 1000], [1830, 520]],
    packs: [
      { at: [1250, 1250], kind: 'dustling', n: 3 },
      { at: [1250, 800], kind: 'stepwalker', n: 1 },
      { at: [1550, 1150], kind: 'wick', n: 2 },
      { at: [1700, 560], kind: 'dustling', n: 4 },
      { at: [1600, 1300], kind: 'stepwalker', n: 1 },
    ],
    props: { towers: [[350, 380], [900, 300], [1500, 280], [2100, 300]], channel: [[950, 1275], [1900, 375]] },
  },
  a3: {
    name: 'The Well of Descent', sub: 'Ossaryn, rim of the Undermere',
    light: { sky: 0x9aa8b8, ground: 0x15140f, hemi: 0.8, key: 0xfff0c4, keyI: 0.9, rim: 0xe8f2ff, rimI: 1.6, amb: 0.72 },
    walk: [[[560, 590], [750, 512], [1000, 480], [1250, 465], [1500, 465], [1750, 480], [1975, 530], [2075, 580], [2090, 650], [2200, 700], [2260, 790], [2210, 900], [2150, 1050], [2070, 1150], [1980, 1210], [1960, 1330], [1910, 1440], [880, 1440], [700, 1380], [560, 1260], [480, 1150], [520, 1060], [620, 1000], [620, 830], [530, 750], [530, 630]]],
    blockers: [ellipse(1487, 845, 385, 252), rect(930, 1360, 1050, 1440)],
    occluders: [
      { poly: [[2187, 937], [2312, 875], [2500, 880], [2560, 925], [2560, 1440], [2200, 1440], [2187, 1175]], base: 1440 },
      { poly: rect(1995, 1190, 2125, 1390), base: 1385 },
      { poly: [[60, 450], [350, 520], [440, 600], [500, 700], [520, 1050], [480, 1120], [60, 1120]], base: 1110 },
      { poly: rect(490, 820, 630, 1010), base: 1000 },
      { poly: rect(920, 1300, 1060, 1440), base: 1440 },
    ],
    spawn: [840, 1270],
    well: { at: [1487, 845], rx: 375, ry: 242 }, // jump-portal: interact at the rim
    boss: { at: [1980, 760] },
    exits: [{ to: 'a2', at: [625, 1300], r: 80, spawn: [1850, 420] }],
    packs: [{ at: [900, 700], kind: 'wick', n: 2 }, { at: [1100, 1250], kind: 'dustling', n: 3 }],
    props: { towers: [[400, 420], [2300, 420]], ring: [1500, 260] },
  },
};

export const QUESTS = {
  q1: { title: 'Keep the Terrace Lit', steps: 'Relight the 3 terrace lanterns', },
  q2: { title: 'The Banner Steps', steps: 'Close the 2 Seam Rifts', },
  q3: { title: 'The Unsealed', steps: 'Defeat the Unsealed at the Well of Descent' },
  q4: { title: 'Down the Well', steps: 'Jump into the Well of Descent' },
};

export const DIALOGUE = {
  teyth: [
    'Elder Teyth: The lanterns are dying faster than we can fill them, Nerith.',
    'Elder Teyth: Something climbed out of the lower terraces when the Ring woke. Pale things. Cold.',
    'Elder Teyth: Relight the three lanterns along the rail. They hate the amber. Then go down to the Steps.',
  ],
  teythDone: ['Elder Teyth: The terrace holds. Go. The Steps are falling.'],
};
