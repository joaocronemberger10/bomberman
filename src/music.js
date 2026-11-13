// ============================================================================
// music.js — Música de fundo gerada por código (sem arquivos de áudio).
//
// Estilo dance/eletrônico animado: bumbo marcado, palmas, chimbal no
// contratempo, baixo pulsando, acordes curtos ("stabs"), arpejos rápidos e
// uma melodia com ritmo quebrado. O cenário define o clima (tom, escala,
// andamento, timbres e bateria) e o número da fase serve de semente para
// compor a melodia — cada fase tem a sua música, e a mesma fase toca sempre
// a mesma. As fases de chefão usam o estilo 'Chefão'.
// ============================================================================

/** Estilo musical de cada cenário (a chave é o nome do cenário em config.js). */
const STYLES = {
  // escala: semitons a partir da tônica | prog: graus da escala, um acorde por compasso
  'Gramado': { bpm: 136, key: 60, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 4, 5, 3], lead: 'square', bass: 'oitavas', drums: 'house', stab: true },
  'Deserto': { bpm: 132, key: 57, scale: [0, 1, 4, 5, 7, 8, 10], prog: [0, 1, 6, 0], lead: 'sawtooth', bass: 'galope', drums: 'quebrada', stab: false },
  'Geleira': { bpm: 140, key: 62, scale: [0, 2, 4, 6, 7, 9, 11], prog: [0, 4, 5, 1], lead: 'triangle', bass: 'pulsa', drums: 'house', stab: true },
  'Noite Neon': { bpm: 145, key: 57, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 2, 6], lead: 'sawtooth', bass: 'rolando', drums: 'pista', stab: true },
  'Doceria': { bpm: 150, key: 65, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 3, 4, 4], lead: 'square', bass: 'oitavas', drums: 'quebrada', stab: true },
  'Vulcão': { bpm: 156, key: 52, scale: [0, 2, 3, 5, 7, 8, 11], prog: [0, 5, 3, 4], lead: 'sawtooth', bass: 'rolando', drums: 'rapida', stab: false },
  'Chefão': { bpm: 162, key: 50, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 6, 5, 4], lead: 'sawtooth', bass: 'rolando', drums: 'pista', stab: true },
};

