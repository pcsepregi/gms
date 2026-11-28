#!/usr/bin/env bash
# GMS telepítése a Macre (technikai spec 9.3, S-60, S-61).
#
#   scripts/install.sh [--excel <fájl>] [--backup-dir <mappa>] [--yes]
#                      [--no-launchd] [--no-open] [--skip-import] [--skip-build]
#
# Lépések: Node 22 ellenőrzése (ha hiányzik, Homebrew-ból), npm ci, build, adat- és
# naplómappák, OneDrive mentési mappa a config.json-ba, egyszeri Excel import (csak üres
# adatbázisba), LaunchAgent (bejelentkezéskor indul, leállás után újraindul), health check,
# próbamentés, végül a böngésző megnyitása. Többször is futtatható: a meglévő adatokat nem
# írja felül.
set -euo pipefail

# shellcheck source=scripts/lib.sh
. "$(dirname "$0")/lib.sh"

EXCEL=""
BACKUP_DIR=""
ASSUME_YES=0
USE_LAUNCHD=1
OPEN_BROWSER=1
SKIP_IMPORT=0
SKIP_BUILD=0

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --excel) EXCEL="${2:?Hiányzik a fájl a --excel után}"; shift 2 ;;
    --backup-dir) BACKUP_DIR="${2:?Hiányzik a mappa a --backup-dir után}"; shift 2 ;;
    --yes | -y) ASSUME_YES=1; shift ;;
    --no-launchd) USE_LAUNCHD=0; shift ;;
    --no-open) OPEN_BROWSER=0; shift ;;
    --skip-import) SKIP_IMPORT=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --help | -h) usage; exit 0 ;;
    *) usage >&2; die "Ismeretlen kapcsoló: $1" ;;
  esac
done

# Kérdés alapértékkel; --yes esetén (vagy ha nincs terminál) az alapértéket adja.
ask() {
  local prompt="$1" default="$2" answer
  if [ "$ASSUME_YES" = 1 ] || [ ! -t 0 ]; then
    printf '%s\n' "$default"
    return
  fi
  read -r -p "    $prompt [$default]: " answer </dev/tty || true
  printf '%s\n' "${answer:-$default}"
}

require_macos

echo "GMS telepítése"
info "Programkód: $GMS_APP_DIR"
if [ "$GMS_APP_DIR" != "$HOME/Applications/gms" ]; then
  info "(A javasolt hely ~/Applications/gms, de máshonnan is működik.)"
fi

# 1. Node.js 22 -------------------------------------------------------------------------
step "1/8 Node.js 22 ellenőrzése"
if ! NODE_PATH_FOUND="$(find_node)"; then
  if command -v brew >/dev/null 2>&1; then
    info "Nincs Node 22, telepítem Homebrew-val (brew install node@22)…"
    brew install node@22
    NODE_PATH_FOUND="$(find_node)" || die "A Node 22 telepítése után sem található."
  else
    die "Nincs Node 22 és Homebrew sem. Telepítsd a Homebrew-t (https://brew.sh), majd futtasd újra."
  fi
fi
use_node "$NODE_PATH_FOUND"
info "Node: $NODE ($("$NODE" -v))"

# 2. Függőségek és build ------------------------------------------------------------------
step "2/8 Függőségek telepítése és build (néhány perc)"
cd "$GMS_APP_DIR"
if [ "$SKIP_BUILD" = 1 ]; then
  info "Kihagyva (--skip-build)."
else
  "$NPM" ci --no-audit --no-fund
  "$NPM" run build
fi
[ -f packages/server/dist/cli/ops-main.js ] || die "A build nem készült el (packages/server/dist hiányzik)."

# 3. Mappák -------------------------------------------------------------------------------
step "3/8 Adat- és naplómappák"
DATA_DIR="$(ops config --get dataDir)"
PORT="$(ops config --get port)"
mkdir -p "$DATA_DIR" "$DATA_DIR/images" "$GMS_LOG_DIR"
info "Adatok: $DATA_DIR"
info "Napló:  $GMS_LOG_DIR"

# 4. Mentési mappa (OneDrive) ---------------------------------------------------------------
step "4/8 Napi mentés helye (OneDrive GMS mappa)"
CURRENT_BACKUP="$(ops config --get backupDir)"
if [ -z "$BACKUP_DIR" ] && [ -n "$CURRENT_BACKUP" ]; then
  info "Már be van állítva: $CURRENT_BACKUP"
