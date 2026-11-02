// Simple procedural 3D characters/props (allowed to be simpler than the videos).
import * as THREE from 'three';

const M = {
  slate: new THREE.MeshStandardMaterial({ color: 0x4b525c, roughness: 0.92 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x9a3220, roughness: 0.85 }),
  ochre: new THREE.MeshStandardMaterial({ color: 0x7d6a48, roughness: 0.9 }),
  skin: new THREE.MeshStandardMaterial({ color: 0x6a4e3c, roughness: 0.8 }),
  bronze: new THREE.MeshStandardMaterial({ color: 0x7a5a32, roughness: 0.4, metalness: 0.85 }),
  amberGlass: new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xff9a30, emissiveIntensity: 1.6, roughness: 0.3 }),
  deadGlass: new THREE.MeshStandardMaterial({ color: 0x4a4038, emissive: 0x7a3a10, emissiveIntensity: 0.7, roughness: 0.3 }),
  paleStone: new THREE.MeshStandardMaterial({ color: 0x77716a, roughness: 0.9, metalness: 0.05 }),
  paleStone2: new THREE.MeshStandardMaterial({ color: 0x57524c, roughness: 0.92 }),
  seam: new THREE.MeshStandardMaterial({ color: 0x6a5228, emissive: 0xc89a40, emissiveIntensity: 0.55 }),
  cold: new THREE.MeshBasicMaterial({ color: 0xf2f8ff }),
};
export const MAT = M;

// soft contact shadow: a dark core right under the feet plus a wide faint penumbra
let SHADOW_TEX = null;
function shadowTex() {
  if (SHADOW_TEX) return SHADOW_TEX;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.82)'); gr.addColorStop(0.28, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return (SHADOW_TEX = new THREE.CanvasTexture(cv));
}
function shadow(r = 0.5) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.6, r * 2.6), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.renderOrder = 1; return m;
}
const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

// Nerith: faded rust/ochre hooded robe, bronze gorget + bracers + one pauldron,
// bronze hook-staff with an amber lantern hanging from the hook (matches portrait_bearer.jpg).
const HM = {
  robe: new THREE.MeshStandardMaterial({ color: 0x9a5a2c, roughness: 0.95 }),
  robeDark: new THREE.MeshStandardMaterial({ color: 0x6e3c1f, roughness: 0.95 }),
  hood: new THREE.MeshStandardMaterial({ color: 0xa8612e, roughness: 0.9 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.8 }),
  bronze: new THREE.MeshStandardMaterial({ color: 0x8a6436, roughness: 0.38, metalness: 0.85 }),
  staff: new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.6, metalness: 0.4 }),
};
export function makeHero() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.add(shadow(0.45));
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.36, 0.95, 10), HM.robeDark); skirt.position.y = 0.48; body.add(skirt);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.24, 0.55, 10), HM.robe); torso.position.y = 1.1; body.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.07, 10), HM.leather); belt.position.y = 0.86; body.add(belt);
  const strap = box(0.06, 0.62, 0.03, HM.leather); strap.position.set(0, 1.08, 0.22); strap.rotation.z = 0.6; body.add(strap);
  const mantle = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.42, 10, 1, true), HM.hood); mantle.position.y = 1.3; body.add(mantle);
  const gorget = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.045, 6, 14), HM.bronze); gorget.rotation.x = Math.PI / 2; gorget.position.y = 1.43; body.add(gorget);
  const pauld = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), HM.bronze); pauld.position.set(-0.27, 1.34, 0); pauld.scale.set(1, 0.7, 1.1); body.add(pauld);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), M.skin); head.position.set(0, 1.58, 0.03); body.add(head);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), HM.hood); hood.position.set(0, 1.58, -0.03); hood.scale.set(1, 1.15, 1.1); body.add(hood);
  const hoodTip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 8), HM.hood); hoodTip.position.set(0, 1.74, -0.12); hoodTip.rotation.x = -0.5; body.add(hoodTip);
  // off-hand with bracer
  const off = new THREE.Group(); off.position.set(-0.3, 1.25, 0); body.add(off);
  const sleeveL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.42, 8), HM.robe); sleeveL.position.y = -0.2; off.add(sleeveL);
  const bracerL = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 8), HM.bronze); bracerL.position.y = -0.4; off.add(bracerL);
  off.rotation.z = -0.15;
  // staff arm: hook-staff, lantern hanging from the hook
  const arm = new THREE.Group(); arm.position.set(0.3, 1.25, 0); body.add(arm);
  const sleeveR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.42, 8), HM.robe); sleeveR.position.set(0, -0.18, 0.06); sleeveR.rotation.x = 0.35; arm.add(sleeveR);
  const bracerR = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 8), HM.bronze); bracerR.position.set(0, -0.36, 0.13); bracerR.rotation.x = 0.35; arm.add(bracerR);
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 2.0, 6), HM.staff); staff.position.set(0.02, -0.2, 0.2); staff.rotation.x = 0.12; arm.add(staff);
  for (const y of [-0.35, 0.25, 0.7]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.05, 6), HM.bronze); band.position.set(0.02, y, 0.2 + (y + 0.2) * 0.12); arm.add(band); }
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 12, Math.PI * 1.3), HM.bronze); hook.position.set(0.02, 0.88, 0.32); hook.rotation.y = Math.PI / 2; arm.add(hook);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4), HM.bronze); chain.position.set(0.02, 0.75, 0.43); arm.add(chain);
  const lant = new THREE.Group(); lant.position.set(0.02, 0.55, 0.43); arm.add(lant);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), M.amberGlass); lant.add(glass);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.09, 0.07, 8), HM.bronze); cap.position.y = 0.11; lant.add(cap);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.04, 8), HM.bronze); foot.position.y = -0.1; lant.add(foot);
  const light = new THREE.PointLight(0xffa850, 5, 8, 1.0); light.position.set(0, 0, 0.1); lant.add(light);
  g.userData = { body, arm, lant, light, lantY: 0.55 };
  return g;
}

