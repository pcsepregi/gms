import fs from 'node:fs';
import path from 'node:path';
import { LAUNCH_AGENT_TEMPLATE } from '../paths.js';

/** A LaunchAgent azonosítója (technikai spec 9.2). */
export const LAUNCH_AGENT_LABEL = 'local.gms.server';

export interface LaunchAgentParams {
  /** A Node.js futtatható teljes útja (Homebrew node@22). */
  nodePath: string;
  /** A repó klónja (pl. ~/Applications/gms). */
  appDir: string;
  /** A naplómappa (~/Library/Logs/GMS). */
  logDir: string;
  /** Az adatmappa (~/Library/Application Support/GMS). */
  dataDir: string;
  label?: string;
}

export class LaunchAgentError extends Error {}

function xmlEscape(s: string): string {
  return s
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

/** A LaunchAgent plist kitöltése a sablonból. Minden útnak abszolútnak kell lennie. */
export function renderLaunchAgent(
  params: LaunchAgentParams,
  template: string = fs.readFileSync(LAUNCH_AGENT_TEMPLATE, 'utf8'),
): string {
  for (const [name, value] of Object.entries({
    nodePath: params.nodePath,
    appDir: params.appDir,
    logDir: params.logDir,
    dataDir: params.dataDir,
  })) {
    if (!value || !path.isAbsolute(value)) {
      throw new LaunchAgentError(`A(z) ${name} értéke abszolút út legyen: "${value}"`);
    }
  }
  const appDir = path.resolve(params.appDir);
  const nodeDir = path.dirname(params.nodePath);
  const values: Record<string, string> = {
    LABEL: params.label ?? LAUNCH_AGENT_LABEL,
    NODE: params.nodePath,
    MAIN: path.join(appDir, 'packages', 'server', 'dist', 'main.js'),
    APP_DIR: appDir,
    LOG_DIR: path.resolve(params.logDir),
    DATA_DIR: path.resolve(params.dataDir),
    // A launchd minimális PATH-ot ad; a Node mappáját előre tesszük (pl. a sharp miatt).
    PATH: [nodeDir, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'),
  };
  const out = template.replace(/\{\{([A-Z_]+)\}\}/gu, (whole, key: string) => {
    const v = values[key];
    if (v === undefined) throw new LaunchAgentError(`Ismeretlen sablonmező: ${whole}`);
    return xmlEscape(v);
  });
  return out;
}
