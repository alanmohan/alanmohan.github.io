/**
 * Three.js teardown helpers.
 *
 * Lane and entity meshes share geometries and materials owned by MeshFactory.
 * Removing a lane from the scene must therefore NOT dispose those shared
 * resources - they are released once, when the whole game is torn down.
 * Anything created per-object is tagged with `userData.ownedResource = true`
 * and is disposed here.
 */

/** Detaches an object from its parent without touching shared GPU resources. */
export function detach(object) {
  if (object && object.parent) object.parent.remove(object);
}

/**
 * Removes `root` from the scene graph and disposes only the geometries and
 * materials it exclusively owns.
 */
export function disposeOwned(root) {
  if (!root) return;
  detach(root);
  root.traverse((node) => {
    if (!node.userData || node.userData.ownedResource !== true) return;
    if (node.geometry && typeof node.geometry.dispose === 'function') node.geometry.dispose();
    disposeMaterial(node.material);
  });
}

/** Fully disposes an object including shared resources. Use only on teardown. */
export function disposeDeep(root) {
  if (!root) return;
  detach(root);
  root.traverse((node) => {
    if (node.geometry && typeof node.geometry.dispose === 'function') node.geometry.dispose();
    disposeMaterial(node.material);
  });
}

function disposeMaterial(material) {
  if (!material) return;
  const list = Array.isArray(material) ? material : [material];
  for (const entry of list) {
    if (!entry) continue;
    for (const key of Object.keys(entry)) {
      const value = entry[key];
      if (value && value.isTexture && typeof value.dispose === 'function') value.dispose();
    }
    if (typeof entry.dispose === 'function') entry.dispose();
  }
}
