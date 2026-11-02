// render -> UnrealBloom -> OutputPass (ACES + sRGB) -> grade (amber/teal split-tone, vignette, grain, letterbox, flashes)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uGrain: { value: 0.04 }, uVig: { value: 1.0 }, uHurt: { value: 0 }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 0.62, 0.25) }, uWhite: { value: 0 }, uBars: { value: 0 }, uAspect: { value: 1.78 }, uSepia: { value: 0 }, uCA: { value: 0.0012 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uT,uGrain,uVig,uHurt,uFlash,uWhite,uBars,uAspect,uSepia,uCA; uniform vec3 uFlashCol; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 q = vUv - 0.5;
      vec3 c; c.r = texture2D(tDiffuse, vUv + q * uCA).r; c.g = texture2D(tDiffuse, vUv).g; c.b = texture2D(tDiffuse, vUv - q * uCA).b;
      float l = dot(c, vec3(0.299,0.587,0.114));
      c = mix(c, c * vec3(0.84,1.02,1.1), (1.0 - smoothstep(0.0, 0.42, l)) * 0.6);
      c = mix(c, c * vec3(1.1,1.0,0.86), smoothstep(0.4, 1.0, l) * 0.5);
      c = (c - 0.5) * 1.07 + 0.5;
      float s = dot(c, vec3(0.3,0.59,0.11)); c = mix(c, vec3(s) * vec3(1.12, 0.98, 0.78), uSepia);
      float v = 1.0 - dot(q * vec2(1.0, 0.9), q * vec2(1.0, 0.9)) * 1.35 * uVig; c *= clamp(v, 0.0, 1.0);
      c = mix(c, vec3(0.5, 0.05, 0.03), uHurt * smoothstep(0.2, 0.8, length(q) * 1.6));
      c += uFlashCol * uFlash;
      c = mix(c, vec3(1.0, 0.97, 0.9), uWhite);
      c += (h(vUv * 1000.0 + fract(uT) * 37.0) - 0.5) * uGrain;
      float bar = step(abs(q.y), 0.5 - uBars * 0.11); c *= bar;
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`
};
export function makePost(renderer, scene, camera, high) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
  const comp = new EffectComposer(renderer, rt);
  comp.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.85, 0.6, 0.72);
  comp.addPass(bloom);
  comp.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader); comp.addPass(grade);
  return { comp, bloom, grade, U: grade.uniforms, setSize(w, h) { comp.setSize(w, h); bloom.setSize(w / 2, h / 2); } };
}
