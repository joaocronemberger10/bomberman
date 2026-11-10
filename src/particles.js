// ============================================================================
// particles.js — Sistema de partículas leve (um único THREE.Points).
// As partículas ficam em um "pool" fixo: nada é alocado durante o jogo.
// ============================================================================
import * as THREE from 'three';

export class ParticleSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {object} opt
   * @param {number} opt.count    número máximo de partículas
   * @param {number} opt.size     tamanho (em unidades do mundo)
   * @param {boolean} opt.additive brilho aditivo (fogo) ou normal (destroços)
   */
  constructor(scene, { count = 300, size = 0.3, additive = true } = {}) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.col = new Float32Array(count * 4);      // RGBA (o alfa faz o "fade")
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.gravity = new Float32Array(count);
    this.cursor = 0;
    this.vivas = 0;

    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -1000;   // fora de vista

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));

    // Textura redonda e macia desenhada em canvas.
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.75)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);

    const mat = new THREE.PointsMaterial({
      size,
      map: new THREE.CanvasTexture(c),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  /**
   * Emite partículas a partir de um ponto.
   * @param {object} o  count, colors[], speed, up, life, gravity, spread
   */
  emit(x, y, z, { count = 10, colors = [0xffffff], speed = 3, up = 1.5, life = 0.5, gravity = 6, spread = 0.2 } = {}) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.count;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.pos[i * 3] = x + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = up * (0.4 + Math.random() * 0.8);
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      this._c.set(colors[Math.floor(Math.random() * colors.length)]);
      this.col[i * 4] = this._c.r; this.col[i * 4 + 1] = this._c.g; this.col[i * 4 + 2] = this._c.b;
      this.col[i * 4 + 3] = 1;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.4);
      this.gravity[i] = gravity;
    }
    this.vivas = this.count;   // força a atualização nos próximos quadros
  }

  update(dt) {
    if (!this.vivas) return;
    let vivas = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      if (this.life[i] <= 0) {
        this.pos[j + 1] = -1000;
        this.col[i * 4 + 3] = 0;
        continue;
      }
      vivas++;
      this.vel[j + 1] -= this.gravity[i] * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.05) { this.pos[j + 1] = 0.05; this.vel[j + 1] *= -0.4; }
      this.col[i * 4 + 3] = Math.min(1, (this.life[i] / this.maxLife[i]) * 1.6);
    }
    this.vivas = vivas;
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
