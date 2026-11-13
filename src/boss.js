// ============================================================================
// boss.js — Fases de chefão (uma a cada duas fases concluídas).
//
// São 6 chefões, cada um com aparência e poderes próprios:
//   1 Rei Gosma       salto esmagador + chama filhotes
//   2 Robô Laser      lasers em linha/cruz + teletransporte
//   3 Dragão de Lava  chuva de bolas de fogo + investida
//   4 Yeti Gigante    sopro congelante (deixa lento) + bolas de neve rolando
//   5 Mago Sombrio    escudo mágico + bombas mágicas + teletransporte
//   6 Rei das Bombas  chefão final: bombas, investida, salto e filhotes
//
// O chefão só toma dano das bombas do jogador (as dele não o ferem) e fica
// alguns instantes invencível depois de cada acerto. Com metade da vida ele
// fica furioso: mais rápido e usando os poderes com mais frequência.
// ============================================================================
import * as THREE from 'three';
import { CONFIG, DIRS } from './config.js';
import { CELL } from './map.js';
import { GridMover } from './mover.js';

const { COLS, ROWS } = CONFIG;

/** Os chefões, na ordem em que aparecem. */
export const BOSSES = [
  { id: 'gosma', nome: 'REI GOSMA', tema: 'Gramado', cor: 0x5fd23a, hp: 4, speed: 1.25, cooldown: 3.2,
    poderes: ['slam', 'summon'], summon: 'gosma', dica: 'Ele pula e esmaga tudo em cruz!' },
  { id: 'robo', nome: 'ROBÔ LASER', tema: 'Doceria', cor: 0x3aa8ff, hp: 5, speed: 1.45, cooldown: 3.0,
    poderes: ['laser', 'teleport', 'laser'], dica: 'Saia da faixa vermelha antes do laser!' },
  { id: 'dragao', nome: 'DRAGÃO DE LAVA', tema: 'Vulcão', cor: 0xff5a1f, hp: 6, speed: 1.35, cooldown: 2.9,
    poderes: ['meteor', 'charge', 'meteor'], dica: 'Chuva de fogo e investidas em linha reta!' },
  { id: 'yeti', nome: 'YETI GIGANTE', tema: 'Geleira', cor: 0xe8f6ff, hp: 6, speed: 1.55, cooldown: 2.7,
    poderes: ['freeze', 'snowball', 'snowball'], dica: 'O sopro gelado deixa você lento!' },
  { id: 'mago', nome: 'MAGO SOMBRIO', tema: 'Deserto', cor: 0x8a3cff, hp: 7, speed: 1.3, cooldown: 2.6,
    poderes: ['shield', 'bombs', 'teleport', 'summon'], summon: 'fantasma', dica: 'Ataque quando o escudo dele cair!' },
  { id: 'rei', nome: 'REI DAS BOMBAS', tema: 'Noite Neon', cor: 0xffc21f, hp: 9, speed: 1.65, cooldown: 2.3,
    poderes: ['bombs', 'charge', 'slam', 'summon', 'meteor'], summon: 'touro', dica: 'O chefão final usa de tudo!' },
];

