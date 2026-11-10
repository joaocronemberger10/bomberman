// ============================================================================
// bombs.js — Bombas, explosões em cruz, chamas e reação em cadeia.
// ============================================================================
import * as THREE from 'three';
import { CONFIG, DIRS } from './config.js';
import { CELL } from './map.js';

export class BombManager {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./map.js').GameMap} map
   * @param {object} hooks  callbacks avisando o jogo:
   *   onExplosion(col, row, cells)  — uma bomba explodiu
   *   onBlockDestroyed(col, row)    — um bloco destrutível foi destruído
   */
  constructor(scene, map, hooks = {}) {
    this.scene = scene;
    this.map = map;
    this.hooks = hooks;
    this.bombs = [];    // { col, row, timer, range, mesh, mat }
    this.flames = [];   // { col, row, ttl, mesh, sx, sz }

    // Geometrias e materiais compartilhados (criados uma única vez).
    this.geoCorpo = new THREE.SphereGeometry(0.34, 20, 14);
    this.geoBocal = new THREE.CylinderGeometry(0.09, 0.11, 0.12, 10);
    this.geoFaisca = new THREE.SphereGeometry(0.07, 8, 6);
    this.matBocal = new THREE.MeshStandardMaterial({ color: 0x8b93c9, roughness: 0.4 });
    this.matFaisca = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    this.geoChama = new THREE.IcosahedronGeometry(0.5, 1);
    this.matChama = new THREE.MeshBasicMaterial({ color: 0xff9a1f });
    this.matNucleo = new THREE.MeshBasicMaterial({ color: 0xfff3a6 });
    this._v = new THREE.Vector3();
  }

  get count() { return this.bombs.length; }

  hasBomb(col, row) {
    return this.bombs.some((b) => b.col === col && b.row === row);
  }

  /** Há chama ativa (que causa dano) nesta célula? */
  isFlame(col, row) {
    return this.flames.some((f) => f.col === col && f.row === row);
  }

  /** Coloca uma bomba. Devolve false se a célula já estiver ocupada. */
  place(col, row, range) {
    if (!this.map.isEmpty(col, row) || this.hasBomb(col, row)) return false;

    const mat = new THREE.MeshStandardMaterial({ color: 0x23284a, roughness: 0.3, metalness: 0.2 });
    const mesh = new THREE.Group();
    const corpo = new THREE.Mesh(this.geoCorpo, mat);
    corpo.castShadow = true;
    const bocal = new THREE.Mesh(this.geoBocal, this.matBocal);
    bocal.position.y = 0.36;
    const faisca = new THREE.Mesh(this.geoFaisca, this.matFaisca);
    faisca.position.y = 0.47;
    mesh.add(corpo, bocal, faisca);

    this.map.cellToWorld(col, row, mesh.position);
    mesh.position.y = 0.36;
    this.scene.add(mesh);

    this.bombs.push({ col, row, range, timer: CONFIG.BOMB_FUSE, mesh, mat, faisca });
    return true;
  }

  update(dt) {
    // --- bombas: pulsam cada vez mais rápido até explodir ---
    for (const b of [...this.bombs]) {
      // Chama encostou na bomba → reação em cadeia.
      if (this.isFlame(b.col, b.row)) b.timer = Math.min(b.timer, CONFIG.CHAIN_DELAY);
      b.timer -= dt;
      if (b.timer <= 0) { this._explode(b); continue; }

      const k = 1 - b.timer / CONFIG.BOMB_FUSE;             // 0 → 1
      const pulso = Math.sin(b.timer * (6 + k * 22));
      const s = 1 + pulso * (0.05 + k * 0.07);
      b.mesh.scale.set(s, 2 - s, s);
      b.mat.emissive.setRGB(k * k * (0.5 + 0.5 * pulso), 0, 0);  // avermelha perto do fim
      b.faisca.scale.setScalar(1 + Math.random() * 0.8);
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

    // Explosão em cruz: avança em cada direção até o alcance, parando em
    // paredes fixas; blocos destrutíveis são destruídos e também param a chama.
    const cells = [{ col: bomb.col, row: bomb.row, dx: 0, dz: 0 }];
    const destruidos = [];
    for (const { dx, dz } of DIRS) {
      for (let n = 1; n <= bomb.range; n++) {
        const col = bomb.col + dx * n, row = bomb.row + dz * n;
        const tipo = this.map.get(col, row);
        if (tipo === CELL.WALL) break;
        cells.push({ col, row, dx, dz });
        if (tipo === CELL.BLOCK) { destruidos.push({ col, row }); break; }
      }
    }

    for (const c of cells) {
      this._addFlame(c);
      // Reação em cadeia: outras bombas atingidas explodem logo em seguida.
      for (const outra of this.bombs) {
        if (outra.col === c.col && outra.row === c.row) outra.timer = Math.min(outra.timer, CONFIG.CHAIN_DELAY);
      }
    }
    for (const d of destruidos) {
      if (this.map.destroyBlock(d.col, d.row) && this.hooks.onBlockDestroyed) this.hooks.onBlockDestroyed(d.col, d.row);
    }
    if (this.hooks.onExplosion) this.hooks.onExplosion(bomb.col, bomb.row, cells);
  }

  _addFlame({ col, row, dx, dz }) {
    // Se já existe chama na célula, apenas renova a duração.
    const existente = this.flames.find((f) => f.col === col && f.row === row);
    if (existente) { existente.ttl = CONFIG.EXPLOSION_DURATION; return; }

    const centro = dx === 0 && dz === 0;
    const mesh = new THREE.Mesh(this.geoChama, centro ? this.matNucleo : this.matChama);
    this.map.cellToWorld(col, row, mesh.position);
    mesh.position.y = 0.35;
    mesh.scale.setScalar(0.01);
    this.scene.add(mesh);
    this.flames.push({
      col, row, mesh,
      ttl: CONFIG.EXPLOSION_DURATION,
      // Os "braços" da cruz são alongados na direção da explosão.
      sx: centro ? 1.1 : (dx !== 0 ? 1.15 : 0.7),
      sz: centro ? 1.1 : (dz !== 0 ? 1.15 : 0.7),
    });
  }
}
