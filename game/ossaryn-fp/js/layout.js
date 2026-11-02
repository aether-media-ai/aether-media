// Single source of truth for the level: visible geometry (world.js) and collision (main.js) both read these numbers,
// so a walk boundary always sits one player-radius in front of a visible parapet or wall (no invisible walls).
export const PR = 0.35;                 // player radius
export const EYE = 1.65;
export const BR = { x0: 11, x1: 70, z0: -68, z1: -62, rise: 3.2, rail: 0.5 };   // arched bridge (deck incl. railings)
export const archY = x => (x <= BR.x0 || x >= BR.x1) ? 0 : BR.rise * Math.sin(Math.PI * (x - BR.x0) / (BR.x1 - BR.x0));
// Walkable rectangles (already shrunk by PR from the visible walls / parapet inner faces)
const W = (x0, x1, z0, z1, name) => ({ x0: x0 + PR, x1: x1 - PR, z0: z0 + PR, z1: z1 - PR, name });
export const RECTS = [
  W(-4.5, 4.3, -74, 6.5, 'terrace'),                       // wall face x=-4.5, parapet inner face x=4.3, gate z=6.5, end wall z=-74
  W(-4.5, 11, -74, -56, 'plaza'),                          // plaza parapets z=-56 and x=11, end wall z=-74
  { x0: 10.5, x1: 70.5, z0: BR.z0 + BR.rail + PR, z1: BR.z1 - BR.rail - PR, name: 'bridge' },
  W(70, 90, -80, -50, 'landing'),                           // parapets x=70 (outside bridge mouth), z=-80, z=-50; tower face x=90
];
export const REGION_ORDER = ['terrace', 'plaza', 'bridge', 'landing'];
export const PORTALS = { 'terrace|plaza': [0, -65], 'plaza|bridge': [10.8, -65], 'bridge|landing': [70.2, -65] };
export const START = { pos: [0, 0, 3], yaw: 0 };          // yaw 0 = looking toward -z
export const LANTERNS = [
  { id: 'L1', pos: [3.3, -16], cp: [1.5, -14.5] },
  { id: 'L2', pos: [3.3, -46], cp: [1.5, -44.5] },
  { id: 'L3', pos: [40.5, -63.2], cp: [38.5, -65] },
];
export const WELL = { pos: [79, -65], r: 3.0 };
export const SHARD = { pos: [88.2, -65] };
export const PICKUPS = [
  { id: 'p1', kind: 'oil', pos: [-3.6, -31] },
  { id: 'p2', kind: 'heal', pos: [-3.6, -32.2] },
  { id: 'p3', kind: 'heal', pos: [8.5, -72.5] },
  { id: 'p4', kind: 'oil', pos: [73, -78.5] },
];
// Static round obstacles (things you can see): crates, urns, altar
export const OBST = [
  { pos: [-3.6, -31.6], r: 0.75 },     // crate stack with flasks
  { pos: [8.5, -73.0], r: 0.6 },
  { pos: [73, -79.0], r: 0.55 },
  { pos: [88.6, -65], r: 0.8 },        // shard altar
];
// Waves: spawn position outside the parapet (climb from) and where they land inside
export const WAVES = {
  L1: [{ from: [5.6, -27], to: [3.0, -27] }, { from: [5.6, -31], to: [3.0, -31] }],
  L2: [{ from: [5.6, -38], to: [3.0, -38] }, { from: [5.6, -53], to: [3.0, -53] }, { from: [12.4, -59], to: [9.5, -59] }],
  L3: [{ from: [33, -69.2], to: [33, -66.4] }, { from: [48, -60.8], to: [48, -63.6] }, { from: [60, -69.2], to: [60, -66.4] }],
  SHARD: [{ from: [79, -65], to: [79, -60.5], hulk: true, well: true }, { from: [78, -81.4], to: [78, -78.6] }, { from: [84, -48.6], to: [84, -51.4] }],
};
