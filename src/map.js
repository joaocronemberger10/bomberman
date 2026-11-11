// ============================================================================
// map.js — Arena: grade lógica + cenário 3D (chão, paredes e blocos).
// Tudo é feito por código com formas simples; paredes e blocos usam
// InstancedMesh para manter poucas chamadas de desenho (leve no celular).
// ============================================================================
import * as THREE from 'three';
import { CONFIG, THEMES } from './config.js';

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
    this._buildDoor();
    this.setTheme(THEMES[0]);
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
  generate(enemyCount = 0, density = CONFIG.BLOCK_DENSITY) {
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
        this.grid[i] = (!safe.has(i) && Math.random() < density) ? CELL.BLOCK : CELL.EMPTY;
        const dist = Math.abs(col - start.col) + Math.abs(row - start.row);
        if (!safe.has(i) && dist >= CONFIG.ENEMY_SAFE_DISTANCE) longe.push({ col, row });
      }
    }

    // Embaralha e reserva células vazias para os inimigos.
    for (let i = longe.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [longe[i], longe[j]] = [longe[j], longe[i]];
    }
    // Escolhe os pontos de nascimento afastados uns dos outros (quando possível).
    const spawns = [];
    for (const minDist of [5, 3, 0]) {
      for (let i = 0; i < longe.length && spawns.length < enemyCount; i++) {
        const c = longe[i];
        if (spawns.every((s) => Math.abs(s.col - c.col) + Math.abs(s.row - c.row) >= minDist)) {
          spawns.push(c);
          longe.splice(i--, 1);
        }
      }
    }
    for (const s of spawns) {
      this.grid[this.index(s.col, s.row)] = CELL.EMPTY;
      // Abre um pequeno corredor em volta, para o inimigo ter por onde andar.
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let n = 1; n <= 2; n++) {
          const i = this.index(s.col + dx * n, s.row + dz * n);
          if (this.get(s.col + dx * n, s.row + dz * n) === CELL.WALL) break;
          if (!safe.has(i)) this.grid[i] = CELL.EMPTY;
        }
      }
    }

    this._afterGenerate(longe);
    this._refreshBlocks();
    return spawns;
  }

  /** Esconde a porta de saída sob um bloco distante do jogador. */
  _afterGenerate(celulasDistantes) {
    const ehBloco = (c) => this.get(c.col, c.row) === CELL.BLOCK;
    let opcoes = celulasDistantes.filter(ehBloco);
    if (!opcoes.length) {
      // Sem blocos distantes: aceita qualquer bloco da arena.
      for (let row = 1; row < ROWS - 1; row++)
        for (let col = 1; col < COLS - 1; col++)
          if (ehBloco({ col, row })) opcoes.push({ col, row });
    }
    const escolhida = opcoes.length
      ? opcoes[Math.floor(Math.random() * opcoes.length)]
      : this.corners[3];                       // caso extremo: canto oposto, já visível
    this.door = { col: escolhida.col, row: escolhida.row, revealed: !opcoes.length, open: false };

    this.cellToWorld(this.door.col, this.door.row, this.doorMesh.position);
    this.doorMesh.visible = this.door.revealed;
    this.doorLuz.visible = false;
    this.doorMat.color.set(0xff5d73);
    this.doorMat.emissive.set(0x7a1020);
  }

  isDoor(col, row) { return !!this.door && this.door.col === col && this.door.row === row; }

  /** Mostra a porta (chamado quando o bloco que a escondia é destruído). */
  revealDoor() {
    this.door.revealed = true;
    this.doorMesh.visible = true;
  }

  /** Abre a porta (todos os inimigos foram eliminados). */
  openDoor() {
    this.door.open = true;
    this.doorMat.color.set(0x5fe08a);
    this.doorMat.emissive.set(0x1f9d4d);
    this.doorLuz.visible = true;
  }

  /** Animações do cenário (porta pulsando). */
  update(dt) {
    this._t = (this._t || 0) + dt;
    if (this.door && this.door.open) {
      const k = 0.5 + 0.5 * Math.sin(this._t * 5);
      this.doorMat.emissiveIntensity = 0.8 + k * 0.9;
      this.doorLuz.material.opacity = 0.18 + k * 0.18;
      this.doorLuz.rotation.y = this._t;
    }
  }

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
    // Chão quadriculado: uma única textura em canvas, redesenhada a cada cenário.
    this.floorCanvas = document.createElement('canvas');
    this.floorCanvas.width = COLS * 32;
    this.floorCanvas.height = ROWS * 32;
    this.floorTex = new THREE.CanvasTexture(this.floorCanvas);
    this.floorTex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(COLS, ROWS),
      new THREE.MeshStandardMaterial({ map: this.floorTex, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Base em volta da arena, para o cenário não "flutuar" no vazio.
    this.baseMat = new THREE.MeshStandardMaterial({ color: 0x39457e, roughness: 0.8 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(COLS + 0.6, 0.6, ROWS + 0.6), this.baseMat);
    base.position.y = -0.305;
    base.receiveShadow = true;
    this.group.add(base);
  }

  /**
   * Aplica um cenário (veja THEMES em config.js): cores do chão, das paredes
   * e dos blocos. Nada é recriado, só recolorido — é instantâneo.
   */
  setTheme(theme) {
    this.theme = theme;
    const px = 32;

    // Chão
    const g = this.floorCanvas.getContext('2d');
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        g.fillStyle = theme.floor[(r + c) % 2];
        g.fillRect(c * px, r * px, px, px);
        g.fillStyle = 'rgba(255,255,255,0.07)';
        g.fillRect(c * px, r * px, px, 2);
        g.fillRect(c * px, r * px, 2, px);
      }
    }
    this.floorTex.needsUpdate = true;
    this.baseMat.color.set(theme.base);

    // Paredes
    const cor = new THREE.Color();
    this.wallCells.forEach(({ col, row }, i) => {
      const borda = col === 0 || row === 0 || col === COLS - 1 || row === ROWS - 1;
      this.wallBody.setColorAt(i, cor.set(borda ? theme.border : theme.wall));
      this.wallTop.setColorAt(i, cor.set(borda ? theme.borderTop : theme.wallTop));
    });
    this.wallBody.instanceColor.needsUpdate = true;
    this.wallTop.instanceColor.needsUpdate = true;

    // Blocos destrutíveis ("caixote" desenhado por código)
    const b = this.blockCanvas.getContext('2d');
    const [fundo, moldura, brilho] = theme.block;
    b.fillStyle = fundo; b.fillRect(0, 0, 64, 64);
    b.fillStyle = moldura;
    b.fillRect(0, 0, 64, 7); b.fillRect(0, 57, 64, 7);
    b.fillRect(0, 0, 7, 64); b.fillRect(57, 0, 7, 64);
    b.strokeStyle = moldura; b.lineWidth = 7;
    b.beginPath(); b.moveTo(6, 6); b.lineTo(58, 58); b.stroke();
    b.fillStyle = brilho;
    b.fillRect(7, 7, 50, 3);
    this.blockTex.needsUpdate = true;
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
      this.cellToWorld(col, row, pos);
      corpo.setMatrixAt(i, this._m4.makeTranslation(pos.x, 0.28, pos.z));
      tampa.setMatrixAt(i, this._m4.makeTranslation(pos.x, 0.61, pos.z));
      corpo.setColorAt(i, cor.set(0xffffff));
      tampa.setColorAt(i, cor.set(0xffffff));
    });
    this.wallCells = cells;
    this.wallBody = corpo;
    this.wallTop = tampa;
    for (const m of [corpo, tampa]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
  }

  _buildBlocks() {
    // A textura dos blocos é desenhada em setTheme().
    this.blockCanvas = document.createElement('canvas');
    this.blockCanvas.width = this.blockCanvas.height = 64;
    this.blockTex = new THREE.CanvasTexture(this.blockCanvas);
    this.blockTex.colorSpace = THREE.SRGBColorSpace;
    const tex = this.blockTex;
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

  _buildDoor() {
    this.doorMesh = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 0.06, 0.86),
      new THREE.MeshStandardMaterial({ color: 0x2a2f55, roughness: 0.6 })
    );
    base.position.y = 0.03;
    base.receiveShadow = true;
    // Disco central: vermelho (fechada) ou verde brilhante (aberta).
    this.doorMat = new THREE.MeshStandardMaterial({ color: 0xff5d73, emissive: 0x7a1020, roughness: 0.4 });
    const disco = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 24), this.doorMat);
    disco.position.y = 0.07;
    // Feixe de luz que aparece quando a porta abre.
    this.doorLuz = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 1.3, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x7dffb0, transparent: true, opacity: 0.25, depthWrite: false,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      })
    );
    this.doorLuz.position.y = 0.7;
    this.doorMesh.add(base, disco, this.doorLuz);
    this.doorMesh.visible = false;
    this.group.add(this.doorMesh);
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
