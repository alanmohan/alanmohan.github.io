import { describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Vector3
} from '../vendor/three/three.module.js';
import { mergeGeometries } from '../src/utils/geometry.js';

/**
 * The project replaced Three.js's BufferGeometryUtils addon with its own
 * mergeGeometries, because that addon imports Three.js through a bare specifier
 * a browser cannot resolve without a bundler. These tests pin the replacement's
 * behaviour against the geometry the renderer actually merges.
 */

/** Every triangle corner of a geometry, resolved through its index. */
function triangleVertices(geometry) {
  const position = geometry.attributes.position;
  const index = geometry.index;
  const out = [];
  for (let i = 0; i < index.count; i += 1) {
    const v = index.getX(i);
    out.push(
      `${position.getX(v).toFixed(4)},${position.getY(v).toFixed(4)},${position.getZ(v).toFixed(4)}`
    );
  }
  return out;
}

describe('mergeGeometries', () => {
  it('returns null for an empty list', () => {
    expect(mergeGeometries([])).toBeNull();
    expect(mergeGeometries(null)).toBeNull();
  });

  it('returns an independent clone for a single geometry', () => {
    const box = new BoxGeometry(1, 2, 3);
    const merged = mergeGeometries([box]);

    expect(merged).not.toBe(box);
    expect(merged.attributes.position.count).toBe(box.attributes.position.count);
    expect(merged.index.count).toBe(box.index.count);
  });

  it('sums vertex and index counts', () => {
    const a = new BoxGeometry(1, 1, 1);
    const b = new BoxGeometry(2, 2, 2);
    const merged = mergeGeometries([a, b]);

    expect(merged.attributes.position.count).toBe(
      a.attributes.position.count + b.attributes.position.count
    );
    expect(merged.index.count).toBe(a.index.count + b.index.count);
  });

  it('carries every attribute across', () => {
    const merged = mergeGeometries([new BoxGeometry(1, 1, 1), new BoxGeometry(1, 1, 1)]);
    expect(Object.keys(merged.attributes).sort()).toEqual(['normal', 'position', 'uv']);
    for (const name of ['position', 'normal', 'uv']) {
      expect(merged.attributes[name].count, name).toBe(merged.attributes.position.count);
    }
  });

  it('preserves each source geometry offset, so merged parts keep their places', () => {
    // This is the property MeshFactory relies on: parts are positioned by
    // translating their geometry before merging.
    const left = new BoxGeometry(1, 1, 1).translate(-5, 0, 0);
    const right = new BoxGeometry(1, 1, 1).translate(5, 0, 0);
    const merged = mergeGeometries([left, right]);

    merged.computeBoundingBox();
    expect(merged.boundingBox.min.x).toBeCloseTo(-5.5, 6);
    expect(merged.boundingBox.max.x).toBeCloseTo(5.5, 6);

    // Both clusters are present, not one duplicated.
    const xs = [];
    const position = merged.attributes.position;
    for (let i = 0; i < position.count; i += 1) xs.push(position.getX(i));
    expect(xs.some((x) => x < -4)).toBe(true);
    expect(xs.some((x) => x > 4)).toBe(true);
  });

  it('rebases indices so every triangle references its own vertices', () => {
    const a = new BoxGeometry(1, 1, 1).translate(-3, 0, 0);
    const b = new BoxGeometry(1, 1, 1).translate(3, 0, 0);
    const merged = mergeGeometries([a, b]);

    // The merged triangle list must equal the concatenation of the originals.
    expect(triangleVertices(merged)).toEqual([...triangleVertices(a), ...triangleVertices(b)]);

    // No index may point outside the merged vertex range.
    const vertexCount = merged.attributes.position.count;
    for (let i = 0; i < merged.index.count; i += 1) {
      expect(merged.index.getX(i)).toBeLessThan(vertexCount);
      expect(merged.index.getX(i)).toBeGreaterThanOrEqual(0);
    }
  });

  it('produces a geometry with correct surface area for merged boxes', () => {
    // A geometric sanity check independent of vertex ordering: two unit cubes
    // far apart must enclose twice one cube's triangle area.
    const area = (geometry) => {
      const position = geometry.attributes.position;
      const index = geometry.index;
      const a = new Vector3();
      const b = new Vector3();
      const c = new Vector3();
      let total = 0;
      for (let i = 0; i < index.count; i += 3) {
        a.fromBufferAttribute(position, index.getX(i));
        b.fromBufferAttribute(position, index.getX(i + 1));
        c.fromBufferAttribute(position, index.getX(i + 2));
        total += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
      }
      return total;
    };

    const single = new BoxGeometry(1, 1, 1);
    const merged = mergeGeometries([
      new BoxGeometry(1, 1, 1).translate(-4, 0, 0),
      new BoxGeometry(1, 1, 1).translate(4, 0, 0)
    ]);

    expect(area(single)).toBeCloseTo(6, 5);
    expect(area(merged)).toBeCloseTo(12, 5);
  });

  it('merges cylinders, as the log and wheel meshes do', () => {
    const parts = [];
    for (const x of [-1, 1]) {
      const cylinder = new CylinderGeometry(0.14, 0.14, 0.12, 10);
      cylinder.rotateX(Math.PI / 2);
      cylinder.translate(x, 0, 0);
      parts.push(cylinder);
    }
    const merged = mergeGeometries(parts);

    expect(merged.attributes.position.count).toBe(
      parts[0].attributes.position.count + parts[1].attributes.position.count
    );
    merged.computeBoundingBox();
    expect(merged.boundingBox.min.x).toBeLessThan(-1);
    expect(merged.boundingBox.max.x).toBeGreaterThan(1);
  });

  it('merges many parts at once, as the dash and sleeper rows do', () => {
    const parts = [];
    for (let x = -12; x <= 12; x += 1) parts.push(new BoxGeometry(0.5, 0.04, 0.09).translate(x, 0, 0));

    const merged = mergeGeometries(parts);
    const expectedVertices = parts.reduce((sum, p) => sum + p.attributes.position.count, 0);
    expect(merged.attributes.position.count).toBe(expectedVertices);

    merged.computeBoundingBox();
    expect(merged.boundingBox.min.x).toBeCloseTo(-12.25, 6);
    expect(merged.boundingBox.max.x).toBeCloseTo(12.25, 6);
  });

  it('widens the index type when the merged geometry outgrows 16 bits', () => {
    const small = mergeGeometries([new BoxGeometry(1, 1, 1), new BoxGeometry(1, 1, 1)]);
    expect(small.index.array).toBeInstanceOf(Uint16Array);

    // Enough high-segment cylinders to push the total past the 16 bit limit.
    const big = [];
    for (let i = 0; i < 6; i += 1) big.push(new CylinderGeometry(1, 1, 1, 200, 60));
    const total = big.reduce((sum, g) => sum + g.attributes.position.count, 0);
    expect(total).toBeGreaterThan(65535);

    const merged = mergeGeometries(big);
    expect(merged.index.array).toBeInstanceOf(Uint32Array);
    // Indices beyond the 16 bit limit survive intact.
    let max = 0;
    for (let i = 0; i < merged.index.count; i += 1) max = Math.max(max, merged.index.getX(i));
    expect(max).toBeGreaterThan(65535);
  });

  it('preserves the array type of each attribute', () => {
    const merged = mergeGeometries([new BoxGeometry(1, 1, 1), new BoxGeometry(1, 1, 1)]);
    expect(merged.attributes.position.array).toBeInstanceOf(Float32Array);
    expect(merged.attributes.position.itemSize).toBe(3);
    expect(merged.attributes.uv.itemSize).toBe(2);
  });

  it('handles non-indexed geometries', () => {
    const make = (offset) => {
      const geometry = new BufferGeometry();
      const values = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0].map((v, i) => (i % 3 === 0 ? v + offset : v)));
      geometry.setAttribute('position', new BufferAttribute(values, 3));
      return geometry;
    };

    const merged = mergeGeometries([make(0), make(10)]);
    expect(merged.index).toBeNull();
    expect(merged.attributes.position.count).toBe(6);
    expect(merged.attributes.position.getX(3)).toBeCloseTo(10, 6);
  });

  it('rejects mismatched attribute sets rather than corrupting the result', () => {
    const box = new BoxGeometry(1, 1, 1);
    const bare = new BufferGeometry();
    bare.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0]), 3));
    bare.setIndex(new BufferAttribute(new Uint16Array([0]), 1));

    expect(() => mergeGeometries([box, bare])).toThrow(/attribute sets differ/);
  });

  it('rejects mixing indexed and non-indexed geometries', () => {
    const indexed = new BoxGeometry(1, 1, 1);
    const nonIndexed = indexed.clone().toNonIndexed();
    expect(() => mergeGeometries([indexed, nonIndexed])).toThrow(/indexed and non-indexed/);
  });

  it('leaves the source geometries untouched', () => {
    const a = new BoxGeometry(1, 1, 1);
    const b = new BoxGeometry(1, 1, 1);
    const beforeA = Array.from(a.attributes.position.array);
    const beforeIndexA = Array.from(a.index.array);

    mergeGeometries([a, b]);

    expect(Array.from(a.attributes.position.array)).toEqual(beforeA);
    expect(Array.from(a.index.array)).toEqual(beforeIndexA);
  });
});
