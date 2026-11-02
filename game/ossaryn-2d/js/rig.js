// Nerith: hybrid cutout rig.
//  - body: painted full-body sprite on a 16x32 mesh, deformed procedurally in the vertex shader
//    (walk stride, hem flutter, cloak trail, lean, breathing, squash/stretch)
//  - staff, hand, lantern: separate cut pieces on their own pivots (staff swings, lantern hangs on a pendulum)
//  - gear = equipment slots. The body texture is re-composited per slot from per-gear-set paintings in the
//    same pose, through soft slot masks (cloak / shoulders / legs), and the lantern slot swaps the lantern
//    sprite + its light. So every equipped item is visible on her.
import * as THREE from 'three';
import { litMat } from './lit.js';
import { tex, quad } from './world.js';
const BW = 312, BH = 576;            // body texture (half-scale crop of the source painting)
const FOOT = [105, 572];             // feet anchor in body texture px (y down)
const GRIP_B = [21, 216];            // staff grip in body px
const GRIP_S = [81, 161];            // staff grip in staff px (126x265)
const CROOK_S = [25, 68];            // lantern hook in staff px
const HOOK_L = [28, 5];              // hook in lantern px (52x130)
const HAND = [7, 205];               // hand sprite top-left in body px (27x29)
export const SCALE = 0.38;           // body px -> world px (Nerith ~210 px tall)
export const GEARSETS = ['base', 'warden'];
export const SLOTS = ['cloak', 'shoulders', 'legs', 'lantern'];
export const LANTERNS = {
  base: { name: 'Bearer\u2019s Lantern', col: [1.0, 0.6, 0.26], col2: null, radius: 680, inten: 2.3 },
  warden: { name: 'The Kept Light (twin flame)', col: [1.0, 0.66, 0.3], col2: [0.25, 0.95, 0.85], radius: 900, inten: 2.6 },
};
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
export async function makeNerith(renderOrderBase) {
  const imgs = {}; for (const g of GEARSETS) imgs[g] = await loadImg(`assets/img/n_body_${g}.png`);
  const maskImg = await loadImg('assets/img/n_slotmask.png');
  const cv = document.createElement('canvas'); cv.width = BW; cv.height = BH; const cx = cv.getContext('2d', { willReadFrequently: true });
  const px = {}; for (const g of GEARSETS) { cx.clearRect(0, 0, BW, BH); cx.drawImage(imgs[g], 0, 0); px[g] = cx.getImageData(0, 0, BW, BH); }
  cx.clearRect(0, 0, BW, BH); cx.drawImage(maskImg, 0, 0, BW, BH); const mk = cx.getImageData(0, 0, BW, BH).data;
  const bodyTex = new THREE.CanvasTexture(cv); bodyTex.colorSpace = THREE.SRGBColorSpace;
  const gear = { cloak: 'base', shoulders: 'base', legs: 'base', lantern: 'base' };
  function composite() {
    const out = cx.createImageData(BW, BH), o = out.data, b = px.base.data;
    const sets = { cloak: px[gear.cloak].data, shoulders: px[gear.shoulders].data, legs: px[gear.legs].data };
    for (let i = 0; i < o.length; i += 4) {
      const ms = mk[i] / 255, ml = mk[i + 1] / 255, mc = Math.max(0, 1 - ms - ml);
      for (let c = 0; c < 4; c++) o[i + c] = sets.cloak[i + c] * mc + sets.shoulders[i + c] * ms + sets.legs[i + c] * ml;
    }
    cx.putImageData(out, 0, 0); bodyTex.needsUpdate = true;
  }
  composite();
  const root = new THREE.Group(); // at feet; scale.x = -SCALE*facing (art faces left)
  const inner = new THREE.Group(); root.add(inner); inner.scale.set(SCALE, SCALE, 1);
  const bodyMat = litMat(bodyTex, { deform: true, rim: true, w: BW, h: BH, tw: BW, th: BH, amb: 0x93a0a6, lightAmt: 1, rimCol: 0x4d7d8c });
  const bodyGeo = new THREE.PlaneGeometry(BW, BH, 16, 32); bodyGeo.translate(BW / 2 - FOOT[0], FOOT[1] - BH / 2, 0);
  const body = new THREE.Mesh(bodyGeo, bodyMat); body.frustumCulled = false; inner.add(body);
  // body px (x right, y down) -> inner local coords
  const B = (x, y) => [x - FOOT[0], FOOT[1] - y];
  const staffPivot = new THREE.Group(); const g0 = B(...GRIP_B); staffPivot.position.set(g0[0], g0[1], 0); inner.add(staffPivot);
  const staffMat = litMat(tex('n_staff.png'), { amb: 0x93a0a6, lightAmt: 1 });
  const staff = quad(staffMat, 126, 265, -GRIP_S[0], GRIP_S[1], 0, 1); staffPivot.add(staff);
  const crook = new THREE.Object3D(); crook.position.set(CROOK_S[0] - GRIP_S[0], GRIP_S[1] - CROOK_S[1], 0); staffPivot.add(crook);
  const lanternPivot = new THREE.Group(); root.add(lanternPivot);   // world-space pendulum, positioned at the crook each frame
  const lmats = {}; for (const g of GEARSETS) lmats[g] = litMat(tex(`n_lantern_${g}.png`), { amb: 0xaab4b8, lightAmt: 0.6, emis: 1.6, emisT: 0.42 });
  const lantern = quad(lmats.base, 52, 130, -HOOK_L[0] + 26, HOOK_L[1] - 65, 0.5, 0.5); lantern.scale.set(SCALE, SCALE, 1);
  lantern.position.set((-HOOK_L[0] + 26) * SCALE, (HOOK_L[1] - 65) * SCALE, 0); lanternPivot.add(lantern);
  const handMats = {}; for (const g of GEARSETS) handMats[g] = litMat(tex(`n_hand_${g}.png`), { amb: 0x93a0a6, lightAmt: 1 });
  const h0 = B(HAND[0], HAND[1]); const hand = quad(handMats.base, 27, 29, h0[0], h0[1], 0, 1); inner.add(hand);
  // flash ghost for gear swap
  body.renderOrder = renderOrderBase; staff.renderOrder = renderOrderBase + 1; lantern.renderOrder = renderOrderBase + 2; hand.renderOrder = renderOrderBase + 3;
  const st = { facing: -1, walkPh: 0, swing: 0, swingT: -1, lantAng: 0, lantVel: 0, lastCrook: new THREE.Vector3(), cloakX: 0, cloakY: 0, breath: 0, flash: 0 };
  function equip(slot, set) {
    gear[slot] = set;
    if (slot === 'lantern') lantern.material = lmats[set];
    else composite();
    if (slot === 'cloak' || slot === 'shoulders') hand.material = handMats[gear.cloak];
    st.flash = 1;
  }
  const lanternWorld = new THREE.Vector3();
  function update(dt, t, P) {
    // P: {x,y,vx,vy,ground,facing,attackT,attackN,hurtT,dodgeT,climb}
    st.facing = P.facing;
    root.position.set(P.x, P.y, 0); root.scale.set(-st.facing, 1, 1);
    const speed = Math.abs(P.vx), run = Math.min(1, speed / 430);
    if (P.ground) st.walkPh += dt * (4 + speed * 0.022); 
    const U = bodyMat.uniforms;
    const air = !P.ground;
    const stride = P.ground ? 0.075 * run : 0.02, lift = P.ground ? 0.03 * run : 0;
    U.uDef0.value.set(st.walkPh, stride, lift, 0.006 + 0.01 * run + (air ? 0.012 : 0));
    // cloak trails opposite to motion (local +x is "behind" because the art faces left)
    const tx = Math.min(0.12, speed * 0.00022) + (air ? 0.03 : 0), ty = air ? Math.max(-0.05, Math.min(0.06, -P.vy * 0.00005)) : 0;
    st.cloakX += (tx - st.cloakX) * Math.min(1, dt * 5); st.cloakY += (ty - st.cloakY) * Math.min(1, dt * 6);
    st.breath += dt * 2.0;
    const lean = -0.06 * run * (P.ground ? 1 : 0.5) - (P.attackT > 0 ? 0.05 : 0) + (P.hurtT > 0 ? 0.08 : 0) - (P.dodgeT > 0 ? 0.12 : 0);
    U.uDef1.value.set(st.cloakX + Math.sin(t * 1.3) * 0.004, st.cloakY, lean, Math.sin(st.breath));
    // squash & stretch: jump / land
    const sy = air ? 1 + Math.max(-0.06, Math.min(0.07, P.vy * 0.00007)) : 1 - (P.landT > 0 ? P.landT * 0.5 : 0);
    U.uDef2.value.set(1 / Math.sqrt(sy), sy, 0.34, Math.sin(st.breath) * 0.002);
    root.position.y += P.ground ? Math.abs(Math.sin(st.walkPh)) * 5 * run : 0;
    // staff: idle sway, attack swing arc (3-hit combo shapes)
    let ang = Math.sin(t * 1.1) * 0.02 + Math.sin(st.walkPh) * 0.05 * run;
    if (P.attackT > 0) {
      const k = 1 - P.attackT / P.attackDur; // 0..1
      const shapes = [[0.55, -1.75], [-0.3, 1.1], [0.9, -2.3]];
      const [a0, a1] = shapes[P.attackN % 3];
      const e = k < 0.25 ? (k / 0.25) : 1 - Math.pow(1 - Math.min(1, (k - 0.25) / 0.35), 3);
      ang = k < 0.25 ? a0 * e : a0 + (a1 - a0) * e;
      if (k > 0.75) ang *= (1 - (k - 0.75) / 0.25);
    }
    if (P.climb) ang = 0.9;
    staffPivot.rotation.z = -ang;    // inner space: positive ang = staff tip forward(-x) .. sign tuned for left-facing art
    hand.position.x = h0[0] + Math.sin(ang) * -6; hand.position.y = h0[1] + (1 - Math.cos(ang)) * 6;
    // lantern pendulum hanging from the crook (world space)
    root.updateMatrixWorld(true);
    crook.getWorldPosition(lanternWorld);
    if (dt > 0) {
      const vx = (lanternWorld.x - st.lastCrook.x) / dt, vy = (lanternWorld.y - st.lastCrook.y) / dt;
      if (st.hasLast) {
        const axc = Math.max(-9000, Math.min(9000, (vx - st.pvx) / dt)), ayc = Math.max(-9000, Math.min(9000, (vy - st.pvy) / dt));
        st.lantVel += (-(9 + ayc / 300) * Math.sin(st.lantAng) - 2.4 * st.lantVel - (axc / 300) * Math.cos(st.lantAng)) * dt;
        st.lantAng = Math.max(-1.2, Math.min(1.2, st.lantAng + st.lantVel * dt));
      }
      st.pvx = vx; st.pvy = vy; st.hasLast = true;
    }
    st.lastCrook.copy(lanternWorld);
    lanternPivot.position.copy(lanternWorld).sub(root.position); lanternPivot.position.x *= 1 / root.scale.x;
    lanternPivot.rotation.z = st.lantAng * root.scale.x;
    // rim: cool from the sky (upper-back), warm from the lantern side
    U.uFlip.value = 1; U.uRimDir.value.set(-0.55, -0.8);
    st.flash = Math.max(0, st.flash - dt * 1.6); U.uFlash.value = st.flash * 0.6;
    const lw = new THREE.Vector3(); lantern.getWorldPosition(lw);
    return { lantern: lw };
  }
  return { root, gear, equip, update, body, bodyMat, cv, LANTERNS, setFlash(v) { st.flash = v; } };
}
