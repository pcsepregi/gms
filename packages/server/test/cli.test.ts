import { describe, expect, it } from 'vitest';
import { runImportCli } from '../src/cli/import-cli.js';
import { openDb } from '../src/db/open.js';
import { fixture, tempDir } from './helpers.js';

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l), env: {} },
  };
}

describe('import parancs (npm run import)', () => {
  it('sikeres import: 0 kilépési kód, összesítő a konzolon', async () => {
    const dir = tempDir();
    const t = io();
    const code = await runImportCli(
      ['--file', fixture('sample-master.xlsx'), '--data-dir', dir],
      t.io,
    );
    expect(code).toBe(0);
    expect(t.out.join('\n')).toContain('Kártyák: 43 (megvan: 22, hiányzik: 21)');
    const db = openDb(`${dir}/gms.sqlite`);
    expect((db.prepare('SELECT COUNT(*) n FROM card').get() as { n: number }).n).toBe(43);
    db.close();
  });

  it('T-IMP-07: második futtatás (--force-szal is) ≠ 0 kilépési kód, nem változik semmi', async () => {
    const dir = tempDir();
    const args = ['--file', fixture('sample-master.xlsx'), '--data-dir', dir];
    expect(await runImportCli(args, io().io)).toBe(0);
    const t = io();
    expect(await runImportCli([...args, '--force'], t.io)).toBe(1);
    expect(t.err.join('\n')).toContain('már 43 kártya van');
    expect(t.err.join('\n')).toContain('--force');
  });

  it('hibás fájl: 1-es kód, a hiba a sort nevezi meg', async () => {
    const t = io();
    const code = await runImportCli(
      ['--file', fixture('bad-language.xlsx'), '--data-dir', tempDir()],
      t.io,
    );
    expect(code).toBe(1);
    expect(t.err.join('\n')).toContain('7. sor: ismeretlen nyelv: "Klingon"');
  });

  it('használati hibák', async () => {
    let t = io();
    expect(await runImportCli([], t.io)).toBe(2);
    expect(t.err[0]).toContain('Hiányzik a --file');
    t = io();
    expect(await runImportCli(['--ismeretlen'], t.io)).toBe(2);
    t = io();
    expect(await runImportCli(['--help'], t.io)).toBe(0);
    expect(t.out[0]).toContain('Használat');
  });

  it('nem import jellegű hiba (pl. hibás config.json) is 1-es kódot ad', async () => {
    const dir = tempDir();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(`${dir}/config.json`, '{"host":"0.0.0.0"}');
    const t = io();
    expect(await runImportCli(['--file', 'x.xlsx', '--data-dir', dir], t.io)).toBe(1);
    expect(t.err[0]).toMatch(/^Hiba: .*127\.0\.0\.1/u);
  });
});
