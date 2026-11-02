// Level data: terrace pieces cut from the painted strip (assets/img/g_*.png). Collision comes from each segment's
// walk-surface polyline (measured on the art), so what you see is what you stand on.
export const GS = 1.9;            // ground art scale (source px -> world px)
export const SEG = {              // w,h = source px; walk = polyline in source px (y from the crop top)
  A: { w: 313, h: 530, walk: [[0, 318], [40, 305], [313, 305]] },
  B: { w: 304, h: 530, walk: [[0, 305], [304, 305]] },
  C: { w: 296, h: 530, walk: [[0, 305], [296, 305]] },
  D: { w: 365, h: 530, walk: [[0, 305], [73, 305], [168, 218], [365, 218]] },
};
export const WALKY = 305;           // flat walk line in segment source px
// islands: [x, y, pieces]; a trailing 'f' flips the piece (right-hand end caps)
export const ISLANDS = [
  { x: 0, y: 0, p: ['A', 'B', 'C', 'B', 'Af'], name: 'The Seventh Terrace' },
  { x: 3060, y: 0, p: ['A', 'C', 'B', 'D'], name: 'Lamplighters\u2019 Walk' },
  { x: 5650, y: 165, p: ['A', 'C', 'Af'], name: 'The Warden\u2019s Niche' },
  { x: 7550, y: -140, p: ['A', 'B', 'C', 'D'], name: 'Low Gallery' },
  { x: 10160, y: 25, p: ['A', 'C', 'C', 'C', 'C', 'Af'], name: 'The Great Crossing', bridge: true },
  { x: 13700, y: 25, p: ['A', 'B', 'Af'], name: 'The Echo Niche' },
  { x: 15670, y: -60, p: ['A', 'C', 'B', 'C', 'Af'], name: 'The Well Terrace' },
];
export const OVERLAP = 14 * GS;
export const START = { x: 300 };
export const LANTERNS = [{ id: 'L1', x: 3900 }, { id: 'L2', x: 8500 }, { id: 'L3', x: 16560 }];
export const GEAR = [
  { id: 'warden_set', x: 6560, name: 'The Warden\u2019s Cloak & Pauldron', slots: { cloak: 'warden', shoulders: 'warden' } },
  { id: 'greaves', x: 9640, name: 'Warden Greaves', slots: { legs: 'warden' } },
];
export const SHARD = { x: 14520 };
export const WELL = { x: 18454, sealX: 18330 };
export const PICKUPS = [{ kind: 'heal', x: 2000 }, { kind: 'oil', x: 5200 }, { kind: 'heal', x: 9050 }, { kind: 'oil', x: 12000 }, { kind: 'heal', x: 15200 }];
// enemy waves: trigger -> spawns (x offsets on that island)
export const WAVES = {
  L1: [{ x: 3420 }, { x: 4420, d: 1.2 }],
  NICHE: [{ x: 6150 }],
  L2: [{ x: 7950 }, { x: 9000, d: 0.8 }, { x: 8200, d: 2.4 }],
  BRIDGE: [{ x: 11900 }, { x: 12300, d: 0.6 }],
  L3: [{ x: 16000 }, { x: 17100, d: 0.8 }, { x: 17600, d: 1.6, big: true }, { x: 16300, d: 3.2 }],
};
export const VISTAS = [{ x0: 10300, x1: 13300, zoom: 0.56, dy: 160, name: 'The Great Crossing' }, { x0: 14100, x1: 15000, zoom: 0.8, dy: 60 }, { x0: 17700, x1: 19200, zoom: 0.72, dy: 40 }];

// build piece list + surfaces
export function buildPieces() {
  const pieces = [], surfaces = [];
  for (const isl of ISLANDS) {
    let x = isl.x; const segs = [];
    for (const id of isl.p) {
      const flip = id.endsWith('f'), k = id[0], s = SEG[k], w = s.w * GS;
      pieces.push({ k, flip, x, y: isl.y, w, h: s.h * GS, island: isl });
      let pts = s.walk.map(([px, py]) => [x + (flip ? s.w - px : px) * GS, isl.y + (WALKY - py) * GS]);
      if (flip) pts.reverse();
      segs.push(...pts);
      x += w - OVERLAP;
    }
    isl.x1 = x + OVERLAP; isl.x0 = isl.x;
    // merge polyline: sort by x, keep monotone
    segs.sort((a, b) => a[0] - b[0]);
    const poly = []; for (const p of segs) { if (!poly.length || p[0] > poly[poly.length - 1][0] + 0.5) poly.push(p); }
    // trim the rounded corner points to the island bounds
    surfaces.push({ x0: isl.x0 + 18, x1: isl.x1 - 18, poly, island: isl });
  }
  return { pieces, surfaces };
}
export function surfaceY(surf, x) {
  const p = surf.poly; if (x <= p[0][0]) return p[0][1]; if (x >= p[p.length - 1][0]) return p[p.length - 1][1];
  for (let i = 1; i < p.length; i++) if (x <= p[i][0]) { const a = p[i - 1], b = p[i], t = (x - a[0]) / Math.max(1e-6, b[0] - a[0]); return a[1] + (b[1] - a[1]) * t; }
  return p[p.length - 1][1];
}
