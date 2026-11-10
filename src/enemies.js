// ============================================================================
// enemies.js — Inimigos com IA simples.
// Andam pela arena célula a célula e mudam de direção ao encontrar obstáculos
// (ou, às vezes, em cruzamentos). Tipos mais difíceis aparecem nas fases
// seguintes: um mais rápido e um que persegue o jogador.
// ============================================================================
import * as THREE from 'three';
import { CONFIG, DIRS } from './config.js';
import { GridMover } from './mover.js';

/** Tipos de inimigo. `speed` multiplica a velocidade base da fase. */
const TYPES = [
  { name: 'gosma', color: 0xff5fa2, speed: 1.0, chase: 0, score: 1 },
  { name: 'veloz', color: 0x35c8ff, speed: 1.45, chase: 0, score: 2 },
  { name: 'cacador', color: 0xa46bff, speed: 1.2, chase: 0.65, score: 3 },
];

class Enemy {
  constructor(type, col, row, speed, shared) {
    this.type = type;
    this.speed = speed * type.speed;
    this.mover = new GridMover();
    this.mover.setCell(col, row);
    this.alive = true;       // ainda causa dano / pode ser atingido
    this.dying = 0;          // tempo restante da animação de derrota
    this.wait = Math.random() * 0.6;
    this.t = Math.random() * 10;
    this.angle = 0;

    // Corpo: esfera achatada com olhos (e enfeites conforme o tipo).
    const g = new THREE.Group();
    const corpo = new THREE.Mesh(shared.geoCorpo, shared.materials[type.name]);
    corpo.position.y = 0.3;
    corpo.scale.set(1, 0.85, 1);
    corpo.castShadow = true;
    g.add(corpo);
    for (const x of [-0.12, 0.12]) {
      const olho = new THREE.Mesh(shared.geoOlho, shared.matOlho);
      olho.position.set(x, 0.38, 0.25);
      const pupila = new THREE.Mesh(shared.geoPupila, shared.matPupila);
      pupila.position.set(x, 0.38, 0.32);
      g.add(olho, pupila);
    }
    if (type.name === 'veloz') {
      const antena = new THREE.Mesh(shared.geoCone, shared.matEnfeite);
      antena.position.y = 0.66;
      g.add(antena);
    } else if (type.name === 'cacador') {
      for (const x of [-0.17, 0.17]) {
        const chifre = new THREE.Mesh(shared.geoCone, shared.matEnfeite);
        chifre.position.set(x, 0.6, 0);
        chifre.rotation.z = -x * 2.2;
        g.add(chifre);
      }
    }
    this.mesh = g;
  }

  get col() { return this.mover.cellCol; }
  get row() { return this.mover.cellRow; }
}

