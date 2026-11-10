// ============================================================================
// map.js — Arena: grade lógica + cenário 3D (chão, paredes e blocos).
// Tudo é feito por código com formas simples; paredes e blocos usam
// InstancedMesh para manter poucas chamadas de desenho (leve no celular).
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';

/** Tipos de célula da grade. */
export const CELL = { EMPTY: 0, WALL: 1, BLOCK: 2 };

const { COLS, ROWS } = CONFIG;

/** Cria uma textura a partir de um canvas desenhado por código. */
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class GameMap {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.grid = new Uint8Array(COLS * ROWS);
    this._m4 = new THREE.Matrix4();
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);

    this._buildGround();
    this._buildWalls();
    this._buildBlocks();
  }

  // ------------------------------------------------------------------ grade

  index(col, row) { return row * COLS + col; }
  inBounds(col, row) { return col >= 0 && row >= 0 && col < COLS && row < ROWS; }
  get(col, row) { return this.inBounds(col, row) ? this.grid[this.index(col, row)] : CELL.WALL; }
  isEmpty(col, row) { return this.get(col, row) === CELL.EMPTY; }

  /** Parede fixa: toda a borda + padrão xadrez (coluna e linha pares). */
  isFixedWall(col, row) {
    return col === 0 || row === 0 || col === COLS - 1 || row === ROWS - 1 ||
      (col % 2 === 0 && row % 2 === 0);
  }

  /** Converte célula da grade em posição no mundo (centro da célula). */
  cellToWorld(col, row, out = new THREE.Vector3()) {
    return out.set(col - (COLS - 1) / 2, 0, row - (ROWS - 1) / 2);
  }

  /** Os quatro cantos internos (pontos de início). */
  get corners() {
    return [
      { col: 1, row: 1 }, { col: COLS - 2, row: 1 },
      { col: 1, row: ROWS - 2 }, { col: COLS - 2, row: ROWS - 2 },
    ];
  }

  /** Célula de início do jogador. */
  get playerStart() { return this.corners[0]; }

  // --------------------------------------------------------------- geração

  /**
   * Gera uma nova arena. Devolve as células onde os inimigos devem nascer.
   * Os cantos (e as células vizinhas) ficam sempre livres.
   */
  generate(enemyCount = 0) {
    const safe = new Set();
    for (const c of this.corners) {
      const sx = c.col === 1 ? 1 : -1, sz = c.row === 1 ? 1 : -1;
      safe.add(this.index(c.col, c.row));
      safe.add(this.index(c.col + sx, c.row));
      safe.add(this.index(c.col + 2 * sx, c.row));
      safe.add(this.index(c.col, c.row + sz));
      safe.add(this.index(c.col, c.row + 2 * sz));
    }

    const start = this.playerStart;
    const longe = [];   // células distantes do jogador (para inimigos e para a porta)
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const i = this.index(col, row);
        if (this.isFixedWall(col, row)) { this.grid[i] = CELL.WALL; continue; }
        this.grid[i] = (!safe.has(i) && Math.random() < CONFIG.BLOCK_DENSITY) ? CELL.BLOCK : CELL.EMPTY;
        const dist = Math.abs(col - start.col) + Math.abs(row - start.row);
        if (!safe.has(i) && dist >= CONFIG.ENEMY_SAFE_DISTANCE) longe.push({ col, row });
      }
    }

    // Embaralha e reserva células vazias para os inimigos.
    for (let i = longe.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [longe[i], longe[j]] = [longe[j], longe[i]];
    }
    const spawns = longe.splice(0, enemyCount);
    for (const s of spawns) this.grid[this.index(s.col, s.row)] = CELL.EMPTY;

    this._afterGenerate(longe);
    this._refreshBlocks();
    return spawns;
  }

  /** Gancho para etapas extras da geração (ex.: esconder a porta de saída). */
  _afterGenerate(_celulasDistantes) {}

  /** Destrói um bloco destrutível. Devolve true se havia um bloco ali. */
  destroyBlock(col, row) {
    if (this.get(col, row) !== CELL.BLOCK) return false;
    const i = this.index(col, row);
    this.grid[i] = CELL.EMPTY;
    this.blocks.setMatrixAt(i, this._zero);
    this.blocks.instanceMatrix.needsUpdate = true;
    return true;
  }

  // --------------------------------------------------------------- cenário

  _buildGround() {
    // Chão quadriculado (uma única textura gerada por código).
    const px = 32;
    const tex = canvasTexture(COLS * px, ROWS * px, (g) => {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          g.fillStyle = (r + c) % 2 ? '#74d680' : '#63c871';
          g.fillRect(c * px, r * px, px, px);
          g.fillStyle = 'rgba(255,255,255,0.07)';
          g.fillRect(c * px, r * px, px, 2);
          g.fillRect(c * px, r * px, 2, px);
        }
      }
    });
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(COLS, ROWS),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Base em volta da arena, para o cenário não "flutuar" no vazio.
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(COLS + 0.6, 0.6, ROWS + 0.6),
      new THREE.MeshStandardMaterial({ color: 0x39457e, roughness: 0.8 })
    );
    base.position.y = -0.305;
    base.receiveShadow = true;
    this.group.add(base);
  }

  _buildWalls() {
    const cells = [];
    for (let row = 0; row < ROWS; row++)
      for (let col = 0; col < COLS; col++)
        if (this.isFixedWall(col, row)) cells.push({ col, row });

    const corpo = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.56, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.7 }),
      cells.length
    );
    const tampa = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.9, 0.12, 0.9),
      new THREE.MeshStandardMaterial({ roughness: 0.5 }),
      cells.length
    );
    const pos = new THREE.Vector3();
    const cor = new THREE.Color();
    cells.forEach(({ col, row }, i) => {
      const borda = col === 0 || row === 0 || col === COLS - 1 || row === ROWS - 1;
      this.cellToWorld(col, row, pos);
      corpo.setMatrixAt(i, this._m4.makeTranslation(pos.x, 0.28, pos.z));
      tampa.setMatrixAt(i, this._m4.makeTranslation(pos.x, 0.61, pos.z));
      corpo.setColorAt(i, cor.set(borda ? 0x3b4a9c : 0x4f63d2));
      tampa.setColorAt(i, cor.set(borda ? 0x5567c9 : 0x7d92ff));
    });
    for (const m of [corpo, tampa]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
  }

  _buildBlocks() {
    // Textura de "caixote" desenhada por código.
    const tex = canvasTexture(64, 64, (g) => {
      g.fillStyle = '#f2a03d'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#d97f1e';
      g.fillRect(0, 0, 64, 7); g.fillRect(0, 57, 64, 7);
      g.fillRect(0, 0, 7, 64); g.fillRect(57, 0, 7, 64);
      g.strokeStyle = '#d97f1e'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(6, 6); g.lineTo(58, 58); g.stroke();
      g.fillStyle = '#ffc56b';
      g.fillRect(7, 7, 50, 3);
    });
    this.blocks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.9, 0.6, 0.9),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }),
      COLS * ROWS
    );
    this.blocks.castShadow = true;
    this.blocks.receiveShadow = true;
    this.blocks.frustumCulled = false;
    this.group.add(this.blocks);
  }

  /** Atualiza as instâncias dos blocos conforme a grade. */
  _refreshBlocks() {
    const pos = new THREE.Vector3();
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const i = this.index(col, row);
        if (this.grid[i] === CELL.BLOCK) {
          this.cellToWorld(col, row, pos);
          this.blocks.setMatrixAt(i, this._m4.makeTranslation(pos.x, 0.3, pos.z));
        } else {
          this.blocks.setMatrixAt(i, this._zero);
        }
      }
    }
    this.blocks.instanceMatrix.needsUpdate = true;
  }
}
