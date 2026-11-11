// ============================================================================
// bombs.js — Bombas, explosões em cruz, chamas e reação em cadeia.
//
// Tipos de bomba:
//   normal  pavio de BOMB_FUSE segundos
//   remote  só explode quando o dono detona (ou após REMOTE_MAX_TIME)
//   pierce  a chama atravessa e destrói todos os blocos no alcance
//   mega    a chama vai até a parede (alcance ilimitado)
// ============================================================================
import * as THREE from 'three';
import { CONFIG, DIRS } from './config.js';
import { CELL } from './map.js';

/** Aparência de cada tipo. */
const LOOK = {
  normal: { color: 0x23284a, scale: 1 },
  remote: { color: 0x1d5fd1, scale: 1 },
  pierce: { color: 0x7a2fd0, scale: 1 },
  mega: { color: 0xc2351d, scale: 1.25 },
};

export class BombManager {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./map.js').GameMap} map
   * @param {object} hooks  callbacks avisando o jogo:
   *   onExplosion(bomb, cells)            — uma bomba explodiu
   *   onBlockDestroyed(col, row, bomb)    — um bloco destrutível foi destruído
   */
  constructor(scene, map, hooks = {}) {
    this.scene = scene;
    this.map = map;
    this.hooks = hooks;
    this.bombs = [];    // { col, row, timer, fuse, range, type, owner, mesh, mat }
    this.flames = [];   // { col, row, ttl, owner, mesh, sx, sz }
    this.danger = new Float32Array(CONFIG.COLS * CONFIG.ROWS);

    // Geometrias e materiais compartilhados (criados uma única vez).
    this.geoCorpo = new THREE.SphereGeometry(0.34, 20, 14);
    this.geoBocal = new THREE.CylinderGeometry(0.09, 0.11, 0.12, 10);
    this.geoFaisca = new THREE.SphereGeometry(0.07, 8, 6);
    this.geoAntena = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6);
    this.geoEspinho = new THREE.ConeGeometry(0.09, 0.26, 8);
    this.matBocal = new THREE.MeshStandardMaterial({ color: 0x8b93c9, roughness: 0.4 });
    this.matFaisca = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    this.matLuz = new THREE.MeshBasicMaterial({ color: 0xff3030 });
    this.geoChama = new THREE.IcosahedronGeometry(0.5, 1);
    this.matChama = new THREE.MeshBasicMaterial({ color: 0xff9a1f });
    this.matNucleo = new THREE.MeshBasicMaterial({ color: 0xfff3a6 });
    this.matChamaAzul = new THREE.MeshBasicMaterial({ color: 0xb48cff });
  }

  get count() { return this.bombs.length; }

  /** Quantas bombas deste dono estão na arena. */
  countOf(owner) {
    let n = 0;
    for (const b of this.bombs) if (b.owner === owner) n++;
    return n;
  }

  hasBomb(col, row) {
    return this.bombs.some((b) => b.col === col && b.row === row);
  }

  /** Há chama ativa (que causa dano) nesta célula? */
  isFlame(col, row) {
    return this.flames.some((f) => f.col === col && f.row === row);
  }

  /** Dono da chama nesta célula (quem soltou a bomba), ou undefined. */
  flameOwner(col, row) {
    const f = this.flames.find((f) => f.col === col && f.row === row);
    return f ? f.owner : undefined;
  }

  /** O dono tem bombas remotas esperando para detonar? */
  hasRemote(owner) {
    return this.bombs.some((b) => b.owner === owner && b.type === 'remote');
  }

  /** Detona todas as bombas remotas do dono. Devolve true se havia alguma. */
  detonateRemote(owner) {
    let alguma = false;
    for (const b of this.bombs) {
      if (b.owner === owner && b.type === 'remote') { b.timer = Math.min(b.timer, 0.02); alguma = true; }
    }
    return alguma;
  }

  /**
   * Coloca uma bomba. Devolve false se a célula já estiver ocupada.
   * @param {object} opt  owner (quem soltou) e type (normal/remote/pierce/mega)
   */
  place(col, row, range, { owner = null, type = 'normal' } = {}) {
    if (!this.map.isEmpty(col, row) || this.hasBomb(col, row)) return false;

    const look = LOOK[type] || LOOK.normal;
    const mat = new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.3, metalness: 0.2 });
    const mesh = new THREE.Group();
    const corpo = new THREE.Mesh(this.geoCorpo, mat);
    corpo.castShadow = true;
    const bocal = new THREE.Mesh(this.geoBocal, this.matBocal);
    bocal.position.y = 0.36;
    mesh.add(corpo, bocal);

    let faisca;
    if (type === 'remote') {
      // Antena com luz vermelha no lugar do pavio.
      const antena = new THREE.Mesh(this.geoAntena, this.matBocal);
      antena.position.y = 0.52;
      faisca = new THREE.Mesh(this.geoFaisca, this.matLuz);
      faisca.position.y = 0.7;
      mesh.add(antena);
    } else {
      faisca = new THREE.Mesh(this.geoFaisca, this.matFaisca);
      faisca.position.y = 0.47;
    }
    mesh.add(faisca);
    if (type === 'pierce') {
      // Espinhos indicam a bomba perfurante.
      for (const [x, z, rz, rx] of [[0.34, 0, -1.57, 0], [-0.34, 0, 1.57, 0], [0, 0.34, 0, 1.57], [0, -0.34, 0, -1.57]]) {
        const esp = new THREE.Mesh(this.geoEspinho, this.matBocal);
        esp.position.set(x, 0, z);
        esp.rotation.set(rx, 0, rz);
        mesh.add(esp);
      }
    }

    this.map.cellToWorld(col, row, mesh.position);
    mesh.position.y = 0.36 * look.scale;
    this.scene.add(mesh);

    const fuse = type === 'remote' ? CONFIG.REMOTE_MAX_TIME : CONFIG.BOMB_FUSE;
    this.bombs.push({ col, row, range, type, owner, fuse, timer: fuse, mesh, mat, faisca, base: look.scale, t: 0 });
    return true;
  }

  /**
   * Calcula as células atingidas por uma explosão em cruz: avança em cada
   * direção até o alcance, parando em paredes fixas. Blocos destrutíveis são
   * destruídos e param a chama (exceto na bomba perfurante).
   */
  blastCells(col, row, range, type = 'normal') {
    const alcance = type === 'mega' ? 99 : range;
    const cells = [{ col, row, dx: 0, dz: 0 }];
    const blocks = [];
    for (const { dx, dz } of DIRS) {
      for (let n = 1; n <= alcance; n++) {
        const c = col + dx * n, r = row + dz * n;
        const tipo = this.map.get(c, r);
        if (tipo === CELL.WALL) break;
        cells.push({ col: c, row: r, dx, dz });
        if (tipo === CELL.BLOCK) {
          blocks.push({ col: c, row: r });
          if (type !== 'pierce') break;
        }
      }
    }
    return { cells, blocks };
  }

  /**
   * Mapa de perigo usado pela IA: para cada célula, em quantos segundos ela
   * será atingida (Infinity = segura, 0 = já está em chamas).
   */
  computeDanger() {
    const d = this.danger;
    d.fill(Infinity);
    for (const b of this.bombs) {
      // Bombas remotas podem explodir a qualquer momento: tratadas como iminentes.
      const t = b.type === 'remote' ? Math.min(b.timer, 1) : b.timer;
      for (const c of this.blastCells(b.col, b.row, b.range, b.type).cells) {
        const i = this.map.index(c.col, c.row);
        if (t < d[i]) d[i] = t;
      }
    }
    for (const f of this.flames) d[this.map.index(f.col, f.row)] = 0;
    return d;
  }

  update(dt) {
    // --- bombas: pulsam cada vez mais rápido até explodir ---
    for (const b of [...this.bombs]) {
      // Chama encostou na bomba → reação em cadeia.
      if (this.isFlame(b.col, b.row)) b.timer = Math.min(b.timer, CONFIG.CHAIN_DELAY);
      b.timer -= dt;
      b.t += dt;
      if (b.timer <= 0) { this._explode(b); continue; }

      if (b.type === 'remote') {
        // Remota: pulso constante e luz piscando.
        const s = b.base * (1 + Math.sin(b.t * 5) * 0.04);
        b.mesh.scale.set(s, 2 * b.base - s, s);
        b.faisca.visible = Math.floor(b.t * 4) % 2 === 0;
      } else {
        const k = 1 - b.timer / b.fuse;                       // 0 → 1
        const pulso = Math.sin(b.timer * (6 + k * 22));
        const s = b.base * (1 + pulso * (0.05 + k * 0.07));
        b.mesh.scale.set(s, 2 * b.base - s, s);
        b.mat.emissive.setRGB(k * k * (0.5 + 0.5 * pulso), 0, 0);  // avermelha perto do fim
        b.faisca.scale.setScalar(1 + Math.random() * 0.8);
      }
    }

    // --- chamas: crescem rápido e somem ---
    for (let i = this.flames.length - 1; i >= 0; i--) {
      const f = this.flames[i];
      f.ttl -= dt;
      if (f.ttl <= 0) {
        this.scene.remove(f.mesh);
        this.flames.splice(i, 1);
        continue;
      }
      const k = f.ttl / CONFIG.EXPLOSION_DURATION;           // 1 → 0
      const s = Math.sin(Math.min(1, (1 - k) * 4) * Math.PI / 2) * (0.35 + 0.65 * k);
      const tremor = 1 + (Math.random() - 0.5) * 0.15;
      f.mesh.scale.set(f.sx * s * tremor, 0.75 * s, f.sz * s * tremor);
    }
  }

  /** Remove todas as bombas e chamas (troca de fase / reinício). */
  clear() {
    for (const b of this.bombs) { this.scene.remove(b.mesh); b.mat.dispose(); }
    for (const f of this.flames) this.scene.remove(f.mesh);
    this.bombs.length = 0;
    this.flames.length = 0;
  }

  // ------------------------------------------------------------- explosão

  _explode(bomb) {
    const i = this.bombs.indexOf(bomb);
    if (i >= 0) this.bombs.splice(i, 1);
    this.scene.remove(bomb.mesh);
    bomb.mat.dispose();

    const { cells, blocks } = this.blastCells(bomb.col, bomb.row, bomb.range, bomb.type);

    for (const c of cells) {
      this._addFlame(c, bomb);
      // Reação em cadeia: outras bombas atingidas explodem logo em seguida.
      for (const outra of this.bombs) {
        if (outra.col === c.col && outra.row === c.row) outra.timer = Math.min(outra.timer, CONFIG.CHAIN_DELAY);
      }
    }
    for (const d of blocks) {
      if (this.map.destroyBlock(d.col, d.row) && this.hooks.onBlockDestroyed) this.hooks.onBlockDestroyed(d.col, d.row, bomb);
    }
    if (this.hooks.onExplosion) this.hooks.onExplosion(bomb, cells);
  }

  _addFlame({ col, row, dx, dz }, bomb) {
    // Se já existe chama na célula, apenas renova a duração.
    const existente = this.flames.find((f) => f.col === col && f.row === row);
    if (existente) { existente.ttl = CONFIG.EXPLOSION_DURATION; existente.owner = bomb.owner; return; }

    const centro = dx === 0 && dz === 0;
    const mat = centro ? this.matNucleo : (bomb.type === 'pierce' ? this.matChamaAzul : this.matChama);
    const mesh = new THREE.Mesh(this.geoChama, mat);
    this.map.cellToWorld(col, row, mesh.position);
    mesh.position.y = 0.35;
    mesh.scale.setScalar(0.01);
    this.scene.add(mesh);
    this.flames.push({
      col, row, mesh,
      owner: bomb.owner,
      ttl: CONFIG.EXPLOSION_DURATION,
      // Os "braços" da cruz são alongados na direção da explosão.
      sx: centro ? 1.1 : (dx !== 0 ? 1.15 : 0.7),
      sz: centro ? 1.1 : (dz !== 0 ? 1.15 : 0.7),
    });
  }
}
