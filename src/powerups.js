// ============================================================================
// powerups.js — Power-ups que saem de alguns blocos destruídos.
// Tipos: +1 bomba, +1 alcance, +velocidade, +1 vida e as bombas especiais
// (remota, perfurante e mega).
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';

/** Aparência de cada tipo (cor de fundo + ícone desenhado em canvas). */
const TYPES = {
  bomb: {
    color: '#3d7bff', label: '+1 bomba',
    icon(g) {
      g.fillStyle = '#1c2340';
      g.beginPath(); g.arc(30, 37, 15, 0, Math.PI * 2); g.fill();
      g.fillRect(36, 15, 8, 10);
      g.fillStyle = '#ffe066';
      g.beginPath(); g.arc(46, 13, 5, 0, Math.PI * 2); g.fill();
    },
  },
  range: {
    color: '#ff5d3d', label: '+1 alcance',
    icon(g) {
      g.fillStyle = '#ffe066';
      g.beginPath();
      g.moveTo(32, 8);
      g.bezierCurveTo(50, 24, 50, 40, 44, 50);
      g.bezierCurveTo(40, 58, 24, 58, 20, 50);
      g.bezierCurveTo(13, 40, 20, 30, 24, 24);
      g.bezierCurveTo(26, 30, 30, 30, 32, 8);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(32, 46, 7, 0, Math.PI * 2); g.fill();
    },
  },
  speed: {
    color: '#22c98a', label: '+ velocidade',
    icon(g) {
      g.fillStyle = '#fff7b0';
      g.beginPath();
      g.moveTo(37, 6); g.lineTo(16, 36); g.lineTo(29, 36);
      g.lineTo(25, 58); g.lineTo(48, 26); g.lineTo(34, 26);
      g.closePath(); g.fill();
    },
  },
  life: {
    color: '#ff4f8b', label: '+1 vida',
    icon(g) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(32, 54);
      g.bezierCurveTo(4, 34, 12, 10, 32, 24);
      g.bezierCurveTo(52, 10, 60, 34, 32, 54);
      g.fill();
    },
  },
  remote: {
    color: '#1d5fd1', label: 'Bomba remota!',
    icon(g) {
      g.fillStyle = '#0d1b3d';
      g.beginPath(); g.arc(28, 40, 14, 0, Math.PI * 2); g.fill();
      g.fillRect(26, 14, 4, 14);
      g.fillStyle = '#ff4040';
      g.beginPath(); g.arc(28, 13, 5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 3;
      for (const r of [9, 15]) { g.beginPath(); g.arc(28, 13, r, -0.9, 0.5); g.stroke(); }
    },
  },
  pierce: {
    color: '#7a2fd0', label: 'Bomba perfurante!',
    icon(g) {
      g.fillStyle = '#1c1036';
      g.beginPath(); g.arc(32, 34, 13, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffe066';
      for (const [x, y, a] of [[32, 10, 0], [56, 34, 1.57], [32, 58, 3.14], [8, 34, -1.57]]) {
        g.save(); g.translate(x, y); g.rotate(a);
        g.beginPath(); g.moveTo(0, -7); g.lineTo(7, 7); g.lineTo(-7, 7); g.closePath(); g.fill();
        g.restore();
      }
    },
  },
  mega: {
    color: '#c2351d', label: 'Mega bomba!',
    icon(g) {
      g.fillStyle = '#2a0b06';
      g.beginPath(); g.arc(32, 36, 19, 0, Math.PI * 2); g.fill();
      g.fillRect(28, 8, 8, 12);
      g.fillStyle = '#ffe066';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 5 : 12, a = -Math.PI / 2 + i * Math.PI / 5;
        g.lineTo(32 + Math.cos(a) * r, 36 + Math.sin(a) * r);
      }
      g.closePath(); g.fill();
    },
  },
};

export const POWERUP_LABELS = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, v.label]));

export class PowerUpManager {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.items = [];   // { type, col, row, mesh, t }
    this.geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this.materials = {};
    for (const [type, def] of Object.entries(TYPES)) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = def.color; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 5; g.strokeRect(3, 3, 58, 58);
      def.icon(g);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.materials[type] = new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.4, emissive: new THREE.Color(def.color), emissiveIntensity: 0.25,
      });
    }
  }

  /** Sorteia um tipo de acordo com os pesos da configuração. */
  randomType() {
    const pesos = CONFIG.POWERUP_WEIGHTS;
    let total = 0;
    for (const k in pesos) total += pesos[k];
    let r = Math.random() * total;
    for (const k in pesos) { r -= pesos[k]; if (r <= 0) return k; }
    return 'bomb';
  }

  spawn(col, row, type = this.randomType()) {
    const mesh = new THREE.Mesh(this.geo, this.materials[type]);
    mesh.castShadow = true;
    this.map.cellToWorld(col, row, mesh.position);
    mesh.scale.setScalar(0.01);
    this.scene.add(mesh);
    this.items.push({ type, col, row, mesh, t: 0 });
  }

  /** Se houver um power-up na célula, remove-o e devolve o tipo. */
  collect(col, row) {
    const i = this.items.findIndex((p) => p.col === col && p.row === row);
    if (i < 0) return null;
    const [item] = this.items.splice(i, 1);
    this.scene.remove(item.mesh);
    return item.type;
  }

  update(dt) {
    for (const p of this.items) {
      p.t += dt;
      const s = Math.min(1, p.t * 5);                        // surge crescendo
      p.mesh.scale.setScalar(s * (1 + Math.sin(p.t * 5) * 0.06));
      p.mesh.position.y = 0.42 + Math.sin(p.t * 3) * 0.07;   // flutua
      p.mesh.rotation.y = p.t * 1.8;                         // gira
    }
  }

  clear() {
    for (const p of this.items) this.scene.remove(p.mesh);
    this.items.length = 0;
  }
}
