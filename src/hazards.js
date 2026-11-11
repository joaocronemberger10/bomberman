// ============================================================================
// hazards.js — Perigos típicos de cada cenário.
//
//   mud     (Gramado)     poças de lama: quem pisa anda devagar
//   spikes  (Deserto)     espinhos que sobem do chão de tempos em tempos
//   ice     (Geleira)     poças de gelo: quem entra escorrega sem controle
//   laser   (Noite Neon)  feixes que ligam e desligam ao longo de corredores
//   balls   (Doceria)     balas gigantes que rolam pela arena
//   meteor  (Vulcão)      bolas de fogo que caem do céu
//
// Lama e gelo afetam todos (menos o fantasma). Espinhos, lasers e balas ferem
// o jogador e eliminam rivais. As bolas de fogo viram chamas: atingem qualquer
// um e ainda destroem blocos.
// ============================================================================
import * as THREE from 'three';
import { CONFIG, DIRS } from './config.js';
import { CELL } from './map.js';
import { GridMover } from './mover.js';

const { COLS, ROWS } = CONFIG;

// Ciclos (em segundos) dos perigos que ligam e desligam.
const SPIKE = { period: 3.8, warn: 2.0, up: 2.7 };     // baixo → aviso → levantado
const LASER = { period: 5.2, warn: 3.0, on: 3.9 };     // desligado → aviso → ligado
const METEOR_WARN = 1.4;                               // tempo do aviso até a queda

