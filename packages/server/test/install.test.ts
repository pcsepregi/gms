import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runImportCli } from '../src/cli/import-cli.js';
import { checkHealth, formatHealth, type HealthReport } from '../src/cli/health.js';
import { runOpsCli } from '../src/cli/ops.js';
import { loadConfig } from '../src/config.js';
import { LaunchAgentError, renderLaunchAgent } from '../src/install/launchd.js';
import { DailyLogFile } from '../src/logfile.js';
import { startServer } from '../src/server.js';
import { fixture, tempDir } from './helpers.js';

function io(env: NodeJS.ProcessEnv = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l), env },
  };
}

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

const PARAMS = {
  nodePath: '/opt/homebrew/opt/node@22/bin/node',
  appDir: '/Users/teszt/Applications/gms',
  logDir: '/Users/teszt/Library/Logs/GMS',
  dataDir: '/Users/teszt/Library/Application Support/GMS',
};

describe('T-INS-10 LaunchAgent plist (technikai spec 9.2)', () => {
  it('a sablonból kitölti a címkét, a Node utat, a main.js-t és a mappákat', () => {
    const xml = renderLaunchAgent(PARAMS);
    expect(xml).toContain('<string>local.gms.server</string>');
    expect(xml).toContain(
      '<string>/opt/homebrew/opt/node@22/bin/node</string>\n    <string>/Users/teszt/Applications/gms/packages/server/dist/main.js</string>',
    );
    expect(xml).toContain('<string>/Users/teszt/Library/Application Support/GMS</string>');
    expect(xml).toContain('<string>/Users/teszt/Library/Logs/GMS/launchd.err.log</string>');
    expect(xml).toContain(
      '<string>/opt/homebrew/opt/node@22/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>',
    );
    expect(xml).not.toMatch(/\{\{/u);
  });

  it('RunAtLoad, KeepAlive és 10 mp ThrottleInterval (S-60: fél percen belül újraindul)', () => {
    const xml = renderLaunchAgent(PARAMS);
    expect(xml).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/u);
    expect(xml).toMatch(/<key>KeepAlive<\/key>\s*<true\/>/u);
    expect(xml).toMatch(/<key>ThrottleInterval<\/key>\s*<integer>10<\/integer>/u);
  });

  it('XML-escape: különleges karakter az útban nem rontja el a plistet', () => {
    const xml = renderLaunchAgent({ ...PARAMS, appDir: '/Users/a&b/<gms>' });
    expect(xml).toContain('<string>/Users/a&amp;b/&lt;gms&gt;</string>');
  });

  it('relatív út vagy ismeretlen sablonmező: hiba', () => {
    expect(() => renderLaunchAgent({ ...PARAMS, nodePath: 'node' })).toThrow(LaunchAgentError);
    expect(() => renderLaunchAgent(PARAMS, '<string>{{SEMMI}}</string>')).toThrow(
      /Ismeretlen sablonmező/u,
    );
  });
});

describe('T-INS-11 naponta forgatott napló (technikai spec 9.1)', () => {
  it('napváltáskor archivál, a 14 napnál régebbieket törli', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'gms-2026-11-01.log'), 'régi\n');
    fs.writeFileSync(path.join(dir, 'gms-2026-11-20.log'), 'friss\n');
    let now = new Date(2026, 10, 27, 23, 59);
    const log = new DailyLogFile(dir, () => now);
    log.write('első nap\n');
    now = new Date(2026, 10, 28, 0, 1);
    log.write(Buffer.from('második nap\n'));
    log.close();
    expect(fs.readFileSync(path.join(dir, 'gms-2026-11-27.log'), 'utf8')).toBe('első nap\n');
    expect(fs.readFileSync(path.join(dir, 'gms.log'), 'utf8')).toBe('második nap\n');
    expect(fs.existsSync(path.join(dir, 'gms-2026-11-01.log'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'gms-2026-11-20.log'))).toBe(true);
  });

  it('indításkor a korábbi napról maradt gms.log-ot elforgatja, meglévő archívhoz hozzáfűz', () => {
    const dir = tempDir();
    const file = path.join(dir, 'gms.log');
    fs.writeFileSync(file, 'tegnapi 2\n');
    const yesterday = new Date(2026, 10, 27, 12);
    fs.utimesSync(file, yesterday, yesterday);
    fs.writeFileSync(path.join(dir, 'gms-2026-11-27.log'), 'tegnapi 1\n');
    const log = new DailyLogFile(dir, () => new Date(2026, 10, 28, 8));
    log.write('mai\n');
    log.close();
    expect(fs.readFileSync(path.join(dir, 'gms-2026-11-27.log'), 'utf8')).toBe(
      'tegnapi 1\ntegnapi 2\n',
    );
    expect(fs.readFileSync(file, 'utf8')).toBe('mai\n');
  });

  it('a szerver a naplófájlba ír, ha stream-et kap', async () => {
    const dir = tempDir();
    const log = new DailyLogFile(path.join(dir, 'logs'));
    const port = await freePort();
    const config = loadConfig({ dataDir: dir, env: { GMS_PORT: String(port) } });
    const app = await startServer(config, {
      logger: { level: 'info', stream: log },
      webDistDir: null,
      collector: false,
    });
    await app.close();
    log.close();
    expect(fs.readFileSync(log.file, 'utf8')).toMatch(/"msg":"Server listening at/u);
  });
});

