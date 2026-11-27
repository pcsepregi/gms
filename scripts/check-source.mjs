#!/usr/bin/env node
/**
 * Forráskód-ellenőrzések a CI-hoz (tesztspecifikáció):
 *  - T-EXT-02: a "Lechonk" / "Oinkologne" szó csak tesztekben, fixture-ökben és a
 *    config.json alapértékében (packages/server/src/config.ts) fordulhat elő.
 *  - T-UI-04: a webes CSS-ben nincs színátmenet és üveghatás, a felület szövegeiben nincs emoji.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SOURCE_DIRS = ['packages/shared/src', 'packages/server/src', 'packages/web/src'];
const NAME_ALLOWED = new Set(['packages/server/src/config.ts']);

function walk(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    return e.isDirectory() ? walk(rel) : [rel];
  });
}

const problems = [];
const files = SOURCE_DIRS.flatMap(walk).filter((f) => /\.(ts|tsx|css|html)$/u.test(f));

for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const at = `${file}:${i + 1}`;
    if (!NAME_ALLOWED.has(file) && /lechonk|oinkologne/iu.test(line)) {
      problems.push(`${at}: Pokémon-név a forráskódban (T-EXT-02)`);
    }
    if (file.startsWith('packages/web/') && file.endsWith('.css')) {
      if (/(linear|radial|conic)-gradient|backdrop-filter/u.test(line)) {
        problems.push(`${at}: tiltott stílus (színátmenet / üveghatás, T-UI-04)`);
      }
    }
    if (file.startsWith('packages/web/') && /\p{Extended_Pictographic}/u.test(line)) {
      problems.push(`${at}: emoji a felületen (T-UI-04)`);
    }
  });
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`Forrásellenőrzés rendben (${files.length} fájl).`);
