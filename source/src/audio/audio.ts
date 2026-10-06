/**
 * Sons et musiques synthétisés avec la Web Audio API : aucun fichier,
 * aucun droit d'auteur, quelques Ko. Remplaçables plus tard par de vrais
 * samples via la même interface (play(nom)).
 */
export type Sfx =
  | "place"
  | "tick"
  | "explode"
  | "break"
  | "pickup"
  | "death"
  | "win"
  | "lose"
  | "shield"
  | "shieldHit"
  | "alarm"
  | "thud"
  | "click"
  | "count"
  | "go"
  | "levelup"
  | "rumble"
  | "eruption"
  | "coin"
  | "buy"
  | "equip"
  | "whoosh"
  | "unlock"
  | "deny"
  | "tab";

type Track = "menu" | "game" | null;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  musicOn = true;
  sfxOn = true;
  private track: Track = null;
  private wanted: Track = null;
  private nextNote = 0;
  private step = 0;
  private timer: number | null = null;
  private intensity = 0;

  /** À appeler depuis un geste utilisateur (exigence des navigateurs). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.32;
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (this.wanted && this.track !== this.wanted) this.playMusic(this.wanted);
  }

  suspend() {
    void this.ctx?.suspend();
  }
  resume() {
    void this.ctx?.resume();
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (!on) this.stopMusic(true);
    else if (this.wanted) this.playMusic(this.wanted);
  }
  setSfx(on: boolean) {
    this.sfxOn = on;
  }
  setIntensity(v: number) {
    this.intensity = v;
  }

  // ------------------------------------------------------------- briques
  private osc(type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number, bus?: AudioNode) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private burst(t0: number, dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, bus?: AudioNode) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(bus ?? this.sfxBus);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  // ---------------------------------------------------------------- sfx
  play(name: Sfx, volume = 1) {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime + 0.005;
    const v = Math.max(0.05, Math.min(1, volume));
    switch (name) {
      case "place":
        this.osc("sine", 420, 140, t, 0.13, 0.5 * v);
        this.burst(t, 0.05, 0.15 * v, "lowpass", 2000, 400);
        break;
      case "tick":
        this.osc("square", 1800, 1800, t, 0.025, 0.06 * v);
        break;
      case "explode":
        this.burst(t, 0.7, 0.9 * v, "lowpass", 3200, 120);
        this.osc("sine", 120, 38, t, 0.45, 0.8 * v);
        this.burst(t, 0.12, 0.35 * v, "highpass", 3000, 1200);
        break;
      case "break":
        this.burst(t, 0.18, 0.35 * v, "bandpass", 1400, 500);
        this.osc("triangle", 260, 120, t, 0.1, 0.2 * v);
        break;
      case "pickup":
        [660, 880, 1320].forEach((f, i) => this.osc("triangle", f, f, t + i * 0.055, 0.12, 0.28 * v));
        break;
      case "death":
        this.osc("square", 520, 90, t, 0.5, 0.22 * v);
        this.osc("sine", 300, 60, t + 0.05, 0.5, 0.3 * v);
        break;
      case "win":
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.osc("triangle", f, f, t + i * 0.11, 0.22, 0.32));
        [262, 330, 392].forEach((f) => this.osc("sine", f, f, t + 0.55, 0.7, 0.18));
        break;
      case "lose":
        [440, 392, 349, 262].forEach((f, i) => this.osc("triangle", f, f * 0.98, t + i * 0.16, 0.3, 0.28));
        break;
      case "shield":
        this.osc("sine", 500, 1400, t, 0.25, 0.25 * v);
        this.osc("triangle", 1500, 2200, t + 0.05, 0.2, 0.1 * v);
        break;
      case "shieldHit":
        this.osc("triangle", 1800, 900, t, 0.15, 0.25 * v);
        break;
      case "alarm":
        for (let i = 0; i < 3; i++) this.osc("square", 880, 660, t + i * 0.22, 0.18, 0.18);
        break;
      case "thud":
        this.osc("sine", 140, 50, t, 0.18, 0.4 * v);
        this.burst(t, 0.12, 0.2 * v, "lowpass", 900, 200);
        break;
      case "click":
        this.osc("triangle", 900, 600, t, 0.06, 0.2);
        break;
      case "count":
        this.osc("triangle", 660, 660, t, 0.14, 0.3);
        break;
      case "go":
        this.osc("triangle", 990, 990, t, 0.3, 0.32);
        this.osc("triangle", 1320, 1320, t + 0.02, 0.3, 0.18);
        break;
      case "rumble":
        this.osc("sine", 55, 40, t, 1.2, 0.35 * v);
        this.burst(t, 1.2, 0.18 * v, "lowpass", 300, 120);
        break;
      case "eruption":
        this.burst(t, 0.9, 0.8 * v, "lowpass", 1800, 90);
        this.osc("sawtooth", 90, 30, t, 0.6, 0.3 * v);
        break;
      case "coin":
        this.osc("square", 1320 + Math.random() * 120, 1320, t, 0.05, 0.06 * v);
        this.osc("triangle", 1980, 1980, t + 0.04, 0.09, 0.1 * v);
        break;
      case "buy":
        [784, 988, 1175, 1568].forEach((f, i) => this.osc("triangle", f, f, t + i * 0.06, 0.18, 0.22));
        this.burst(t, 0.25, 0.12, "highpass", 6000, 3000);
        break;
      case "equip":
        this.osc("sine", 400, 900, t, 0.16, 0.25);
        this.osc("triangle", 1200, 1600, t + 0.06, 0.14, 0.12);
        break;
      case "whoosh":
        this.burst(t, 0.28, 0.25 * v, "bandpass", 600, 2400);
        break;
      case "unlock":
        [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.osc("triangle", f, f, t + i * 0.075, 0.3, 0.2));
        [262, 392, 523].forEach((f) => this.osc("sine", f, f, t + 0.45, 0.9, 0.16));
        this.burst(t + 0.4, 0.6, 0.12, "highpass", 8000, 4000);
        break;
      case "deny":
        this.osc("square", 220, 160, t, 0.12, 0.12);
        this.osc("square", 180, 130, t + 0.1, 0.16, 0.12);
        break;
      case "tab":
        this.osc("triangle", 700, 900, t, 0.05, 0.14);
        break;
      case "levelup":
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.osc("square", f, f, t + i * 0.07, 0.14, 0.12));
        break;
    }
  }

  // ------------------------------------------------------------- musique
  playMusic(track: Track) {
    this.wanted = track;
    if (!this.ctx || !this.musicOn || !track) return;
    if (this.track === track && this.timer !== null) return;
    this.stopMusic(false);
    this.track = track;
    this.step = 0;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.setValueAtTime(0.32, this.ctx.currentTime);
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  stopMusic(clearWanted: boolean) {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.track = null;
    if (clearWanted) this.wanted = null;
  }

  private schedule() {
    const c = this.ctx;
    if (!c || !this.track) return;
    const bpm = this.track === "menu" ? 96 : 132 + this.intensity * 16;
    const stepDur = 60 / bpm / 4;
    while (this.nextNote < c.currentTime + 0.15) {
      if (this.track === "menu") this.menuStep(this.step, this.nextNote, stepDur);
      else this.gameStep(this.step, this.nextNote, stepDur);
      this.nextNote += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  // Ambiance menu : marimba douce en do majeur
  private menuStep(st: number, t: number, d: number) {
    const chords = [
      [262, 330, 392],
      [220, 262, 330],
      [175, 220, 262],
      [196, 247, 294],
    ];
    const ch = chords[Math.floor(st / 16) % 4];
    const bus = this.musicBus;
    if (st % 16 === 0) this.osc("sine", ch[0] / 2, ch[0] / 2, t, d * 14, 0.35, bus);
    const pattern = [0, -1, 1, -1, 2, -1, 1, 2, 0, -1, 2, -1, 1, -1, 2, 1];
    const n = pattern[st % 16];
    if (n >= 0) this.osc("triangle", ch[n] * 2, ch[n] * 2, t, d * 2.5, 0.16, bus);
  }

  // Partie : basse sautillante + charleston + petite mélodie
  private gameStep(st: number, t: number, d: number) {
    const bus = this.musicBus;
    const roots = [110, 110, 87.3, 98];
    const root = roots[Math.floor(st / 16) % 4];
    const bassPat = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1];
    if (bassPat[st % 16]) this.osc("square", st % 4 === 0 ? root : root * 2, st % 4 === 0 ? root : root * 2, t, d * 0.9, 0.12, bus);
    if (st % 4 === 0) this.osc("sine", 140, 45, t, 0.12, 0.45, bus);
    if (st % 2 === 1) this.burst(t, 0.03, 0.05, "highpass", 7000, 6000, bus);
    if (st % 8 === 4) this.burst(t, 0.1, 0.12, "bandpass", 1800, 900, bus);
    const mel = [0, -1, 2, -1, 4, -1, 2, 7, -1, 5, -1, 4, 2, -1, 0, -1];
    const scale = [0, 2, 3, 5, 7, 8, 10, 12];
    const m = mel[st % 16];
    if (m >= 0 && Math.floor(st / 16) % 2 === 1) {
      const f = root * 4 * Math.pow(2, scale[m % 8] / 12);
      this.osc("triangle", f, f, t, d * 1.6, 0.09, bus);
    }
  }
}

export const audio = new AudioEngine();
