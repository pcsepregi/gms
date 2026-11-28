import { fileURLToPath } from 'node:url';

/** A `migrations/` mappa (src/ és dist/ alól egyaránt ugyanoda mutat). */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

/** A lefordított React felület (`packages/web/dist`). */
export const WEB_DIST_DIR = fileURLToPath(new URL('../../web/dist/', import.meta.url));

export const SERVER_PACKAGE_JSON = fileURLToPath(new URL('../package.json', import.meta.url));

/** A repó gyökere (a telepítő szkriptek és a LaunchAgent-sablon helye). */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** A launchd sablon (technikai spec 9.2). */
export const LAUNCH_AGENT_TEMPLATE = fileURLToPath(
  new URL('../../../scripts/local.gms.server.plist.tmpl', import.meta.url),
);
