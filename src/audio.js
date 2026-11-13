// Original procedural score and effects. Audio starts only after a user gesture.
const clamp = (value, fallback) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const SCORE = {
  menu: {
    bpm: 76,
    chords: [
      [50, 57, 62, 66],
      [47, 54, 59, 62],
      [43, 55, 59, 62],
      [45, 57, 61, 64],
    ],
    melody: [
      74,
      null,
      78,
      81,
      null,
      78,
      76,
      null,
      74,
      null,
      71,
      74,
      null,
      69,
      73,
      null,
    ],
  },
  battle: {
    bpm: 104,
    chords: [
      [50, 57, 62, 65],
      [48, 55, 60, 64],
      [43, 55, 59, 62],
      [45, 57, 60, 64],
    ],
    melody: [
      74,
      null,
      77,
      81,
      79,
      null,
      77,
      74,
      72,
      null,
      76,
      79,
      77,
      null,
      74,
      null,
    ],
  },
  boss: {
    bpm: 120,
    chords: [
      [38, 50, 57, 62],
      [41, 53, 60, 65],
      [39, 51, 58, 63],
      [45, 57, 61, 64],
    ],
    melody: [
      74,
      null,
      69,
      74,
      77,
      null,
      76,
      74,
      75,
      null,
      70,
      75,
      73,
      null,
      69,
      null,
    ],
  },
};

export class AudioManager {
  constructor(settings = {}) {
    this.music = clamp(settings.music, 0.3);
    this.sfx = clamp(settings.sfx, 0.6);
    this.mood = "menu";
    this.ctx = null;
    this.unlocked = false;
    this.paused = false;
    this.destroyed = false;
    this.timer = null;
    this.step = 0;
    this.nextNote = 0;
    this.voices = new Set();
    this.lastFx = new Map();
  }

