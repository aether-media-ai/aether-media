// Generated ambience for The Glass Reef (WebAudio, no audio files).
const ReefAudio = (() => {
  let ctx = null, master = null, waterGain = null, reverb = null, started = false;
  let muted = localStorage.getItem('reefMuted') === '1';

  function noiseBuffer(seconds, brown) {
    const len = ctx.sampleRate * seconds, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
    }
    return buf;
  }
  function impulse(seconds, decay) {
    const len = ctx.sampleRate * seconds, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function lfo(freq, amount, target) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; g.gain.value = amount; o.connect(g); g.connect(target); o.start();
  }

  function start() {
    if (started) { if (ctx.state !== 'running') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); started = true;
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    reverb = ctx.createConvolver(); reverb.buffer = impulse(4.5, 2.6);
    const revGain = ctx.createGain(); revGain.gain.value = 0.55; reverb.connect(revGain); revGain.connect(master);

    // Wind: brown noise through a wandering band-pass
    const brown = noiseBuffer(6, true);
    const wind = ctx.createBufferSource(); wind.buffer = brown; wind.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.7;
    const wg = ctx.createGain(); wg.gain.value = 0.32;
    wind.connect(bp); bp.connect(wg); wg.connect(master); wg.connect(reverb);
    lfo(0.05, 160, bp.frequency); lfo(0.11, 0.12, wg.gain); wind.start();

    // Drone: low detuned sines, slowly breathing
    const dg = ctx.createGain(); dg.gain.value = 0.045;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    [55, 82.41, 110.3, 164.8].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = i === 3 ? 'triangle' : 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = i === 3 ? 0.25 : 1; o.connect(g); g.connect(lp); o.start();
      lfo(0.03 + i * 0.017, 0.25, g.gain);
    });
    lp.connect(dg); dg.connect(master); dg.connect(reverb);

    // Water: white noise, low-passed, with gentle lapping swells
    const water = ctx.createBufferSource(); water.buffer = noiseBuffer(4, false); water.loop = true;
    const wlp = ctx.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 700;
    waterGain = ctx.createGain(); waterGain.gain.value = 0.02;
    water.connect(wlp); wlp.connect(waterGain); waterGain.connect(master); water.start();
    lfo(0.23, 220, wlp.frequency);

    master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 1.5);
  }

  function setMotion(speed01) { // skiff speed -> more water sound
    if (!ctx) return;
    waterGain.gain.setTargetAtTime(0.02 + speed01 * 0.07, ctx.currentTime, 0.4);
  }

  function chime(notes, gap = 0.12, vol = 0.12) {
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.02;
    notes.forEach((f, i) => {
      const t = t0 + i * gap;
      [1, 2.01, 3.98].forEach((h, k) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f * h;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol / (k + 1.5), t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8 / (k + 1));
        o.connect(g); g.connect(master); g.connect(reverb); o.start(t); o.stop(t + 3);
      });
    });
  }
  const shard = (n) => chime([659.25, 987.77, 1318.5, 1479.98].slice(0, 2 + n).concat([1975.5 * (n % 2 ? 1 : 0.75)]), 0.11, 0.1);
  const open = () => chime([329.6, 493.9, 659.25, 739.99, 987.77, 1318.5, 1975.5], 0.22, 0.12);

  function fadeOut(sec) { if (ctx) master.gain.setTargetAtTime(0, ctx.currentTime, sec / 3); }
  function fadeIn() { if (ctx && !muted) master.gain.setTargetAtTime(0.9, ctx.currentTime, 1.2); }
  function toggleMute() {
    muted = !muted; localStorage.setItem('reefMuted', muted ? '1' : '0');
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.2);
    return muted;
  }
  return { start, setMotion, shard, open, fadeOut, fadeIn, toggleMute, isMuted: () => muted };
})();
