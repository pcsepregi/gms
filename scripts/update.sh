#!/usr/bin/env bash
# GMS frissítése (technikai spec 9.3, ET-11).
#
#   scripts/update.sh [--no-pull] [--skip-backup] [--skip-build]
#
# Lépések: helyi adatbázis-másolat és OneDrive mentés, git pull (main), npm ci, build,
# LaunchAgent frissítése, újraindítás, health check. Az adatbázis-migrációkat a szerver
# induláskor futtatja (előtte saját másolatot is készít).
set -euo pipefail

# shellcheck source=scripts/lib.sh
. "$(dirname "$0")/lib.sh"

PULL=1
BACKUP=1
BUILD=1
while [ $# -gt 0 ]; do
  case "$1" in
    --no-pull) PULL=0; shift ;;
    --skip-backup) BACKUP=0; shift ;;
    --skip-build) BUILD=0; shift ;;
    --help | -h) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Ismeretlen kapcsoló: $1" ;;
  esac
done

require_macos
NODE_PATH_FOUND="$(find_node)" || die "Nincs Node 22. Futtasd a scripts/install.sh-t."
use_node "$NODE_PATH_FOUND"
cd "$GMS_APP_DIR"
[ -f packages/server/dist/cli/ops-main.js ] || die "Nincs lefordított app. Futtasd a scripts/install.sh-t."

PORT="$(ops config --get port)"
BEFORE="$(git rev-parse --short HEAD)"

step "1/5 Mentés a frissítés előtt"
if [ "$BACKUP" = 1 ]; then
  ops snapshot --label pre-update
  if [ -n "$(ops config --get backupDir)" ] && ops health --quiet >/dev/null 2>&1; then
    if run_backup_now "$PORT"; then
      info "OneDrive mentés kész."
    else
      die "A frissítés előtti mentés nem sikerült: $BACKUP_ERROR (--skip-backup-pal kihagyható)"
    fi
  fi
else
  info "Kihagyva (--skip-backup)."
fi

step "2/5 Új verzió letöltése"
if [ "$PULL" = 1 ]; then
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    die "A programmappában helyi módosítások vannak ($GMS_APP_DIR). Előbb ezeket kell rendezni."
  fi
  git fetch origin main
  git checkout -q main
  git merge --ff-only origin/main
  info "$BEFORE -> $(git rev-parse --short HEAD)"
else
  info "Kihagyva (--no-pull)."
fi

step "3/5 Függőségek és build"
if [ "$BUILD" = 1 ]; then
  "$NPM" ci --no-audit --no-fund
  "$NPM" run build
else
  info "Kihagyva (--skip-build)."
fi

step "4/5 Újraindítás"
write_plist
if agent_loaded; then
  # A plist változhatott (pl. új Node út), ezért újratöltjük.
  agent_unload
fi
agent_load

step "5/5 Ellenőrzés"
if ! ops health --wait 30; then
  tail -n 20 "$GMS_LOG_DIR/gms.log" "$GMS_LOG_DIR/launchd.err.log" 2>/dev/null || true
  die "A frissített szerver nem indult el. Visszaállás az előző verzióra: git checkout $BEFORE && scripts/update.sh --no-pull"
fi
echo
echo "Kész."
