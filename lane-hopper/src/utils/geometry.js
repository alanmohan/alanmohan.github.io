import { BufferAttribute, BufferGeometry } from '../../vendor/three/three.module.js';

/**
 * Merges several geometries that share one material into a single geometry.
 *
 * This replaces the one function the project needed from Three.js's
 * BufferGeometryUtils addon. That addon imports Three.js through the bare
 * specifier `'three'`, which a browser cannot resolve without a bundler or an
 * import map. Implementing the single function here keeps the game runnable as
 * plain ES modules with no build step and nothing to configure.
 *
 * Scope is deliberately narrow: the inputs are the primitive box and cylinder
 * geometries built by MeshFactory, so every geometry is indexed and carries the
 * same attribute set. Anything else is rejected rather than silently mishandled.
 *
 * @param {BufferGeometry[]} geometries
 * @returns {BufferGeometry|null} a new geometry, or null for an empty list
 */
export function mergeGeometries(geometries) {
  if (!Array.isArray(geometries) || geometries.length === 0) return null;
  if (geometries.length === 1) return geometries[0].clone();

  const first = geometries[0];
  const attributeNames = Object.keys(first.attributes).sort();
  const isIndexed = first.index !== null;

  for (const geometry of geometries) {
    const names = Object.keys(geometry.attributes).sort();
    if (names.join(',') !== attributeNames.join(',')) {
      throw new Error(
        `mergeGeometries: attribute sets differ (${names.join(',')} vs ${attributeNames.join(',')})`
      );
    }
    if ((geometry.index !== null) !== isIndexed) {
      throw new Error('mergeGeometries: cannot mix indexed and non-indexed geometries');
    }
  }

  let vertexCount = 0;
  let indexCount = 0;
  for (const geometry of geometries) {
    vertexCount += geometry.attributes.position.count;
    if (isIndexed) indexCount += geometry.index.count;
  }

  const merged = new BufferGeometry();

  for (const name of attributeNames) {
    const template = first.attributes[name];
    const ArrayType = template.array.constructor;
    const values = new ArrayType(vertexCount * template.itemSize);

    let offset = 0;
    for (const geometry of geometries) {
      const attribute = geometry.attributes[name];
      if (attribute.itemSize !== template.itemSize) {
        throw new Error(`mergeGeometries: itemSize differs for attribute "${name}"`);
      }
      values.set(attribute.array, offset);
      offset += attribute.array.length;
    }

    merged.setAttribute(name, new BufferAttribute(values, template.itemSize, template.normalized));
  }

  if (isIndexed) {
    // Indices are offset by the vertices already written, and widened to 32 bit
    // when the merged geometry no longer fits in 16.
    const IndexType = vertexCount > 65535 ? Uint32Array : Uint16Array;
    const indices = new IndexType(indexCount);

    let indexOffset = 0;
    let vertexOffset = 0;
    for (const geometry of geometries) {
      const index = geometry.index;
      for (let i = 0; i < index.count; i += 1) {
        indices[indexOffset + i] = index.getX(i) + vertexOffset;
      }
      indexOffset += index.count;
      vertexOffset += geometry.attributes.position.count;
    }

    merged.setIndex(new BufferAttribute(indices, 1));
  }

  return merged;
}
