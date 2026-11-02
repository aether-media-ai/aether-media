// Post chain: render -> UnrealBloom -> OutputPass (ACES + sRGB) -> grade (teal/amber split-tone, vignette, film grain, hurt/flare tint)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uGrain: { value: 0.045 }, uVig: { value: 1.0 }, uHurt: { value: 0 }, uFlash: { value: 0 }, uDark: { value: 0 }, uWhite: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uT,uGrain,uVig,uHurt,uFlash,uDark,uWhite; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299,0.587,0.114));
      // split tone: teal shadows, amber highlights (the Aether Realms grade)
      c = mix(c, c * vec3(0.86,1.02,1.08), (1.0 - smoothstep(0.0, 0.45, l)) * 0.55);
      c = mix(c, c * vec3(1.08,1.0,0.88), smoothstep(0.45, 1.0, l) * 0.45);
      c = (c - 0.5) * 1.06 + 0.5;
      vec2 q = vUv - 0.5; float v = 1.0 - dot(q, q) * 1.25 * uVig; c *= clamp(v, 0.0, 1.0);
      c *= 1.0 - uDark * smoothstep(0.15, 0.75, length(q * vec2(1.6, 1.0)));
      c = mix(c, vec3(0.55, 0.05, 0.03), uHurt * smoothstep(0.2, 0.8, length(q) * 1.6));
      c += vec3(1.0, 0.62, 0.25) * uFlash;
      c = mix(c, vec3(1.0, 0.96, 0.86), uWhite);
      c += (h(vUv * 1000.0 + fract(uT) * 37.0) - 0.5) * uGrain;
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`
};

export function makePost(renderer, scene, camera, high) {
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: high ? 4 : 0 });
  const comp = new EffectComposer(renderer, rt);
  comp.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.7, 0.55, 0.82);
  bloom.enabled = high;
  comp.addPass(bloom);
  comp.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  comp.addPass(grade);
  return { comp, bloom, grade, U: grade.uniforms, setSize(w, h) { comp.setSize(w, h); } };
}
