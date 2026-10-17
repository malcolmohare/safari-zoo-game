// Sound and music, all synthesized with WebAudio. The rhythm game runs on the audio clock
// (Snd.now()) so notes line up with what you hear.

const Snd = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let muted = localStorage.getItem('reel-rhythm-muted') === '1';

  function ensure() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  const running = () => !!ctx && ctx.state === 'running';
  // Seconds. The audio clock when sound is running, otherwise the page clock.
  const now = () => running() ? ctx.currentTime : performance.now() / 1000;
  // How long after a sound is scheduled you actually hear it.
  const latency = () => running() ? (ctx.outputLatency || ctx.baseLatency || 0) : 0;

  function setMuted(m) {
    muted = m;
    localStorage.setItem('reel-rhythm-muted', m ? '1' : '0');
    if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
  }

  // A single enveloped oscillator. `at` is an absolute audio time (default: now).
  function tone(freq, dur, { type = 'square', vol = 0.05, slide = 0, at = 0, dest = null, attack = 0.004 } = {}) {
    if (!running()) return;
    const t = Math.max(at || 0, ctx.currentTime), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, { vol = 0.05, at = 0, dest = null, hp = 4000 } = {}) {
    if (!running()) return;
    const t = Math.max(at || 0, ctx.currentTime), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest || master); s.start(t); s.stop(t + dur + 0.02);
  }
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // ---- Music for a fish fight ----
  // A song owns a gain node; everything it schedules goes through it so it can be faded out at once.
  const PROGS = [[0, 7, 9, 5], [0, 5, 7, 5], [9, 5, 0, 7], [0, 3, 5, 7]];
  const SPOT_ROOT = { pond: 48, river: 50, lake: 52, reef: 53, deep: 45 };
  function song(spot, lvl) {
    if (!running()) return { bar() {}, stop() {}, chordRoot: () => 60 };
    const g = ctx.createGain(); g.gain.value = 0.9; g.connect(master);
    const root = SPOT_ROOT[spot] || 48, prog = PROGS[(lvl + root) % PROGS.length];
    const minor = spot === 'deep' || spot === 'river';
    let chord = root;
    return {
      // Schedule drums, bass and a soft chord for bar k starting at time t.
      bar(k, t, beat, countIn) {
        chord = root + prog[k % 4];
        for (let i = 0; i < 4; i++) {
          const bt = t + i * beat;
          if (countIn) { tone(i ? 880 : 1320, 0.05, { type: 'square', vol: 0.03, at: bt, dest: g }); continue; }
          if (i === 0 || i === 2) tone(120, 0.18, { type: 'sine', vol: 0.35, slide: -80, at: bt, dest: g });
          if (i === 1 || i === 3) noise(0.12, { vol: 0.09, at: bt, dest: g, hp: 1500 });
          noise(0.03, { vol: 0.03, at: bt, dest: g, hp: 7000 });
          noise(0.03, { vol: 0.02, at: bt + beat / 2, dest: g, hp: 7000 });
          if (lvl >= 4) { noise(0.02, { vol: 0.012, at: bt + beat / 4, dest: g, hp: 8000 }); noise(0.02, { vol: 0.012, at: bt + beat * 3 / 4, dest: g, hp: 8000 }); }
          const bn = chord - 12 + (i === 3 && lvl >= 3 ? 7 : 0);
          tone(midi(bn), beat * 0.8, { type: 'triangle', vol: 0.12, at: bt, dest: g });
          if (lvl >= 2) tone(midi(bn + 12), beat * 0.3, { type: 'triangle', vol: 0.05, at: bt + beat / 2, dest: g });
        }
        if (!countIn) for (const iv of [0, minor ? 3 : 4, 7]) tone(midi(chord + 12 + iv), beat * 3.5, { type: 'sine', vol: 0.025, at: t, dest: g, attack: 0.08 });
      },
      // A soft guide tick on each note so the chart can be heard as well as seen.
      guide(t, lane, hold) {
        tone(lane ? 1180 : 940, 0.04, { type: 'sine', vol: 0.06, at: t, dest: g });
        if (hold) tone(midi(chord + 24), hold, { type: 'triangle', vol: 0.02, at: t, dest: g, attack: 0.02 });
      },
      chordRoot: () => chord,
      stop() {
        try { g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08); setTimeout(() => g.disconnect(), 600); } catch (e) { /* ignore */ }
      },
    };
  }

  // The melody you play by hitting notes: chord tones climbing with your combo.
  const SCALE = [0, 4, 7, 12, 16, 19, 24];
  function hitNote(chordRoot, combo, perfect) {
    const n = chordRoot + 12 + SCALE[combo % SCALE.length];
    tone(midi(n), 0.16, { type: 'square', vol: perfect ? 0.05 : 0.035 });
    tone(midi(n + 12), 0.08, { type: 'sine', vol: 0.03 });
  }

  const sfx = {
    click() { tone(660, 0.04, { type: 'square', vol: 0.03 }); },
    cast() { tone(500, 0.25, { type: 'triangle', vol: 0.05, slide: 600 }); setTimeout(() => noise(0.15, { vol: 0.06, hp: 1200 }), 450); },
    plop() { tone(400, 0.12, { type: 'sine', vol: 0.08, slide: -250 }); },
    nibble() { tone(700, 0.05, { type: 'sine', vol: 0.05, slide: -200 }); },
    bite() { tone(880, 0.08, { type: 'square', vol: 0.06 }); tone(1320, 0.12, { type: 'square', vol: 0.05, at: ctx ? ctx.currentTime + 0.08 : 0 }); },
    hooked() { noise(0.25, { vol: 0.08, hp: 900 }); tone(300, 0.2, { type: 'triangle', vol: 0.08, slide: 400 }); },
    miss() { tone(140, 0.12, { type: 'sawtooth', vol: 0.05, slide: -60 }); },
    stray() { tone(200, 0.05, { type: 'square', vol: 0.025 }); },
    snap() { noise(0.3, { vol: 0.12, hp: 2500 }); tone(600, 0.4, { type: 'sawtooth', vol: 0.06, slide: -500 }); },
    caught() { [0, 4, 7, 12, 16].forEach((n, i) => tone(midi(72 + n), 0.18, { type: 'square', vol: 0.05, at: ctx ? ctx.currentTime + i * 0.08 : 0 })); },
    coin() { tone(988, 0.06, { type: 'square', vol: 0.04 }); tone(1319, 0.14, { type: 'square', vol: 0.04, at: ctx ? ctx.currentTime + 0.06 : 0 }); },
    sad() { tone(330, 0.2, { type: 'triangle', vol: 0.04, slide: -120 }); },
    buy() { [0, 7, 12].forEach((n, i) => tone(midi(67 + n), 0.1, { type: 'triangle', vol: 0.05, at: ctx ? ctx.currentTime + i * 0.06 : 0 })); },
    bell() { tone(1568, 0.5, { type: 'sine', vol: 0.05 }); tone(2093, 0.4, { type: 'sine', vol: 0.03 }); },
    error() { tone(160, 0.15, { type: 'square', vol: 0.04 }); },
  };

  return { ensure, running, now, latency, isMuted: () => muted, setMuted, song, hitNote, sfx };
})();