export function makeNPC() {
  const g = new THREE.Group(); g.add(shadow(0.4));
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.3, 10), M.ochre); robe.position.y = 0.65; g.add(robe);
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 10), M.ochre); hood.position.y = 1.45; g.add(hood);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.0, 6), M.bronze); pole.position.set(0.35, 1.0, 0); g.add(pole);
  const gl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), M.amberGlass); gl.position.set(0.35, 2.05, 0); g.add(gl);
  return g;
}

function seamLines(grp, w, h, d, y) {
  const s1 = box(w * 1.01, 0.03, d * 1.01, M.seam); s1.position.y = y; grp.add(s1);
}
export function makeEnemy(kind) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  let light = null;
  if (kind === 'dustling') {
    g.add(shadow(0.4));
    const a = box(0.55, 0.3, 0.5, M.paleStone); a.position.y = 0.2; body.add(a);
    const b = box(0.38, 0.24, 0.36, M.paleStone2); b.position.set(0.05, 0.45, -0.04); body.add(b);
    const c = box(0.2, 0.16, 0.22, M.paleStone); c.position.set(0, 0.62, 0.1); body.add(c);
    seamLines(body, 0.55, 0.3, 0.5, 0.34);
    for (let i = 0; i < 4; i++) { const leg = box(0.06, 0.25, 0.06, M.paleStone2); leg.position.set(i < 2 ? -0.28 : 0.28, 0.08, i % 2 ? -0.2 : 0.2); leg.rotation.z = i < 2 ? 0.6 : -0.6; body.add(leg); }
    const eye = box(0.18, 0.04, 0.02, M.cold); eye.position.set(0, 0.24, 0.26); body.add(eye);
  } else if (kind === 'wick') {
    g.add(shadow(0.35));
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), M.cold); core.position.y = 1.4; body.add(core);
    for (let i = 0; i < 6; i++) { const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 + (i % 2) * 0.06), i % 2 ? M.paleStone : M.paleStone2); sh.userData.orbit = i; body.add(sh); }
    light = new THREE.PointLight(0xdfefff, 6, 5, 1.8); light.position.y = 1.4; body.add(light);
  } else if (kind === 'stepwalker' || kind === 'unsealed') {
    g.add(shadow(0.8));
    const parts = [[1.0, 0.7, 0.8, 0.35], [0.8, 0.6, 0.65, 0.98], [0.55, 0.45, 0.5, 1.5]];
    for (const [w, h, d, y] of parts) { const p = box(w, h, d, y > 1 ? M.paleStone : M.paleStone2); p.position.y = y; body.add(p); seamLines(body, w, h, d, y + h / 2); }
    for (const sx of [-1, 1]) { const arm = box(0.28, 0.9, 0.3, M.paleStone2); arm.position.set(sx * 0.62, 0.9, 0.05); arm.userData.arm = sx; body.add(arm); }
    const slit = box(0.32, 0.05, 0.02, M.cold); slit.position.set(0, 1.55, 0.26); body.add(slit);
    if (kind === 'unsealed') { // chest seam gate: two plates that part to fire the blade
      const l = box(0.4, 0.55, 0.06, M.paleStone), r = box(0.4, 0.55, 0.06, M.paleStone); l.position.set(-0.2, 1.0, 0.36); r.position.set(0.2, 1.0, 0.36); body.add(l, r);
      const glow = box(0.06, 0.5, 0.02, M.cold); glow.position.set(0, 1.0, 0.35); body.add(glow);
      g.userData.gate = { l, r, glow };
      // weathered warden mantle so the Unsealed reads as a figure, not a crate stack
      const mantle = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.5, 9, 1, true), M.slate); mantle.position.y = 0.75; mantle.material.side = THREE.DoubleSide; body.add(mantle);
      const cowl = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), M.slate); cowl.position.set(0, 1.62, -0.04); body.add(cowl);
      light = new THREE.PointLight(0xe8f2ff, 10, 7, 1.6); light.position.set(0, 1.0, 0.8); body.add(light);
    }
  } else if (kind === 'rift') {
    const crackMat = M.cold;
    let x = -1.0;
    for (let i = 0; i < 6; i++) { const seg = box(0.45, 0.04, 0.09, crackMat); seg.position.set(x + 0.2, 0.03, (i % 2 ? 0.12 : -0.12)); seg.rotation.y = i % 2 ? 0.5 : -0.5; body.add(seg); x += 0.36; }
    for (let i = 0; i < 7; i++) { const blk = box(0.3 + Math.random() * 0.3, 0.15 + Math.random() * 0.35, 0.3, i % 2 ? M.paleStone : M.paleStone2); const a = i / 7 * Math.PI * 2; blk.position.set(Math.cos(a) * 1.0, 0.1, Math.sin(a) * 0.55); blk.rotation.y = a; body.add(blk); }
    light = new THREE.PointLight(0xe6f0ff, 10, 6, 1.6); light.position.y = 0.6; body.add(light);
  }
  g.userData.body = body; g.userData.light = light;
  return g;
}