export class HazardManager {
  /**
   * @param {object} hooks  onImpact(col, row) — uma bola de fogo caiu nesta célula
   */
  constructor(scene, map, hooks = {}) {
    this.map = map;
    this.hooks = hooks;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.kind = null;
    this.t = 0;
    this.tiles = new Map();   // índice da célula → { type, ... } (lama, gelo, espinhos)
    this.lasers = [];
    this.balls = [];
    this.meteors = [];
    this.meteorTimer = 0;
    this.meteorEvery = 2;

    // Geometrias e materiais compartilhados.
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.geo = {
      poca: new THREE.CircleGeometry(0.44, 20),
      placa: new THREE.BoxGeometry(0.84, 0.04, 0.84),
      espinho: new THREE.ConeGeometry(0.09, 0.42, 6),
      emissor: new THREE.BoxGeometry(0.34, 0.3, 0.34),
      feixe: new THREE.BoxGeometry(1, 0.1, 0.1),
      bala: new THREE.SphereGeometry(0.4, 20, 14),
      anel: new THREE.RingGeometry(0.3, 0.44, 24),
      fogo: new THREE.SphereGeometry(0.3, 14, 10),
    };
    this.mat = {
      lama: std({ color: 0x5b3a1e, roughness: 0.35 }),
      gelo: std({ color: 0x58c4ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 }),
      placa: std({ color: 0x3d2a17, roughness: 0.9 }),
      espinho: std({ color: 0xe9e2d0, roughness: 0.3, metalness: 0.4 }),
      emissor: std({ color: 0x1b1238, roughness: 0.4, emissive: 0xff2bd0, emissiveIntensity: 0.6 }),
      feixe: new THREE.MeshBasicMaterial({ color: 0xff3fd0, transparent: true, opacity: 0.9 }),
      anel: new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
      fogo: new THREE.MeshBasicMaterial({ color: 0xffa530 }),
    };
    // Bala listrada (textura desenhada por código).
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const cores = ['#ff5fa2', '#ffffff', '#5fd0ff', '#ffffff'];
    for (let i = 0; i < 8; i++) { g.fillStyle = cores[i % 4]; g.fillRect(i * 8, 0, 8, 64); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.mat.bala = std({ map: tex, roughness: 0.25 });
  }

  // ------------------------------------------------------------ montagem

  /** Remove todos os perigos da arena. */
  clear() {
    this.group.clear();
    this.tiles.clear();
    this.lasers.length = 0;
    this.balls.length = 0;
    this.meteors.length = 0;
    this.kind = null;
    this.t = 0;
  }

  /**
   * Monta os perigos da fase.
   * @param {string} kind       tipo (veja o topo do arquivo)
   * @param {number} intensity  1 nas primeiras fases, 2 na segunda volta
   * @param {Array<{col:number,row:number}>} evitar  células a manter livres (onde os inimigos nascem)
   */
  setup(kind, intensity = 1, evitar = []) {
    this.clear();
    this.kind = kind;
    const forte = intensity > 1;

    if (kind === 'mud' || kind === 'ice') {
      const mat = kind === 'mud' ? this.mat.lama : this.mat.gelo;
      for (const c of this._pickCells(forte ? 20 : 13)) {
        const m = new THREE.Mesh(this.geo.poca, mat);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = Math.random() * 6;
        m.scale.set(0.9 + Math.random() * 0.25, 0.9 + Math.random() * 0.25, 1);
        this.map.cellToWorld(c.col, c.row, m.position);
        m.position.y = 0.012;
        m.receiveShadow = true;
        this.group.add(m);
        this.tiles.set(this.map.index(c.col, c.row), { type: kind });
      }
    } else if (kind === 'spikes') {
      this._pickCells(forte ? 16 : 10).forEach((c, i) => {
        const g = new THREE.Group();
        const placa = new THREE.Mesh(this.geo.placa, this.mat.placa);
        placa.position.y = 0.02;
        placa.receiveShadow = true;
        const pontas = new THREE.Group();
        for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2], [0, 0]]) {
          const e = new THREE.Mesh(this.geo.espinho, this.mat.espinho);
          e.position.set(x, 0, z);
          e.castShadow = true;
          pontas.add(e);
        }
        g.add(placa, pontas);
        this.map.cellToWorld(c.col, c.row, g.position);
        this.group.add(g);
        // Dois grupos alternados: nunca sobem todos ao mesmo tempo.
        this.tiles.set(this.map.index(c.col, c.row), { type: 'spikes', pontas, offset: (i % 2) * SPIKE.period / 2 });
      });
    } else if (kind === 'laser') {
      // Feixes ao longo de corredores (linhas e colunas ímpares, longe do início).
      const linhas = [];
      for (let n = 3; n <= ROWS - 2; n += 2) linhas.push({ axis: 'row', n });
      for (let n = 3; n <= COLS - 2; n += 2) linhas.push({ axis: 'col', n });
      this._shuffle(linhas);
      linhas.slice(0, forte ? 5 : 3).forEach((l, i) => {
        const len = l.axis === 'row' ? COLS - 2 : ROWS - 2;
        const feixe = new THREE.Mesh(this.geo.feixe, this.mat.feixe.clone());
        feixe.scale.x = len;
        const meio = this.map.cellToWorld(l.axis === 'row' ? (COLS - 1) / 2 : l.n, l.axis === 'row' ? l.n : (ROWS - 1) / 2);
        feixe.position.set(meio.x, 0.32, meio.z);
        if (l.axis === 'col') feixe.rotation.y = Math.PI / 2;
        feixe.visible = false;
        this.group.add(feixe);
        // Emissores sobre as paredes da borda, nas duas pontas.
        for (const ponta of [0, l.axis === 'row' ? COLS - 1 : ROWS - 1]) {
          const e = new THREE.Mesh(this.geo.emissor, this.mat.emissor);
          const p = this.map.cellToWorld(l.axis === 'row' ? ponta : l.n, l.axis === 'row' ? l.n : ponta);
          e.position.set(p.x, 0.8, p.z);
          this.group.add(e);
        }
        this.lasers.push({ ...l, feixe, offset: i * 1.3, state: 'off' });
      });
    } else if (kind === 'balls') {
      // Nascem em células vazias, longe do jogador e dos inimigos.
      const longe = (c) => evitar.every((e) => Math.abs(e.col - c.col) + Math.abs(e.row - c.row) >= 3);
      let livres = this._pickCells(forte ? 4 : 2, (c) => this.map.isEmpty(c.col, c.row) && longe(c), 6);
      if (!livres.length) {
        // Sem espaço vazio adequado: abre um lugar sob um bloco distante.
        livres = this._pickCells(forte ? 4 : 2, longe, 6);
        for (const c of livres) this.map.destroyBlock(c.col, c.row);
      }
      for (const c of livres) {
        const mesh = new THREE.Mesh(this.geo.bala, this.mat.bala);
        mesh.castShadow = true;
        mesh.position.set(c.col - (COLS - 1) / 2, 0.4, c.row - (ROWS - 1) / 2);
        this.group.add(mesh);
        const mover = new GridMover();
        mover.setCell(c.col, c.row);
        this.balls.push({ mover, mesh, speed: forte ? 1.9 : 1.5, wait: 2.5 });
      }
    } else if (kind === 'meteor') {
      this.meteorEvery = forte ? 1.2 : 2.0;
      this.meteorTimer = 2.5;      // um respiro no começo da fase
    }
  }

  _shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Sorteia células internas (fora das paredes, da porta e de perto do início). */
  _pickCells(n, filtro = null, distMin = 3) {
    const start = this.map.playerStart;
    const cells = [];
    for (let row = 1; row < ROWS - 1; row++) {
      for (let col = 1; col < COLS - 1; col++) {
        if (this.map.get(col, row) === CELL.WALL || this.map.isDoor(col, row)) continue;
        if (Math.abs(col - start.col) + Math.abs(row - start.row) < distMin) continue;
        if (filtro && !filtro({ col, row })) continue;
        cells.push({ col, row });
      }
    }
    return this._shuffle(cells).slice(0, n);
  }

  // ------------------------------------------------------------- consultas

  /** Multiplicador de velocidade do terreno nesta célula. */
  speedFactor(col, row) {
    const t = this.tiles.get(this.map.index(col, row));
    if (!t) return 1;
    return t.type === 'mud' ? 0.5 : t.type === 'ice' ? 1.45 : 1;
  }

  /** A célula é gelo (quem entra continua escorregando)? */
  isIce(col, row) {
    const t = this.tiles.get(this.map.index(col, row));
    return !!t && t.type === 'ice';
  }

  /** Há um perigo ativo (que fere) nesta célula agora? */
  hits(col, row) {
    const t = this.tiles.get(this.map.index(col, row));
    if (t && t.type === 'spikes' && t.up) return true;
    for (const l of this.lasers) {
      if (l.state === 'on' && (l.axis === 'row' ? row === l.n : col === l.n)) return true;
    }
    for (const b of this.balls) {
      if (b.mover.cellCol === col && b.mover.cellRow === row) return true;
    }
    return false;
  }

  /**
   * Acrescenta os perigos do cenário ao mapa de perigo da IA dos rivais
   * (segundos até a célula ferir; 0 = já está ferindo).
   */
  addDanger(danger) {
    const marca = (col, row, t) => {
      if (!this.map.inBounds(col, row)) return;
      const i = this.map.index(col, row);
      if (t < danger[i]) danger[i] = t;
    };
    for (const [i, t] of this.tiles) {
      if (t.type === 'spikes' && (t.up || t.warn)) { if (danger[i] > (t.up ? 0 : 0.5)) danger[i] = t.up ? 0 : 0.5; }
    }
    for (const l of this.lasers) {
      if (l.state === 'off') continue;
      const len = l.axis === 'row' ? COLS : ROWS;
      for (let k = 1; k < len - 1; k++) marca(l.axis === 'row' ? k : l.n, l.axis === 'row' ? l.n : k, l.state === 'on' ? 0 : 0.6);
    }
    for (const b of this.balls) {
      const m = b.mover;
      marca(m.cellCol, m.cellRow, 0);
      for (let k = 1; k <= 5; k++) marca(m.toCol + m.dirX * (k - 1), m.toRow + m.dirZ * (k - 1), 0.5 * k);
    }
    for (const mt of this.meteors) marca(mt.col, mt.row, mt.t);
  }

  // ------------------------------------------------------------ atualização

  /**
   * @param {object} ctx  canEnter(col,row) e player { col, row, dead }
   */
  update(dt, ctx) {
    this.t += dt;

    // Espinhos: sobem e descem em ciclo, com um aviso antes.
    for (const t of this.tiles.values()) {
      if (t.type !== 'spikes') continue;
      const fase = (this.t + t.offset) % SPIKE.period;
      t.up = fase >= SPIKE.up;
      t.warn = !t.up && fase >= SPIKE.warn;
      const alvo = t.up ? 0.2 : t.warn ? -0.08 + Math.sin(this.t * 40) * 0.015 : -0.26;
      t.pontas.position.y += (alvo - t.pontas.position.y) * Math.min(1, dt * 22);
    }

    // Lasers: desligado → piscando (aviso) → ligado.
    for (const l of this.lasers) {
      const fase = (this.t + l.offset) % LASER.period;
      l.state = fase >= LASER.on ? 'on' : fase >= LASER.warn ? 'warn' : 'off';
      l.feixe.visible = l.state !== 'off';
      if (l.state === 'warn') {
        l.feixe.scale.set(l.feixe.scale.x, 0.3, 0.3);
        l.feixe.material.opacity = Math.floor(this.t * 12) % 2 ? 0.7 : 0.15;
      } else if (l.state === 'on') {
        const pulso = 1.6 + Math.sin(this.t * 30) * 0.3;
        l.feixe.scale.set(l.feixe.scale.x, pulso, pulso);
        l.feixe.material.opacity = 0.95;
      }
    }

    // Balas gigantes: rolam em linha reta e mudam de direção ao bater.
    for (const b of this.balls) {
      const m = b.mover;
      if (b.wait > 0 && !m.moving) { b.wait -= dt; }
      else {
        let resto = b.speed * dt;
        let guarda = 0;
        while (resto > 1e-6 && guarda++ < 3) {
          if (!m.moving) {
            const livres = DIRS.filter((d) => ctx.canEnter(m.col + d.dx, m.row + d.dz));
            if (!livres.length) { b.wait = 0.3; break; }
            const frente = livres.find((d) => d.dx === m.dirX && d.dz === m.dirZ);
            const semVolta = livres.filter((d) => !(d.dx === -m.dirX && d.dz === -m.dirZ));
            const opcoes = semVolta.length ? semVolta : livres;
            const d = frente && Math.random() < 0.8 ? frente : opcoes[Math.floor(Math.random() * opcoes.length)];
            m.start(d.dx, d.dz);
          }
          const antes = resto;
          resto = m.advance(resto);
          // Gira conforme rola.
          const andou = antes - resto;
          b.mesh.rotation.x += m.dirZ * andou * 2.5;
          b.mesh.rotation.z -= m.dirX * andou * 2.5;
        }
      }
      b.mesh.position.set(m.gx - (COLS - 1) / 2, 0.4, m.gz - (ROWS - 1) / 2);
    }

    // Bolas de fogo: um aviso no chão e, logo depois, a queda.
    if (this.kind === 'meteor') {
      this.meteorTimer -= dt;
      if (this.meteorTimer <= 0) {
        this.meteorTimer = this.meteorEvery * (0.7 + Math.random() * 0.6);
        this._spawnMeteor(ctx.player);
      }
      for (let i = this.meteors.length - 1; i >= 0; i--) {
        const mt = this.meteors[i];
        mt.t -= dt;
        const k = Math.max(0, mt.t / METEOR_WARN);                 // 1 → 0
        mt.anel.scale.setScalar(1.25 - k * 0.6 + Math.sin(this.t * 18) * 0.05);
        mt.anel.material.opacity = 0.45 + (1 - k) * 0.5;
        mt.bola.position.y = 0.3 + k * k * 9;
        mt.bola.scale.setScalar(1 + Math.sin(this.t * 30) * 0.12);
        if (mt.t <= 0) {
          this.group.remove(mt.anel, mt.bola);
          mt.anel.material.dispose();
          this.meteors.splice(i, 1);
          if (this.hooks.onImpact) this.hooks.onImpact(mt.col, mt.row);
        }
      }
    }
  }

  _spawnMeteor(player) {
    // Pouco mais da metade das bolas mira o jogador ou uma célula vizinha;
    // o resto cai em qualquer lugar. Ficar parado é perigoso.
    let col, row;
    for (let tentativa = 0; tentativa < 12; tentativa++) {
      if (player && !player.dead && Math.random() < 0.55) {
        col = player.col + Math.floor(Math.random() * 3) - 1;
        row = player.row + Math.floor(Math.random() * 3) - 1;
      } else {
        col = 1 + Math.floor(Math.random() * (COLS - 2));
        row = 1 + Math.floor(Math.random() * (ROWS - 2));
      }
      if (this.map.get(col, row) !== CELL.WALL && !this.meteors.some((m) => m.col === col && m.row === row)) break;
      col = undefined;
    }
    if (col === undefined) return;

    const anel = new THREE.Mesh(this.geo.anel, this.mat.anel.clone());
    anel.rotation.x = -Math.PI / 2;
    const p = this.map.cellToWorld(col, row);
    // Sobre um bloco, o aviso aparece em cima dele.
    anel.position.set(p.x, this.map.get(col, row) === CELL.BLOCK ? 0.62 : 0.03, p.z);
    const bola = new THREE.Mesh(this.geo.fogo, this.mat.fogo);
    bola.position.set(p.x, 9, p.z);
    this.group.add(anel, bola);
    this.meteors.push({ col, row, t: METEOR_WARN, anel, bola });
  }
}
