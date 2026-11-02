// Tiny WebAudio synth: no audio files needed for the slice.
let ac = null, master = null;
function ctx() { if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination); } return ac; }
function tone(f0, f1, dur, type = 'sine', vol = 0.2, noise = false) {
  const a = ctx(), t = a.currentTime, g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); g.connect(master);
  if (noise) { const b = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = a.createBufferSource(); s.buffer = b; const fl = a.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur); s.connect(fl); fl.connect(g); s.start(t); return; }
  const o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); o.connect(g); o.start(t); o.stop(t + dur);
}
const S = {
  swing: () => tone(900, 300, 0.12, 'sine', 0.08, true),
  hit: () => tone(220, 90, 0.12, 'triangle', 0.12),
  die: () => tone(500, 60, 0.4, 'sine', 0.12, true),
  hurt: () => tone(160, 70, 0.2, 'sawtooth', 0.07),
  cast: () => tone(600, 1400, 0.18, 'triangle', 0.08),
  flare: () => { tone(200, 900, 0.5, 'sine', 0.12); tone(1200, 300, 0.5, 'sine', 0.06, true); },
  enemyCast: () => tone(1800, 2400, 0.15, 'sine', 0.05),
  slam: () => { tone(90, 40, 0.5, 'sine', 0.25); tone(400, 80, 0.4, 'sine', 0.1, true); },
  blade: () => tone(3000, 800, 0.4, 'sine', 0.09, true),
  pickup: () => tone(700, 1100, 0.12, 'sine', 0.08),
  equip: () => tone(300, 500, 0.1, 'square', 0.04),
  drink: () => tone(400, 800, 0.25, 'sine', 0.07),
  level: () => { tone(523, 1046, 0.6, 'triangle', 0.1); tone(659, 1318, 0.6, 'sine', 0.06); },
  light: () => { tone(330, 660, 0.7, 'sine', 0.1); tone(495, 990, 0.7, 'sine', 0.05); },
  quest: () => { tone(392, 784, 0.9, 'sine', 0.1); tone(587, 1174, 0.9, 'sine', 0.06); },
  jump: () => tone(500, 60, 1.6, 'sine', 0.1, true),
};
export function sfx(n) { try { if (ac && ac.state !== 'running') return; S[n]?.(); } catch (e) { } }
export function startAmbience() {
  try {
    const a = ctx(); a.resume();
    for (const [f, v] of [[55, 0.05], [82.4, 0.03], [110.3, 0.015]]) { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = f; g.gain.value = v; const l = a.createOscillator(), lg = a.createGain(); l.frequency.value = 0.07 + f / 3000; lg.gain.value = v * 0.6; l.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(master); o.start(); l.start(); }
    const b = a.createBuffer(1, a.sampleRate * 4, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = a.createBufferSource(); s.buffer = b; s.loop = true; const fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 380; const g = a.createGain(); g.gain.value = 0.05; s.connect(fl); fl.connect(g); g.connect(master); s.start();
  } catch (e) { }
}
