// ============================================================================
// enemies.js — Inimigos: rivais e monstros.
//
// RIVAIS (os bonecos de time) jogam como o jogador: soltam bombas perto de
// blocos e de alvos, e fogem das explosões. Cada tipo usa um modelo GLB
// (veja ENEMY_MODEL_PATHS em config.js); se o arquivo faltar, aparece um
// boneco provisório.
//
// MONSTROS são feitos de formas simples e atacam qualquer um: o contato fere
// o jogador e elimina rivais.
//   gosma     anda devagar pela arena
//   fantasma  atravessa blocos destrutíveis
//   touro     dispara em linha reta quando vê alguém
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG, DIRS, ENEMY_MODEL_PATHS } from './config.js';
import { CELL } from './map.js';
import { GridMover } from './mover.js';
import { normalizeModel } from './model.js';

/** Tipos de inimigo. `speed` multiplica a velocidade base da fase. */
const TYPES = {
  // --- rivais ---
  flamengo: { kind: 'rival', color: 0xe0202a, speed: 1.0, chase: 0.15, score: 2 },
  fluminense: { kind: 'rival', color: 0x1f8a5b, speed: 1.35, chase: 0.15, score: 3 },
  botafogo: { kind: 'rival', color: 0xe8e8f0, speed: 1.15, chase: 0.7, score: 4 },
  // --- monstros ---
  gosma: { kind: 'monster', color: 0x7ddc3a, speed: 0.8, chase: 0, score: 1 },
  fantasma: { kind: 'monster', color: 0xdfe6ff, speed: 0.7, chase: 0.5, score: 2, ghost: true },
  touro: { kind: 'monster', color: 0x9c2b2b, speed: 0.9, chase: 0, score: 3, charge: 2.6 },
};
for (const nome in TYPES) TYPES[nome].name = nome;

class Enemy {
  constructor(type, col, row, speed, visual) {
    this.type = type;
    this.kind = type.kind;
    this.speed = speed * type.speed;
    this.mover = new GridMover();
    this.mover.setCell(col, row);
    this.alive = true;       // ainda causa dano / pode ser atingido
    this.dying = 0;          // tempo restante da animação de derrota
    this.wait = 0.4 + Math.random() * 0.8;
    this.t = Math.random() * 10;
    this.angle = 0;
    this.charging = false;   // touro em disparada

    // Só os rivais usam estes campos (preenchidos em spawn).
    this.range = 2;
    this.maxBombs = 1;
    this.bombDelay = 3;
    this.cooldown = 1.5 + Math.random() * 2;

    // mesh: posição/rotação na arena | visual: o que é desenhado (provisório ou GLB)
    this.mesh = new THREE.Group();
    this.visual = visual;
    this.mesh.add(visual);
    this.mixer = null;       // animação do modelo GLB (quando houver)
  }

  /** Troca o boneco provisório por uma cópia do modelo GLB do tipo. */
  useModel(template) {
    const copia = cloneSkinned(template.scene);
    this.mesh.remove(this.visual);
    this.visual = copia;
    this.mesh.add(copia);
    this.mesh.scale.setScalar(1);
    if (template.walk) {
      this.mixer = new THREE.AnimationMixer(copia);
      const acao = this.mixer.clipAction(template.walk);
      acao.play();
      acao.time = Math.random() * template.walk.duration;   // cada um num passo diferente
    }
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
      geoSaia: new THREE.CylinderGeometry(0.34, 0.3, 0.3, 14, 1, true),
      matOlho: mat(0xffffff, { roughness: 0.2 }),
      matPupila: mat(0x15182e, { roughness: 0.2 }),
      matChifre: mat(0xfff2c9),
      materials: {},
    };
    for (const nome in TYPES) {
      const t = TYPES[nome];
      this.shared.materials[nome] = mat(t.color, t.ghost
        ? { transparent: true, opacity: 0.72, emissive: 0x8090ff, emissiveIntensity: 0.35, side: THREE.DoubleSide }
        : {});
    }

