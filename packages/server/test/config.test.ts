import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, defaultDataDir, loadConfig } from '../src/config.js';
import { tempDir, testConfig } from './helpers.js';

describe('beállítások', () => {
  it('alapértékek: 127.0.0.1:4747, adatbázis és képek az adatmappában', () => {
    const c = testConfig();
    expect(c).toMatchObject({ host: '127.0.0.1', port: 4747, backupDir: null });
    expect(c.dbPath).toBe(path.join(c.dataDir, 'gms.sqlite'));
    expect(c.imagesDir).toBe(path.join(c.dataDir, 'images'));
    expect(c.appTitle).toBe('Lechonk & Oinkologne gyűjtemény');
  });

  it('macOS-en az Application Support/GMS mappa', () => {
    expect(defaultDataDir('darwin', '/Users/p')).toBe('/Users/p/Library/Application Support/GMS');
    expect(defaultDataDir('linux', '/home/p')).toBe('/home/p/.local/share/gms');
  });

  it('config.json és környezeti változók', () => {
    const c = testConfig({ port: 5000, backupDir: '/tmp/od', appTitle: 'Saját' });
    expect(c).toMatchObject({ port: 5000, backupDir: '/tmp/od', appTitle: 'Saját' });
    expect(loadConfig({ dataDir: c.dataDir, env: { GMS_PORT: '6000' } }).port).toBe(6000);
    expect(loadConfig({ env: { GMS_DATA_DIR: c.dataDir } }).dataDir).toBe(c.dataDir);
  });

  it('S-61/EF1 (T-SEC-01): más kötési cím megadása hibát ad', () => {
    expect(() => testConfig({ host: '0.0.0.0' })).toThrow(ConfigError);
    expect(() => testConfig({ host: '127.0.0.1' })).not.toThrow();
  });

  it('hibás port és hibás config.json', () => {
    expect(() => testConfig({ port: 'abc' })).toThrow(/Érvénytelen port/u);
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'config.json'), '{nem json');
    expect(() => loadConfig({ dataDir: dir, env: {} })).toThrow(/nem olvasható/u);
  });
});