export class EnemyManager {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.enemies = [];
    const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, ...o });
    this.shared = {
      geoCorpo: new THREE.SphereGeometry(0.34, 18, 14),
      geoOlho: new THREE.SphereGeometry(0.09, 10, 8),
      geoPupila: new THREE.SphereGeometry(0.045, 8, 6),
      geoCone: new THREE.ConeGeometry(0.08, 0.22, 8),
      matOlho: mat(0xffffff, { roughness: 0.2 }),
      matPupila: mat(0x15182e, { roughness: 0.2 }),
      matEnfeite: mat(0xffe066),
      materials: Object.fromEntries(TYPES.map((t) => [t.name, mat(t.color)])),
    };
  }

  /** Quantos inimigos ainda estão vivos. */
  get aliveCount() { return this.enemies.filter((e) => e.alive).length; }

  /** Cria os inimigos da fase nas células indicadas. */
  spawn(cells, level) {
    const base = Math.min(
      CONFIG.ENEMY_SPEED + CONFIG.ENEMY_SPEED_PER_LEVEL * (level - 1),
      CONFIG.ENEMY_SPEED_MAX
    );
    const maxTipo = Math.min(TYPES.length - 1, level - 1);   // fase 1: só o básico
    cells.forEach((c, i) => {
      const e = new Enemy(TYPES[i % (maxTipo + 1)], c.col, c.row, base, this.shared);
      this.scene.add(e.mesh);
      this.enemies.push(e);
      this._sync(e);
    });
  }

  /**
   * @param {number} dt
   * @param {(col:number,row:number)=>boolean} canEnter célula livre?
   * @param {{col:number,row:number}} alvo célula do jogador (para o tipo caçador)
   */
  update(dt, canEnter, alvo) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.t += dt;

      if (!e.alive) {
        // Animação de derrota: gira, sobe e encolhe.
        e.dying -= dt;
        const k = Math.max(0, e.dying / 0.5);
        e.mesh.scale.setScalar(k);
        e.mesh.rotation.y += dt * 18;
        e.mesh.position.y = (1 - k) * 0.6;
        if (e.dying <= 0) {
          this.scene.remove(e.mesh);
          this.enemies.splice(i, 1);
        }
        continue;
      }

      this._move(e, dt, canEnter, alvo);
      this._sync(e);

      // "Pulinhos" enquanto anda.
      const pulo = Math.abs(Math.sin(e.t * 7));
      e.mesh.position.y = pulo * 0.08;
      e.mesh.scale.set(1 + (1 - pulo) * 0.08, 0.92 + pulo * 0.12, 1 + (1 - pulo) * 0.08);
      let diff = Math.atan2(e.mover.dirX, e.mover.dirZ) - e.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      e.angle += diff * Math.min(1, dt * 10);
      e.mesh.rotation.y = e.angle;
    }
  }

  _move(e, dt, canEnter, alvo) {
    const m = e.mover;
    if (e.wait > 0) { e.wait -= dt; return; }

    let resto = e.speed * dt;
    let guarda = 0;
    while (resto > 1e-6 && guarda++ < 3) {
      if (!m.moving) {
        const d = this._chooseDir(e, canEnter, alvo);
        if (!d) { e.wait = 0.25; return; }     // encurralado: espera um pouco
        m.start(d.dx, d.dz);
      }
      resto = m.advance(resto);
    }
  }

  /** IA: segue em frente; vira ao bater em obstáculo ou, às vezes, em cruzamentos. */
  _chooseDir(e, canEnter, alvo) {
    const m = e.mover;
    const livres = DIRS.filter((d) => canEnter(m.col + d.dx, m.row + d.dz));
    if (!livres.length) return null;

    const frente = livres.find((d) => d.dx === m.dirX && d.dz === m.dirZ);
    // Evita dar meia-volta se houver outra saída.
    const semVolta = livres.filter((d) => !(d.dx === -m.dirX && d.dz === -m.dirZ));
    const opcoes = semVolta.length ? semVolta : livres;

    // Tipo caçador: tende a escolher a direção que o aproxima do jogador.
    if (alvo && Math.random() < e.type.chase) {
      let melhor = opcoes[0], menor = Infinity;
      for (const d of opcoes) {
        const dist = Math.abs(m.col + d.dx - alvo.col) + Math.abs(m.row + d.dz - alvo.row);
        if (dist < menor) { menor = dist; melhor = d; }
      }
      return melhor;
    }

    if (frente && Math.random() > CONFIG.ENEMY_TURN_CHANCE) return frente;
    return opcoes[Math.floor(Math.random() * opcoes.length)];
  }

  _sync(e) {
    const { COLS, ROWS } = CONFIG;
    e.mesh.position.x = e.mover.gx - (COLS - 1) / 2;
    e.mesh.position.z = e.mover.gz - (ROWS - 1) / 2;
  }

  /** Derrota um inimigo. Devolve o multiplicador de pontos do tipo. */
  kill(e) {
    if (!e.alive) return 0;
    e.alive = false;
    e.dying = 0.5;
    return e.type.score;
  }

  clear() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies.length = 0;
  }
}