    // Modelos GLB dos rivais: { scene, walk }. Preenchido conforme carregam.
    this.templates = {};
    const loader = new GLTFLoader();
    for (const nome in ENEMY_MODEL_PATHS) {
      const type = TYPES[nome];
      const path = ENEMY_MODEL_PATHS[nome];
      if (!type || !path) continue;
      loader.load(path, (gltf) => {
        try {
          const clips = gltf.animations || [];
          this.templates[nome] = {
            scene: normalizeModel(gltf.scene, CONFIG.ENEMY_HEIGHT),
            walk: clips.find((c) => /walk|run|andar|corr/i.test(c.name)) || clips[0] || null,
          };
          // Atualiza os inimigos desse tipo que já estão na arena.
          for (const e of this.enemies) if (e.type === type && e.alive) e.useModel(this.templates[nome]);
        } catch (err) {
          console.warn(`[enemies] Falha ao preparar "${path}"; usando o provisório.`, err);
        }
      }, undefined, () => console.info(`[enemies] "${path}" não encontrado — usando o inimigo provisório.`));
    }
  }

  /** Quantos inimigos (rivais + monstros) ainda estão vivos. */
  get aliveCount() { return this.enemies.filter((e) => e.alive).length; }

  /**
   * Cria os inimigos da fase.
   * @param {Array<{col:number,row:number}>} cells células de nascimento
   * @param {object} setup resultado de levelSetup() em config.js
   */
  spawn(cells, setup) {
    const nomes = [...setup.rivals, ...setup.monsters];
    cells.forEach((c, i) => {
      const type = TYPES[nomes[i]];
      if (!type) return;
      const e = new Enemy(type, c.col, c.row, setup.speed, this._buildVisual(type));
      if (e.kind === 'rival') {
        e.range = setup.rivalRange;
        e.maxBombs = setup.rivalBombs;
        e.bombDelay = setup.rivalBombDelay;
        if (this.templates[type.name]) e.useModel(this.templates[type.name]);
      }
      this.scene.add(e.mesh);
      this.enemies.push(e);
      this._sync(e);
    });
  }

  // ------------------------------------------------------------- aparência

  /** Corpo feito de formas simples (monstros e rivais sem modelo GLB). */
  _buildVisual(type) {
    const s = this.shared;
    const g = new THREE.Group();
    const corpo = new THREE.Mesh(s.geoCorpo, s.materials[type.name]);
    corpo.position.y = 0.3;
    corpo.scale.set(1, 0.85, 1);
    corpo.castShadow = !type.ghost;
    g.add(corpo);
    for (const x of [-0.12, 0.12]) {
      const olho = new THREE.Mesh(s.geoOlho, s.matOlho);
      olho.position.set(x, 0.38, 0.25);
      const pupila = new THREE.Mesh(s.geoPupila, s.matPupila);
      pupila.position.set(x, 0.38, 0.32);
      g.add(olho, pupila);
    }
    if (type.ghost) {
      // Fantasma: "lençol" translúcido que flutua.
      const saia = new THREE.Mesh(s.geoSaia, s.materials[type.name]);
      saia.position.y = 0.16;
      g.add(saia);
      corpo.position.y = 0.36;
      corpo.scale.set(1, 1, 1);
    } else if (type.charge) {
      // Touro: chifres grandes apontando para a frente.
      for (const x of [-0.2, 0.2]) {
        const chifre = new THREE.Mesh(s.geoCone, s.matChifre);
        chifre.scale.setScalar(1.6);
        chifre.position.set(x, 0.5, 0.16);
        chifre.rotation.set(0.9, 0, -x * 2.4);
        g.add(chifre);
      }
      corpo.scale.set(1.15, 0.95, 1.15);
    } else if (type.kind === 'monster') {
      // Gosma: achatada, com uma "antena".
      const antena = new THREE.Mesh(s.geoCone, s.materials[type.name]);
      antena.position.y = 0.62;
      g.add(antena);
    }
    return g;
  }

  // ------------------------------------------------------------ atualização

  /**
   * @param {number} dt
   * @param {object} ctx  informações do jogo usadas pela IA:
   *   canEnter(col,row)   célula livre (sem bloco nem bomba)?
   *   bombs               BombManager (ou null na tela inicial)
   *   danger              mapa de perigo (Float32Array) ou null
   *   player              { col, row, dead } ou null
   *   placeBomb(enemy)    pede ao jogo para o rival soltar uma bomba
   */
  update(dt, ctx) {
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

      if (e.cooldown > 0) e.cooldown -= dt;
      this._move(e, dt, ctx);
      this._sync(e);

      if (e.mixer) {
        // Modelo GLB: a caminhada acompanha a velocidade e para quando ele espera.
        e.mixer.update(e.mover.moving ? dt * e.speed / CONFIG.ENEMY_SPEED * 1.15 : 0);
      } else if (e.type.ghost) {
        e.mesh.position.y = 0.25 + Math.sin(e.t * 3) * 0.08;      // flutua
      } else {
        // Formas simples: "pulinhos" enquanto anda (mais rápidos em disparada).
        const pulo = Math.abs(Math.sin(e.t * (e.charging ? 16 : 7)));
        e.mesh.position.y = pulo * 0.08;
        e.mesh.scale.set(1 + (1 - pulo) * 0.08, 0.92 + pulo * 0.12, 1 + (1 - pulo) * 0.08);
      }
      let diff = Math.atan2(e.mover.dirX, e.mover.dirZ) - e.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      e.angle += diff * Math.min(1, dt * 10);
      e.mesh.rotation.y = e.angle;
    }
  }

  _move(e, dt, ctx) {
    const m = e.mover;
    if (e.wait > 0 && !m.moving) { e.wait -= dt; return; }

    let resto = e.speed * (e.charging ? e.type.charge : 1) * dt;
    let guarda = 0;
    while (resto > 1e-6 && guarda++ < 3) {
      if (!m.moving) {
        const d = e.kind === 'rival' ? this._rivalThink(e, ctx) : this._monsterThink(e, ctx);
        if (!d) { e.wait = 0.15; e.charging = false; return; }   // sem saída segura: espera
        m.start(d.dx, d.dz);
      }
      resto = m.advance(resto);
    }
  }

  // ------------------------------------------------------------- IA: rivais

  /** Decide o próximo passo de um rival (e, se valer a pena, solta uma bomba). */
  _rivalThink(e, ctx) {
    const m = e.mover;
    const danger = ctx.danger;
    const idx = (c, r) => this.map.index(c, r);

    // Monstros também são ameaça: o rival evita ficar encostado neles.
    const perto = new Set();
    for (const o of this.enemies) {
      if (!o.alive || o.kind !== 'monster') continue;
      for (const [c, r] of [[o.mover.col, o.mover.row], [o.mover.toCol, o.mover.toRow]]) {
        perto.add(idx(c, r));
        // Do touro, que dispara em linha reta, mantém distância maior.
        const raio = o.type.charge ? 4 : 1;
        for (const d of DIRS) for (let n = 1; n <= raio; n++) perto.add(idx(c + d.dx * n, r + d.dz * n));
      }
    }
    const ameacada = (i) => (danger && danger[i] < Infinity) || perto.has(i);
    const livre = (c, r) => ctx.canEnter(c, r) && !(danger && danger[idx(c, r)] <= 0.35);

    // 1) Em perigo (explosão a caminho ou monstro por perto): foge.
    if (ameacada(idx(m.col, m.row))) {
      return this._escape(m.col, m.row, livre, ameacada, 7);
    }

    // 2) Solta uma bomba se houver bloco ou alvo ao alcance — e uma rota de fuga.
    if (ctx.bombs && e.cooldown <= 0 && ctx.bombs.countOf(e) < e.maxBombs && !ctx.bombs.hasBomb(m.col, m.row)) {
      const { cells, blocks } = ctx.bombs.blastCells(m.col, m.row, e.range);
      const p = ctx.player;
      const acerta = (col, row) => cells.some((c) => c.col === col && c.row === row);
      let quer = p && !p.dead && acerta(p.col, p.row);
      if (!quer) quer = this.enemies.some((o) => o.alive && o.kind === 'monster' && acerta(o.col, o.row));
      if (!quer) quer = blocks.length > 0 && Math.random() < 0.55;
      if (quer) {
        const explosao = new Set(cells.map((c) => idx(c.col, c.row)));
        const fuga = this._escape(m.col, m.row, livre, (i) => ameacada(i) || explosao.has(i), 3);
        if (fuga) {
          ctx.placeBomb(e);
          e.cooldown = e.bombDelay * (0.7 + Math.random() * 0.6);
          return fuga;
        }
        e.cooldown = 0.4;   // sem fuga daqui: tenta de novo mais adiante
      }
    }

    // 3) Passeia (sem pisar em células ameaçadas); alguns perseguem o jogador.
    return this._wander(e, (c, r) => livre(c, r) && !ameacada(idx(c, r)), ctx.player);
  }

  /**
   * Busca em largura pela célula segura mais próxima. Devolve a direção do
   * primeiro passo, ou null se não houver rota.
   * @param {(i:number)=>boolean} ameacada diz se a célula (índice) é perigosa
   */
  _escape(col, row, livre, ameacada, maxPassos) {
    const visto = new Set([this.map.index(col, row)]);
    let fila = [{ col, row, first: null }];
    for (let passo = 1; passo <= maxPassos && fila.length; passo++) {
      const prox = [];
      for (const n of fila) {
        for (const d of DIRS) {
          const c = n.col + d.dx, r = n.row + d.dz;
          const i = this.map.index(c, r);
          if (visto.has(i) || !livre(c, r)) continue;
          visto.add(i);
          const first = n.first || d;
          if (!ameacada(i)) return first;
          prox.push({ col: c, row: r, first });
        }
      }
      fila = prox;
    }
    return null;
  }

  // ------------------------------------------------------------ IA: monstros

  _monsterThink(e, ctx) {
    const m = e.mover;
    const flame = (c, r) => ctx.bombs && ctx.bombs.isFlame(c, r);
    const livre = e.type.ghost
      // Fantasma: atravessa blocos destrutíveis, mas não paredes nem bombas.
      ? (c, r) => this.map.get(c, r) !== CELL.WALL && !(ctx.bombs && ctx.bombs.hasBomb(c, r)) && !flame(c, r)
      : (c, r) => ctx.canEnter(c, r) && !flame(c, r);

    e.charging = false;
    if (e.type.charge) {
      // Touro: se enxergar alguém em linha reta, dispara naquela direção.
      for (const d of DIRS) {
        for (let n = 1; n <= 5; n++) {
          const c = m.col + d.dx * n, r = m.row + d.dz * n;
          if (!livre(c, r)) break;
          if (this._targetAt(c, r, ctx.player)) { e.charging = true; return d; }
        }
      }
    }
    return this._wander(e, livre, ctx.player);
  }

  /** Há jogador ou rival vivo nesta célula? */
  _targetAt(col, row, player) {
    if (player && !player.dead && player.col === col && player.row === row) return true;
    return this.enemies.some((o) => o.alive && o.kind === 'rival' && o.col === col && o.row === row);
  }

  /** Passeio: segue em frente; vira ao bater em obstáculo ou, às vezes, em cruzamentos. */
  _wander(e, livre, player) {
    const m = e.mover;
    const livres = DIRS.filter((d) => livre(m.col + d.dx, m.row + d.dz));
    if (!livres.length) return null;

    const frente = livres.find((d) => d.dx === m.dirX && d.dz === m.dirZ);
    // Evita dar meia-volta se houver outra saída.
    const semVolta = livres.filter((d) => !(d.dx === -m.dirX && d.dz === -m.dirZ));
    const opcoes = semVolta.length ? semVolta : livres;

    // Perseguidores tendem a escolher a direção que os aproxima do jogador.
    if (player && !player.dead && Math.random() < e.type.chase) {
      let melhor = opcoes[0], menor = Infinity;
      for (const d of opcoes) {
        const dist = Math.abs(m.col + d.dx - player.col) + Math.abs(m.row + d.dz - player.row);
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