  async unlock() {
    if (this.destroyed) return false;
    try {
      if (!this.ctx) {
        const Context =
          globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Context) return false;
        this.ctx = new Context();
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        // A compressor catches stacked attacks without making quiet notes loud.
        this.master = this.ctx.createDynamicsCompressor();
        this.master.threshold.value = -12;
        this.master.knee.value = 12;
        this.master.ratio.value = 5;
        this.master.attack.value = 0.004;
        this.master.release.value = 0.15;
        this.musicGain.gain.value = this.music * 0.4;
        this.sfxGain.gain.value = this.sfx * 0.45;
        this.musicGain.connect(this.master);
        this.sfxGain.connect(this.master);
        this.master.connect(this.ctx.destination);
        const length = Math.ceil(this.ctx.sampleRate * 1.5);
        this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const samples = this.noise.getChannelData(0);
        for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
      }
      if (!this.paused && this.ctx.state === "suspended")
        await this.ctx.resume();
      this.unlocked = true;
      this.startScheduler();
      return true;
    } catch {
      // Browsers without usable audio still have a fully playable game.
      return false;
    }
  }

  setVolumes(music, sfx) {
    this.music = clamp(music, this.music);
    this.sfx = clamp(sfx, this.sfx);
    if (!this.ctx || this.destroyed) return;
    const now = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(this.music * 0.4, now, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.sfx * 0.45, now, 0.05);
  }

  setMood(mood) {
    if (!SCORE[mood] || this.mood === mood) return;
    this.mood = mood;
    this.step = 0;
    this.nextNote = this.ctx ? this.ctx.currentTime + 0.08 : 0;
  }

  pause(paused = true) {
    this.paused = Boolean(paused);
    if (!this.ctx || this.destroyed) return;
    if (this.paused) {
      this.stopScheduler();
      this.ctx.suspend().catch(() => {});
    } else if (this.unlocked) {
      this.ctx
        .resume()
        .then(() => {
          if (this.destroyed || this.paused) return;
          this.nextNote = this.ctx.currentTime + 0.06;
          this.startScheduler();
        })
        .catch(() => {});
    }
  }

  startScheduler() {
    if (
      this.timer ||
      !this.ctx ||
      !this.unlocked ||
      this.paused ||
      this.destroyed
    )
      return;
    this.nextNote = Math.max(this.nextNote, this.ctx.currentTime + 0.04);
    this.schedule();
    this.timer = globalThis.setInterval(() => this.schedule(), 100);
  }

  stopScheduler() {
    if (this.timer !== null) globalThis.clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    if (
      !this.ctx ||
      this.ctx.state !== "running" ||
      this.paused ||
      this.destroyed
    )
      return;
    const score = SCORE[this.mood];
    const eighth = 30 / score.bpm;
    // Recover from a background-tab timer delay without scheduling a burst.
    if (this.nextNote < this.ctx.currentTime - eighth)
      this.nextNote = this.ctx.currentTime + 0.04;
    while (this.nextNote < this.ctx.currentTime + 0.3) {
      if (this.music > 0)
        this.scoreStep(score, this.step, this.nextNote, eighth);
      this.step++;
      this.nextNote += eighth;
    }
  }

  scoreStep(score, step, at, eighth) {
    const chord = score.chords[Math.floor(step / 16) % score.chords.length];
    const beat = step % 16;
    if (beat === 0 || beat === 8) {
      for (let i = 1; i < chord.length; i++) {
        this.tone(
          hz(chord[i]),
          eighth * 9,
          "sine",
          0.035,
          at + i * 0.025,
          this.musicGain,
          { attack: 0.25 },
        );
      }
      this.tone(
        hz(chord[0]),
        eighth * 3.7,
        "triangle",
        0.065,
        at,
        this.musicGain,
        { attack: 0.03, filter: 550 },
      );
    }
    const note = score.melody[step % score.melody.length];
    if (note !== null) {
      // A soft bell, with a quiet octave partial, carries the original motif.
      this.tone(hz(note), eighth * 2.5, "sine", 0.07, at, this.musicGain);
      this.tone(hz(note + 12), eighth * 1.1, "sine", 0.012, at, this.musicGain);
    }
    if (this.mood !== "menu" && beat % 2 === 0) {
      const noteIndex = 1 + (Math.floor(beat / 2) % 3);
      this.tone(
        hz(chord[noteIndex] + 12),
        eighth * 0.8,
        "triangle",
        0.025,
        at,
        this.musicGain,
        { filter: 1600 },
      );
    }
    if (this.mood === "boss" && beat % 4 === 0) {
      this.tone(85, 0.18, "sine", 0.18, at, this.musicGain, { end: 36 });
      this.hiss(0.08, 0.018, at, this.musicGain, 650, 200);
    }
  }

  tone(frequency, duration, type, volume, at, bus, options = {}) {
    if (!this.ctx || this.voices.size > 72 || this.destroyed) return;
    const ctx = this.ctx,
      start = Math.max(ctx.currentTime, at),
      attack = Math.min(options.attack || 0.008, duration * 0.4);
    const oscillator = ctx.createOscillator(),
      envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
    if (options.end)
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, options.end),
        start + duration,
      );
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, volume),
      start + attack,
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    let filter;
    if (options.filter) {
      filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = options.filter;
      oscillator.connect(filter);
      filter.connect(envelope);
    } else oscillator.connect(envelope);
    envelope.connect(bus);
    this.voices.add(oscillator);
    oscillator.onended = () => {
      this.voices.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
      filter?.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  hiss(duration, volume, at, bus, from = 2500, to = 300) {
    if (!this.ctx || !this.noise || this.voices.size > 72 || this.destroyed)
      return;
    const ctx = this.ctx,
      start = Math.max(ctx.currentTime, at);
    const source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      envelope = ctx.createGain();
    source.buffer = this.noise;
    filter.type = "bandpass";
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(
      volume,
      start + Math.min(0.02, duration * 0.3),
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(bus);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
    source.start(start);
    source.stop(start + duration + 0.01);
  }

  play(name) {
    if (
      !this.unlocked ||
      this.paused ||
      this.destroyed ||
      !this.ctx ||
      this.ctx.state !== "running" ||
      this.sfx === 0
    )
      return;
    const now = this.ctx.currentTime;
    if (now - (this.lastFx.get(name) ?? -1) < 0.045) return;
    this.lastFx.set(name, now);
    const note = (
      midi,
      offset = 0,
      duration = 0.18,
      volume = 0.16,
      type = "sine",
    ) =>
      this.tone(hz(midi), duration, type, volume, now + offset, this.sfxGain);
    const noise = (duration, volume, from, to, offset = 0) =>
      this.hiss(duration, volume, now + offset, this.sfxGain, from, to);
    switch (name) {
      case "select":
        note(81, 0, 0.09, 0.1);
        break;
      case "place":
        note(69, 0, 0.2);
        note(76, 0.075, 0.25);
        break;
      case "upgrade":
        [74, 78, 81, 86].forEach((n, i) => note(n, i * 0.07, 0.4, 0.17));
        break;
      case "sell":
        note(81, 0, 0.17, 0.12);
        note(76, 0.09, 0.2, 0.12);
        break;
      case "ice":
        note(93, 0, 0.14, 0.12);
        note(100, 0.025, 0.18, 0.06);
        noise(0.11, 0.065, 5000, 2600);
        break;
      case "wind":
        noise(0.22, 0.17, 2400, 650);
        note(79, 0.02, 0.16, 0.05);
        break;
      case "impact":
        this.tone(120, 0.13, "triangle", 0.27, now, this.sfxGain, { end: 40 });
        noise(0.08, 0.16, 1800, 240);
        break;
      case "yin":
        note(62, 0, 0.25, 0.15, "triangle");
        note(69, 0.03, 0.28, 0.08);
        noise(0.14, 0.06, 1400, 500);
        break;
      case "sword":
        noise(0.105, 0.17, 6000, 1200);
        note(57, 0.02, 0.1, 0.1, "triangle");
        break;
      case "wave":
        [62, 69, 74].forEach((n, i) =>
          note(n, i * 0.1, 0.45, 0.13, "triangle"),
        );
        break;
      case "win":
        [74, 78, 81, 86, 81, 86].forEach((n, i) =>
          note(n, i * 0.16, 0.65, 0.17),
        );
        break;
      case "lose":
        [62, 60, 57, 50].forEach((n, i) =>
          note(n, i * 0.19, 0.55, 0.16, "triangle"),
        );
        break;
      case "ability":
        [74, 81, 86, 90, 93, 98].forEach((n, i) =>
          note(n, i * 0.065, 0.8, 0.13),
        );
        noise(0.8, 0.19, 900, 5200, 0.04);
        this.tone(110, 0.55, "sine", 0.24, now, this.sfxGain, { end: 55 });
        break;
      default:
        break;
    }
  }

  destroy() {
    this.destroyed = true;
    this.unlocked = false;
    this.stopScheduler();
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {}
    }
    this.voices.clear();
    this.lastFx.clear();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.noise = null;
  }
}
