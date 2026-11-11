// ============================================================================
// music.js — Música de fundo gerada por código (sem arquivos de áudio).
//
// Cada fase tem a sua própria música: o cenário define o "clima" (escala,
// andamento, timbres, bateria) e o número da fase serve de semente para
// compor a melodia. Assim as 12 fases soam diferentes, mas a mesma fase toca
// sempre a mesma música.
// ============================================================================

/** Estilo musical de cada cenário (a chave é o nome do cenário em config.js). */
const STYLES = {
  // escala: semitons a partir da tônica | prog: graus da escala (0 = tônica)
  'Gramado': { bpm: 118, key: 60, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 4, 5, 3], lead: 'square', bass: 'oitavas', arp: 8, drums: 'pop' },
  'Deserto': { bpm: 104, key: 57, scale: [0, 1, 4, 5, 7, 8, 10], prog: [0, 1, 0, 6], lead: 'sawtooth', bass: 'galope', arp: 0, drums: 'tribal' },
  'Geleira': { bpm: 96, key: 62, scale: [0, 2, 4, 6, 7, 9, 11], prog: [0, 2, 3, 0], lead: 'triangle', bass: 'longas', arp: 16, drums: 'leve' },
  'Noite Neon': { bpm: 128, key: 57, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 2, 6], lead: 'sawtooth', bass: 'colcheias', arp: 16, drums: 'dance' },
  'Doceria': { bpm: 138, key: 65, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 3, 4, 0], lead: 'square', bass: 'saltitante', arp: 8, drums: 'pop' },
  'Vulcão': { bpm: 146, key: 52, scale: [0, 2, 3, 5, 7, 8, 11], prog: [0, 0, 5, 4], lead: 'sawtooth', bass: 'colcheias', arp: 0, drums: 'pesada' },
};