describe('T-INS-12 health check (npm run health)', () => {
  it('futó szerver: összesítő a kártyákról, képekről, mentésről', async () => {
    const dir = tempDir();
    const port = await freePort();
    const config = loadConfig({ dataDir: dir, env: { GMS_PORT: String(port) } });
    expect(
      await runImportCli(['--file', fixture('sample-master.xlsx'), '--data-dir', dir], io().io),
    ).toBe(0);
    const app = await startServer(config, { logger: false, webDistDir: null, collector: false });
    try {
      const t = io({ GMS_PORT: String(port) });
      expect(await runOpsCli(['health', '--data-dir', dir, '--wait', '2'], t.io)).toBe(0);
      const text = t.out.join('\n');
      expect(text).toContain(`A GMS fut: http://127.0.0.1:${port}`);
      expect(text).toContain('Kártyák: 43 (megvan: 22, hiányzik: 21)');
      expect(text).toContain('Képek: pontos 0');
      expect(text).toContain('FIGYELEM: a napi mentés nincs beállítva');
    } finally {
      await app.close();
    }
  });

  it('nem futó szerver: 1-es kód, várakozás után is', async () => {
    const port = await freePort();
    const t = io({ GMS_PORT: String(port) });
    expect(await runOpsCli(['health', '--data-dir', tempDir(), '--wait', '1'], t.io)).toBe(1);
    expect(t.err[0]).toContain('nem válaszol');
    expect(await runOpsCli(['health', '--wait', 'x'], io().io)).toBe(2);
  });

  it('megvárja, amíg a szerver elindul', async () => {
    let calls = 0;
    const fakeFetch = (async (url: string) => {
      calls++;
      if (calls < 3) throw new Error('ECONNREFUSED');
      const body = url.endsWith('/api/health')
        ? { ok: true, version: '1', dbPath: '/x', appTitle: 'GMS' }
        : null;
      return new Response(JSON.stringify(body), { status: body ? 200 : 404 });
    }) as typeof fetch;
    const r = await checkHealth(
      { port: 1, waitSeconds: 5 },
      { out: () => {}, err: () => {}, fetch: fakeFetch, sleep: async () => {} },
    );
    expect(r?.health.ok).toBe(true);
    expect(r?.stats).toBeNull();
  });

  it('mentési állapot figyelmeztetései', () => {
    const base: HealthReport = {
      health: { ok: true, version: '1', dbPath: '/x', appTitle: 'GMS' },
      stats: { all: 0, owned: 0 },
      images: null,
      backup: {
        configured: true,
        targetDir: '/od/GMS',
        lastOkAt: null,
        lastStatus: null,
        lastError: null,
        stale: false,
        running: false,
      },
    };
    let f = formatHealth(base, 4747);
    expect(f.warnings).toBe(1);
    expect(f.lines.join('\n')).toContain('az adatbázis üres');
    expect(f.lines.join('\n')).toContain('Mentés: még nem volt');
    f = formatHealth(
      { ...base, backup: { ...base.backup!, lastStatus: 'error', lastError: 'EACCES' } },
      4747,
    );
    expect(f.lines.join('\n')).toContain('az utolsó mentés hibás: EACCES');
    f = formatHealth(
      { ...base, backup: { ...base.backup!, lastOkAt: '2026-11-01T00:00:00Z', stale: true } },
      4747,
    );
    expect(f.lines.join('\n')).toContain('26 óránál régebbi');
  });
});

