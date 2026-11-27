import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { readVersion, startServer } from '../src/server.js';
import { tempDir } from './helpers.js';

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

describe('szerver indítása', () => {
  it('a 127.0.0.1 címen hallgat, létrehozza és migrálja az adatbázist', async () => {
    const port = await freePort();
    const config = loadConfig({ dataDir: tempDir(), env: { GMS_PORT: String(port) } });
    const app = await startServer(config, { logger: false, webDistDir: null });
    try {
      const addr = app.server.address() as net.AddressInfo;
      expect(addr.address).toBe('127.0.0.1');
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(await res.json()).toMatchObject({ ok: true, version: readVersion() });
    } finally {
      await app.close();
    }
  });

  it('foglalt port esetén hibát dob', async () => {
    const port = await freePort();
    const blocker = net.createServer().listen(port, '127.0.0.1');
    await new Promise((r) => blocker.once('listening', r));
    try {
      const config = loadConfig({ dataDir: tempDir(), env: { GMS_PORT: String(port) } });
      await expect(startServer(config, { logger: false, webDistDir: null })).rejects.toThrow(
        /EADDRINUSE/u,
      );
    } finally {
      blocker.close();
    }
  });
});