const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class BossManager {
  /**
   * @param {object} hooks  o que o chefão pede ao jogo:
   *   flame(col,row)            chama do chefão (fere o jogador, destrói blocos)
   *   placeBomb(col,row,range)  bomba do chefão
   *   summon(cells, tipo)       cria monstros
   *   slowPlayer(seg)           deixa o jogador lento
   *   hurtPlayer()              dano direto no jogador
   *   particles(x,z,cores)      partículas
   *   shake(forca) / sound(nome) / toast(texto)
   *   onDefeated()              o chefão foi derrotado
   */
  constructor(scene, map, hooks) {
    this.scene = scene;
    this.map = map;
    this.hooks = hooks;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.boss = null;
    this.fx = [];

    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.45, ...o });
    this.geo = {
      sphere: new THREE.SphereGeometry(0.5, 22, 16),
      box: new THREE.BoxGeometry(1, 1, 1),
      cone: new THREE.ConeGeometry(0.5, 1, 14),
      cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
      marker: new THREE.PlaneGeometry(0.92, 0.92),
      ring: new THREE.RingGeometry(0.34, 0.5, 28),
      snow: new THREE.SphereGeometry(0.3, 14, 10),
      fire: new THREE.SphereGeometry(0.3, 14, 10),
    };
    this.std = std;
    this.mat = {
      olho: std({ color: 0xffffff, roughness: 0.2 }),
      pupila: std({ color: 0x120a1e, roughness: 0.2 }),
      ouro: std({ color: 0xffc928, metalness: 0.6, roughness: 0.3 }),
      escuro: std({ color: 0x1c1830 }),
      neve: std({ color: 0xffffff, roughness: 0.8 }),
      fogo: new THREE.MeshBasicMaterial({ color: 0xffa530 }),
      escudo: new THREE.MeshBasicMaterial({ color: 0xc89bff, transparent: true, opacity: 0.32, depthWrite: false }),
    };
  }

  get active() { return !!this.boss && this.boss.state !== 'gone'; }

  clear() {
    this.group.clear();
    this.boss = null;
    this.fx.length = 0;
  }

  // -------------------------------------------------------------- criação

  /** Cria o chefão número n (1 a 6) na célula indicada. */
  spawn(n, col, row) {
    this.clear();
    const def = BOSSES[(n - 1) % BOSSES.length];
    const mover = new GridMover();
    mover.setCell(col, row);
    const root = new THREE.Group();
    const corpo = this._buildVisual(def);
    root.add(corpo);
    const escudo = new THREE.Mesh(this.geo.sphere, this.mat.escudo);
    escudo.scale.setScalar(2.3);
    escudo.position.y = 0.85;
    escudo.visible = false;
    root.add(escudo);
    this.group.add(root);
    this.boss = {
      def, n, hp: def.hp, maxHp: def.hp, mover, root, corpo, escudo,
      state: 'walk', action: null, cooldown: 2.2, inv: 0, t: 0,
      vulnerableT: 0, airborne: false, hidden: false, furioso: false,
      px: col, pz: row, py: 0, angle: 0, deathT: 0, charging: false,
    };
    this._sync(this.boss);
    return this.boss;
  }

  /** Aparência de cada chefão, feita de formas simples (~1,7 célula de altura). */
  _buildVisual(def) {
    const g = new THREE.Group();
    const cor = this.std({ color: def.cor });
    const flash = [cor];
    const add = (geo, mat, pos, scale, rot) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      if (scale) m.scale.set(...scale);
      if (rot) m.rotation.set(...rot);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    const olhos = (y, z, sep = 0.22, r = 0.17, bravo = true) => {
      for (const s of [-1, 1]) {
        add(this.geo.sphere, this.mat.olho, [s * sep, y, z], [r * 2, r * 2, r * 1.2]);
        add(this.geo.sphere, this.mat.pupila, [s * sep, y, z + r * 0.55], [r * 0.9, r * 0.9, r * 0.5]);
        if (bravo) add(this.geo.box, this.mat.escuro, [s * sep, y + r * 1.15, z + 0.02], [r * 2.4, 0.06, 0.06], [0, 0, s * 0.45]);
      }
    };
    const coroa = (y, r) => {
      add(this.geo.cyl, this.mat.ouro, [0, y, 0], [r * 2, 0.2, r * 2]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(this.geo.cone, this.mat.ouro, [Math.cos(a) * r * 0.85, y + 0.22, Math.sin(a) * r * 0.85], [0.16, 0.3, 0.16]);
      }
    };

    if (def.id === 'gosma') {
      add(this.geo.sphere, cor, [0, 0.62, 0], [1.75, 1.25, 1.75]);
      olhos(0.85, 0.72, 0.3, 0.19);
      add(this.geo.sphere, this.mat.escuro, [0, 0.5, 0.82], [0.5, 0.18, 0.1]);
      coroa(1.3, 0.38);
    } else if (def.id === 'robo') {
      const metal = this.std({ color: 0x8c97b8, metalness: 0.5, roughness: 0.35 });
      flash.push(metal);
      add(this.geo.box, cor, [0, 0.65, 0], [1.2, 0.9, 0.9]);
      add(this.geo.box, metal, [0, 1.35, 0], [0.85, 0.55, 0.7]);
      add(this.geo.box, new THREE.MeshBasicMaterial({ color: 0xff2a2a }), [0, 1.37, 0.36], [0.6, 0.14, 0.04]);
      add(this.geo.cyl, metal, [0, 1.8, 0], [0.05, 0.4, 0.05]);
      add(this.geo.sphere, new THREE.MeshBasicMaterial({ color: 0xff3a3a }), [0, 2.02, 0], [0.16, 0.16, 0.16]);
      for (const s of [-1, 1]) {
        add(this.geo.cyl, metal, [s * 0.75, 0.75, 0], [0.18, 0.7, 0.18], [0, 0, s * 0.3]);
        add(this.geo.box, metal, [s * 0.35, 0.12, 0], [0.32, 0.25, 0.6]);
      }
    } else if (def.id === 'dragao') {
      add(this.geo.sphere, cor, [0, 0.7, 0], [1.4, 1.15, 1.5]);
      add(this.geo.sphere, cor, [0, 1.35, 0.35], [0.85, 0.75, 0.85]);
      add(this.geo.cone, cor, [0, 1.25, 0.85], [0.42, 0.5, 0.42], [Math.PI / 2, 0, 0]);
      olhos(1.5, 0.66, 0.2, 0.12);
      const asa = this.std({ color: 0xb5301a, side: THREE.DoubleSide });
      for (const s of [-1, 1]) {
        add(this.geo.cone, this.mat.ouro, [s * 0.25, 1.75, 0.2], [0.12, 0.35, 0.12], [-0.4, 0, s * 0.3]);
        add(this.geo.box, asa, [s * 0.95, 1.15, -0.2], [0.9, 0.06, 0.6], [0, 0, s * 0.5]);
      }
      add(this.geo.cone, cor, [0, 0.45, -0.95], [0.35, 0.9, 0.35], [-Math.PI / 2.4, 0, 0]);
    } else if (def.id === 'yeti') {
      add(this.geo.sphere, cor, [0, 0.72, 0], [1.6, 1.4, 1.4]);
      add(this.geo.sphere, cor, [0, 1.55, 0.05], [1.0, 0.85, 0.9]);
      const rosto = this.std({ color: 0x8fc8e8 });
      add(this.geo.sphere, rosto, [0, 1.5, 0.35], [0.65, 0.55, 0.3]);
      olhos(1.58, 0.5, 0.15, 0.1);
      for (const s of [-1, 1]) {
        add(this.geo.sphere, cor, [s * 0.85, 0.8, 0.1], [0.45, 0.9, 0.45]);
        add(this.geo.cone, this.mat.neve, [s * 0.35, 1.95, 0], [0.12, 0.3, 0.12], [0, 0, -s * 0.5]);
      }
    } else if (def.id === 'mago') {
      add(this.geo.cone, cor, [0, 0.62, 0], [1.25, 1.25, 1.25]);
      const pele = this.std({ color: 0xb7a3d9 });
      add(this.geo.sphere, pele, [0, 1.38, 0], [0.62, 0.62, 0.62]);
      olhos(1.42, 0.27, 0.12, 0.08);
      add(this.geo.cone, cor, [0, 2.0, 0], [0.62, 0.85, 0.62], [-0.15, 0, 0]);
      add(this.geo.cyl, cor, [0, 1.65, 0], [0.95, 0.06, 0.95]);
      const brilho = new THREE.MeshBasicMaterial({ color: 0x55ffe8 });
      add(this.geo.cyl, this.mat.escuro, [0.62, 0.9, 0.15], [0.06, 1.7, 0.06]);
      add(this.geo.sphere, brilho, [0.62, 1.8, 0.15], [0.26, 0.26, 0.26]);
    } else {
      // Rei das Bombas: uma bomba gigante com coroa.
      add(this.geo.sphere, this.std({ color: 0x241c4a, metalness: 0.25, roughness: 0.3 }), [0, 0.85, 0], [1.7, 1.7, 1.7]);
      flash.push(g.children[0].material);
      olhos(1.0, 0.72, 0.28, 0.17);
      add(this.geo.cyl, this.std({ color: 0x9aa0b8 }), [0, 1.72, 0], [0.4, 0.25, 0.4]);
      coroa(1.9, 0.36);
      add(this.geo.sphere, new THREE.MeshBasicMaterial({ color: 0xffe066 }), [0.25, 2.35, 0], [0.22, 0.22, 0.22]);
    }
    g.userData.flash = flash;
    return g;
  }

  // ------------------------------------------------------------ consultas

  /** O chefão pode tomar dano agora? */
  vulnerable() {
    const b = this.boss;
    return !!b && b.state !== 'dying' && b.state !== 'gone' && !b.airborne && !b.hidden &&
      b.inv <= 0 && !this.shielded();
  }

  shielded() {
    const b = this.boss;
    return !!b && b.def.poderes.includes('shield') && b.vulnerableT <= 0 && b.state !== 'dying';
  }

  /** Encostar no chefão fere o jogador? */
  touching(x, z) {
    const b = this.boss;
    if (!b || b.state === 'dying' || b.state === 'gone' || b.airborne || b.hidden) return false;
    const dx = b.root.position.x - x, dz = b.root.position.z - z;
    return dx * dx + dz * dz < 0.7;
  }

  /** Células que o corpo do chefão ocupa (para checar as chamas). */
  cells() {
    const b = this.boss;
    if (!b) return [];
    const m = b.mover;
    return m.moving ? [[m.col, m.row], [m.toCol, m.toRow]] : [[m.col, m.row]];
  }

  /** Aplica um acerto. Devolve true se o chefão tomou dano. */
  hit() {
    const b = this.boss;
    if (!this.vulnerable()) return false;
    b.hp--;
    b.inv = 1.1;
    this.hooks.sound('bosshit');
    this.hooks.shake(0.6);
    if (b.hp <= 0) {
      b.state = 'dying';
      b.deathT = 0;
      b.action = null;
      this.hooks.sound('bossdown');
      return true;
    }
    if (!b.furioso && b.hp <= b.maxHp / 2) {
      b.furioso = true;
      this.hooks.toast(`${b.def.nome} ficou furioso!`);
    }
    return true;
  }

  // ---------------------------------------------------------- atualização

  /**
   * @param {object} ctx  canEnter(col,row), player {col,row,dead}, bombs, minions (quantidade)
   */
  update(dt, ctx) {
    this._updateFx(dt, ctx);
    const b = this.boss;
    if (!b || b.state === 'gone') return;
    b.t += dt;
    if (b.inv > 0) b.inv -= dt;
    if (b.vulnerableT > 0) b.vulnerableT -= dt;

    if (b.state === 'dying') {
      b.deathT += dt;
      // Explode em vários pontos antes de sumir.
      if (Math.floor(b.deathT * 8) !== Math.floor((b.deathT - dt) * 8)) {
        this.hooks.particles(b.root.position.x + (Math.random() - 0.5) * 1.4, b.root.position.z + (Math.random() - 0.5) * 1.4,
          [0xffe27a, 0xffa530, 0xff5a1f, b.def.cor]);
        this.hooks.shake(0.35);
      }
      const k = Math.min(1, b.deathT / 1.6);
      b.root.rotation.y += dt * (4 + k * 18);
      b.root.scale.setScalar(Math.max(0.001, 1 - k * k));
      if (b.deathT >= 1.6) {
        b.state = 'gone';
        this.group.remove(b.root);
        this.hooks.onDefeated();
      }
      return;
    }

    if (b.action) {
      if (b.action.update(dt)) {
        const fim = b.action.end;
        b.action = null;
        if (fim) fim();
      }
    } else {
      b.cooldown -= dt;
      if (b.cooldown <= 0 && !b.mover.moving && !ctx.player.dead) {
        const ok = this._startPower(b, ctx);
        b.cooldown = (ok ? b.def.cooldown : 0.6) * (b.furioso ? 0.65 : 1) * (0.85 + Math.random() * 0.3);
      } else {
        this._walk(b, dt, ctx);
      }
    }
    this._animate(b, dt, ctx);
  }

  _walk(b, dt, ctx) {
    const m = b.mover;
    let resto = b.def.speed * (b.furioso ? 1.25 : 1) * dt;
    let guarda = 0;
    while (resto > 1e-6 && guarda++ < 3) {
      if (!m.moving) {
        if (b.cooldown <= 0) return;      // hora de usar um poder: para na célula
        const livres = DIRS.filter((d) => ctx.canEnter(m.col + d.dx, m.row + d.dz));
        if (!livres.length) return;
        const p = ctx.player;
        let d;
        if (Math.random() < 0.75) {
          // Vai na direção do jogador (sem dar meia-volta se puder evitar).
          const semVolta = livres.filter((x) => !(x.dx === -m.dirX && x.dz === -m.dirZ));
          const op = semVolta.length ? semVolta : livres;
          d = op.reduce((best, x) => {
            const dist = Math.abs(m.col + x.dx - p.col) + Math.abs(m.row + x.dz - p.row);
            return dist < best.dist ? { dist, x } : best;
          }, { dist: Infinity, x: op[0] }).x;
        } else d = livres[Math.floor(Math.random() * livres.length)];
        m.start(d.dx, d.dz);
      }
      resto = m.advance(resto);
    }
  }

  _sync(b) {
    if (!b.airborne) { b.px = b.mover.gx; b.pz = b.mover.gz; }
    b.root.position.set(b.px - (COLS - 1) / 2, b.py, b.pz - (ROWS - 1) / 2);
  }

  _animate(b, dt, ctx) {
    this._sync(b);
    // Vira para o lado em que anda (ou para o jogador quando parado).
    let alvo;
    if (b.mover.moving) alvo = Math.atan2(b.mover.dirX, b.mover.dirZ);
    else alvo = Math.atan2(ctx.player.col - b.px, ctx.player.row - b.pz);
    let diff = alvo - b.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    b.angle += diff * Math.min(1, dt * 6);
    b.root.rotation.y = b.angle;
    // Respira/pula enquanto anda; treme ao preparar um poder.
    const prep = b.action && b.action.prep;
    const pulo = b.airborne ? 0 : Math.abs(Math.sin(b.t * (b.mover.moving ? 7 : 2.5))) * (b.mover.moving ? 0.1 : 0.04);
    b.corpo.position.set(prep ? (Math.random() - 0.5) * 0.12 : 0, pulo, prep ? (Math.random() - 0.5) * 0.12 : 0);
    const s = b.hidden ? 0.001 : (b.action && b.action.escala != null ? b.action.escala : 1);
    b.root.scale.setScalar(s);
    // Pisca ao tomar dano; brilha vermelho quando furioso.
    const piscando = b.inv > 0 && Math.floor(b.t * 16) % 2 === 0;
    for (const mt of b.corpo.userData.flash) {
      if (piscando) mt.emissive.setRGB(1, 1, 1);
      else if (b.furioso) mt.emissive.setRGB(0.35 + 0.25 * Math.sin(b.t * 8), 0, 0);
      else mt.emissive.setRGB(0, 0, 0);
    }
    b.escudo.visible = this.shielded() && !b.hidden;
    if (b.escudo.visible) {
      b.escudo.scale.setScalar(2.3 + Math.sin(b.t * 5) * 0.08);
      b.escudo.material.opacity = 0.25 + 0.1 * Math.sin(b.t * 7);
    }
  }

  // --------------------------------------------------------------- poderes

  _startPower(b, ctx) {
    const lista = shuffle(b.def.poderes.filter((p) => p !== 'shield'));
    for (const nome of lista) {
      const acao = this['_p_' + nome](b, ctx);
      if (acao) {
        b.action = acao;
        b.vulnerableT = 4.2;      // o escudo do mago cai depois de cada magia
        return true;
      }
    }
    return false;
  }

  /** Célula livre mais próxima de (col,row). */
  _freeNear(col, row, ctx, raio = 2) {
    let best = null, bd = Infinity;
    for (let r = row - raio; r <= row + raio; r++) {
      for (let c = col - raio; c <= col + raio; c++) {
        if (!ctx.canEnter(c, r)) continue;
        const d = Math.abs(c - col) + Math.abs(r - row) + Math.random() * 0.1;
        if (d < bd) { bd = d; best = { col: c, row: r }; }
      }
    }
    return best;
  }

  /** Células em cruz a partir de um ponto (param nas paredes; blocos param e são destruídos). */
  _cross(col, row, alcance) {
    const out = [{ col, row }];
    for (const { dx, dz } of DIRS) {
      for (let n = 1; n <= alcance; n++) {
        const c = col + dx * n, r = row + dz * n;
        const t = this.map.get(c, r);
        if (t === CELL.WALL) break;
        out.push({ col: c, row: r });
        if (t === CELL.BLOCK) break;
      }
    }
    return out;
  }

  /** Salto esmagador: pula até perto do jogador e cai soltando chamas em cruz. */
  _p_slam(b, ctx) {
    const alvo = this._freeNear(ctx.player.col, ctx.player.row, ctx, 1);
    if (!alvo) return null;
    const de = { x: b.mover.gx, z: b.mover.gz };
    const marca = this._marker(alvo.col, alvo.row, 0xff2a2a, 1.9, true);
    this.hooks.sound('charge');
    const dur = 1.25;
    let t = 0;
    return {
      update: (dt) => {
        t += dt;
        const k = Math.min(1, t / dur);
        b.airborne = true;
        const e = easeInOut(k);
        b.px = lerp(de.x, alvo.col, e);
        b.pz = lerp(de.z, alvo.row, e);
        b.py = Math.sin(k * Math.PI) * 2.8;
        return k >= 1;
      },
      end: () => {
        b.airborne = false;
        b.py = 0;
        b.mover.setCell(alvo.col, alvo.row);
        this._removeFx(marca);
        for (const c of this._cross(alvo.col, alvo.row, b.furioso ? 3 : 2)) this.hooks.flame(c.col, c.row);
        this.hooks.shake(1.2);
        this.hooks.sound('slam');
      },
    };
  }

  /** Chama filhotes (monstros) perto dele. */
  _p_summon(b, ctx) {
    if (ctx.minions >= (b.furioso ? 5 : 3)) return null;
    const m = b.mover, cells = [];
    for (let r = m.row - 4; r <= m.row + 4; r++) {
      for (let c = m.col - 4; c <= m.col + 4; c++) {
        const d = Math.abs(c - m.col) + Math.abs(r - m.row);
        const dp = Math.abs(c - ctx.player.col) + Math.abs(r - ctx.player.row);
        if (d >= 2 && d <= 4 && dp >= 3 && ctx.canEnter(c, r)) cells.push({ col: c, row: r });
      }
    }
    if (!cells.length) return null;
    const escolhidas = shuffle(cells).slice(0, b.furioso ? 3 : 2);
    const marcas = escolhidas.map((c) => this._marker(c.col, c.row, 0x9dff6a, 1, true));
    this.hooks.sound('summon');
    let t = 0;
    return {
      prep: true,
      update: (dt) => (t += dt) >= 0.9,
      end: () => {
        marcas.forEach((mk) => this._removeFx(mk));
        this.hooks.summon(escolhidas, b.def.summon || 'gosma');
      },
    };
  }

  /** Laser: faixa vermelha de aviso na linha (e/ou coluna) do jogador, depois o disparo. */
  _p_laser(b, ctx) {
    const p = ctx.player;
    const linhas = [];
    if (b.furioso || Math.random() < 0.5) linhas.push({ eixo: 'row', n: p.row });
    if (b.furioso || !linhas.length) linhas.push({ eixo: 'col', n: p.col });
    const cells = [];
    for (const l of linhas) {
      const len = l.eixo === 'row' ? COLS : ROWS;
      for (let k = 1; k < len - 1; k++) {
        const c = l.eixo === 'row' ? k : l.n, r = l.eixo === 'row' ? l.n : k;
        if (this.map.get(c, r) !== CELL.WALL) cells.push({ col: c, row: r });
      }
    }
    const marcas = cells.map((c) => this._marker(c.col, c.row, 0xff2a2a, 1, true));
    this.hooks.sound('charge');
    let t = 0;
    return {
      prep: true,
      update: (dt) => (t += dt) >= 1.35,
      end: () => {
        marcas.forEach((mk) => this._removeFx(mk));
        for (const c of cells) this.hooks.flame(c.col, c.row);
        for (const l of linhas) this._beam(l);
        this.hooks.sound('laser');
        this.hooks.shake(0.5);
      },
    };
  }

  /** Teletransporte: some e reaparece longe do jogador. */
  _p_teleport(b, ctx) {
    const p = ctx.player, opcoes = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        const d = Math.abs(c - p.col) + Math.abs(r - p.row);
        if (d >= 4 && d <= 9 && ctx.canEnter(c, r)) opcoes.push({ col: c, row: r });
      }
    }
    if (!opcoes.length) return null;
    const destino = opcoes[Math.floor(Math.random() * opcoes.length)];
    this.hooks.sound('teleport');
    let t = 0, pulou = false;
    const acao = {
      escala: 1,
      update: (dt) => {
        t += dt;
        const k = t / 0.9;
        if (k < 0.45) acao.escala = 1 - k / 0.45;
        else if (k < 0.55) {
          b.hidden = true;
          if (!pulou) {
            pulou = true;
            this.hooks.particles(b.root.position.x, b.root.position.z, [b.def.cor, 0xffffff]);
            b.mover.setCell(destino.col, destino.row);
          }
        } else { b.hidden = false; acao.escala = Math.min(1, (k - 0.55) / 0.45); }
        return k >= 1;
      },
      end: () => { b.hidden = false; this.hooks.particles(b.root.position.x, b.root.position.z, [b.def.cor, 0xffffff]); },
    };
    return acao;
  }

  /** Chuva de bolas de fogo em volta do jogador. */
  _p_meteor(b, ctx) {
    const p = ctx.player;
    const n = b.furioso ? 8 : 5;
    const usadas = new Set();
    for (let i = 0; i < n; i++) {
      let col, row, tent = 0;
      do {
        col = p.col + Math.floor(Math.random() * 5) - 2;
        row = p.row + Math.floor(Math.random() * 5) - 2;
      } while ((this.map.get(col, row) === CELL.WALL || usadas.has(col + ',' + row)) && ++tent < 12);
      if (tent >= 12) continue;
      usadas.add(col + ',' + row);
      // A primeira cai exatamente onde o jogador está.
      if (i === 0) { col = p.col; row = p.row; }
      this._meteor(col, row, i * 0.28);
    }
    this.hooks.sound('roar');
    let t = 0;
    return { prep: true, update: (dt) => (t += dt) >= 0.7 };
  }

  /** Investida: se o jogador estiver na mesma linha/coluna, dispara até bater. */
  _p_charge(b, ctx) {
    const m = b.mover, p = ctx.player;
    let dir = null;
    if (p.row === m.row || p.col === m.col) {
      const d = { dx: Math.sign(p.col - m.col), dz: Math.sign(p.row - m.row) };
      let livre = true;
      const dist = Math.abs(p.col - m.col) + Math.abs(p.row - m.row);
      for (let k = 1; k < dist; k++) if (!ctx.canEnter(m.col + d.dx * k, m.row + d.dz * k)) livre = false;
      if (livre && dist > 0 && dist <= 10) dir = d;
    }
    if (!dir) return null;
    this.hooks.sound('roar');
    let t = 0;
    const acao = {
      prep: true,
      update: (dt) => {
        t += dt;
        if (t < 0.65) return false;       // prepara (treme)
        acao.prep = false;
        b.charging = true;
        let resto = 7.5 * dt;
        while (resto > 1e-6) {
          if (!m.moving) {
            if (!ctx.canEnter(m.col + dir.dx, m.row + dir.dz)) return true;
            m.start(dir.dx, dir.dz);
          }
          resto = m.advance(resto);
        }
        return t > 4;
      },
      end: () => { b.charging = false; this.hooks.shake(0.6); },
    };
    return acao;
  }

  /** Sopro congelante: em linha na direção do jogador; quem for atingido fica lento. */
  _p_freeze(b, ctx) {
    const m = b.mover, p = ctx.player;
    const dx = p.col - m.col, dz = p.row - m.row;
    const dir = Math.abs(dx) >= Math.abs(dz) ? { dx: Math.sign(dx) || 1, dz: 0 } : { dx: 0, dz: Math.sign(dz) };
    const cells = [];
    const larg = b.furioso ? 1 : 0;
    for (let k = 1; k <= 6; k++) {
      for (let w = -larg; w <= larg; w++) {
        const c = m.col + dir.dx * k + (dir.dz ? w : 0), r = m.row + dir.dz * k + (dir.dx ? w : 0);
        if (this.map.get(c, r) === CELL.EMPTY) cells.push({ col: c, row: r });
      }
    }
    if (!cells.length) return null;
    const marcas = cells.map((c) => this._marker(c.col, c.row, 0x5fd0ff, 1, true));
    this.hooks.sound('charge');
    let t = 0;
    return {
      prep: true,
      update: (dt) => (t += dt) >= 0.95,
      end: () => {
        marcas.forEach((mk) => this._removeFx(mk));
        for (const c of cells) {
          const w = this.map.cellToWorld(c.col, c.row);
          this.hooks.particles(w.x, w.z, [0xffffff, 0xbfefff, 0x6fd3ff]);
          this._frost(c.col, c.row);
        }
        const pc = ctx.player;
        if (cells.some((c) => c.col === pc.col && c.row === pc.row)) this.hooks.slowPlayer(3.5);
        this.hooks.sound('freeze');
      },
    };
  }

  /** Bolas de neve rolando em várias direções. */
  _p_snowball(b, ctx) {
    const m = b.mover, p = ctx.player;
    // Sempre uma bola na direção do jogador, mais duas (ou todas, furioso) ao acaso.
    const dx = p.col - m.col, dz = p.row - m.row;
    const mira = Math.abs(dx) >= Math.abs(dz) ? { dx: Math.sign(dx) || 1, dz: 0 } : { dx: 0, dz: Math.sign(dz) };
    const outras = shuffle(DIRS.filter((d) => !(d.dx === mira.dx && d.dz === mira.dz)));
    const dirs = b.furioso ? DIRS : [DIRS.find((d) => d.dx === mira.dx && d.dz === mira.dz), outras[0], outras[1]];
    this.hooks.sound('summon');
    let t = 0;
    return {
      prep: true,
      update: (dt) => (t += dt) >= 0.55,
      end: () => { for (const d of dirs) this._snowball(m.col, m.row, d); },
    };
  }

  /** Bombas mágicas em volta do jogador. */
  _p_bombs(b, ctx) {
    const p = ctx.player;
    const cells = [];
    for (let r = p.row - 2; r <= p.row + 2; r++) {
      for (let c = p.col - 2; c <= p.col + 2; c++) {
        if (ctx.canEnter(c, r) && !(c === p.col && r === p.row) && !ctx.bombs.hasBomb(c, r)) cells.push({ col: c, row: r });
      }
    }
    if (!cells.length) return null;
    const escolhidas = shuffle(cells).slice(0, b.furioso ? 4 : 3);
    const marcas = escolhidas.map((c) => this._marker(c.col, c.row, 0xc070ff, 1, true));
    this.hooks.sound('summon');
    let t = 0;
    return {
      prep: true,
      update: (dt) => (t += dt) >= 0.6,
      end: () => {
        marcas.forEach((mk) => this._removeFx(mk));
        for (const c of escolhidas) this.hooks.placeBomb(c.col, c.row, b.furioso ? 3 : 2);
      },
    };
  }

  // ------------------------------------------------------------- efeitos

  /** Marca de aviso no chão (pisca). */
  _marker(col, row, cor, escala = 1, piscar = true) {
    const mat = new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.5, depthWrite: false });
    const mesh = new THREE.Mesh(this.geo.marker, mat);
    mesh.rotation.x = -Math.PI / 2;
    this.map.cellToWorld(col, row, mesh.position);
    mesh.position.y = this.map.get(col, row) === CELL.BLOCK ? 0.62 : 0.025;
    mesh.scale.setScalar(escala);
    this.group.add(mesh);
    const fx = { tipo: 'marca', mesh, t: 0, piscar };
    this.fx.push(fx);
    return fx;
  }

  _removeFx(fx) {
    const i = this.fx.indexOf(fx);
    if (i >= 0) this.fx.splice(i, 1);
    if (fx.mesh) { this.group.remove(fx.mesh); if (fx.mesh.material && fx.mesh.material.dispose && fx.tipo === 'marca') fx.mesh.material.dispose(); }
    if (fx.extra) this.group.remove(fx.extra);
  }

  _beam(l) {
    const len = l.eixo === 'row' ? COLS - 2 : ROWS - 2;
    const mat = new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(this.geo.box, mat);
    const p = this.map.cellToWorld(l.eixo === 'row' ? (COLS - 1) / 2 : l.n, l.eixo === 'row' ? l.n : (ROWS - 1) / 2);
    mesh.position.set(p.x, 0.45, p.z);
    mesh.scale.set(len, 0.22, 0.22);
    if (l.eixo === 'col') mesh.rotation.y = Math.PI / 2;
    this.group.add(mesh);
    this.fx.push({ tipo: 'feixe', mesh, t: 0 });
  }

  _frost(col, row) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xcff4ff, transparent: true, opacity: 0.8, depthWrite: false });
    const mesh = new THREE.Mesh(this.geo.marker, mat);
    mesh.rotation.x = -Math.PI / 2;
    this.map.cellToWorld(col, row, mesh.position);
    mesh.position.y = 0.03;
    this.group.add(mesh);
    this.fx.push({ tipo: 'gelo', mesh, t: 0 });
  }

  _meteor(col, row, atraso) {
    const anel = new THREE.Mesh(this.geo.ring, new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    anel.rotation.x = -Math.PI / 2;
    const p = this.map.cellToWorld(col, row);
    anel.position.set(p.x, this.map.get(col, row) === CELL.BLOCK ? 0.62 : 0.03, p.z);
    const bola = new THREE.Mesh(this.geo.fire, this.mat.fogo);
    bola.position.set(p.x, 30, p.z);
    this.group.add(anel, bola);
    this.fx.push({ tipo: 'meteoro', mesh: anel, extra: bola, col, row, t: -atraso, aviso: 1.15 });
  }

  _snowball(col, row, d) {
    const mesh = new THREE.Mesh(this.geo.snow, this.mat.neve);
    mesh.castShadow = true;
    this.group.add(mesh);
    this.fx.push({ tipo: 'neve', mesh, x: col, z: row, dx: d.dx, dz: d.dz, t: 0, primeiro: true });
  }

  _updateFx(dt, ctx) {
    for (const fx of [...this.fx]) {
      fx.t += dt;
      if (fx.tipo === 'marca') {
        fx.mesh.material.opacity = fx.piscar ? 0.3 + 0.35 * (0.5 + 0.5 * Math.sin(fx.t * 18)) : 0.5;
      } else if (fx.tipo === 'feixe') {
        const k = fx.t / 0.4;
        fx.mesh.material.opacity = Math.max(0, 0.95 * (1 - k));
        fx.mesh.scale.y = fx.mesh.scale.z = 0.22 + k * 0.4;
        if (k >= 1) this._removeFx(fx);
      } else if (fx.tipo === 'gelo') {
        fx.mesh.material.opacity = Math.max(0, 0.8 * (1 - fx.t / 1.2));
        if (fx.t >= 1.2) this._removeFx(fx);
      } else if (fx.tipo === 'meteoro') {
        if (fx.t < 0) continue;
        const k = Math.min(1, fx.t / fx.aviso);
        fx.mesh.material.opacity = 0.45 + 0.5 * k;
        fx.mesh.scale.setScalar(1.3 - 0.5 * k + Math.sin(fx.t * 18) * 0.05);
        fx.extra.position.y = 0.3 + (1 - k) * (1 - k) * 10;
        if (k >= 1) {
          this._removeFx(fx);
          fx.mesh.material.dispose();
          this.hooks.flame(fx.col, fx.row);
          this.hooks.sound('impact');
        }
      } else if (fx.tipo === 'neve') {
        // rola em linha reta (5 células/s) até bater em algo
        const passo = 5 * dt;
        const nx = fx.x + fx.dx * passo, nz = fx.z + fx.dz * passo;
        const frente = { c: Math.round(fx.x + fx.dx * 0.55), r: Math.round(fx.z + fx.dz * 0.55) };
        const bateu = !fx.primeiro && !ctx.canEnter(frente.c, frente.r);
        if (Math.round(nx) !== Math.round(fx.x) || Math.round(nz) !== Math.round(fx.z)) fx.primeiro = false;
        if (bateu || fx.t > 6) {
          const w = this.map.cellToWorld(Math.round(fx.x), Math.round(fx.z));
          this.hooks.particles(w.x, w.z, [0xffffff, 0xdff6ff]);
          this._removeFx(fx);
          continue;
        }
        fx.x = nx; fx.z = nz;
        fx.mesh.position.set(fx.x - (COLS - 1) / 2, 0.3, fx.z - (ROWS - 1) / 2);
        fx.mesh.rotation.x += fx.dz * passo * 3;
        fx.mesh.rotation.z -= fx.dx * passo * 3;
        const p = ctx.player;
        if (!p.dead && Math.abs(fx.x - p.gx) < 0.6 && Math.abs(fx.z - p.gz) < 0.6) {
          this.hooks.hurtPlayer();
          this.hooks.particles(fx.mesh.position.x, fx.mesh.position.z, [0xffffff, 0xdff6ff]);
          this._removeFx(fx);
        }
      }
    }
  }
}
