// One sprite shader for every layer: painted texture x (ambient + dynamic point lights), emissive lift for the
// art's own glowing pixels, atmospheric fog per depth, optional rim light + cutout-mesh deformation (Nerith / Drowned).
import * as THREE from 'three';
export const MAXL = 14;
export const LIGHTS = { pos: Array.from({ length: MAXL }, () => new THREE.Vector4()), col: Array.from({ length: MAXL }, () => new THREE.Vector3()), n: { value: 0 } };
const shared = { uLights: { value: LIGHTS.pos }, uLCol: { value: LIGHTS.col }, uNL: LIGHTS.n, uTime: { value: 0 } };
export const SHARED = shared;
const vert = `
  uniform float uTime; varying vec2 vUv; varying vec3 vWorld;
  #ifdef DEFORM
  uniform vec4 uDef0; // x walk phase, y stride, z lift, w hem flutter
  uniform vec4 uDef1; // x cloak trail x, y cloak trail y, z lean, w breath
  uniform vec4 uDef2; // x squash x, y squash y, z feet split u, w torso twist
  uniform vec2 uSize;
  #endif
  void main(){
    vUv = uv; vec3 p = position;
    #ifdef DEFORM
      float v = uv.y, u = uv.x;
      float legW = smoothstep(0.26, 0.0, v);
      float s = smoothstep(uDef2.z - 0.06, uDef2.z + 0.06, u);
      float ph = uDef0.x;
      p.x += uDef0.y * mix(sin(ph), -sin(ph), s) * legW * uSize.x;
      p.y += uDef0.z * max(0.0, mix(cos(ph), -cos(ph), s)) * legW * uSize.y;
      float hemW = smoothstep(0.6, 0.0, v);
      p.x += sin(uTime * 3.1 + v * 9.0 + u * 5.0) * uDef0.w * hemW * uSize.x;
      float trailW = smoothstep(0.35, 0.95, u) * smoothstep(0.92, 0.15, v);
      p.x += uDef1.x * trailW * uSize.x; p.y += uDef1.y * trailW * uSize.y;
      p.x += uDef1.z * v * uSize.y;                           // lean (shear around the feet)
      float torso = smoothstep(0.42, 0.62, v) * smoothstep(0.95, 0.75, v);
      p.y += uDef1.w * torso * uSize.y * 0.012; p.x += uDef2.w * torso * uSize.x;
      p.x *= uDef2.x; p.y *= uDef2.y;
    #endif
    vec4 w = modelMatrix * vec4(p, 1.0); vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const frag = `
  uniform sampler2D map; uniform vec3 uTint, uAmb, uFog; uniform float uAlpha, uLightAmt, uFogAmt, uEmis, uEmisT, uFlash;
  uniform vec4 uLights[${MAXL}]; uniform vec3 uLCol[${MAXL}]; uniform int uNL; uniform float uTime;
  uniform vec4 uUvXf; // uv offset/scale for tiling
  uniform vec4 uEdge; // soft fade widths in uv: left, right, bottom, top
  #ifdef RIM
  uniform vec3 uRim, uRim2; uniform vec2 uRimDir, uTexel; uniform float uFlip;
  #endif
  varying vec2 vUv; varying vec3 vWorld;
  void main(){
    vec2 uv = vUv * uUvXf.zw + uUvXf.xy;
    vec4 t = texture2D(map, uv);
    t.a *= smoothstep(0.0, uEdge.x + 1e-5, vUv.x) * smoothstep(1.0, 1.0 - uEdge.y - 1e-5, vUv.x) * smoothstep(0.0, uEdge.z + 1e-5, vUv.y) * smoothstep(1.0, 1.0 - uEdge.w - 1e-5, vUv.y);
    if (t.a < 0.012) discard;
    vec3 light = uAmb;
    for (int i = 0; i < ${MAXL}; i++) { if (i >= uNL) break;
      vec2 d = (vWorld.xy - uLights[i].xy) / uLights[i].z; float f = clamp(1.0 - dot(d, d), 0.0, 1.0);
      light += uLCol[i] * uLights[i].w * f * f * uLightAmt; }
    vec3 c = t.rgb * uTint * light;
    float lum = dot(t.rgb, vec3(0.3, 0.55, 0.15));
    c += t.rgb * smoothstep(uEmisT, uEmisT + 0.3, lum) * uEmis;
    #ifdef RIM
      vec2 o = uRimDir * uTexel * 7.0; o.x *= uFlip;
      float a2 = texture2D(map, uv + o).a, a3 = texture2D(map, uv - o * 0.9).a;
      c += uRim * t.a * (1.0 - a2) * 1.0 + uRim2 * t.a * (1.0 - a3) * 0.8;
    #endif
    c = mix(c, uFog, uFogAmt);
    c += vec3(1.0, 0.9, 0.8) * uFlash * t.a;
    gl_FragColor = vec4(c, t.a * uAlpha);
  }`;
export function litMat(tex, o = {}) {
  const defines = {}; if (o.deform) defines.DEFORM = 1; if (o.rim) defines.RIM = 1;
  const u = {
    map: { value: tex }, uTint: { value: new THREE.Color(o.tint ?? 0xffffff) }, uAmb: { value: new THREE.Color(o.amb ?? 0xffffff) },
    uFog: { value: new THREE.Color(o.fog ?? 0x2a3a40) }, uFogAmt: { value: o.fogAmt ?? 0 }, uAlpha: { value: o.alpha ?? 1 },
    uLightAmt: { value: o.lightAmt ?? 0 }, uEmis: { value: o.emis ?? 0 }, uEmisT: { value: o.emisT ?? 0.55 }, uFlash: { value: 0 },
    uUvXf: { value: new THREE.Vector4(0, 0, 1, 1) }, uEdge: { value: new THREE.Vector4(...(o.edge || [0, 0, 0, 0])) }, ...shared,
  };
  if (o.deform) Object.assign(u, { uDef0: { value: new THREE.Vector4() }, uDef1: { value: new THREE.Vector4() }, uDef2: { value: new THREE.Vector4(1, 1, 0.33, 0) }, uSize: { value: new THREE.Vector2(o.w || 1, o.h || 1) } });
  if (o.rim) Object.assign(u, { uRim: { value: new THREE.Color(o.rimCol ?? 0x5f8a96) }, uRim2: { value: new THREE.Color(0x000000) }, uRimDir: { value: new THREE.Vector2(0.7, 0.7) }, uTexel: { value: new THREE.Vector2(1 / (o.tw || 512), 1 / (o.th || 512)) }, uFlip: { value: 1 } });
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, defines, transparent: true, depthWrite: false, depthTest: false, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending });
}
// additive glow / shaft / mist material (unlit)
export function fxMat(tex, color, opacity, add = true) {
  return new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, depthTest: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
}