describe('T-INS-13 telepítő segédparancsok (npm run ops)', () => {
  it('config: a backupDir beállítása megtartja a többi mezőt', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ port: 4800 }));
    const t = io();
    expect(
      await runOpsCli(['config', '--data-dir', dir, '--set-backup-dir', '/od/GMS'], t.io),
    ).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'))).toEqual({
      port: 4800,
      backupDir: '/od/GMS',
    });
    const g = io();
    expect(await runOpsCli(['config', '--data-dir', dir, '--get', 'backupDir'], g.io)).toBe(0);
    expect(g.out).toEqual(['/od/GMS']);
    expect(await runOpsCli(['config', '--data-dir', dir, '--get', 'nincs'], io().io)).toBe(2);
    expect(await runOpsCli(['config', '--data-dir', dir], io().io)).toBe(2);
  });

  it('config: hibás config.json esetén 1-es kód', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'config.json'), '{');
    const t = io();
    expect(await runOpsCli(['config', '--data-dir', dir, '--set-backup-dir', '/x'], t.io)).toBe(1);
    expect(t.err[0]).toContain('config.json');
  });

  it('card-count és snapshot', async () => {
    const dir = tempDir();
    let t = io();
    expect(await runOpsCli(['snapshot', '--data-dir', dir], t.io)).toBe(0);
    expect(t.out[0]).toContain('nincs mit menteni');
    t = io();
    expect(await runOpsCli(['card-count', '--data-dir', dir], t.io)).toBe(0);
    expect(t.out).toEqual(['0']);
    await runImportCli(['--file', fixture('sample-master.xlsx'), '--data-dir', dir], io().io);
    t = io();
    await runOpsCli(['card-count', '--data-dir', dir], t.io);
    expect(t.out).toEqual(['43']);
    t = io();
    expect(await runOpsCli(['snapshot', '--data-dir', dir, '--label', 'pre-update'], t.io)).toBe(0);
    const copies = fs.readdirSync(dir).filter((f) => f.startsWith('gms.sqlite.pre-update-'));
    expect(copies).toHaveLength(1);
  });

  it('launch-agent: fájlba vagy a kimenetre írja a plistet', async () => {
    const dir = tempDir();
    const out = path.join(dir, 'LaunchAgents', 'local.gms.server.plist');
    const base = ['launch-agent', '--node', PARAMS.nodePath, '--app-dir', PARAMS.appDir];
    const args = [...base, '--log-dir', PARAMS.logDir, '--data-dir', dir];
    expect(await runOpsCli([...args, '--out', out], io().io)).toBe(0);
    expect(fs.readFileSync(out, 'utf8')).toContain(`<string>${dir}</string>`);
    const t = io();
    expect(await runOpsCli(args, t.io)).toBe(0);
    expect(t.out[0]).toMatch(/^<\?xml/u);
    expect(await runOpsCli(base, io().io)).toBe(2);
    expect(await runOpsCli([...base, '--log-dir', 'relatív'], io().io)).toBe(1);
  });

  it('használati hibák', async () => {
    expect(await runOpsCli([], io().io)).toBe(2);
    expect(await runOpsCli(['ismeretlen'], io().io)).toBe(2);
    expect(await runOpsCli(['--help'], io().io)).toBe(0);
    expect(await runOpsCli(['health', '--rossz'], io().io)).toBe(2);
  });
});

describe('T-INS-14 import --if-empty (telepítő)', () => {
  it('nem üres adatbázisnál 0-s kód és nem változik semmi', async () => {
    const dir = tempDir();
    const args = ['--file', fixture('sample-master.xlsx'), '--data-dir', dir, '--if-empty'];
    expect(await runImportCli(args, io().io)).toBe(0);
    const t = io();
    expect(await runImportCli(args, t.io)).toBe(0);
    expect(t.out[0]).toContain('már 43 kártya van, az import kimarad');
  });
});
