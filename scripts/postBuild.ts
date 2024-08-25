import { resolve } from 'path';
import { readdir, rename, rmdir } from 'fs/promises';

const distPath = resolve(import.meta.dir, '../dist');
const distEsmPath = resolve(distPath, 'esm');

const files = await readdir(distEsmPath);

for (const file of files) {
  await rename(resolve(distEsmPath, file), resolve(distPath, file.replace('.js', '.mjs').replace('.ts', '.mts')));
}

await rmdir(distEsmPath);