export function makeLanternPost() {
  const g = new THREE.Group(); g.add(shadow(0.3));
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 8), M.bronze); pole.position.y = 1.1; g.add(pole);
  const arm = box(0.5, 0.05, 0.05, M.bronze); arm.position.set(0.2, 2.15, 0); g.add(arm);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), M.deadGlass.clone()); glass.position.set(0.42, 1.9, 0); g.add(glass);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 8), M.bronze); cap.position.set(0.42, 2.18, 0); g.add(cap);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.14, 8), M.bronze); foot.position.y = 0.07; g.add(foot);
  const light = new THREE.PointLight(0xffa850, 0, 10, 1.5); light.position.set(0.42, 1.95, 0); g.add(light);
  g.userData = { glass, light };
  return g;
}
export function lightLantern(post) { post.userData.glass.material = M.amberGlass; post.userData.light.intensity = 22; }

export function makeLoot(color) {
  const g = new THREE.Group();
  const c = new THREE.Color(color);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 2.6, 8, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.y = 1.3; g.add(beam);
  const it = box(0.32, 0.08, 0.2, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6 })); it.position.y = 0.06; it.rotation.y = Math.random() * 3; g.add(it);
  g.userData.beam = beam;
  return g;
}

export function makeRing(color, r0, r1, opacity = 0.55) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.04; return m;
}
export function makeOrb(color, r = 0.16) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ color })));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r * 2.2, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })));
  return g;
}
export function makeBeam(color, len, w = 0.35) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, len), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.y = 0.05; return m;
}
