#!/usr/bin/env bash
# Telepítési füstteszt a CI-hoz (tesztspecifikáció T-INS-*). Lefordított repóban fut,
# ideiglenes HOME-mal, a szintetikus fixture-rel; Pali gépét és adatait nem érinti.
#
#   scripts/smoke-install.sh            macOS: valódi LaunchAgenttel (betöltés, újraindulás
#                                       kill után, update, uninstall)
#   scripts/smoke-install.sh --no-launchd
#                                       bármely rendszeren: telepítés LaunchAgent nélkül, a
#                                       szervert a teszt indítja
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-launchd}"
PORT=4747
URL="http://127.0.0.1:$PORT"

fail() {
  printf 'SIKERTELEN: %s\n' "$*" >&2
  exit 1
}
ok() { printf 'rendben: %s\n' "$*"; }

TMP="$(mktemp -d)"
export HOME="$TMP/home"
mkdir -p "$HOME"
BACKUP="$TMP/OneDrive/GMS"
SERVER_PID=""

cleanup() {
  if [ "$MODE" = "launchd" ]; then "$ROOT/scripts/uninstall.sh" >/dev/null 2>&1 || true; fi
  if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  rm -rf "$TMP"
}
trap cleanup EXIT

ops() { node "$ROOT/packages/server/dist/cli/ops-main.js" "$@"; }
server_pids() { pgrep -f "$ROOT/packages/server/dist/main.js" || true; }

if [ "$MODE" = "--no-launchd" ]; then
  export GMS_ALLOW_NON_MACOS=1
  "$ROOT/scripts/install.sh" --yes --skip-build --no-launchd --no-open \
    --excel "$ROOT/fixtures/sample-master.xlsx" --backup-dir "$BACKUP"
  [ "$(ops card-count)" = "43" ] || fail "az import után 43 kártya kell"
  ok "T-INS-01 telepítés: import 43 kártya, config.json backupDir"

  "$ROOT/scripts/install.sh" --yes --skip-build --no-launchd --no-open \
    --excel "$ROOT/fixtures/sample-master.xlsx" >/dev/null
  [ "$(ops card-count)" = "43" ] || fail "az ismételt telepítés megváltoztatta az adatokat"
  ok "T-INS-02 ismételt telepítés: az adatok változatlanok"

  GMS_LOG_DIR="$TMP/logs" node "$ROOT/packages/server/dist/main.js" &
  SERVER_PID=$!
  ops health --wait 20 || fail "a szerver nem indult el"
  [ -s "$TMP/logs/gms.log" ] || fail "nincs naplófájl"
  ok "T-INS-04 health check és naplófájl"
  exit 0
fi

[ "$(uname -s)" = "Darwin" ] || fail "a LaunchAgent-teszt csak macOS-en fut (vagy: --no-launchd)"

# T-INS-03: telepítés LaunchAgenttel
"$ROOT/scripts/install.sh" --yes --skip-build --no-open \
  --excel "$ROOT/fixtures/sample-master.xlsx" --backup-dir "$BACKUP"
PLIST="$HOME/Library/LaunchAgents/local.gms.server.plist"
[ -f "$PLIST" ] || fail "nincs plist"
plutil -lint "$PLIST" >/dev/null || fail "hibás plist"
launchctl print "gui/$(id -u)/local.gms.server" >/dev/null || fail "a LaunchAgent nincs betöltve"
ops health --wait 30 || fail "a szerver nem válaszol"
[ "$(curl -fsS "$URL/api/stats" | node -p 'JSON.parse(require("fs").readFileSync(0)).total.all')" = "43" ] ||
  fail "a szerver nem a telepített adatbázist szolgálja ki"
ls "$BACKUP/backups/"*.sqlite >/dev/null 2>&1 || fail "nem készült próbamentés"
[ -s "$HOME/Library/Logs/GMS/gms.log" ] || fail "nincs naplófájl"
ok "T-INS-03 LaunchAgent betöltve, health ok, próbamentés és napló megvan"

# T-SEC-01 / ET-07 előzetes: csak a 127.0.0.1 címen hallgat
LISTEN="$(lsof -nP -iTCP:$PORT -sTCP:LISTEN | tail -n +2)"
printf '%s\n' "$LISTEN" | grep -q '127.0.0.1:' || fail "nem a 127.0.0.1-en hallgat: $LISTEN"
if printf '%s\n' "$LISTEN" | grep -Eq '\*:|0\.0\.0\.0|\[::\]'; then fail "minden címen hallgat"; fi
CODE="$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: gms.example:4747' "$URL/api/health")"
[ "$CODE" = "403" ] || fail "idegen Host fejléc: $CODE (403 kell)"
ok "T-INS-05 csak 127.0.0.1, idegen Host elutasítva"

# T-INS-06 / ET-06: leállított folyamat 30 mp-en belül újraindul
OLD="$(server_pids)"
[ -n "$OLD" ] || fail "nem található a szerverfolyamat"
# shellcheck disable=SC2086 # több PID is lehet
kill $OLD
sleep 1
ops health --wait 30 >/dev/null || fail "a szerver nem indult újra 30 mp-en belül"
NEW="$(server_pids)"
[ -n "$NEW" ] && [ "$NEW" != "$OLD" ] || fail "nem új folyamat fut ($OLD -> $NEW)"
ok "T-INS-06 kill után újraindult ($OLD -> $NEW)"

# T-INS-07: frissítés (git pull nélkül, build nélkül): helyi másolat, mentés, újraindítás
"$ROOT/scripts/update.sh" --no-pull --skip-build
ls "$HOME/Library/Application Support/GMS/"gms.sqlite.pre-update-* >/dev/null 2>&1 ||
  fail "nem készült frissítés előtti másolat"
[ "$(ops card-count)" = "43" ] || fail "a frissítés megváltoztatta a kártyák számát"
ops health --wait 30 >/dev/null || fail "frissítés után nem fut"
ok "T-INS-07 frissítés: másolat, kártyaszám változatlan, fut"

# T-INS-08: eltávolítás
"$ROOT/scripts/uninstall.sh"
[ ! -f "$PLIST" ] || fail "a plist megmaradt"
sleep 2
if ops health >/dev/null 2>&1; then fail "a szerver eltávolítás után is fut"; fi
[ -f "$HOME/Library/Application Support/GMS/gms.sqlite" ] || fail "az eltávolítás törölte az adatokat"
ok "T-INS-08 eltávolítás: leállt, plist törölve, adatok megmaradtak"
