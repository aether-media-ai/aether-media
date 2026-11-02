// Navigation in plate space (pure JS, no three.js) so the game and the node QC share it.
// Grid of CELL-px cells over the plate: walkable = inside a walk polygon and outside every blocker.
// Ground metres per plate px: x -> 1/PPU, y -> 1/(PPU*sin(elev)) (plates are an orthographic 3/4 view).
import { PLATE_W, PLATE_H, PPU, CAM } from './config.js';

export const CELL = 16;
const YS = 1 / Math.sin(CAM.elevDeg * Math.PI / 180);
export const gdist = (ax, ay, bx, by) => Math.hypot((bx - ax) / PPU, (by - ay) * YS / PPU); // ground metres

export function pip(x, y, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
export function walkableP(L, x, y) { return L.walk.some(p => pip(x, y, p)) && !(L.blockers || []).some(p => pip(x, y, p)); }

export function buildNav(L) {
  const W = Math.ceil(PLATE_W / CELL), H = Math.ceil(PLATE_H / CELL), ok = new Uint8Array(W * H), comp = new Int32Array(W * H).fill(-1);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) ok[j * W + i] = walkableP(L, (i + 0.5) * CELL, (j + 0.5) * CELL) ? 1 : 0;
  let nc = 0;
  for (let s = 0; s < W * H; s++) {
    if (!ok[s] || comp[s] >= 0) continue;
    const q = [s]; comp[s] = nc;
    while (q.length) { const c = q.pop(), ci = c % W, cj = (c / W) | 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue; const n = nj * W + ni; if (ok[n] && comp[n] < 0 && (!di || !dj || (ok[cj * W + ni] && ok[nj * W + ci]))) { comp[n] = nc; q.push(n); } } }
    nc++;
  }
  return { L, W, H, ok, comp };
}
export const cellOf = (N, x, y) => [Math.min(N.W - 1, Math.max(0, Math.floor(x / CELL))), Math.min(N.H - 1, Math.max(0, Math.floor(y / CELL)))];
export const cellCenter = (i, j) => [(i + 0.5) * CELL, (j + 0.5) * CELL];
export function compAt(N, x, y) { const [i, j] = cellOf(N, x, y); return N.comp[j * N.W + i]; }

// nearest walkable cell centre to (x,y), optionally restricted to component c; returns [x,y,metres] or null
export function nearestWalkable(N, x, y, c = -1, maxR = 400) {
  const [ci, cj] = cellOf(N, x, y); let best = null, bd = 1e9;
  const R = Math.ceil(maxR / CELL);
  for (let r = 0; r <= R; r++) {
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= N.W || j >= N.H) continue;
      const k = j * N.W + i; if (!N.ok[k] || (c >= 0 && N.comp[k] !== c)) continue;
      const [px, py] = cellCenter(i, j), d = gdist(x, y, px, py); if (d < bd) { bd = d; best = [px, py, d]; }
    }
    if (best && r * CELL / PPU > bd + 0.5) break;
  }
  return best;
}

// line of sight across walkable plate space (sampled every ~CELL/2 px)
export function los(N, ax, ay, bx, by) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) / (CELL / 2));
  for (let k = 1; k < n; k++) { const t = k / n; if (!walkableP(N.L, ax + (bx - ax) * t, ay + (by - ay) * t)) return false; }
  return true;
}