/** Ritmos possíveis para um compasso da melodia: [passo (0-15), duração em passos]. */
const RHYTHMS = [
  [[0, 4], [4, 4], [8, 4], [12, 4]],
  [[0, 3], [3, 3], [6, 2], [8, 4], [12, 4]],
  [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
  [[0, 6], [6, 2], [8, 6], [14, 2]],
  [[0, 4], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
  [[0, 2], [4, 2], [6, 2], [8, 2], [12, 4]],
];

const STEPS = 128;   // 8 compassos de 16 semicolcheias

/** Gerador de números pseudoaleatórios com semente (mesma fase → mesma música). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

export class Music {
  /** @param {import('./audio.js').AudioFX} audio  dono do AudioContext e do volume geral */
  constructor(audio) {
    this.audio = audio;
    this.song = null;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.paused = false;
    this.gain = null;
  }

  // ------------------------------------------------------------- composição

  /** Compõe a música da fase. */
  _compose(level, themeName) {
    const st = STYLES[themeName] || STYLES['Gramado'];
    const rand = rng(level * 7919 + 13);
    const volta = level > Object.keys(STYLES).length;        // segunda passada pelos cenários
    const key = st.key + (volta ? 2 : 0);
    const bpm = Math.round(st.bpm * (volta ? 1.08 : 1));

    // Grau da escala (pode passar de 6 ou ser negativo) → nota MIDI.
    const nota = (grau, oitava = 0) => {
      const n = st.scale.length;
      const o = Math.floor(grau / n);
      return key + st.scale[((grau % n) + n) % n] + 12 * (o + oitava);
    };

    // Motivos melódicos de um compasso: ritmo + contorno relativo ao acorde.
    const motivo = () => {
      const ritmo = RHYTHMS[Math.floor(rand() * RHYTHMS.length)];
      let pos = [0, 2, 4][Math.floor(rand() * 3)];
      return ritmo.map(([passo, dur]) => {
        if (passo % 8 === 0) {
          // Tempos fortes caem em notas do acorde (fundamental, terça, quinta, oitava).
          const alvos = [0, 2, 4, 7];
          pos = alvos.reduce((m, a) => (Math.abs(a - pos) < Math.abs(m - pos) ? a : m), alvos[0]);
          if (rand() < 0.35) pos = alvos[Math.floor(rand() * alvos.length)];
        } else {
          pos += [-2, -1, -1, 1, 1, 2][Math.floor(rand() * 6)];
          pos = Math.max(-1, Math.min(8, pos));
        }
        return { passo, dur, pos };
      });
    };
    const A = motivo(), B = motivo(), C = motivo(), D = motivo();
    D[D.length - 1].pos = 0;                                  // a frase termina "em casa"
    const forma = [A, B, A, C, A, B, A, D];

    const lead = new Array(STEPS).fill(null);
    const bass = new Array(STEPS).fill(null);
    const arp = new Array(STEPS).fill(null);

    for (let bar = 0; bar < 8; bar++) {
      const raiz = st.prog[Math.floor(bar / 2) % st.prog.length];   // cada acorde dura 2 compassos
      const base = bar * 16;

      for (const n of forma[bar]) lead[base + n.passo] = { midi: nota(raiz + n.pos, 1), dur: n.dur };

      // Baixo
      for (let s = 0; s < 16; s++) {
        let b = null;
        if (st.bass === 'oitavas' && s % 2 === 0) b = { midi: nota(raiz, s % 4 === 0 ? -2 : -1), dur: 2 };
        else if (st.bass === 'colcheias' && s % 2 === 0) b = { midi: nota(raiz, -2), dur: 2 };
        else if (st.bass === 'longas' && s % 8 === 0) b = { midi: nota(s === 8 ? raiz + 4 : raiz, -2), dur: 7 };
        else if (st.bass === 'galope' && [0, 3, 4, 8, 11, 12].includes(s)) b = { midi: nota(raiz, -2), dur: s % 4 === 3 ? 1 : 3 };
        else if (st.bass === 'saltitante' && s % 4 === 0) b = { midi: nota(s % 8 === 0 ? raiz : raiz + 4, -2), dur: 2 };
        bass[base + s] = b;
      }

      // Arpejo (notas do acorde em sequência)
      if (st.arp) {
        const cada = 16 / st.arp;
        const graus = [0, 2, 4, 7, 4, 2];
        for (let k = 0; k < st.arp; k++) arp[base + k * cada] = { midi: nota(raiz + graus[k % graus.length], 0), dur: cada };
      }
    }

    return { st, bpm, lead, bass, arp, stepDur: 60 / bpm / 4 };
  }

  // -------------------------------------------------------------- controle

  /** Começa a tocar a música da fase (troca a que estiver tocando). */
  play(level, themeName) {
    this.stop();
    const ctx = this.audio.ctx;
    if (!ctx) return;
    this.song = this._compose(level, themeName);
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.0001;
    this.gain.gain.exponentialRampToValueAtTime(0.42, ctx.currentTime + 0.6);   // entra suave
    this.gain.connect(this.audio.master);
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.15;
    this.paused = false;
    this.timer = setInterval(() => this._schedule(), 60);
  }

  /** Para a música (com um pequeno "fade"). */
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const g = this.gain, ctx = this.audio.ctx;
    if (g && ctx) {
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      setTimeout(() => g.disconnect(), 400);
    }
    this.gain = null;
    this.song = null;
  }

  /** Pausa/continua (usado no menu de pausa). */
  setPaused(paused) {
    if (!this.song || this.paused === paused) return;
    this.paused = paused;
    const ctx = this.audio.ctx;
    this.gain.gain.cancelScheduledValues(ctx.currentTime);
    this.gain.gain.setTargetAtTime(paused ? 0.0001 : 0.42, ctx.currentTime, 0.05);
    if (!paused) this.nextTime = Math.max(this.nextTime, ctx.currentTime + 0.1);
  }

  // ------------------------------------------------------------- execução

  /** Agenda as notas dos próximos instantes (chamado várias vezes por segundo). */
  _schedule() {
    const ctx = this.audio.ctx;
    const song = this.song;
    if (!song || this.paused || ctx.state !== 'running') return;
    // Se a aba ficou parada, não tenta "recuperar" o atraso de uma vez.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;

    while (this.nextTime < ctx.currentTime + 0.25) {
      this._playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % STEPS;
      this.nextTime += song.stepDur;
    }
  }

  _playStep(i, t) {
    const { st, lead, bass, arp, stepDur } = this.song;
    const s = i % 16;

    const l = lead[i];
    if (l) this._note(freq(l.midi), t, l.dur * stepDur * 0.92, st.lead, st.lead === 'triangle' ? 0.34 : 0.16, true);
    const b = bass[i];
    if (b) this._note(freq(b.midi), t, b.dur * stepDur * 0.9, 'triangle', 0.42);
    const a = arp[i];
    if (a) this._note(freq(a.midi), t, a.dur * stepDur * 0.7, 'triangle', 0.11);

    // Bateria
    const d = st.drums;
    const bumbo = d === 'dance' || d === 'pesada' ? s % 4 === 0
      : d === 'tribal' ? [0, 6, 8, 11].includes(s)
        : d === 'leve' ? s === 0
          : s === 0 || s === 8 || s === 10;
    const caixa = d === 'leve' ? s === 8 : d === 'tribal' ? s === 4 || s === 12 || s === 14 : s === 4 || s === 12;
    const chimbal = d === 'leve' ? s % 4 === 2 : d === 'dance' ? s % 4 === 2 : d === 'pesada' ? true : s % 2 === 0;
    if (bumbo) this._kick(t);
    if (caixa) this._noise(t, 0.12, 0.2, 1800);
    if (chimbal) this._noise(t, 0.03, d === 'pesada' && s % 2 ? 0.035 : 0.07, 7000);
  }

  _note(f, t, dur, type, vol, vibrato = false) {
    const ctx = this.audio.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (vibrato && dur > 0.3) {
      // leve "tremido" nas notas longas da melodia
      osc.frequency.setValueAtTime(f, t + dur * 0.5);
      osc.frequency.linearRampToValueAtTime(f * 1.012, t + dur * 0.75);
      osc.frequency.linearRampToValueAtTime(f, t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(vol * 0.6, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.gain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _kick(t) {
    const ctx = this.audio.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g).connect(this.gain);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  /** Ruído curto filtrado (caixa e chimbal). */
  _noise(t, dur, vol, corte) {
    const ctx = this.audio.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.audio.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = corte;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.gain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}
