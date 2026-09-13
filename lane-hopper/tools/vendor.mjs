#!/usr/bin/env node
/**
 * Refreshes the vendored copy of Three.js in vendor/three/.
 *
 * The game runs as plain ES modules with no build step, so Three.js is committed
 * to the repository rather than resolved from node_modules at runtime. This
 * script copies it from the version pinned in package.json, so the vendored
 * files always have a known provenance.
 *
 * Usage: npm run vendor
 */

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'three');
const target = join(root, 'vendor', 'three');

/**
 * Only the self-contained build files are copied. Addons under examples/jsm are
 * deliberately not vendored: they import Three.js through the bare specifier
 * `'three'`, which a browser cannot resolve without a bundler or an import map.
 * The one helper this project needed, mergeGeometries, lives in
 * src/utils/geometry.js instead.
 */
const FILES = ['build/three.module.js', 'build/three.core.js', 'LICENSE'];

async function main() {
  let version;
  try {
    const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
    version = pkg.version;
  } catch {
    console.error(
      'Could not read node_modules/three. Run `npm install` first, then `npm run vendor`.'
    );
    process.exit(1);
  }

  await mkdir(target, { recursive: true });

  for (const file of FILES) {
    const name = file.split('/').pop();
    await copyFile(join(source, file), join(target, name));
    console.log(`copied ${name}`);
  }

  // Record what was vendored, so the committed copy is traceable.
  await writeFile(
    join(target, 'VERSION'),
    `three ${version}\n` +
      'Copied from node_modules/three by tools/vendor.mjs. Do not edit by hand.\n' +
      'Licensed under the MIT License; see LICENSE in this directory.\n',
    'utf8'
  );

  console.log(`\nvendored three ${version} into vendor/three/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