// A* from (ax,ay) to (bx,by) in plate px. Start/goal snap to nearest walkable (goal within start's component).
// Returns smoothed waypoint list [[x,y],...] ending at the (snapped) goal, or null.
export function findPath(N, ax, ay, bx, by) {
  const s0 = nearestWalkable(N, ax, ay); if (!s0) return null;
  const c = compAt(N, s0[0], s0[1]);
  const g0 = walkableP(N.L, bx, by) && compAt(N, bx, by) === c ? [bx, by] : nearestWalkable(N, bx, by, c, 2560); if (!g0) return null;
  const [si, sj] = cellOf(N, s0[0], s0[1]), [gi, gj] = cellOf(N, g0[0], g0[1]);
  const W = N.W, S = sj * W + si, Gk = gj * W + gi;
  if (los(N, ax, ay, g0[0], g0[1]) && walkableP(N.L, ax, ay)) return [[g0[0], g0[1]]];
  const gs = new Float32Array(N.W * N.H).fill(Infinity), from = new Int32Array(N.W * N.H).fill(-1), closed = new Uint8Array(N.W * N.H);
  const h = k => gdist((k % W) * CELL, ((k / W) | 0) * CELL, gi * CELL, gj * CELL);
  const heap = []; const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  gs[S] = 0; push(S, h(S));
  while (heap.length) {
    const [, k] = pop(); if (closed[k]) continue; closed[k] = 1; if (k === Gk) break;
    const ci = k % W, cj = (k / W) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= N.H) continue;
      const n = nj * W + ni; if (!N.ok[n] || closed[n]) continue;
      if (di && dj && !(N.ok[cj * W + ni] && N.ok[nj * W + ci])) continue;
      const g = gs[k] + gdist(0, 0, di * CELL, dj * CELL); if (g < gs[n]) { gs[n] = g; from[n] = k; push(n, g + h(n)); }
    }
  }
  if (from[Gk] < 0 && Gk !== S) return null;
  const pts = []; for (let k = Gk; k >= 0 && k !== S; k = from[k]) pts.push(cellCenter(k % W, (k / W) | 0)); pts.reverse();
  if (pts.length) pts[pts.length - 1] = [g0[0], g0[1]]; else pts.push([g0[0], g0[1]]);
  // string-pull
  const out = []; let cx = walkableP(N.L, ax, ay) ? ax : s0[0], cy = walkableP(N.L, ax, ay) ? ay : s0[1], i = 0;
  if (cx !== ax || cy !== ay) out.push([cx, cy]);
  while (i < pts.length) { let j = pts.length - 1; while (j > i && !los(N, cx, cy, pts[j][0], pts[j][1])) j--; out.push(pts[j]); [cx, cy] = pts[j]; i = j + 1; }
  return out;
}

// Interaction ranges in ground metres (shared by game + QC)
export const RANGE = { lantern: 3.2, npc: 3.0, rift: 2.2, exit: 1.8, wellRim: 1.6 };

// Everything a player must reach in a level, as [label, plateX, plateY, rangeMetres]
export function objectives(L) {
  const o = [];
  (L.lanterns || []).forEach((p, i) => o.push([`lantern${i + 1}`, p[0], p[1], RANGE.lantern]));
  (L.npcs || []).forEach(n => o.push([n.id, n.at[0], n.at[1], RANGE.npc]));
  (L.rifts || []).forEach((p, i) => o.push([`rift${i + 1}`, p[0], p[1], RANGE.rift]));
  (L.exits || []).forEach(e => o.push([`exit>${e.to}`, e.at[0], e.at[1], e.r / PPU + RANGE.exit]));
  if (L.boss) o.push(['boss', L.boss.at[0], L.boss.at[1], 2.5]);
  if (L.well) { const { at: [cx, cy], rx, ry } = L.well; o.push(['well-rim', cx, cy + ry, RANGE.wellRim + 0.3]); }
  for (const p of L.packs || []) o.push([`pack:${p.kind}`, p.at[0], p.at[1], 2.5]);
  return o;
}
// From spawn: is every objective within its range of a reachable cell? (also from every exit's arrival spawn)
export function reachReport(id, LEVELS) {
  const L = LEVELS[id];
  const N = buildNav(L); const starts = [['spawn', L.spawn]];
  for (const [lid, l] of Object.entries(LEVELS)) for (const e of l.exits || []) if (e.to === id) starts.push([`from ${lid}`, e.spawn]);
  const rows = [];
  for (const [sn, sp] of starts) {
    const s = nearestWalkable(N, sp[0], sp[1]); const c = s ? compAt(N, s[0], s[1]) : -1;
    rows.push({ start: sn, startOnWalk: walkableP(L, sp[0], sp[1]), snapM: s ? +s[2].toFixed(2) : null });
    for (const [lab, x, y, r] of objectives(L)) { const n = nearestWalkable(N, x, y, c, 1200); rows.push({ start: sn, obj: lab, distM: n ? +n[2].toFixed(2) : null, range: r, ok: !!n && n[2] <= r }); }
  }
  return rows;
}
