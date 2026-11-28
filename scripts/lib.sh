# shellcheck shell=bash
# Közös segédfüggvények az install.sh, update.sh és uninstall.sh számára (technikai spec 9.3).
# Nem önálló szkript: a többi `source`-olja.

GMS_LABEL="local.gms.server"
GMS_APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GMS_PLIST="${GMS_LAUNCH_AGENTS_DIR:-$HOME/Library/LaunchAgents}/$GMS_LABEL.plist"
GMS_LOG_DIR="${GMS_LOG_DIR:-$HOME/Library/Logs/GMS}"
GMS_DOMAIN="gui/$(id -u)"

step() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '    FIGYELEM: %s\n' "$*" >&2; }
die() {
  printf '\nHIBA: %s\n' "$*" >&2
  exit 1
}

require_macos() {
  if [ "$(uname -s)" != "Darwin" ] && [ -z "${GMS_ALLOW_NON_MACOS:-}" ]; then
    die "Ez a szkript macOS-re készült (a LaunchAgent csak ott működik)."
  fi
}

# A Node 22 futtatható útját írja ki. Sorrend: GMS_NODE, Homebrew node@22 (Apple Silicon,
# majd Intel), végül a PATH-on lévő node, ha 22-es.
find_node() {
  local candidate major
  for candidate in \
    "${GMS_NODE:-}" \
    /opt/homebrew/opt/node@22/bin/node \
    /usr/local/opt/node@22/bin/node \
    "$(command -v node 2>/dev/null || true)"; do
    [ -n "$candidate" ] && [ -x "$candidate" ] || continue
    major="$("$candidate" -p 'process.versions.node.split(".")[0]' 2>/dev/null)" || continue
    if [ "$major" = "22" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

# Beállítja a NODE és NPM változót, a PATH elejére teszi a Node mappáját.
use_node() {
  NODE="$1"
  local dir
  dir="$(dirname "$NODE")"
  NPM="$dir/npm"
  [ -x "$NPM" ] || NPM="$(command -v npm || true)"
  [ -n "$NPM" ] || die "Nem található az npm a Node mellett ($dir)."
  export PATH="$dir:$PATH"
}

# Az app saját parancssori segédje (a lefordított szerverből).
ops() {
  "$NODE" "$GMS_APP_DIR/packages/server/dist/cli/ops-main.js" "$@"
}

agent_loaded() {
  launchctl print "$GMS_DOMAIN/$GMS_LABEL" >/dev/null 2>&1
}

# Leállítja és kiveszi a LaunchAgentet (ha be van töltve).
agent_unload() {
  if agent_loaded; then
    launchctl bootout "$GMS_DOMAIN/$GMS_LABEL" 2>/dev/null || true
    local i
    for i in 1 2 3 4 5 6 7 8 9 10; do
      agent_loaded || return 0
      sleep 1
      : "$i"
    done
    warn "A LaunchAgent 10 mp után is be van töltve."
  fi
}

# Betölti a LaunchAgentet és elindítja a szervert. A bootstrap közvetlenül egy bootout után
# átmenetileg hibázhat ("Input/output error"), ezért néhányszor újrapróbálja.
agent_load() {
  local i
  for i in 1 2 3 4 5; do
    if launchctl bootstrap "$GMS_DOMAIN" "$GMS_PLIST" 2>/dev/null; then
      launchctl enable "$GMS_DOMAIN/$GMS_LABEL" 2>/dev/null || true
      launchctl kickstart "$GMS_DOMAIN/$GMS_LABEL" 2>/dev/null || true
      return 0
    fi
    sleep 2
    : "$i"
  done
  launchctl bootstrap "$GMS_DOMAIN" "$GMS_PLIST" || die "A LaunchAgent nem tölthető be: $GMS_PLIST"
}

# Kitölti és a helyére írja a LaunchAgent plistet.
write_plist() {
  ops launch-agent --node "$NODE" --app-dir "$GMS_APP_DIR" --log-dir "$GMS_LOG_DIR" \
    --out "$GMS_PLIST" >/dev/null
  if command -v plutil >/dev/null 2>&1; then
    plutil -lint "$GMS_PLIST" >/dev/null || die "Hibás plist: $GMS_PLIST"
  fi
  info "LaunchAgent: $GMS_PLIST"
}

# Kézi mentés a futó szerveren keresztül (OneDrive). 0: sikerült; hiba esetén a BACKUP_ERROR
# változóba kerül a szerver magyar hibaüzenete.
# shellcheck disable=SC2034 # BACKUP_ERROR-t a hívó szkript olvassa.
run_backup_now() {
  local port="$1" body code
  BACKUP_ERROR=""
  if ! body="$(curl -sS -X POST -w '\n%{http_code}' "http://127.0.0.1:$port/api/backup/run" 2>&1)"; then
    BACKUP_ERROR="$body"
    return 1
  fi
  code="${body##*$'\n'}"
  body="${body%$'\n'*}"
  [ "$code" = "200" ] && return 0
  BACKUP_ERROR="$(printf '%s' "$body" | "$NODE" -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try { console.log(JSON.parse(s).error.message); } catch { console.log(s); }
    });')"
  return 1
}