else
  if [ -z "$BACKUP_DIR" ]; then
    SUGGESTED=""
    for od in "$HOME"/Library/CloudStorage/OneDrive-*; do
      [ -d "$od" ] && { SUGGESTED="$od/GMS"; break; }
    done
    if [ -n "$SUGGESTED" ]; then
      BACKUP_DIR="$(ask "A OneDrive GMS mappa" "$SUGGESTED")"
    else
      warn "Nem találtam OneDrive mappát (~/Library/CloudStorage/OneDrive-*)."
      BACKUP_DIR="$(ask "Mentési mappa (üresen hagyva később állítható be)" "")"
    fi
  fi
  if [ -n "$BACKUP_DIR" ]; then
    mkdir -p "$BACKUP_DIR" || die "A mentési mappa nem hozható létre: $BACKUP_DIR"
    ops config --set-backup-dir "$BACKUP_DIR"
  else
    warn "A napi mentés nincs beállítva. Később: npm run ops -- config --set-backup-dir <mappa>"
  fi
fi

# 5. Egyszeri import -----------------------------------------------------------------------
step "5/8 Excel import (csak üres adatbázisba)"
CARDS="$(ops card-count)"
if [ "$CARDS" != "0" ]; then
  info "Az adatbázisban már $CARDS kártya van, az import kimarad (az app a master)."
elif [ "$SKIP_IMPORT" = 1 ]; then
  info "Kihagyva (--skip-import)."
else
  if [ -z "$EXCEL" ]; then
    FOUND="$(find "$HOME/Downloads" "$HOME/Desktop" "$HOME/Documents" -maxdepth 2 \
      -iname '*master*.xlsx' -not -name '~$*' 2>/dev/null | head -n 1 || true)"
    EXCEL="$(ask "Az Excel fájl útja" "$FOUND")"
  fi
  if [ -n "$EXCEL" ]; then
    [ -f "$EXCEL" ] || die "Nem található az Excel fájl: $EXCEL"
    "$NODE" "$GMS_APP_DIR/packages/server/dist/cli/import.js" --file "$EXCEL" --if-empty
  else
    warn "Nincs Excel fájl megadva, az import kimaradt. Később: npm run import -- --file <excel.xlsx>"
  fi
fi

# 6. LaunchAgent ----------------------------------------------------------------------------
step "6/8 Automatikus indítás (LaunchAgent)"
if [ "$USE_LAUNCHD" = 1 ]; then
  agent_unload
  if ops health --quiet >/dev/null 2>&1; then
    die "A $PORT-es porton már fut egy GMS szerver (nem a LaunchAgent indította). Állítsd le, majd futtasd újra."
  fi
  write_plist
  agent_load
  info "Betöltve: $GMS_DOMAIN/$GMS_LABEL"
else
  info "Kihagyva (--no-launchd). Kézi indítás: npm start"
fi

# 7. Health check ---------------------------------------------------------------------------
step "7/8 Ellenőrzés"
if [ "$USE_LAUNCHD" = 1 ]; then
  if ! ops health --wait 30; then
    warn "A szerver 30 mp alatt sem indult el. Utolsó naplósorok:"
    tail -n 20 "$GMS_LOG_DIR/gms.log" "$GMS_LOG_DIR/launchd.err.log" 2>/dev/null || true
    die "A telepítés befejeződött, de a szerver nem fut."
  fi
else
  info "Kihagyva (a szerver nem fut)."
fi

# 8. Próbamentés ----------------------------------------------------------------------------
step "8/8 Próbamentés a OneDrive mappába"
if [ "$USE_LAUNCHD" = 1 ] && [ -n "$(ops config --get backupDir)" ]; then
  if run_backup_now "$PORT"; then
    info "A próbamentés sikerült: $(ops config --get backupDir)/backups"
  else
    warn "A próbamentés nem sikerült: $BACKUP_ERROR"
    warn "Ha a macOS nem engedi a háttérben futó Node-nak a OneDrive mappát, add hozzá"
    warn "a Node-ot: Rendszerbeállítások > Adatvédelem és biztonság > Teljes lemezhozzáférés"
    warn "($NODE), majd a Beállítások oldalon nyomd meg a \"Mentés most\" gombot."
  fi
else
  info "Kihagyva."
fi

echo
echo "Kész. A GMS címe: http://127.0.0.1:$PORT"
if [ "$USE_LAUNCHD" = 1 ] && [ "$OPEN_BROWSER" = 1 ] && command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:$PORT"
fi