/** Ritmos de um compasso da melodia: [passo (0-15), duração em passos]. Bem sincopados. */
const RHYTHMS = [
  [[0, 2], [2, 2], [4, 1], [5, 1], [6, 2], [8, 2], [10, 1], [11, 3], [14, 2]],
  [[0, 3], [3, 3], [6, 2], [8, 1], [9, 1], [10, 2], [12, 4]],
  [[0, 1], [1, 1], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
  [[0, 2], [3, 2], [6, 2], [8, 2], [11, 2], [14, 2]],
  [[0, 4], [4, 2], [6, 2], [8, 3], [11, 3], [14, 2]],
  [[2, 2], [4, 2], [6, 1], [7, 1], [8, 4], [12, 2], [14, 2]],
  [[0, 3], [3, 1], [4, 2], [6, 2], [8, 3], [11, 1], [12, 2], [14, 1], [15, 1]],
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
    this.duck = null;      // barramento que "abaixa" a cada bumbo (efeito de pulsar)
  }

  // ------------------------------------------------------------- composição

  /** Compõe a música da fase. */
  _compose(level, themeName) {
    const st = STYLES[themeName] || STYLES['Gramado'];
    const rand = rng(level * 7919 + 13);
    const volta = level > 6 && level < 100;                  // segunda passada pelos cenários
    const key = st.key + (volta ? 2 : 0);
    const bpm = Math.round(st.bpm * (volta ? 1.05 : 1));

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
        if (passo % 4 === 0) {
          // Tempos fortes caem em notas do acorde (fundamental, terça, quinta, oitava).
          const alvos = [0, 2, 4, 7];
          pos = alvos.reduce((m, a) => (Math.abs(a - pos) < Math.abs(m - pos) ? a : m), alvos[0]);
          if (rand() < 0.4) pos = alvos[Math.floor(rand() * alvos.length)];
        } else {
          pos += [-2, -1, -1, 1, 1, 2, 3][Math.floor(rand() * 7)];
          pos = Math.max(-1, Math.min(9, pos));
        }
        return { passo, dur, pos };
      });
    };
    const A = motivo(), B = motivo(), C = motivo(), D = motivo();
    D[D.length - 1].pos = 0;                                  // a frase termina "em casa"
    // Pergunta e resposta: A repete com final diferente, depois B e C sobem.
    const forma = [A, B, A, C, A, B, C, D];

    const lead = new Array(STEPS).fill(null);
    const bass = new Array(STEPS).fill(null);
    const arp = new Array(STEPS).fill(null);
    const stab = new Array(STEPS).fill(null);

    for (let bar = 0; bar < 8; bar++) {
      const raiz = st.prog[bar % st.prog.length];             // um acorde por compasso
      const base = bar * 16;
      const sobe = bar >= 4 ? 1 : 0;                          // segunda metade uma oitava acima

      for (const n of forma[bar]) lead[base + n.passo] = { midi: nota(raiz + n.pos, 1 + (bar >= 6 && n.pos < 3 ? 1 : 0)), dur: n.dur };

      for (let s = 0; s < 16; s++) {
        let b = null;
        if (st.bass === 'oitavas' && s % 2 === 0) b = { midi: nota(raiz, s % 4 === 0 ? -2 : -1), dur: 2 };
        else if (st.bass === 'pulsa' && s % 4 === 2) b = { midi: nota(raiz, -1), dur: 2 };
        else if (st.bass === 'pulsa' && s % 4 === 0) b = { midi: nota(raiz, -2), dur: 1 };
        else if (st.bass === 'rolando') b = { midi: nota(raiz, -2) + (s % 4 === 3 ? 12 : 0), dur: 1 };
        else if (st.bass === 'galope' && [0, 3, 4, 7, 8, 11, 12, 14].includes(s)) b = { midi: nota(raiz, -2) + (s === 14 ? 12 : 0), dur: 1 };
        bass[base + s] = b;

        // Arpejo em semicolcheias sobre o acorde.
        const graus = [0, 2, 4, 7, 9, 7, 4, 2];
        if (s % 1 === 0) arp[base + s] = { midi: nota(raiz + graus[s % 8], 1 + sobe), dur: 1 };

        // Acordes curtos no contratempo.
        if (st.stab && s % 4 === 2) stab[base + s] = [nota(raiz, 0), nota(raiz + 2, 0), nota(raiz + 4, 0)];
      }
    }

    return { st, bpm, lead, bass, arp, stab, stepDur: 60 / bpm / 4 };
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
    this.gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.5);   // entra suave
    this.gain.connect(this.audio.master);
    this.duck = ctx.createGain();
    this.duck.connect(this.gain);
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.12;
    this.paused = false;
    this.timer = setInterval(() => this._schedule(), 50);
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
    this.duck = null;
    this.song = null;
  }

  /** Pausa/continua (usado no menu de pausa). */
  setPaused(paused) {
    if (!this.song || this.paused === paused) return;
    this.paused = paused;
    const ctx = this.audio.ctx;
    this.gain.gain.cancelScheduledValues(ctx.currentTime);
    this.gain.gain.setTargetAtTime(paused ? 0.0001 : 0.3, ctx.currentTime, 0.05);
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
    const { st, lead, bass, arp, stab, stepDur } = this.song;
    const s = i % 16, bar = Math.floor(i / 16);
    const virada = bar === 7 && s >= 8;      // virada de bateria no último compasso

    const l = lead[i];
    if (l) {
      const vol = st.lead === 'triangle' ? 0.3 : 0.12;
      this._note(freq(l.midi), t, l.dur * stepDur * 0.9, st.lead, vol, this.gain, true);
      this._note(freq(l.midi) * 1.006, t, l.dur * stepDur * 0.9, st.lead === 'triangle' ? 'square' : st.lead, vol * 0.35, this.gain);
    }
    const b = bass[i];
    if (b) this._note(freq(b.midi), t, b.dur * stepDur * 0.85, 'sawtooth', 0.16, this.duck, false, 900);
    if (b) this._note(freq(b.midi), t, b.dur * stepDur * 0.85, 'sine', 0.3, this.duck);
    const a = arp[i];
    if (a) this._note(freq(a.midi), t, stepDur * 0.6, 'square', 0.035, this.duck, false, 3200);
    const c = stab[i];
    if (c) for (const m of c) this._note(freq(m), t, stepDur * 0.9, 'sawtooth', 0.045, this.duck, false, 2400);

    // Bateria
    const d = st.drums;
    let bumbo, caixa, chimbal, aberto;
    if (d === 'house' || d === 'pista') {
      bumbo = s % 4 === 0;
      caixa = s === 4 || s === 12;
      aberto = s % 4 === 2;
      chimbal = true;
    } else if (d === 'quebrada') {
      bumbo = s === 0 || s === 6 || s === 10;
      caixa = s === 4 || s === 12;
      aberto = s === 14;
      chimbal = s % 2 === 0 || s === 15;
    } else {      // rapida
      bumbo = s === 0 || s === 10 || (s === 7 && bar % 2);
      caixa = s === 4 || s === 12;
      aberto = s === 2 || s === 10;
      chimbal = true;
    }
    if (virada) { caixa = s % (s >= 12 ? 1 : 2) === 0; bumbo = s === 8; }
    if (bumbo) { this._kick(t); this._pump(t); }
    if (caixa) { this._noise(t, 0.12, virada ? 0.12 + (s - 8) * 0.015 : 0.2, 1500); this._noise(t, 0.05, 0.08, 4000); }
    if (chimbal) this._noise(t, 0.025, s % 2 ? 0.035 : 0.06, 8000);
    if (aberto) this._noise(t, 0.14, 0.06, 7000);
    if (i === 0) this._noise(t, 1.0, 0.12, 5000);        // prato no começo do ciclo
  }

  /** "Pulsar" típico da música eletrônica: abaixa o barramento a cada bumbo. */
  _pump(t) {
    const g = this.duck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.35, t);
    g.linearRampToValueAtTime(1, t + 0.16);
  }

  _note(f, t, dur, type, vol, destino, vibrato = false, corte = 0) {
    const ctx = this.audio.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (vibrato && dur > 0.25) {
      // leve "tremido" nas notas longas da melodia
      osc.frequency.setValueAtTime(f, t + dur * 0.5);
      osc.frequency.linearRampToValueAtTime(f * 1.012, t + dur * 0.75);
      osc.frequency.linearRampToValueAtTime(f, t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(vol * 0.55, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let saida = osc;
    if (corte) {
      const f2 = ctx.createBiquadFilter();
      f2.type = 'lowpass';
      f2.frequency.value = corte;
      osc.connect(f2);
      saida = f2;
    }
    saida.connect(g).connect(destino || this.gain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _kick(t) {
    const ctx = this.audio.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    g.gain.setValueAtTime(0.75, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(g).connect(this.gain);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  /** Ruído curto filtrado (caixa, palmas, chimbal, prato). */
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
