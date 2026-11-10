// ============================================================================
// model.js — Utilidades para modelos GLB (jogador e inimigos).
// ============================================================================
import * as THREE from 'three';

/**
 * Mede a caixa envolvente real do modelo. Malhas com esqueleto precisam ter
 * os ossos atualizados antes, senão a medida sai errada (o Meshy/Blender
 * costuma exportar a armação com escala 0,01).
 */
export function measureModel(model, box = new THREE.Box3()) {
  box.makeEmpty();
  model.updateMatrixWorld(true);
  const parcial = new THREE.Box3();
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isSkinnedMesh) {
      o.skeleton.update();
      o.computeBoundingBox();          // considera a pose dos ossos
      parcial.copy(o.boundingBox);
    } else {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      parcial.copy(o.geometry.boundingBox);
    }
    box.union(parcial.applyMatrix4(o.matrixWorld));
  });
  return box;
}

/**
 * Normaliza um modelo: passa a ter `height` de altura, fica centralizado na
 * célula e com os pés no chão. Também liga as sombras. Devolve um grupo
 * pronto para ser adicionado à cena.
 */
export function normalizeModel(model, height) {
  const box = measureModel(model);
  const size = box.getSize(new THREE.Vector3());
  if (!(size.y > 0)) throw new Error('modelo sem dimensões válidas');
  model.scale.multiplyScalar(height / size.y);
  measureModel(model, box);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;   // malhas com esqueleto podem "sumir" sem isto
    }
  });

  const wrapper = new THREE.Group();
  wrapper.add(model);
  return wrapper;
}
