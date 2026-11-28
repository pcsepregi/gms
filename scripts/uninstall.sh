#!/usr/bin/env bash
# Az automatikus indítás eltávolítása (technikai spec 9.3).
#
#   scripts/uninstall.sh
#
# Leállítja a szervert és törli a LaunchAgentet. Az adatokat (adatbázis, képek, beállítások),
# a naplókat, a OneDrive mentéseket és a programkódot NEM törli; ezek helyét kiírja.
set -euo pipefail

# shellcheck source=scripts/lib.sh
. "$(dirname "$0")/lib.sh"

case "${1:-}" in
  --help | -h) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  "") ;;
  *) die "Ismeretlen kapcsoló: $1" ;;
esac

require_macos

step "Szerver leállítása"
if agent_loaded; then
  agent_unload
  info "Leállítva: $GMS_DOMAIN/$GMS_LABEL"
else
  info "A LaunchAgent nem volt betöltve."
fi

step "LaunchAgent törlése"
if [ -f "$GMS_PLIST" ]; then
  rm -f "$GMS_PLIST"
  info "Törölve: $GMS_PLIST"
else
  info "Nem volt telepítve."
fi

DATA_DIR="${GMS_DATA_DIR:-$HOME/Library/Application Support/GMS}"
echo
echo "Kész. A GMS többé nem indul el automatikusan."
echo "Megmaradt (szándékosan nem töröltem):"
echo "  - adatok:      $DATA_DIR"
echo "  - napló:       $GMS_LOG_DIR"
echo "  - programkód:  $GMS_APP_DIR"
echo "  - mentések:    a OneDrive GMS mappában"
echo "Újratelepítés: scripts/install.sh"
