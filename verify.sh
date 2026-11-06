#!/usr/bin/env bash
# =============================================================================
# verify.sh - universal, requirement-driven verification harness
#
# Parses a markdown/plain-text specification into discrete requirements and
# proves each one with either:
#   * an executable check embedded in the spec (HTTP / command / SQL / file), or
#   * a strict OpenRouter semantic code review with cited evidence.
#
# Design principles:
#   - No requirement is silently skipped.  Explicit skips are reported.
#   - Every check prints EXPECTED -> TEST -> COMPARISON -> VERDICT.
#     Use -v for full raw commands, prompts, payloads, responses and context.
#   - Secrets are redacted from all console output.
#   - The script exits 0 only when every tested requirement passes and none
#     were skipped.
#
# Embedded check format (fenced block or HTML comment):
#
#   ```verify
#   type: http
#   method: PATCH
#   url: ${SUPABASE_URL}/rest/v1/tasks?id=eq.task-99
#   headers:
#     apikey: ${SUPABASE_ANON_KEY}
#     Authorization: Bearer ${WORKER_TOKEN}
#     Content-Type: application/json
#   body: |
#     {"status": "completed"}
#   expect_status: 403
#   expect_body: PGRST301
#   ```
#
#   type: command  -> run:, expect_exit:, expect_contains:, expect_regex:
#   type: sql      -> sql: (uses SUPABASE_DB_URL / DATABASE_URL), or run:
#   type: file     -> path:/files:, contains:, regex:, absent:
#   type: llm      -> expected:, files: (optional)
#
# Variables in URLs, headers and bodies are expanded from the environment.
# Values from .env / .env.local are loaded automatically (without overriding
# variables already exported by the caller).
# =============================================================================

set -u
set -o pipefail

HOME="${HOME:-}"
SCRIPT_NAME="$(basename -- "$0")"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
VERSION="1.0.0"

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
SPEC_FILE=""
OR_MODEL_OVERRIDE=""
OR_API_BASE_OVERRIDE=""
NO_LLM=0
DRY_RUN=0
OPT_VERBOSE=0
ASSUME_YES=0
FORCE_INTERACTIVE=0
FORCE=0
SHOW_BROWSER=0
FIX_MODE=0
LIST_ONLY=0
ONLY_REQ=""
COLOR_MODE="auto"
KEEP_LOGS=0
ALLOW_PAID=0
RUN_PROBE=1
MAX_REQS=0
MIN_CONFIDENCE=0
CMD_TIMEOUT=120
LLM_TIMEOUT=180
TRACE_LINES=120
CONTEXT_CHARS=48000
LLM_FILE_LINES=450
LIVE_TIMEOUT=10
LIVE_MANAGER_EMAIL="${LIVE_MANAGER_EMAIL:-manager@bystruev.com}"
LIVE_WORKER1_EMAIL="${LIVE_WORKER1_EMAIL:-worker1@hurated.com}"
LIVE_WORKER2_EMAIL="${LIVE_WORKER2_EMAIL:-worker2@buddian.com}"
LIVE_MANAGER_PASSWORD="${LIVE_MANAGER_PASSWORD:-Crm2026!Manager}"
LIVE_WORKER1_PASSWORD="${LIVE_WORKER1_PASSWORD:-Crm2026!Worker1}"
LIVE_WORKER2_PASSWORD="${LIVE_WORKER2_PASSWORD:-Crm2026!Worker2}"
LOG_DIR=""
WORKDIR=""
KEEP_ON_FAIL=0

OR_API_KEY="${OR_API_KEY:-}"
OR_MODEL="${OR_MODEL:-openrouter/free}"
ORIGINAL_OR_API_BASE="${OR_API_BASE:-}"
OR_API_BASE="${OR_API_BASE:-https://openrouter.ai/api/v1}"
QUOTA_USED=""
QUOTA_LIMIT=""
QUOTA_REMAINING=""
QUOTA_DISPLAY="n/a"
QUOTA_REQUIRED=0
START_QUOTA_USED=""
START_QUOTA_LIMIT=""
START_QUOTA_REMAINING=""
END_QUOTA_USED=""
END_QUOTA_LIMIT=""
END_QUOTA_REMAINING=""
END_QUOTA_REFRESHED=0
OR_API_CALLS=0

LIVE_APP_URL=""
LIVE_APP_STATUS=""
LIVE_VERCEL_ID=""
LIVE_ETAG=""
LIVE_LAST_MODIFIED=""
LIVE_ASSET_PATH=""
LIVE_ASSET_HASH=""
LIVE_API_STATUS=""
LIVE_AUTH_STATUS=""
LIVE_ANON_KEY=""
LIVE_ANON_KEY_SOURCE=""
LIVE_API_DISPLAY=""

REQ_COUNT=0
PASSED=0
FAILED=0
SKIPPED=0
FAILED_TITLES=()
SKIPPED_TITLES=()
INTERACTIVE=0
ABORTED=0
SUMMARY_PRINTED=0
DEMO_MANAGER_EMAIL=""
DEMO_WORKER_EMAIL=""

# ANSI colors (enabled after CLI parsing when stdout is a TTY or --color)
C_RESET=""
C_BOLD=""
C_DIM=""
C_RED=""
C_GREEN=""
C_YELLOW=""
C_BLUE=""
C_CYAN=""

# Colors for interactive previews/prompts routed to the terminal.
UI_RESET=""
UI_BOLD=""
UI_RED=""
UI_GREEN=""
UI_YELLOW=""
UI_BLUE=""
UI_CYAN=""
UI_COLOR_ENABLED=0

# Where interactive previews/prompts go when stdout is redirected:
#   stdout = normal terminal output
#   tty    = write to /dev/tty so stdout stays clean for tee/log files
#   stderr = /dev/tty unavailable; use stderr
PROMPT_DEST="stdout"

# Comparison accumulator (filled during execution, printed in step 3)
CMP_LINES=()
cmp_add() {
  CMP_LINES+=("$1")
}

# Parsed verify-block state
VB_TYPE=""
VB_RUN=""
VB_METHOD="GET"
VB_URL=""
VB_BODY=""
VB_BODY_SET=0
VB_EXPECT_STATUS=""
VB_EXPECT_BODY=""
VB_EXPECT_REGEX=""
VB_EXPECT_NOT=""
VB_EXPECT_EXIT=""
VB_EXPECT_CONTAINS=""
VB_EXPECT_JSON=""
VB_EXPECT_HEADER=""
VB_TIMEOUT=""
VB_PATH=""
VB_FILES=""
VB_EXPECTED=""
VB_SQL=""
VB_PROMPT=""
VB_HEADERS=()

# Last LLM result
LLM_VERDICT=""
LLM_CONFIDENCE=""
LLM_EXPECTED=""
LLM_ACTUAL=""
LLM_REASON=""
LLM_MISSING=""
LLM_EVIDENCE=""
LLM_EVIDENCE_CHECK=""
LLM_RAW_CONTENT=""

# ---------------------------------------------------------------------------
# Small utilities
# ---------------------------------------------------------------------------
setup_colors() {
  COLOR_ENABLED=0
  case "$COLOR_MODE" in
    always) COLOR_ENABLED=1 ;;
    never) COLOR_ENABLED=0 ;;
    auto)
      if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then COLOR_ENABLED=1; fi
      ;;
  esac
  if [ "$COLOR_ENABLED" -eq 1 ]; then
    C_RESET=$'\033[0m'
    C_BOLD=$'\033[1m'
    C_DIM=$'\033[90m'
    C_RED=$'\033[1;31m'
    C_GREEN=$'\033[1;32m'
    C_YELLOW=$'\033[1;33m'
    C_BLUE=$'\033[1;34m'
    C_CYAN=$'\033[1;36m'
  else
    C_RESET=""; C_BOLD=""; C_DIM=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_CYAN=""
  fi
}

setup_ui_colors() {
  UI_RESET=""; UI_BOLD=""; UI_RED=""; UI_GREEN=""
  UI_YELLOW=""; UI_BLUE=""; UI_CYAN=""
  UI_COLOR_ENABLED=0
  [ "$INTERACTIVE" -eq 1 ] || return 0
  case "$COLOR_MODE" in
    always)
      UI_COLOR_ENABLED=1
      ;;
    never)
      UI_COLOR_ENABLED=0
      ;;
    auto)
      [ -n "${NO_COLOR:-}" ] && return 0
      case "$PROMPT_DEST" in
        tty) UI_COLOR_ENABLED=1 ;;
        stderr) [ -t 2 ] && UI_COLOR_ENABLED=1 ;;
        *) [ -t 1 ] && UI_COLOR_ENABLED=1 ;;
      esac
      ;;
  esac
  if [ "$UI_COLOR_ENABLED" -eq 1 ]; then
    UI_RESET=$'\033[0m'
    UI_BOLD=$'\033[1m'
    UI_RED=$'\033[1;31m'
    UI_GREEN=$'\033[1;32m'
    UI_YELLOW=$'\033[1;33m'
    UI_BLUE=$'\033[1;34m'
    UI_CYAN=$'\033[1;36m'
  fi
}

rule() {
  printf '%s%s%s\n' "$C_BLUE" "================================================================================" "$C_RESET"
}

step_label() {
  printf '%s%s%s\n' "$C_BOLD$C_BLUE" "$1" "$C_RESET"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

warn() {
  printf 'WARNING: %s\n' "$*" >&2
}

have() {
  command -v "$1" >/dev/null 2>&1
}

dedent() {
  # Strip leading whitespace from every line (used for | blocks).
  sed -e 's/^[[:space:]]*//'
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

indent() {
  sed 's/^\(..*\)$/  \1/'
}

indent_deep() {
  sed 's/^\(..*\)$/    \1/'
}

lines_in() {
  awk 'END { print NR + 0 }' "$1" 2>/dev/null || printf '0'
}

redact_text() {
  sed -E \
    -e 's/(Bearer[[:space:]]+)[A-Za-z0-9._~+\/-]+/\1[REDACTED]/g' \
    -e 's/(apikey[[:space:]]*[:=][[:space:]]*)[A-Za-z0-9._~+\/-]+/\1[REDACTED]/g' \
    -e 's/(sk-or-v1-)[A-Za-z0-9]+/\1[REDACTED]/g' \
    -e 's/(sk-)[A-Za-z0-9_-]{20,}/\1[REDACTED]/g' \
    -e 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/[REDACTED_JWT]/g' \
    -e 's/("(password|access_token|refresh_token)"[[:space:]]*:[[:space:]]*")[^"]*"/\1[REDACTED]"/g' \
    -e 's#(postgres(ql)?://[^:/@]+:)[^@]+@#\1[REDACTED]@#g'
}

redact_url() {
  redact_text
}

# Render execution traces (HTTP bodies, command output, SQL results, raw model
# responses) in gray so harness messages remain visually distinct.
dim_text() {
  if [ -n "$C_DIM" ]; then
    awk -v d="$C_DIM" -v r="$C_RESET" '{ print d $0 r }'
  else
    cat
  fi
}

print_file_indented() {
  local file="$1" max_lines="${2:-$TRACE_LINES}" n
  if [ ! -s "$file" ]; then
    printf '  (no output)\n' | dim_text
    return 0
  fi
  n=$(lines_in "$file")
  if [ "$n" -le "$max_lines" ]; then
    redact_text < "$file" | indent | dim_text
  else
    redact_text < "$file" | head -n "$max_lines" | indent | dim_text
    printf '  [... %d more line(s); full trace in %s ...]\n' "$((n - max_lines))" "$file"
  fi
}

expand_env() {
  # Expand ${VAR} and $VAR from the environment.  Deliberately does not run
  # command substitutions: spec files are trusted for `run:`, but URL/body
  # fields should not execute arbitrary extra commands by accident.
  local s="$1" name val i=0
  while [ "$i" -lt 20 ] && [[ "$s" =~ \$\{([A-Za-z_][A-Za-z0-9_]*)\} ]]; do
    name="${BASH_REMATCH[1]}"
    eval "val=\${$name-}"
    s="${s//\$\{$name\}/$val}"
    i=$((i + 1))
  done
  i=0
  while [ "$i" -lt 20 ] && [[ "$s" =~ \$([A-Za-z_][A-Za-z0-9_]*) ]]; do
    name="${BASH_REMATCH[1]}"
    eval "val=\${$name-}"
    s="${s//\$$name/$val}"
    i=$((i + 1))
  done
  printf '%s' "$s"
}

shell_quote_readable() {
  local s="$1"
  if [[ "$s" == *"'"* ]]; then
    printf '%q' "$s"
  else
    printf "'%s'" "$s"
  fi
}

run_limited() {
  # run_limited SECONDS command [args...]
  local t="$1"
  shift
  if have timeout; then
    timeout "$t" "$@"
    return $?
  fi
  "$@" &
  local pid=$!
  ( sleep "$t"; kill -TERM "$pid" 2>/dev/null; sleep 1; kill -KILL "$pid" 2>/dev/null ) >/dev/null 2>&1 &
  local watcher=$!
  wait "$pid"
  local rc=$?
  kill "$watcher" 2>/dev/null || true
  wait "$watcher" 2>/dev/null || true
  return "$rc"
}

secs_until_utc_midnight() {
  local now left
  now=$(date -u +%s)
  left=$((86400 - now % 86400))
  [ "$left" -eq 0 ] && left=86400
  printf '%s' "$left"
}

duration_fmt() {
  local s="$1" h m r
  h=$((s / 3600))
  m=$(((s % 3600) / 60))
  r=$((s % 60))
  if [ "$h" -gt 0 ]; then
    printf '%dh %02dm' "$h" "$m"
  elif [ "$m" -gt 0 ]; then
    printf '%dm %02ds' "$m" "$r"
  else
    printf '%ds' "$r"
  fi
}

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------
print_help() {
  cat <<EOF
$SCRIPT_NAME v$VERSION - universal specification verification harness

Usage:
  ./$SCRIPT_NAME <path-to-spec-file.md> [OPTIONS]

The harness parses markdown / plain-text requirements, then verifies each one
using embedded executable checks or a strict OpenRouter semantic code review.
Every requirement is reported with EXPECTED, TEST, COMPARISON and VERDICT.
Default output is concise; use -v for full raw traces.

Options:
  -h, --help              Show this help and exit.
  -m, --model MODEL       OpenRouter model (default: \$OR_MODEL or openrouter/free).
  -n, --no-llm            Disable all OpenRouter usage (only embedded checks run).
  -y, --yes               Continuous mode: never pause between requirements.
  -l, --list              Parse the specification, print the indexed requirement
                          list, and exit without running checks or preflight.
  -r, --req N             Run only requirement number N (1-based).
      --only N            Alias for --req.
  -s, --show              Run embedded browser/Playwright checks headed with
                          slow motion (HEADLESS=false, PLAYWRIGHT_SLOWMO=1000).
      --fix               On failure, write WORKDIR/fix_req_<num>.json with
                          repair context; run VERIFY_FIX_COMMAND when configured
                          and re-verify after a successful repair.
      --interactive       Force interactive prompts regardless of TTY detection
                          (-y / --yes still wins).
      --force             Continue even if remaining quota < parsed requirement count.
      --dry-run           Parse and list requirements; do not execute checks.
  -v, --verbose           Print full commands, prompts, payloads, raw responses,
                          context listings and detailed comparisons.
      --color             Force ANSI color output.
      --no-color          Disable ANSI color output.
      --keep-logs         Keep the temporary artifact directory.
      --log-dir DIR       Write artifacts to DIR (implies --keep-logs).
      --max N             Test at most N requirements.
      --min-confidence N  Fail an LLM PASS below N% confidence (default: 0).
      --timeout SECONDS   Timeout for commands / HTTP checks (default: 120).
      --llm-timeout SEC   Timeout for one LLM request (default: 180).
      --trace-lines N     Max raw trace lines printed per check in -v mode (default: 120).
      --context-chars N   Max code context sent to the LLM (default: 48000).
      --allow-paid        Allow a paid model instead of a free one.
      --no-probe          Skip the preflight completion probe (catalog only).
      --api-base URL      Override the OpenRouter API base URL.

Interactive mode (default when stdin is a TTY and -y is absent):
  y / Enter  Run this requirement
  n          Abort immediately and print the executive summary
  s          Skip this requirement and record [SKIPPED]
  a          Run this requirement, then continue without pausing
  Manual reproduction instructions (URL, test accounts and steps) are shown
  before each prompt.  When stdout is redirected (for example
  \`./verify.sh spec.md | tee test.log\`), previews and prompts go to /dev/tty
  so the log stays clean while the terminal remains interactive.  Pass -y for
  continuous operation in scripts and CI.

Environment:
  OR_API_KEY              OpenRouter key. Lookup order: shell environment,
                          ~/.llm_config, then .env / .env.local in the
                          repository root or specification directory.
  OR_MODEL                Model id (default: openrouter/free).
  APP_URL                 Base URL for manual instructions (default:
                          http://localhost:5173).
  MANAGER_EMAIL           Override the manager account shown in manual steps.
  WORKER_EMAIL            Override the worker account shown in manual steps.
  SUPABASE_URL            Used by embedded HTTP checks as \${SUPABASE_URL}.
  SUPABASE_ANON_KEY       Used by embedded HTTP checks.
  SUPABASE_DB_URL         Used by \`type: sql\` checks.
  WORKER_TOKEN, ...       Any variable can be referenced in a verify block.
  VERIFY_FIX_COMMAND      Optional external repair command used by --fix.
                          Receives the fix JSON path as \$1 and the repository
                          root as \$2.  A zero exit triggers re-verification.
  LIVE_MANAGER_EMAIL      Live manager account (default: manager@bystruev.com).
  LIVE_WORKER1_EMAIL      Live worker 1 account (default: worker1@hurated.com).
  LIVE_WORKER2_EMAIL      Live worker 2 account (default: worker2@buddian.com).
  LIVE_*_PASSWORD         Override the live demo account passwords.
  APP_URL                 Live app target (default: https://crm.bystruev.com).
  SUPABASE_URL            Live Supabase target (default:
                          https://uctbykqitlelphgbpnoq.supabase.co).
  LIVE_TIMEOUT            Per-request live probe timeout in seconds (default: 10).

OpenRouter key setup:
  ~/bin/llm.sh key add <key>
  export OR_API_KEY=...
  printf 'OR_API_KEY="%s"\\n' '<key>' > ~/.llm_config

Embedded check example:
  ### RLS blocks worker updates
  The database must reject a worker updating another worker's task.

  \`\`\`verify
  type: http
  method: PATCH
  url: \${SUPABASE_URL}/rest/v1/tasks?id=eq.task-99
  headers:
    apikey: \${SUPABASE_ANON_KEY}
    Authorization: Bearer \${WORKER_TOKEN}
    Content-Type: application/json
  body: |
    {"status": "completed"}
  expect_status: 403
  expect_body: PGRST301
  \`\`\`

  Other check types:
    type: command   run: npm run build ; expect_exit: 0
    type: sql       sql: select ... ; expect_contains: ...
    type: file      path: supabase/migrations/*.sql ; contains: enable row level security
    type: llm       expected: Workers cannot read other workers' tasks.

Tip: openrouter/free is a router and may pick a weak model. For stable verdicts,
pin a specific free model, e.g. --model nvidia/nemotron-3.5-lightning:free.

Exit codes:
  0  All tested requirements passed and none were skipped.
  1  Usage error, parse error, requirement failure, skipped requirement, or abort.
  2  LLM / OpenRouter preflight failed (auth, network, or insufficient quota).
EOF
}

# ---------------------------------------------------------------------------
# CLI parsing
# ---------------------------------------------------------------------------
SHOW_HELP=0
if [ "$#" -eq 0 ]; then
  print_help
  exit 1
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      SHOW_HELP=1
      shift
      ;;
    -m|--model)
      [ "$#" -ge 2 ] || die "--model requires a value"
      OR_MODEL_OVERRIDE="$2"
      shift 2
      ;;
    -n|--no-llm)
      NO_LLM=1
      shift
      ;;
    -y|--yes)
      ASSUME_YES=1
      shift
      ;;
    -l|--list)
      LIST_ONLY=1
      shift
      ;;
    -r|--req|--only)
      [ "$#" -ge 2 ] || die "$1 requires a requirement number"
      ONLY_REQ="$2"
      shift 2
      ;;
    -s|--show)
      SHOW_BROWSER=1
      shift
      ;;
    --fix)
      FIX_MODE=1
      shift
      ;;
    --interactive)
      FORCE_INTERACTIVE=1
      shift
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -v|--verbose)
      OPT_VERBOSE=1
      shift
      ;;
    --color)
      COLOR_MODE="always"
      shift
      ;;
    --no-color)
      COLOR_MODE="never"
      shift
      ;;
    --keep-logs)
      KEEP_LOGS=1
      shift
      ;;
    --log-dir)
      [ "$#" -ge 2 ] || die "--log-dir requires a value"
      LOG_DIR="$2"
      KEEP_LOGS=1
      shift 2
      ;;
    --max)
      [ "$#" -ge 2 ] || die "--max requires a value"
      MAX_REQS="$2"
      shift 2
      ;;
    --min-confidence)
      [ "$#" -ge 2 ] || die "--min-confidence requires a value"
      MIN_CONFIDENCE="$2"
      shift 2
      ;;
    --timeout)
      [ "$#" -ge 2 ] || die "--timeout requires a value"
      CMD_TIMEOUT="$2"
      shift 2
      ;;
    --llm-timeout)
      [ "$#" -ge 2 ] || die "--llm-timeout requires a value"
      LLM_TIMEOUT="$2"
      shift 2
      ;;
    --trace-lines)
      [ "$#" -ge 2 ] || die "--trace-lines requires a value"
      TRACE_LINES="$2"
      shift 2
      ;;
    --context-chars)
      [ "$#" -ge 2 ] || die "--context-chars requires a value"
      CONTEXT_CHARS="$2"
      shift 2
      ;;
    --allow-paid)
      ALLOW_PAID=1
      shift
      ;;
    --no-probe)
      RUN_PROBE=0
      shift
      ;;
    --api-base)
      [ "$#" -ge 2 ] || die "--api-base requires a value"
      OR_API_BASE_OVERRIDE="$2"
      shift 2
      ;;
    --)
      shift
      while [ "$#" -gt 0 ]; do
        [ -z "$SPEC_FILE" ] || die "only one specification file may be supplied"
        SPEC_FILE="$1"
        shift
      done
      ;;
    -*)
      printf 'ERROR: unknown option: %s\n\n' "$1" >&2
      print_help >&2
      exit 1
      ;;
    *)
      [ -z "$SPEC_FILE" ] || die "only one specification file may be supplied"
      SPEC_FILE="$1"
      shift
      ;;
  esac
done

if [ "$SHOW_HELP" -eq 1 ]; then
  print_help
  exit 0
fi

if [ -z "$SPEC_FILE" ]; then
  print_help
  exit 1
fi

[ -f "$SPEC_FILE" ] || die "specification file not found: $SPEC_FILE"
[ -r "$SPEC_FILE" ] || die "specification file is not readable: $SPEC_FILE"
[ -s "$SPEC_FILE" ] || die "specification file is empty: $SPEC_FILE"

case "$MAX_REQS" in ''|*[!0-9]*) die "--max must be a non-negative integer";; esac
if [ -n "$ONLY_REQ" ]; then
  case "$ONLY_REQ" in ''|*[!0-9]*) die "--req must be a positive integer";; esac
  [ "$ONLY_REQ" -ge 1 ] || die "--req must be a positive integer"
fi
case "$MIN_CONFIDENCE" in ''|*[!0-9]*) die "--min-confidence must be an integer";; esac
case "$CMD_TIMEOUT" in ''|*[!0-9]*) die "--timeout must be an integer";; esac
case "$LLM_TIMEOUT" in ''|*[!0-9]*) die "--llm-timeout must be an integer";; esac
case "$TRACE_LINES" in ''|*[!0-9]*) die "--trace-lines must be an integer";; esac
case "$CONTEXT_CHARS" in ''|*[!0-9]*) die "--context-chars must be an integer";; esac

setup_colors

# Headed browser mode for embedded Playwright / browser commands.
if [ "$SHOW_BROWSER" -eq 1 ]; then
  export HEADLESS=false
  export PLAYWRIGHT_HEADED=1
  export PLAYWRIGHT_SLOWMO=1000
fi

# ---------------------------------------------------------------------------
# Dependencies and working directory
# ---------------------------------------------------------------------------
for dep in bash awk sed grep curl jq mktemp; do
  have "$dep" || die "required dependency is missing: $dep"
done

if [ -n "$LOG_DIR" ]; then
  mkdir -p "$LOG_DIR" || die "cannot create log directory: $LOG_DIR"
  WORKDIR="$(cd -- "$LOG_DIR" && pwd)"
else
  TMPBASE="${TMPDIR:-/tmp}"
  TMPBASE="${TMPBASE%/}"
  WORKDIR="$(mktemp -d "$TMPBASE/verify.XXXXXX")" || die "cannot create temporary directory"
  chmod 700 "$WORKDIR" 2>/dev/null || true
fi

cleanup() {
  local rc=$?
  if [ -n "${WORKDIR:-}" ] && [ -d "$WORKDIR" ]; then
    # Never leave live access tokens in retained artifacts.
    rm -f "$WORKDIR"/live_token_* "$WORKDIR"/live_login_*.json "$WORKDIR"/live_login_*.hdr 2>/dev/null || true
    if [ "${KEEP_LOGS:-0}" -eq 0 ] && [ "${KEEP_ON_FAIL:-0}" -eq 0 ]; then
      rm -rf "$WORKDIR"
    fi
  fi
  if [ "$rc" -eq 0 ]; then
    return 0
  fi
  return "$rc"
}
trap cleanup EXIT

REPO_ROOT=""
if have git; then
  REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
fi
[ -n "$REPO_ROOT" ] || REPO_ROOT="$SCRIPT_DIR"
SPEC_ABS="$(cd -- "$(dirname -- "$SPEC_FILE")" >/dev/null 2>&1 && pwd)/$(basename -- "$SPEC_FILE")"
SPEC_BASENAME="$(basename -- "$SPEC_FILE")"
SPEC_DIR="$(dirname -- "$SPEC_ABS")"

# ---------------------------------------------------------------------------
# Environment loading
# ---------------------------------------------------------------------------
load_env_file() {
  local f="$1" line key val
  [ -f "$f" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      ''|\#*) continue ;;
    esac
    line="${line#export }"
    case "$line" in
      *=*) ;;
      *) continue ;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    case "$key" in
      ''|[0-9]*|*[!A-Za-z0-9_]*) continue ;;
    esac
    val="$(printf '%s' "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    case "$val" in
      \"*\") val="${val#\"}"; val="${val%\"}" ;;
      \'*\') val="${val#\'}"; val="${val%\'}" ;;
    esac
    if [ -z "${!key+x}" ]; then
      export "$key=$val" 2>/dev/null || true
    fi
  done < "$f"
}

load_environment() {
  # Priority for OR_API_KEY: shell environment > ~/.llm_config > .env/.env.local.
  # load_llm_config() has already restored a non-empty shell key and sourced
  # the config file, so an empty value here is safe to unset and let .env fill.
  if [ -z "${OR_API_KEY:-}" ]; then
    unset OR_API_KEY
  fi
  for envf in "$REPO_ROOT/.env" "$REPO_ROOT/.env.local" "$SPEC_DIR/.env" "$SPEC_DIR/.env.local"; do
    load_env_file "$envf"
  done

  # Common aliases so embedded checks can use the Supabase names.
  if [ -z "${SUPABASE_URL:-}" ] && [ -n "${VITE_SUPABASE_URL:-}" ]; then
    export SUPABASE_URL="$VITE_SUPABASE_URL"
  fi
  if [ -z "${SUPABASE_ANON_KEY:-}" ] && [ -n "${VITE_SUPABASE_ANON_KEY:-}" ]; then
    export SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY"
  fi
  if [ -z "${SUPABASE_DB_URL:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
    export SUPABASE_DB_URL="$DATABASE_URL"
  fi
}

load_demo_accounts() {
  local f="$REPO_ROOT/src/lib/demoAccounts.ts" role email
  [ -f "$f" ] || return 0
  while IFS='|' read -r role email; do
    [ -n "$role" ] || continue
    case "$role" in
      manager)
        [ -n "$DEMO_MANAGER_EMAIL" ] || DEMO_MANAGER_EMAIL="$email"
        ;;
      worker)
        [ -n "$DEMO_WORKER_EMAIL" ] || DEMO_WORKER_EMAIL="$email"
        ;;
    esac
  done < <(awk '
    /key:[ \t]*'\''/ {
      key = $0
      sub(/.*key:[ \t]*'\''/, "", key)
      sub(/'\''.*/, "", key)
    }
    /email:[ \t]*'\''/ {
      email = $0
      sub(/.*email:[ \t]*'\''/, "", email)
      sub(/'\''.*/, "", email)
    }
    /role:[ \t]*'\''/ {
      role = $0
      sub(/.*role:[ \t]*'\''/, "", role)
      sub(/'\''.*/, "", role)
      print role "|" email
    }
  ' "$f" 2>/dev/null)
}

# ---------------------------------------------------------------------------
# Live deployment detection and runtime probes
# ---------------------------------------------------------------------------
live_header_value() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 0
  awk -v key="$key" '
    {
      line = $0
      sub(/\r$/, "", line)
      if (tolower(substr(line, 1, length(key) + 1)) == tolower(key) ":") {
        sub(/^[^:]+:[ \t]*/, "", line)
        print line
        exit
      }
    }
  ' "$file"
}

detect_live_deployment() {
  APP_URL="${APP_URL:-https://crm.bystruev.com}"
  SUPABASE_URL="${SUPABASE_URL:-https://uctbykqitlelphgbpnoq.supabase.co}"
  APP_URL="${APP_URL%/}"
  SUPABASE_URL="${SUPABASE_URL%/}"
  LIVE_APP_URL="$APP_URL"

  local index="$WORKDIR/live_index.html"
  local headers="$WORKDIR/live_headers.txt"
  local asset="$WORKDIR/live_asset.js"
  local rest_headers="$WORKDIR/live_rest_headers.txt"
  local code

  : > "$headers"
  code="$(curl -sS -L --connect-timeout 5 --max-time "$LIVE_TIMEOUT" \
    -D "$headers" -o "$index" -w '%{http_code}' "$APP_URL/" \
    2>"$WORKDIR/live_index.err" || printf '000')"
  LIVE_APP_STATUS="$code"
  LIVE_VERCEL_ID="$(live_header_value "$headers" 'x-vercel-id')"
  LIVE_ETAG="$(live_header_value "$headers" 'etag')"
  LIVE_LAST_MODIFIED="$(live_header_value "$headers" 'last-modified')"
  LIVE_ASSET_PATH="$(grep -oE 'assets/index-[A-Za-z0-9._-]+\.js' "$index" 2>/dev/null | head -1)"
  LIVE_ASSET_HASH="$(basename "${LIVE_ASSET_PATH:-}")"
  [ -z "$LIVE_ASSET_HASH" ] && LIVE_ASSET_HASH="n/a"

  if [ -n "$LIVE_ASSET_PATH" ]; then
    curl -sS -L --connect-timeout 5 --max-time "$LIVE_TIMEOUT" \
      -o "$asset" "$APP_URL/$LIVE_ASSET_PATH" 2>/dev/null || true
  fi

  LIVE_ANON_KEY="${SUPABASE_ANON_KEY:-}"
  if [ -n "$LIVE_ANON_KEY" ]; then
    LIVE_ANON_KEY_SOURCE="environment"
  elif [ -s "$asset" ]; then
    LIVE_ANON_KEY="$(grep -oE 'sb_publishable_[A-Za-z0-9_-]+' "$asset" 2>/dev/null | head -1)"
    if [ -z "$LIVE_ANON_KEY" ]; then
      LIVE_ANON_KEY="$(grep -oE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' "$asset" 2>/dev/null | head -1)"
    fi
    [ -n "$LIVE_ANON_KEY" ] && LIVE_ANON_KEY_SOURCE="live asset $LIVE_ASSET_HASH"
  fi
  if [ -n "$LIVE_ANON_KEY" ]; then
    export SUPABASE_ANON_KEY="$LIVE_ANON_KEY"
  fi

  if [ -n "$LIVE_ANON_KEY" ]; then
    LIVE_API_STATUS="$(curl -sS --connect-timeout 5 --max-time "$LIVE_TIMEOUT" \
      -o "$WORKDIR/live_rest_body.json" -D "$rest_headers" -w '%{http_code}' \
      "$SUPABASE_URL/rest/v1/" \
      -H "apikey: $LIVE_ANON_KEY" \
      -H "Authorization: Bearer $LIVE_ANON_KEY" \
      2>"$WORKDIR/live_rest.err" || printf '000')"
  else
    LIVE_API_STATUS="$(curl -sS --connect-timeout 5 --max-time "$LIVE_TIMEOUT" \
      -o "$WORKDIR/live_rest_body.json" -D "$rest_headers" -w '%{http_code}' \
      "$SUPABASE_URL/rest/v1/" \
      2>"$WORKDIR/live_rest.err" || printf '000')"
  fi

  LIVE_AUTH_STATUS="$(
    health_args=( -sS --connect-timeout 5 --max-time "$LIVE_TIMEOUT" \
      -o "$WORKDIR/live_auth_health.json" -w '%{http_code}' )
    if [ -n "$LIVE_ANON_KEY" ]; then
      health_args+=(-H "apikey: $LIVE_ANON_KEY")
    fi
    curl "${health_args[@]}" "$SUPABASE_URL/auth/v1/health" \
      2>"$WORKDIR/live_auth_health.err" || printf '000'
  )"

  if [ "$LIVE_AUTH_STATUS" = "200" ]; then
    LIVE_API_DISPLAY="200 OK"
  else
    LIVE_API_DISPLAY="${LIVE_AUTH_STATUS:-unreachable}"
  fi
  case "$LIVE_API_STATUS" in
    000|'') ;;
    200) LIVE_API_DISPLAY="$LIVE_API_DISPLAY; REST 200" ;;
    401|403) LIVE_API_DISPLAY="$LIVE_API_DISPLAY; REST $LIVE_API_STATUS reachable" ;;
    *) LIVE_API_DISPLAY="$LIVE_API_DISPLAY; REST $LIVE_API_STATUS" ;;
  esac

  if [ "$OPT_VERBOSE" -eq 1 ]; then
    printf '  [LIVE] App %s -> HTTP %s | Vercel ID: %s | Asset: %s\n' \
      "$LIVE_APP_URL" "$LIVE_APP_STATUS" "${LIVE_VERCEL_ID:-n/a}" "$LIVE_ASSET_HASH" >&2
    printf '  [LIVE] API %s -> Auth health %s | REST %s | anon key: %s\n' \
      "$SUPABASE_URL" "$LIVE_AUTH_STATUS" "$LIVE_API_STATUS" "${LIVE_ANON_KEY_SOURCE:-n/a}" >&2
  fi
}

live_deployment_evidence() {
  local out="$1"
  {
    printf '=== LIVE RUNTIME EVIDENCE (actual network probes) ===\n'
    printf 'Live app URL: %s\n' "${LIVE_APP_URL:-n/a}"
    printf 'Live app HTTP status: %s\n' "${LIVE_APP_STATUS:-n/a}"
    printf 'Vercel ID: %s\n' "${LIVE_VERCEL_ID:-n/a}"
    printf 'ETag: %s\n' "${LIVE_ETAG:-n/a}"
    printf 'Last-Modified: %s\n' "${LIVE_LAST_MODIFIED:-n/a}"
    printf 'Primary JS asset: %s\n' "${LIVE_ASSET_HASH:-n/a}"
    printf 'Live API URL: %s\n' "${SUPABASE_URL:-n/a}"
    printf 'REST /rest/v1/ status: %s\n' "${LIVE_API_STATUS:-n/a}"
    printf 'Auth /auth/v1/health status: %s\n' "${LIVE_AUTH_STATUS:-n/a}"
    printf 'Anon key source: %s\n' "${LIVE_ANON_KEY_SOURCE:-n/a}"
    printf 'These are real responses from the running deployment, not local source claims.\n\n'
  } > "$out"
}

live_http_probe() {
  local label="$1" method="$2" url="$3" token="$4" body="$5" out="$6" hdr="$7"
  local -a args
  local code
  args=( -sS -L --connect-timeout 5 --max-time "$LIVE_TIMEOUT" -X "$method" -D "$hdr" -o "$out" -w '%{http_code}' )
  [ -n "$LIVE_ANON_KEY" ] && args+=(-H "apikey: $LIVE_ANON_KEY")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  if [ -n "$body" ]; then
    args+=(-H 'Content-Type: application/json' --data-binary "$body")
  fi
  if [ "$method" = "PATCH" ] || [ "$method" = "POST" ]; then
    args+=(-H 'Prefer: return=representation')
  fi
  code="$(curl "${args[@]}" "$url" 2>"$WORKDIR/live_${label}.err" || printf '000')"

  if [ "$OPT_VERBOSE" -eq 1 ]; then
    printf '  [LIVE] %s %s -> HTTP %s\n' "$method" "$url" "$code" >&2
    if [ -n "$body" ]; then
      case "$label" in
        auth_login*) printf '    Request body: <login request redacted>\n' >&2 ;;
        *) printf '    Request body: ' >&2; printf '%s' "$body" | redact_text >&2; printf '\n' >&2 ;;
      esac
    fi
    if [ -s "$hdr" ] && [[ "$label" != auth_login* ]]; then
      sed 's/^/    /' "$hdr" 2>/dev/null | head -n 12 >&2
    fi
    if [ -s "$out" ]; then
      if [[ "$label" == auth_login* ]]; then
        printf '    Body: <login response redacted>\n' >&2
      else
        printf '    Body: ' >&2
        head -c 1000 "$out" | redact_text >&2
        printf '\n' >&2
      fi
    fi
  fi
  printf '%s' "$code"
}

live_login() {
  local role="$1" email="$2" password="$3"
  local token_file="$WORKDIR/live_token_$role"
  local body="$WORKDIR/live_login_$role.json"
  local status_file="$WORKDIR/live_login_$role.status"
  local payload code

  if [ -s "$token_file" ]; then
    return 0
  fi
  : > "$token_file"
  if [ -z "$LIVE_ANON_KEY" ]; then
    printf '000' > "$status_file"
    return 1
  fi

  payload="$(jq -n --arg email "$email" --arg password "$password" \
    '{email:$email, password:$password}')"
  code="$(live_http_probe "auth_login_$role" POST \
    "$SUPABASE_URL/auth/v1/token?grant_type=password" "" "$payload" \
    "$body" "$WORKDIR/live_login_$role.hdr")"
  printf '%s' "$code" > "$status_file"

  if [ "$code" = "200" ]; then
    jq -r '.access_token // empty' "$body" > "$token_file" 2>/dev/null || true
    if [ -s "$token_file" ]; then
      rm -f "$body" "$WORKDIR/live_login_$role.hdr"
      return 0
    fi
  fi
  : > "$token_file"
  return 1
}

live_get_tasks() {
  local role="$1" token="$2" out="$3"
  live_http_probe "tasks_$role" GET \
    "$SUPABASE_URL/rest/v1/tasks?select=id,title,description,assignee_id,status&limit=100" \
    "$token" "" "$out" "$WORKDIR/live_tasks_$role.hdr"
}

collect_live_runtime_evidence() {
  local text="$1" out="$2"
  local signup_code="" signup_email="" signup_payload=""
  local manager_ok=1 worker1_ok=1 worker2_ok=1
  local w1_code="" w2_code="" w1_token="" w2_token="" manager_token=""
  local foreign_task="" foreign_title="" foreign_code=""
  local status_code="" status_task="" status_role="" status_token=""
  local history_post_code="" history_delete_code="" history_payload=""

  live_deployment_evidence "$out"

  if printf '%s' "$text" | grep -Eqi 'регистрац|signup|sign-up|registration|public registration'; then
    {
      printf -- '--- LIVE SIGNUP PROBE (requirement 15) ---\n'
      if [ -z "$LIVE_ANON_KEY" ]; then
        printf 'SKIPPED: no public anon key was found for the live probe.\n\n'
      else
        signup_email="probe-verify15-$(date +%s)-$$@example.com"
        signup_payload="$(jq -n --arg email "$signup_email" --arg password 'ProbePass123!' \
          '{email:$email, password:$password}')"
        signup_code="$(live_http_probe 'signup' POST "$SUPABASE_URL/auth/v1/signup" "" \
          "$signup_payload" "$WORKDIR/live_signup.json" "$WORKDIR/live_signup.hdr")"
        printf 'POST %s/auth/v1/signup -> HTTP %s\n' "$SUPABASE_URL" "$signup_code"
        printf 'Response body: '
        head -c 1200 "$WORKDIR/live_signup.json" 2>/dev/null | redact_text
        printf '\n'
        case "$signup_code" in
          400|401|403|422) printf 'Live result: public signup rejected by the deployment.\n' ;;
          200|201) printf 'Live result: SIGNUP SUCCEEDED - public registration is NOT disabled.\n' ;;
          *) printf 'Live result: unexpected status; review the response above.\n' ;;
        esac
        printf '\n'
      fi
    } >> "$out"
  fi

  if printf '%s' "$text" | grep -Eqi 'роль|role|worker|исполнител|manager|постановщик|rls|row.level|policy|доступ|прав|безопас|permission|чуж'; then
    {
      printf -- '--- LIVE AUTH / RLS PROBES (requirements 01, 11, 12) ---\n'
      live_login manager "$LIVE_MANAGER_EMAIL" "$LIVE_MANAGER_PASSWORD"; manager_ok=$?
      live_login worker1 "$LIVE_WORKER1_EMAIL" "$LIVE_WORKER1_PASSWORD"; worker1_ok=$?
      live_login worker2 "$LIVE_WORKER2_EMAIL" "$LIVE_WORKER2_PASSWORD"; worker2_ok=$?
      printf 'Manager login (%s): HTTP %s\n' "$LIVE_MANAGER_EMAIL" "$(cat "$WORKDIR/live_login_manager.status" 2>/dev/null || printf 'n/a')"
      printf 'Worker 1 login (%s): HTTP %s\n' "$LIVE_WORKER1_EMAIL" "$(cat "$WORKDIR/live_login_worker1.status" 2>/dev/null || printf 'n/a')"
      printf 'Worker 2 login (%s): HTTP %s\n' "$LIVE_WORKER2_EMAIL" "$(cat "$WORKDIR/live_login_worker2.status" 2>/dev/null || printf 'n/a')"
      printf '\n'

      if [ "$worker1_ok" -eq 0 ]; then
        w1_token="$(cat "$WORKDIR/live_token_worker1" 2>/dev/null || true)"
        w1_code="$(live_get_tasks worker1 "$w1_token" "$WORKDIR/live_tasks_worker1.json")"
        printf 'GET /rest/v1/tasks as worker1 -> HTTP %s\n' "$w1_code"
        if [ "$w1_code" = "200" ] && [ -s "$WORKDIR/live_tasks_worker1.json" ]; then
          printf 'Worker 1 task count: %s\n' "$(jq 'length' "$WORKDIR/live_tasks_worker1.json" 2>/dev/null || printf 'n/a')"
          printf 'Worker 1 assignee_ids: %s\n' "$(jq -r '[.[].assignee_id] | unique | join(", ")' "$WORKDIR/live_tasks_worker1.json" 2>/dev/null || printf 'n/a')"
          printf 'Worker 1 tasks:\n'
          jq -r '.[] | "  \(.id) | \(.status) | \(.title)"' "$WORKDIR/live_tasks_worker1.json" 2>/dev/null | head -n 8
        else
          printf 'Worker 1 response body: '
          head -c 800 "$WORKDIR/live_tasks_worker1.json" 2>/dev/null | redact_text
          printf '\n'
        fi
        printf '\n'
      fi

      if [ "$worker2_ok" -eq 0 ]; then
        w2_token="$(cat "$WORKDIR/live_token_worker2" 2>/dev/null || true)"
        w2_code="$(live_get_tasks worker2 "$w2_token" "$WORKDIR/live_tasks_worker2.json")"
        printf 'GET /rest/v1/tasks as worker2 -> HTTP %s\n' "$w2_code"
        if [ "$w2_code" = "200" ] && [ -s "$WORKDIR/live_tasks_worker2.json" ]; then
          printf 'Worker 2 task count: %s\n' "$(jq 'length' "$WORKDIR/live_tasks_worker2.json" 2>/dev/null || printf 'n/a')"
          printf 'Worker 2 assignee_ids: %s\n' "$(jq -r '[.[].assignee_id] | unique | join(", ")' "$WORKDIR/live_tasks_worker2.json" 2>/dev/null || printf 'n/a')"
        else
          printf 'Worker 2 response body: '
          head -c 800 "$WORKDIR/live_tasks_worker2.json" 2>/dev/null | redact_text
          printf '\n'
        fi
        printf '\n'
      fi

      if [ "$worker1_ok" -eq 0 ] && [ "$w2_code" = "200" ] && [ -s "$WORKDIR/live_tasks_worker2.json" ]; then
        w1_token="$(cat "$WORKDIR/live_token_worker1" 2>/dev/null || true)"
        foreign_task="$(jq -r '.[0].id // empty' "$WORKDIR/live_tasks_worker2.json" 2>/dev/null || true)"
        foreign_title="$(jq -r '.[0].title // empty' "$WORKDIR/live_tasks_worker2.json" 2>/dev/null || true)"
        if [ -n "$foreign_task" ] && [ -n "$foreign_title" ]; then
          foreign_code="$(live_http_probe 'patch_foreign_task' PATCH \
            "$SUPABASE_URL/rest/v1/tasks?id=eq.$foreign_task" "$w1_token" \
            "$(jq -n --arg title "$foreign_title" '{title:$title}')" \
            "$WORKDIR/live_patch_foreign.json" "$WORKDIR/live_patch_foreign.hdr")"
          printf 'PATCH another worker task %s as worker1 -> HTTP %s\n' "$foreign_task" "$foreign_code"
          printf 'Response body: '
          head -c 800 "$WORKDIR/live_patch_foreign.json" 2>/dev/null | redact_text
          printf '\n'
          if [ "$foreign_code" = "200" ] && jq -e 'length == 0' "$WORKDIR/live_patch_foreign.json" >/dev/null 2>&1; then
            printf 'Live result: 0 rows updated (RLS blocked the foreign task).\n'
          elif [ "$foreign_code" = "401" ] || [ "$foreign_code" = "403" ]; then
            printf 'Live result: RLS/permission rejection.\n'
          else
            printf 'Live result: review the response above.\n'
          fi
          printf '\n'
        fi
      fi
    } >> "$out"
  fi

  if printf '%s' "$text" | grep -Eqi 'статус|переход|status|transition|state machine|workflow|проверк|review|доработк|revision|принят|accept|в работу|in_progress'; then
    {
      printf -- '--- LIVE STATUS-TRANSITION PROBE (requirement 13) ---\n'
      live_login worker1 "$LIVE_WORKER1_EMAIL" "$LIVE_WORKER1_PASSWORD"; status_role="worker1"
      status_token="$(cat "$WORKDIR/live_token_worker1" 2>/dev/null || true)"
      if [ -z "$status_token" ]; then
        live_login worker2 "$LIVE_WORKER2_EMAIL" "$LIVE_WORKER2_PASSWORD"
        status_role="worker2"
        status_token="$(cat "$WORKDIR/live_token_worker2" 2>/dev/null || true)"
      fi
      status_code="$(live_get_tasks "$status_role" "$status_token" "$WORKDIR/live_tasks_status.json")"
      printf 'GET /rest/v1/tasks as %s -> HTTP %s\n' "$status_role" "$status_code"
      if [ "$status_code" = "200" ]; then
        status_task="$(jq -r '.[] | select(.status == "new") | .id' "$WORKDIR/live_tasks_status.json" 2>/dev/null | head -1)"
      else
        printf 'Response body: '
        head -c 800 "$WORKDIR/live_tasks_status.json" 2>/dev/null | redact_text
        printf '\n'
        status_task=""
      fi
      if [ -n "$status_task" ] && [ -n "$status_token" ]; then
        status_code="$(live_http_probe 'invalid_transition' PATCH \
          "$SUPABASE_URL/rest/v1/tasks?id=eq.$status_task" "$status_token" \
          '{"status":"accepted"}' \
          "$WORKDIR/live_invalid_transition.json" "$WORKDIR/live_invalid_transition.hdr")"
        printf 'PATCH task %s new -> accepted as %s -> HTTP %s\n' "$status_task" "$status_role" "$status_code"
        printf 'Response body: '
        head -c 1000 "$WORKDIR/live_invalid_transition.json" 2>/dev/null | redact_text
        printf '\n'
        if [ "$status_code" = "400" ] && grep -q 'Invalid status transition' "$WORKDIR/live_invalid_transition.json" 2>/dev/null; then
          printf 'Live result: PostgreSQL rejected the invalid transition (P0001).\n'
        else
          printf 'Live result: review the response above.\n'
        fi
      else
        printf 'No task in status "new" was available for the worker transition probe.\n'
      fi
      printf '\n'
    } >> "$out"
  fi

  if printf '%s' "$text" | grep -Eqi 'истори|history|audit'; then
    {
      printf -- '--- LIVE HISTORY-IMMUTABILITY PROBE (requirement 14) ---\n'
      live_login worker1 "$LIVE_WORKER1_EMAIL" "$LIVE_WORKER1_PASSWORD"
      w1_token="$(cat "$WORKDIR/live_token_worker1" 2>/dev/null || true)"
      history_payload='{"task_id":"00000000-0000-4000-8000-000000000000","to_status":"new"}'
      history_post_code="$(live_http_probe 'history_post' POST \
        "$SUPABASE_URL/rest/v1/task_history" "$w1_token" "$history_payload" \
        "$WORKDIR/live_history_post.json" "$WORKDIR/live_history_post.hdr")"
      printf 'POST /rest/v1/task_history as worker1 -> HTTP %s\n' "$history_post_code"
      printf 'Response body: '
      head -c 800 "$WORKDIR/live_history_post.json" 2>/dev/null | redact_text
      printf '\n'

      history_delete_code="$(live_http_probe 'history_delete' DELETE \
        "$SUPABASE_URL/rest/v1/task_history?id=eq.00000000-0000-4000-8000-000000000000" \
        "$w1_token" "" "$WORKDIR/live_history_delete.json" "$WORKDIR/live_history_delete.hdr")"
      printf 'DELETE /rest/v1/task_history as worker1 -> HTTP %s\n' "$history_delete_code"
      printf 'Response body: '
      head -c 800 "$WORKDIR/live_history_delete.json" 2>/dev/null | redact_text
      printf '\n'
      if { [ "$history_post_code" = "401" ] || [ "$history_post_code" = "403" ]; } && \
         { [ "$history_delete_code" = "401" ] || [ "$history_delete_code" = "403" ]; }; then
        printf 'Live result: audit-history writes are refused for authenticated workers.\n'
      else
        printf 'Live result: review the response codes above.\n'
      fi
      printf '\n'
    } >> "$out"
  fi
}


# ---------------------------------------------------------------------------
# OpenRouter configuration (source ~/bin/llm.sh when available)
# ---------------------------------------------------------------------------
load_llm_config() {
  local env_key="${OR_API_KEY:-}"
  local env_model="${OR_MODEL:-}"
  local llm_sh=""

  # Keep the caller's environment authoritative over the config file.
  if [ -f "$HOME/.llm_config" ]; then
    # shellcheck disable=SC1090
    . "$HOME/.llm_config" 2>/dev/null || true
  fi
  if [ -n "$env_key" ]; then OR_API_KEY="$env_key"; fi
  if [ -n "$env_model" ]; then OR_MODEL="$env_model"; fi
  OR_MODEL="${OR_MODEL:-openrouter/free}"

  for llm_sh in "$HOME/bin/llm.sh" "$HOME/.local/bin/llm.sh" "$SCRIPT_DIR/llm.sh"; do
    if [ -f "$llm_sh" ]; then
      # shellcheck disable=SC1090
      . "$llm_sh" >/dev/null 2>&1 || true
      break
    fi
  done

  if [ -n "$OR_MODEL_OVERRIDE" ]; then OR_MODEL="$OR_MODEL_OVERRIDE"; fi
  if [ -n "$OR_API_BASE_OVERRIDE" ]; then OR_API_BASE="$OR_API_BASE_OVERRIDE"; fi
  if [ -n "${API_URL:-}" ] && [ -z "$OR_API_BASE_OVERRIDE" ] && [ -z "$ORIGINAL_OR_API_BASE" ]; then
    # llm.sh normally sets this; keep its value when present unless the
    # caller supplied OR_API_BASE explicitly.
    OR_API_BASE="$API_URL"
  fi
  OR_API_BASE="${OR_API_BASE%/}"
  API_URL="$OR_API_BASE"
  # llm.sh's own verbose switch must not change our structured output.
  VERBOSE=0
}

openrouter_error_message() {
  jq -r '.error.metadata.raw // .error.message // .message // "unknown OpenRouter error"' "$1" 2>/dev/null | redact_text || printf 'unknown OpenRouter error'
}

preflight_die() {
  KEEP_ON_FAIL=1
  printf 'ERROR: %s\n' "$*" >&2
  if [ -n "${WORKDIR:-}" ] && [ -d "$WORKDIR" ]; then
    printf 'Artifacts: %s\n' "$WORKDIR" >&2
  fi
  exit 2
}

preflight_get() {
  local url="$1" body="$2" err="$3" code rc
  code=$(curl -sS --max-time "$CMD_TIMEOUT" -o "$body" -w '%{http_code}' \
    -H "Authorization: Bearer ${OR_API_KEY:-}" \
    -H "Accept: application/json" \
    -H "HTTP-Referer: https://github.com/dbystruev/crm" \
    -H "X-Title: verify.sh" \
    "$url" 2>"$err")
  rc=$?
  if [ "$rc" -ne 0 ]; then
    printf '000'
    return 0
  fi
  printf '%s' "$code"
}

preflight_llm() {
  local auth_body="$WORKDIR/preflight_auth.json"
  local auth_err="$WORKDIR/preflight_auth.err"
  local models_body="$WORKDIR/preflight_models.json"
  local models_err="$WORKDIR/preflight_models.err"
  local probe_body="$WORKDIR/preflight_probe.json"
  local code msg model_list free_count selected_count served

  if [ -z "${OR_API_KEY:-}" ]; then
    cat >&2 <<EOF
ERROR: OR_API_KEY is not configured.

The verification harness needs an OpenRouter key for semantic checks.

Set it with one of:
  ~/bin/llm.sh key add <key>
  export OR_API_KEY=<key>
  printf 'OR_API_KEY="%s"\\n' '<key>' > ~/.llm_config
  printf 'OR_API_KEY="%s"\\n' '<key>' > "$REPO_ROOT/.env"

Lookup order: shell environment -> ~/.llm_config -> .env / .env.local.

Then re-run:
  ./$SCRIPT_NAME "$SPEC_FILE"
EOF
    KEEP_ON_FAIL=1
    exit 2
  fi

  OR_API_CALLS=$((OR_API_CALLS + 1))
  code="$(preflight_get "$OR_API_BASE/auth/key" "$auth_body" "$auth_err")"
  case "$code" in
    000)
      preflight_die "could not reach OpenRouter at $OR_API_BASE (network/proxy/DNS error). $(cat "$auth_err" 2>/dev/null)"
      ;;
    401|403)
      msg="$(openrouter_error_message "$auth_body")"
      preflight_die "OpenRouter authentication failed (HTTP $code): $msg. Re-add the key with: ~/bin/llm.sh key add <key>"
      ;;
    429)
      msg="$(openrouter_error_message "$auth_body")"
      preflight_die "OpenRouter rate limit hit during preflight (HTTP 429): $msg. Wait for the quota window to reset or use another key."
      ;;
    2*)
      ;;
    *)
      msg="$(openrouter_error_message "$auth_body")"
      preflight_die "OpenRouter preflight returned HTTP $code: $msg"
      ;;
  esac

  if ! jq -e '.data' "$auth_body" >/dev/null 2>&1; then
    preflight_die "OpenRouter /auth/key did not return a data object: $(redact_text < "$auth_body")"
  fi

  # Daily free-model quota (present on keys with free-model access).
  if jq -e '.data.free_model_daily_requests' "$auth_body" >/dev/null 2>&1; then
    QUOTA_USED="$(jq -r '.data.free_model_daily_requests.used // 0' "$auth_body")"
    QUOTA_LIMIT="$(jq -r '.data.free_model_daily_requests.limit // 0' "$auth_body")"
    QUOTA_REMAINING="$(jq -r '.data.free_model_daily_requests.remaining // empty' "$auth_body")"
    if [ -z "$QUOTA_REMAINING" ] || [ "$QUOTA_REMAINING" = "null" ]; then
      QUOTA_REMAINING=$((QUOTA_LIMIT - QUOTA_USED))
      [ "$QUOTA_REMAINING" -lt 0 ] && QUOTA_REMAINING=0
    fi
    START_QUOTA_USED="$QUOTA_USED"
    START_QUOTA_LIMIT="$QUOTA_LIMIT"
    START_QUOTA_REMAINING="$QUOTA_REMAINING"

    if [ "$QUOTA_REMAINING" -lt "$QUOTA_REQUIRED" ]; then
      msg="OpenRouter daily free-model quota is insufficient: $QUOTA_REMAINING remaining ($QUOTA_USED/$QUOTA_LIMIT used), but $QUOTA_REQUIRED requirement(s) are scheduled from $SPEC_BASENAME."
      if [ "$FORCE" -eq 1 ]; then
        warn "$msg Continuing because --force was supplied."
      else
        preflight_die "$msg Re-run with --force to override, or wait until 00:00 UTC (in $(duration_fmt "$(secs_until_utc_midnight)"))."
      fi
    elif [ "$RUN_PROBE" -eq 1 ] && [ "$QUOTA_REMAINING" -eq "$QUOTA_REQUIRED" ]; then
      warn "Quota exactly equals the requirement count; the preflight probe consumes one additional call. Use --no-probe or --force if the last requirement runs out."
    fi
    if [ "$QUOTA_REMAINING" -le 0 ]; then
      msg="OpenRouter free-model daily quota is exhausted ($QUOTA_USED/$QUOTA_LIMIT used). It resets at 00:00 UTC (in $(duration_fmt "$(secs_until_utc_midnight)"))."
      if [ "$FORCE" -eq 1 ]; then
        warn "$msg Continuing because --force was supplied; LLM calls may fail."
      else
        preflight_die "$msg Use another key or wait for the reset."
      fi
    fi
  else
    warn "OpenRouter did not report free_model_daily_requests; quota assertion skipped."
  fi

  # Confirm the catalog exposes free models, and that the selected model exists.
  OR_API_CALLS=$((OR_API_CALLS + 1))
  code="$(preflight_get "$OR_API_BASE/models" "$models_body" "$models_err")"
  if [ "$code" = "200" ] && jq -e '.data' "$models_body" >/dev/null 2>&1; then
    free_count="$(jq -r '[.data[]? | select((.id // "") == "openrouter/free" or ((.id // "") | endswith(":free")))] | length' "$models_body" 2>/dev/null || printf '0')"
    selected_count="$(jq -r --arg m "$OR_MODEL" '[.data[]? | select(.id == $m)] | length' "$models_body" 2>/dev/null || printf '0')"
    if [ "${free_count:-0}" -le 0 ]; then
      preflight_die "OpenRouter catalog reports no free models available; check the key's free-tier access."
    fi
    case "$OR_MODEL" in
      openrouter/free|*:free)
        if [ "${selected_count:-0}" -eq 0 ]; then
          preflight_die "model '$OR_MODEL' is not present in the OpenRouter catalog. Run: ~/bin/llm.sh model list"
        fi
        ;;
      *)
        if [ "$ALLOW_PAID" -ne 1 ]; then
          preflight_die "model '$OR_MODEL' is not a free model. Select a free model (e.g. openrouter/free) or pass --allow-paid."
        fi
        ;;
    esac
    [ "$OPT_VERBOSE" -eq 1 ] && printf '[preflight] free models in catalog: %s; selected model present: %s\n' "$free_count" "$selected_count" >&2
  else
    warn "could not fetch the OpenRouter model catalog; relying on the completion probe"
  fi

  # Actually confirm that the selected model is usable.  A catalog entry alone
  # does not prove that the free pool will serve this key right now.
  if [ "$RUN_PROBE" -eq 1 ]; then
    local payload response attempt err
    payload="$(jq -n --arg m "$OR_MODEL" '{model:$m, messages:[{role:"user", content:"Reply with OK"}], temperature:0, max_tokens:8}')"
    attempt=1
    while [ "$attempt" -le 3 ]; do
      OR_API_CALLS=$((OR_API_CALLS + 1))
      response="$(call_api "POST" "/chat/completions" "$payload" "$LLM_TIMEOUT" 2>/dev/null || true)"
      printf '%s\n' "$response" > "$probe_body"
      if printf '%s' "$response" | jq -e '.choices[0].message' >/dev/null 2>&1; then
        served="$(printf '%s' "$response" | jq -r '.model // empty')"
        [ "$OPT_VERBOSE" -eq 1 ] && printf '[preflight] free-model probe OK%s\n' "${served:+ (served by $served)}" >&2
        break
      fi
      err="$(printf '%s' "$response" | jq -r '.error.metadata.raw // .error.message // empty' 2>/dev/null || true)"
      [ -z "$err" ] && err="empty or invalid response"
      attempt=$((attempt + 1))
      if [ "$attempt" -le 3 ]; then
        printf '[preflight] probe failed (%s); retrying %d/3...\n' "$err" "$attempt" >&2
        sleep 3
      fi
    done
    if [ "$attempt" -gt 3 ] && ! printf '%s' "$response" | jq -e '.choices[0].message' >/dev/null 2>&1; then
      msg="$(printf '%s' "$response" | jq -r '.error.code // empty' 2>/dev/null || true)"
      case "$msg" in
        401|403) preflight_die "OpenRouter rejected the completion probe (HTTP $msg): $err" ;;
        429) preflight_die "OpenRouter free-model probe was rate-limited (HTTP 429): $err. The daily or per-minute quota is exhausted; wait or use another key." ;;
        *) preflight_die "OpenRouter free-model probe failed for '$OR_MODEL': $err" ;;
      esac
    fi
  fi

  # Refresh the quota after the probe so the header is accurate.
  if jq -e '.data.free_model_daily_requests' "$auth_body" >/dev/null 2>&1; then
    local auth_body2="$WORKDIR/preflight_auth2.json"
    OR_API_CALLS=$((OR_API_CALLS + 1))
    code="$(preflight_get "$OR_API_BASE/auth/key" "$auth_body2" "$WORKDIR/preflight_auth2.err")"
    if [ "$code" = "200" ] && jq -e '.data.free_model_daily_requests' "$auth_body2" >/dev/null 2>&1; then
      QUOTA_USED="$(jq -r '.data.free_model_daily_requests.used // 0' "$auth_body2")"
      QUOTA_LIMIT="$(jq -r '.data.free_model_daily_requests.limit // 0' "$auth_body2")"
      QUOTA_REMAINING="$(jq -r '.data.free_model_daily_requests.remaining // empty' "$auth_body2")"
      if [ -z "$QUOTA_REMAINING" ] || [ "$QUOTA_REMAINING" = "null" ]; then
        QUOTA_REMAINING=$((QUOTA_LIMIT - QUOTA_USED))
        [ "$QUOTA_REMAINING" -lt 0 ] && QUOTA_REMAINING=0
      fi
    fi
  fi

  if [ -n "$QUOTA_REMAINING" ] && [ -n "$QUOTA_LIMIT" ]; then
    QUOTA_DISPLAY="$QUOTA_REMAINING/$QUOTA_LIMIT"
  fi
}

refresh_end_quota() {
  [ "$NO_LLM" -eq 1 ] && return 0
  [ "$END_QUOTA_REFRESHED" -eq 1 ] && return 0
  END_QUOTA_REFRESHED=1
  local body="$WORKDIR/end_auth.json" code
  if [ -z "${OR_API_KEY:-}" ]; then
    END_QUOTA_USED="$QUOTA_USED"
    END_QUOTA_LIMIT="$QUOTA_LIMIT"
    END_QUOTA_REMAINING="$QUOTA_REMAINING"
    return 0
  fi
  OR_API_CALLS=$((OR_API_CALLS + 1))
  code="$(preflight_get "$OR_API_BASE/auth/key" "$body" "$WORKDIR/end_auth.err")"
  if [ "$code" = "200" ] && jq -e '.data.free_model_daily_requests' "$body" >/dev/null 2>&1; then
    END_QUOTA_USED="$(jq -r '.data.free_model_daily_requests.used // 0' "$body")"
    END_QUOTA_LIMIT="$(jq -r '.data.free_model_daily_requests.limit // 0' "$body")"
    END_QUOTA_REMAINING="$(jq -r '.data.free_model_daily_requests.remaining // empty' "$body")"
    if [ -z "$END_QUOTA_REMAINING" ] || [ "$END_QUOTA_REMAINING" = "null" ]; then
      END_QUOTA_REMAINING=$((END_QUOTA_LIMIT - END_QUOTA_USED))
      [ "$END_QUOTA_REMAINING" -lt 0 ] && END_QUOTA_REMAINING=0
    fi
  else
    END_QUOTA_USED="$QUOTA_USED"
    END_QUOTA_LIMIT="$QUOTA_LIMIT"
    END_QUOTA_REMAINING="$QUOTA_REMAINING"
  fi
}

# Fallback OpenRouter caller when ~/bin/llm.sh is unavailable.
if ! declare -F call_api >/dev/null 2>&1; then
  call_api() {
    local method="$1" endpoint="$2" data="$3" max_time="${4:-0}"
    local -a opts
    opts=(-sS -X "$method" "$OR_API_BASE$endpoint" -H "Authorization: Bearer ${OR_API_KEY:-}")
    if [ "$max_time" -gt 0 ]; then opts+=(--max-time "$max_time"); fi
    if [ -n "$data" ]; then opts+=(-H "Content-Type: application/json" -d "$data"); fi
    curl "${opts[@]}"
    return $?
  }
fi

load_llm_config
load_environment
load_demo_accounts

# Live deployment is the primary target for runtime evidence. --list is a pure
# local parse operation and must stay fast and offline.
if [ "$LIST_ONLY" -eq 0 ]; then
  detect_live_deployment
fi

# ---------------------------------------------------------------------------
# Specification parsing
# ---------------------------------------------------------------------------
# The parser intentionally avoids a rigid schema: it understands headings,
# numbered/bulleted requirement lists, and explicit REQ/FR/NFR lines.  It
# treats leaf sections as requirements; if a leaf section has two or more
# list items, each item becomes a requirement with its section context.
# ---------------------------------------------------------------------------
cat > "$WORKDIR/parser.awk" <<'AWK'
function clean(s,   t) {
  t = s
  sub(/\r$/, "", t)
  gsub(/\\/, "", t)
  gsub(/[*`]/, "", t)
  sub(/^[ \t]+/, "", t)
  sub(/[ \t]+$/, "", t)
  sub(/^[0-9]+(\.[0-9]+)*[.)]?[ \t]+/, "", t)
  gsub(/[ \t]+/, " ", t)
  return t
}

function item_clean(s,   t) {
  t = s
  sub(/\r$/, "", t)
  sub(/^[ \t]+/, "", t)
  sub(/^([0-9]+[.)]|[-*+])[ \t]+/, "", t)
  sub(/^\[[ xX]\][ \t]+/, "", t)
  sub(/^\[[ xX]\][ \t]+/, "", t)
  sub(/^(REQ|Requirement|requirement|Требование|ТРЕБОВАНИЕ|AC|FR|NFR)[-_ ]?[0-9]*[:.)]?[ \t]+/, "", t)
  return clean(t)
}

function is_excluded(t,   s) {
  s = tolower(t)
  if (s ~ /^(overview|introduction|context|background|conditions|terms|setup|installation|quick start|getting started|usage|how to run|deliverables|submission|what to submit|notes|appendix|table of contents|license|contributing)$/) return 1
  if (s ~ /^(overview|introduction|context|background|conditions|terms|setup|installation|quick start|getting started|usage|how to run|deliverables|submission|what to submit|notes|appendix|table of contents|license|contributing)[ :.-]/) return 1
  if (t ~ /^(Условия|Введение|Обзор|Контекст|Фон|Установка|Запуск|Как запустить|Примечания|Приложение|Оглавление|Что сдать|Сдача|Лицензия)([ :.-]|$)/) return 1
  return 0
}

function section_intro(h,   i, out, n, started) {
  out = ""; n = 0; started = 0
  if (h == 0) return ""
  for (i = hline[h] + 1; i <= hend[h]; i++) {
    if (line[i] ~ /^[ \t]*$/) {
      if (started) break
      continue
    }
    if (line[i] ~ /^[ \t]*([0-9]+[.)]|[-*+])[ \t]+/) break
    if (line[i] ~ /^[ \t]*\|/) break
    if (line[i] ~ /^#{1,6}[ \t]+/) break
    if (line[i] ~ /^[ \t]*(```|~~~)/) break
    started = 1
    out = out line[i] "\n"
    n++
    if (n >= 10) break
  }
  return out
}

function item_end(k,   m, best, pend) {
  if (iparent[k] > 0) pend = hend[iparent[k]]
  else pend = NR
  best = pend
  for (m = 1; m <= icount; m++) {
    if (m == k) continue
    if (iparent[m] != iparent[k]) continue
    if (istart[m] <= istart[k]) continue
    if (istart[m] - 1 < best) best = istart[m] - 1
  }
  return best
}

function add_candidate(kind, title, start, end, h) {
  if (title == "" || seen[title]) return
  seen[title] = 1
  ncand++
  ckind[ncand] = kind
  ctitle[ncand] = title
  cstart[ncand] = start
  cend[ncand] = end
  ch[ncand] = h
}

{
  raw = $0
  sub(/\r$/, "", raw)
  line[NR] = raw

  if (in_fence) {
    if (raw ~ ("^[ \t]*" fence_char)) {
      in_fence = 0
      fence_char = ""
    }
    next
  }
  if (raw ~ /^[ \t]*(```|~~~)/) {
    if (match(raw, /^[ \t]*(```|~~~)/)) {
      # RSTART covers the leading spaces; take the last three chars of the match.
      fence_char = substr(raw, RSTART + RLENGTH - 3, 3)
      in_fence = 1
      next
    }
  }

  if (raw ~ /^#{1,6}[ \t]+/) {
    hcount++
    hline[hcount] = NR
    hlvl[hcount] = 0
    tmp = raw
    while (substr(tmp, 1, 1) == "#") {
      hlvl[hcount]++
      tmp = substr(tmp, 2)
    }
    sub(/^[ \t]+/, "", tmp)
    sub(/[ \t]+#+[ \t]*$/, "", tmp)
    htitle[hcount] = clean(tmp)
    cur_h = hcount
    next
  }

  # Named requirement line, e.g. "REQ-1: ...", "Requirement: ...", "FR 2 ...".
  named = raw
  sub(/^[ \t]+/, "", named)
  if (named ~ /^(REQ|Requirement|requirement|Требование|ТРЕБОВАНИЕ|AC|FR|NFR)[-_ ]?[0-9]*[:.)]?[ \t]+/) {
    icount++
    istart[icount] = NR
    iparent[icount] = cur_h
    itext[icount] = item_clean(raw)
    next
  }

  if (raw ~ /^[ \t]*([0-9]+[.)]|[-*+])[ \t]+/) {
    indent = raw
    sub(/^([ \t]*).*/, "\\1", indent)
    if (length(indent) <= 4) {
      icount++
      istart[icount] = NR
      iparent[icount] = cur_h
      itext[icount] = item_clean(raw)
      next
    }
  }
}

END {
  # Heading ranges and leaf detection.
  for (i = 1; i <= hcount; i++) {
    hend[i] = NR
    for (j = i + 1; j <= hcount; j++) {
      if (hlvl[j] <= hlvl[i]) {
        hend[i] = hline[j] - 1
        break
      }
    }
    hleaf[i] = 1
    for (j = i + 1; j <= hcount; j++) {
      if (hline[j] > hend[i]) break
      if (hlvl[j] > hlvl[i]) {
        hleaf[i] = 0
        break
      }
    }
  }

  # Primary candidates: non-excluded leaf sections and their list items.
  for (i = 1; i <= hcount; i++) {
    if (hlvl[i] < 2) continue
    if (!hleaf[i]) continue
    if (is_excluded(htitle[i])) continue
    nit = 0
    for (k = 1; k <= icount; k++) {
      if (iparent[k] == i && istart[k] >= hline[i] && istart[k] <= hend[i]) nit++
    }
    if (nit >= 2) {
      last_start = 0
      for (k = 1; k <= icount; k++) {
        if (iparent[k] != i) continue
        if (istart[k] < hline[i] || istart[k] > hend[i]) continue
        if (istart[k] > last_start) last_start = istart[k]
      }
      tail_start = 0
      seen_blank = 0
      for (j = last_start + 1; j <= hend[i]; j++) {
        if (line[j] ~ /^[ \t]*$/) { seen_blank = 1; continue }
        if (seen_blank && line[j] !~ /^[ \t]*([0-9]+[.)]|[-*+])[ \t]+/ && line[j] !~ /^[ \t]*\|/ && line[j] !~ /^#{1,6}[ \t]+/ && line[j] !~ /^[ \t]*(```|~~~)/) {
          tail_start = j
          break
        }
        seen_blank = 0
      }
      tail_text = ""
      if (tail_start > 0) tail_text = clean(line[tail_start])
      if (tail_start > 0 && tail_text ~ /only|только|must|should|должен|должна|должны|cannot|не может|показывает|shows/) {
        for (k = 1; k <= icount; k++) {
          if (iparent[k] != i) continue
          if (istart[k] < hline[i] || istart[k] > hend[i]) continue
          e = item_end(k)
          if (e >= tail_start) e = tail_start - 1
          add_candidate("item", itext[k], istart[k], e, i)
        }
        add_candidate("para", tail_text, tail_start, hend[i], i)
      } else {
        for (k = 1; k <= icount; k++) {
          if (iparent[k] != i) continue
          if (istart[k] < hline[i] || istart[k] > hend[i]) continue
          add_candidate("item", itext[k], istart[k], item_end(k), i)
        }
      }
    } else {
      add_candidate("section", htitle[i], hline[i], hend[i], i)
    }
  }

  # Fallback 1: headings that were excluded by the generic filter.
  if (ncand == 0) {
    for (i = 1; i <= hcount; i++) {
      if (hlvl[i] < 2) continue
      if (!hleaf[i]) continue
      add_candidate("section", htitle[i], hline[i], hend[i], i)
    }
  }

  # Fallback 2: top-level list items with no enclosing heading.
  if (ncand == 0) {
    for (k = 1; k <= icount; k++) {
      if (iparent[k] != 0) continue
      add_candidate("item", itext[k], istart[k], item_end(k), 0)
    }
  }

  # Fallback 3: the whole document as one requirement.
  if (ncand == 0) {
    t = ""
    for (i = 1; i <= NR; i++) {
      if (line[i] ~ /^[ \t]*$/) continue
      if (line[i] ~ /^#{1,6}[ \t]+/) continue
      t = clean(line[i])
      if (t != "") break
    }
    add_candidate("section", (t == "" ? "Specification" : t), 1, NR, 0)
  }

  for (i = 1; i <= ncand; i++) {
    path = sprintf("%s/req_body_%03d.txt", outdir, i)
    print "=== SPECIFICATION CONTEXT ===" > path
    if (ch[i] > 0) {
      print "Section: " htitle[ch[i]] > path
    }
    print "" > path

    if (ckind[i] == "item") {
      intro = section_intro(ch[i])
      if (intro != "") {
        print "=== SECTION INTRODUCTION ===" > path
        printf "%s", intro > path
        print "" > path
      }
      print "=== REQUIREMENT ITEM ===" > path
    }

    for (j = cstart[i]; j <= cend[i]; j++) {
      if (j == cstart[i] && ckind[i] == "section" && line[j] ~ /^#{1,6}[ \t]+/) continue
      print line[j] > path
    }
    close(path)
    printf "%d\t%s\t%s\n", i, ctitle[i], path
  }
}
AWK

awk -v outdir="$WORKDIR" -f "$WORKDIR/parser.awk" "$SPEC_ABS" > "$WORKDIR/manifest.tsv" 2>"$WORKDIR/parser.err"
if [ "$?" -ne 0 ]; then
  printf 'ERROR: failed to parse specification: %s\n' "$SPEC_BASENAME" >&2
  cat "$WORKDIR/parser.err" >&2
  KEEP_ON_FAIL=1
  exit 1
fi

while IFS=$'\t' read -r _idx _title _body; do
  [ -n "${_idx:-}" ] || continue
  REQ_TITLES+=("$_title")
  REQ_BODIES+=("$_body")
done < "$WORKDIR/manifest.tsv"

PARSED_TOTAL="${#REQ_TITLES[@]}"
REQ_COUNT="$PARSED_TOTAL"
if [ "$REQ_COUNT" -eq 0 ]; then
  printf 'ERROR: no requirements could be parsed from %s\n' "$SPEC_BASENAME" >&2
  KEEP_ON_FAIL=1
  exit 1
fi

if [ "$LIST_ONLY" -eq 1 ]; then
  for ((i = 0; i < PARSED_TOTAL; i++)); do
    printf '[%02d] %s\n' "$((i + 1))" "${REQ_TITLES[$i]}"
  done
  exit 0
fi

if [ -n "$ONLY_REQ" ] && [ "$ONLY_REQ" -gt "$PARSED_TOTAL" ]; then
  die "--req $ONLY_REQ is out of range; $SPEC_BASENAME has $PARSED_TOTAL requirement(s)"
fi

if [ "$MAX_REQS" -gt 0 ] && [ "$REQ_COUNT" -gt "$MAX_REQS" ]; then
  REQ_COUNT="$MAX_REQS"
fi

if [ -n "$ONLY_REQ" ] && [ "$ONLY_REQ" -gt "$REQ_COUNT" ]; then
  die "--req $ONLY_REQ is outside the --max window (first $REQ_COUNT requirement(s))"
fi

# The specification is parsed before preflight so the quota assertion can
# compare remaining free-model calls with the number of requirements that will
# actually run. --req N consumes a single verification instead of all of them.
QUOTA_REQUIRED="$REQ_COUNT"
if [ -n "$ONLY_REQ" ]; then
  QUOTA_REQUIRED=1
fi

if [ "$NO_LLM" -eq 0 ] && [ "$DRY_RUN" -eq 0 ]; then
  preflight_llm
fi

# ---------------------------------------------------------------------------
# Verify-block detection (used by --dry-run too)
# ---------------------------------------------------------------------------
count_verify_blocks() {
  local body="$1"
  awk '
    BEGIN { inb = 0; mode = ""; n = 0 }
    {
      line = $0; sub(/\r$/, "", line)
      if (!inb) {
        if (line ~ /^[ \t]*```+[ \t]*verify([- \t]|$)/) { inb = 1; mode = "fence"; n++; next }
        if (line ~ /^[ \t]*<!--[ \t]*verify([- \t]|$)/) { inb = 1; mode = "html"; n++; next }
      } else {
        if (mode == "fence" && line ~ /^[ \t]*```+[ \t]*$/) { inb = 0; mode = ""; next }
        if (mode == "html" && line ~ /-->/) { inb = 0; mode = ""; next }
      }
    }
    END { print n + 0 }
  ' "$body"
}

# ---------------------------------------------------------------------------
# Header and parsed-requirements summary
# ---------------------------------------------------------------------------
rule
printf '%sVERIFICATION HARNESS: %s%s\n' "$C_BOLD$C_CYAN" "$SPEC_BASENAME" "$C_RESET"
if [ "$NO_LLM" -eq 1 ]; then
  printf 'OpenRouter Model: disabled | Daily Quota Remaining: n/a\n'
elif [ "$DRY_RUN" -eq 1 ]; then
  printf 'OpenRouter Model: %s | Daily Quota Remaining: n/a (dry run; preflight skipped)\n' "$OR_MODEL"
else
  printf 'OpenRouter Model: %s | Daily Quota Remaining: %s\n' "$OR_MODEL" "$QUOTA_DISPLAY"
fi
if [ -n "$LIVE_APP_URL" ]; then
  printf 'Live App Target : %s [Vercel ID: %s, Asset Hash: %s]\n' \
    "$LIVE_APP_URL" "${LIVE_VERCEL_ID:-n/a}" "${LIVE_ASSET_HASH:-n/a}"
  printf 'Live API Target : %s [Status: %s]\n' \
    "$SUPABASE_URL" "${LIVE_API_DISPLAY:-n/a}"
fi
if [ "$SHOW_BROWSER" -eq 1 ]; then
  printf 'Browser Mode   : headed (PLAYWRIGHT_SLOWMO=1000ms)\n'
fi
if [ "$FIX_MODE" -eq 1 ]; then
  if [ -n "${VERIFY_FIX_COMMAND:-}" ]; then
    printf 'Repair Mode    : enabled (external patcher configured)\n'
  else
    printf 'Repair Mode    : enabled (context only; set VERIFY_FIX_COMMAND to auto-patch)\n'
  fi
fi
rule
printf '\n%sPARSED REQUIREMENTS SUMMARY:%s\n' "$C_BOLD$C_CYAN" "$C_RESET"
for ((i = 0; i < REQ_COUNT; i++)); do
  printf '[%02d] %s\n' "$((i + 1))" "${REQ_TITLES[$i]}"
done
printf '\n'

if [ "$DRY_RUN" -eq 1 ]; then
  printf 'Found %d requirement(s) in %s (dry run; no checks executed).\n' "$PARSED_TOTAL" "$SPEC_BASENAME"
  for ((i = 0; i < REQ_COUNT; i++)); do
    body="${REQ_BODIES[$i]}"
    if [ "$(count_verify_blocks "$body")" -gt 0 ]; then
      printf '  [%02d] embedded executable check\n' "$((i + 1))"
    else
      printf '  [%02d] LLM semantic verification%s\n' "$((i + 1))" "$([ "$NO_LLM" -eq 1 ] && printf ' (disabled -> will fail)' || true)"
    fi
  done
  exit 0
else
  if [ -n "$ONLY_REQ" ]; then
    printf 'Found %d requirement(s) in %s; testing only requirement %d. Starting test execution...\n\n' "$PARSED_TOTAL" "$SPEC_BASENAME" "$ONLY_REQ"
  elif [ "$REQ_COUNT" -lt "$PARSED_TOTAL" ]; then
    printf 'Found %d requirement(s) in %s; testing the first %d. Starting test execution...\n\n' "$PARSED_TOTAL" "$SPEC_BASENAME" "$REQ_COUNT"
  else
    printf 'Found %d requirement(s) in %s. Starting test execution...\n\n' "$PARSED_TOTAL" "$SPEC_BASENAME"
  fi
fi

# ---------------------------------------------------------------------------
# Verify-block extraction and parsing
# ---------------------------------------------------------------------------
extract_verify_blocks() {
  local body="$1" outdir="$2"
  rm -f "$outdir"/verify_block_*.txt 2>/dev/null || true
  awk -v outdir="$outdir" '
    BEGIN { inb = 0; mode = ""; n = 0; fn = ""; indent = 0 }
    function fence_indent(s,   i, c) {
      i = 0
      while (i < length(s)) {
        c = substr(s, i + 1, 1)
        if (c != " " && c != "\t") break
        i++
      }
      return i
    }
    function dedent(s,   k) {
      k = 0
      while (k < indent && (substr(s, 1, 1) == " " || substr(s, 1, 1) == "\t")) {
        s = substr(s, 2)
        k++
      }
      return s
    }
    {
      line = $0; sub(/\r$/, "", line)
      if (!inb) {
        if (line ~ /^[ \t]*```+[ \t]*verify([- \t]|$)/) {
          inb = 1; mode = "fence"; n++
          indent = fence_indent(line)
          fn = sprintf("%s/verify_block_%03d.txt", outdir, n)
          next
        }
        if (line ~ /^[ \t]*<!--[ \t]*verify([- \t]|$)/) {
          inb = 1; mode = "html"; n++
          indent = fence_indent(line)
          fn = sprintf("%s/verify_block_%03d.txt", outdir, n)
          next
        }
      } else {
        if (mode == "fence" && line ~ /^[ \t]*```+[ \t]*$/) { inb = 0; close(fn); next }
        if (mode == "html" && line ~ /-->/) { inb = 0; close(fn); next }
        print dedent(line) > fn
      }
    }
    END { print n + 0 }
  ' "$body"
}

vb_reset() {
  VB_TYPE=""
  VB_RUN=""
  VB_METHOD="GET"
  VB_URL=""
  VB_BODY=""
  VB_BODY_SET=0
  VB_EXPECT_STATUS=""
  VB_EXPECT_BODY=""
  VB_EXPECT_REGEX=""
  VB_EXPECT_NOT=""
  VB_EXPECT_EXIT=""
  VB_EXPECT_CONTAINS=""
  VB_EXPECT_JSON=""
  VB_EXPECT_HEADER=""
  VB_TIMEOUT=""
  VB_PATH=""
  VB_FILES=""
  VB_EXPECTED=""
  VB_SQL=""
  VB_PROMPT=""
  VB_HEADERS=()
}

vb_finalize() {
  local key="$1" val="$2" h
  case "$key" in
    headers)
      while IFS= read -r h; do
        [ -n "$h" ] || continue
        VB_HEADERS+=("$h")
      done <<EOF
$val
EOF
      ;;
    body|data)
      VB_BODY="$val"; VB_BODY_SET=1
      ;;
    expected|expect)
      VB_EXPECTED="$val"
      ;;
    prompt)
      VB_PROMPT="$val"
      ;;
    files)
      VB_FILES="$val"
      ;;
    run|command|shell)
      VB_RUN="$val"
      ;;
    sql)
      VB_SQL="$val"
      ;;
  esac
}

vb_set() {
  local key="$1" val="$2" h old_ifs
  case "$key" in
    type) VB_TYPE="$val" ;;
    method) VB_METHOD="$val" ;;
    url|endpoint) VB_URL="$val" ;;
    run|command|shell) VB_RUN="$val" ;;
    sql) VB_SQL="$val" ;;
    body|data) VB_BODY="$val"; VB_BODY_SET=1 ;;
    headers)
      old_ifs="$IFS"
      IFS=';'
      for h in $val; do
        h="$(trim "$h")"
        [ -n "$h" ] && VB_HEADERS+=("$h")
      done
      IFS="$old_ifs"
      ;;
    header.*)
      h="${key#header.}"
      VB_HEADERS+=("$h: $val")
      ;;
    expect_status|status|expect_http) VB_EXPECT_STATUS="$val" ;;
    expect_body|body_contains|expect_body_contains) VB_EXPECT_BODY="$val" ;;
    expect_regex|regex) VB_EXPECT_REGEX="$val" ;;
    expect_not|not_contains|absent) VB_EXPECT_NOT="$val" ;;
    expect_exit|exit) VB_EXPECT_EXIT="$val" ;;
    expect_contains|contains) VB_EXPECT_CONTAINS="$val" ;;
    expect_json|json) VB_EXPECT_JSON="$val" ;;
    expect_header) VB_EXPECT_HEADER="$val" ;;
    timeout) VB_TIMEOUT="$val" ;;
    path|file) VB_PATH="$val" ;;
    files) VB_FILES="$val" ;;
    expected|expect) VB_EXPECTED="$val" ;;
    prompt) VB_PROMPT="$val" ;;
  esac
}

parse_verify_block() {
  local file="$1" line key val multi="" buf="" trimmed
  vb_reset
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    if [ -n "$multi" ]; then
      if [ -z "$line" ]; then
        buf+=$'\n'
        continue
      fi
      case "$line" in
        [[:space:]]*)
          trimmed="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//')"
          buf+="$trimmed"$'\n'
          continue
          ;;
        *)
          vb_finalize "$multi" "${buf%$'\n'}"
          multi=""
          ;;
      esac
    fi
    [ -z "$line" ] && continue
    case "$line" in \#*) continue ;; esac
    if [[ "$line" =~ ^([A-Za-z0-9_.-]+):[[:space:]]*(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      val="${BASH_REMATCH[2]}"
      key="$(printf '%s' "$key" | tr 'A-Z-' 'a-z_')"
      if [ "$val" = "|" ] || [ "$val" = ">" ] || { [ "$key" = "headers" ] && [ -z "$val" ]; }; then
        multi="$key"
        buf=""
        continue
      fi
      vb_set "$key" "$val"
    fi
  done < "$file"
  if [ -n "$multi" ]; then
    vb_finalize "$multi" "${buf%$'\n'}"
  fi

  if [ -z "$VB_TYPE" ]; then
    if [ -n "$VB_URL" ]; then
      VB_TYPE="http"
    elif [ -n "$VB_RUN" ] || [ -n "$VB_SQL" ]; then
      VB_TYPE="command"
    elif [ -n "$VB_PATH" ] || [ -n "$VB_FILES" ]; then
      VB_TYPE="file"
    elif [ -n "$VB_EXPECTED" ]; then
      VB_TYPE="llm"
    fi
  fi
  VB_TYPE="$(printf '%s' "${VB_TYPE:-unknown}" | tr 'A-Z' 'a-z')"
}

# ---------------------------------------------------------------------------
# Expected / comparison helpers
# ---------------------------------------------------------------------------
strip_verify_blocks() {
  awk '
    BEGIN { inv = 0; mode = "" }
    {
      line = $0
      if (!inv && line ~ /^[ \t]*```+[ \t]*verify([- \t]|$)/) { inv = 1; mode = "fence"; next }
      if (!inv && line ~ /^[ \t]*<!--[ \t]*verify([- \t]|$)/) { inv = 1; mode = "html"; next }
      if (inv) {
        if (mode == "fence" && line ~ /^[ \t]*```+[ \t]*$/) { inv = 0; mode = ""; next }
        if (mode == "html" && line ~ /-->/) { inv = 0; mode = ""; next }
        next
      }
      print
    }
  '
}

# Convert markdown pipe tables into narrow key/value line blocks, e.g.
#   | Роль | Что может |
#   | ---- | --------- |
#   | Постановщик | создаёт ... |
# becomes:
#   Роль: Постановщик
#   Что может: создаёт ...
render_markdown_tables() {
  awk '
    function trim(s) {
      sub(/^[ \t]+/, "", s)
      sub(/[ \t]+$/, "", s)
      return s
    }
    function split_row(line, cells,   s, n, i, a) {
      s = trim(line)
      sub(/^\|/, "", s)
      sub(/\|$/, "", s)
      n = split(s, a, "[|]")
      for (i = 1; i <= n; i++) cells[i] = trim(a[i])
      return n
    }
    function is_sep(line,   s) {
      s = trim(line)
      return s ~ /^\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?$/
    }
    function is_table_row(line,   s) {
      s = trim(line)
      return (s != "" && s ~ /\|/)
    }
    { lines[NR] = $0 }
    END {
      i = 1
      while (i <= NR) {
        if (i < NR && is_table_row(lines[i]) && is_sep(lines[i + 1])) {
          nh = split_row(lines[i], hdr)
          i += 2
          r = 0
          while (i <= NR && is_table_row(lines[i]) && !is_sep(lines[i])) {
            r++
            if (r > 1) print ""
            nc = split_row(lines[i], cells)
            for (j = 1; j <= nh; j++) {
              val = (j <= nc) ? cells[j] : ""
              print hdr[j] ": " val
            }
            i++
          }
          continue
        }
        print lines[i]
        i++
      }
    }
  '
}

print_criteria_from_body() {
  local body="$1" max_lines="${2:-25}" pad="${3:-4}" n
  local filtered
  filtered="$(strip_verify_blocks < "$body" | render_markdown_tables | grep -v '^===' | grep -vE '^[[:space:]]*\|?[[:space:]]*:?-{3,}' | awk '
    /^[[:space:]]*$/ { if (started && !blank) { print ""; blank = 1 } next }
    { started = 1; blank = 0; print }
  ' | awk 'prev ~ /^Section:/ && /^[[:space:]]*$/ { next } { print; prev = $0 }')"
  n=$(printf '%s\n' "$filtered" | grep -c .)
  if [ "$pad" -eq 2 ]; then
    printf '%s\n' "$filtered" | awk -v max="$max_lines" 'NF { n++ } n <= max { print }' | indent
  else
    printf '%s\n' "$filtered" | awk -v max="$max_lines" 'NF { n++ } n <= max { print }' | indent_deep
  fi
  if [ "${n:-0}" -gt "$max_lines" ]; then
    printf '%*s[... %d more line(s) in requirement text ...]\n' "$pad" "" "$((n - max_lines))"
  fi
}

print_expected_brief() {
  local label="${1:-}" h rendered
  [ -n "$label" ] && printf '  %s\n' "$label"
  case "$VB_TYPE" in
    http)
      printf '  Expected : HTTP %s' "${VB_EXPECT_STATUS:-?}"
      [ -n "$VB_EXPECT_BODY" ] && printf '; body contains "%s"' "$VB_EXPECT_BODY"
      [ -n "$VB_EXPECT_HEADER" ] && printf '; header contains "%s"' "$VB_EXPECT_HEADER"
      [ -n "$VB_EXPECT_JSON" ] && printf '; JSON assertion %s' "$VB_EXPECT_JSON"
      printf '\n'
      ;;
    command|playwright|sql)
      printf '  Expected : exit %s' "${VB_EXPECT_EXIT:-0}"
      [ -n "$VB_EXPECT_CONTAINS" ] && printf '; output contains "%s"' "$VB_EXPECT_CONTAINS"
      [ -n "$VB_EXPECT_REGEX" ] && printf '; output matches /%s/' "$VB_EXPECT_REGEX"
      printf '\n'
      ;;
    file)
      printf '  Expected : %s' "$(trim "$VB_PATH $VB_FILES")"
      [ -n "$VB_EXPECT_CONTAINS" ] && printf ' contains "%s"' "$VB_EXPECT_CONTAINS"
      [ -n "$VB_EXPECT_REGEX" ] && printf ' matches /%s/' "$VB_EXPECT_REGEX"
      [ -n "$VB_EXPECT_NOT" ] && printf ' excludes "%s"' "$VB_EXPECT_NOT"
      printf '\n'
      ;;
    llm)
      rendered="$(printf '%s\n' "${VB_EXPECTED:-$VB_PROMPT}" | render_markdown_tables)"
      if [ "$(printf '%s\n' "$rendered" | grep -c .)" -le 1 ]; then
        printf '  Expected : %s\n' "$(printf '%s' "$rendered" | LC_ALL=C tr '\n' ' ')"
      else
        printf '  Expected :\n'
        printf '%s\n' "$rendered" | indent_deep
      fi
      ;;
    *)
      printf '  Expected : a valid embedded check\n'
      ;;
  esac
}

print_expected_block() {
  local label="${1:-}" h
  [ -n "$label" ] && printf '  %s\n' "$label"
  printf '  Check type      : %s\n' "${VB_TYPE:-unknown}"
  case "$VB_TYPE" in
    http)
      printf '  HTTP method     : %s\n' "${VB_METHOD:-GET}"
      printf '  URL             : %s\n' "$(redact_text <<<"$(expand_env "$VB_URL")")"
      [ -n "$VB_EXPECT_STATUS" ] && printf '  HTTP status     : %s\n' "$VB_EXPECT_STATUS"
      [ -n "$VB_EXPECT_HEADER" ] && printf '  Header contains : %s\n' "$VB_EXPECT_HEADER"
      [ -n "$VB_EXPECT_BODY" ] && printf '  Body contains   : %s\n' "$VB_EXPECT_BODY"
      [ -n "$VB_EXPECT_REGEX" ] && printf '  Body regex      : %s\n' "$VB_EXPECT_REGEX"
      [ -n "$VB_EXPECT_NOT" ] && printf '  Body excludes   : %s\n' "$VB_EXPECT_NOT"
      [ -n "$VB_EXPECT_JSON" ] && printf '  JSON assertion  : %s\n' "$VB_EXPECT_JSON"
      for h in "${VB_HEADERS[@]+"${VB_HEADERS[@]}"}"; do
        printf '  Request header  : %s\n' "$(redact_text <<<"$(expand_env "$h")")"
      done
      ;;
    command|playwright|sql)
      if [ -n "$VB_SQL" ]; then
        printf '  SQL             : %s\n' "$VB_SQL"
      else
        printf '  Command         : %s\n' "$(redact_text <<<"$VB_RUN")"
      fi
      printf '  Expected exit   : %s\n' "${VB_EXPECT_EXIT:-0}"
      [ -n "$VB_EXPECT_CONTAINS" ] && printf '  Output contains : %s\n' "$VB_EXPECT_CONTAINS"
      [ -n "$VB_EXPECT_REGEX" ] && printf '  Output regex    : %s\n' "$VB_EXPECT_REGEX"
      [ -n "$VB_EXPECT_NOT" ] && printf '  Output excludes : %s\n' "$VB_EXPECT_NOT"
      ;;
    file)
      printf '  File(s)         : %s %s\n' "$VB_PATH" "$VB_FILES"
      [ -n "$VB_EXPECT_CONTAINS" ] && printf '  Contains        : %s\n' "$VB_EXPECT_CONTAINS"
      [ -n "$VB_EXPECT_REGEX" ] && printf '  Regex           : %s\n' "$VB_EXPECT_REGEX"
      [ -n "$VB_EXPECT_NOT" ] && printf '  Absent          : %s\n' "$VB_EXPECT_NOT"
      ;;
    llm)
      printf '  Criteria        :\n'
      if [ -n "$VB_EXPECTED" ]; then
        printf '%s\n' "$VB_EXPECTED" | render_markdown_tables | indent_deep
      else
        printf '    (requirement text)\n'
      fi
      [ -n "$VB_FILES" ] && printf '  Focus files     : %s\n' "$VB_FILES"
      ;;
    *)
      printf '  ERROR           : unrecognised or incomplete check\n'
      ;;
  esac
}

status_matches() {
  local expected="$1" actual="$2" token
  expected="$(trim "$expected")"
  [ -z "$expected" ] && return 1
  for token in $(printf '%s' "$expected" | tr ',' ' '); do
    token="$(printf '%s' "$token" | tr 'A-Z' 'a-z')"
    case "$token" in
      *x*)
        case "$actual" in ${token%x*}*) return 0 ;; esac
        ;;
      *)
        [ "$actual" = "$token" ] && return 0
        ;;
    esac
  done
  return 1
}

exit_matches() {
  local expected="$1" actual="$2" token
  expected="$(trim "$expected")"
  [ -z "$expected" ] && expected="0"
  for token in $(printf '%s' "$expected" | tr ',' ' '); do
    [ "$actual" = "$token" ] && return 0
  done
  return 1
}

text_contains() {
  local haystack="$1" needle="$2"
  case "$haystack" in
    *"$needle"*) return 0 ;;
  esac
  return 1
}

# ---------------------------------------------------------------------------
# Check execution: HTTP
# ---------------------------------------------------------------------------
run_check_http() {
  local req_num="$1" check_num="$2" out="$3"
  local url method timeout bodyfile headersfile errfile actual_code rc
  local bodytmp="" h pass=0 status_ok=1 body_ok=1 regex_ok=1 not_ok=1 json_ok=1 header_ok=1
  local actual_body="" header_blob=""

  url="$(expand_env "$VB_URL")"
  if [ -z "$url" ]; then
    printf '  Command: (not run)\n'
    cmp_add "  Expected : a non-empty url: field"
    cmp_add "  Actual   : missing url"
    cmp_add "  Match    : MISMATCH"
    return 1
  fi
  method="$(printf '%s' "${VB_METHOD:-GET}" | tr 'a-z' 'A-Z')"
  timeout="${VB_TIMEOUT:-$CMD_TIMEOUT}"
  bodyfile="$WORKDIR/http_body_${req_num}_${check_num}.txt"
  headersfile="$WORKDIR/http_headers_${req_num}_${check_num}.txt"
  errfile="$WORKDIR/http_err_${req_num}_${check_num}.txt"
  : > "$bodyfile"
  : > "$headersfile"
  : > "$errfile"

  local -a hdrs
  hdrs=()
  for h in "${VB_HEADERS[@]+"${VB_HEADERS[@]}"}"; do
    hdrs+=("$(expand_env "$h")")
  done

  if [ "$VB_BODY_SET" -eq 1 ]; then
    bodytmp="$WORKDIR/http_payload_${req_num}_${check_num}.txt"
    expand_env "$VB_BODY" > "$bodytmp"
  fi

  {
    printf '### HTTP CHECK %s\n' "$check_num"
    printf 'curl -sS --max-time %s -X %s ' "$timeout" "$method"
    printf '%q ' "$url"
    for h in "${hdrs[@]+"${hdrs[@]}"}"; do
      printf '%q ' -H "$h"
    done
    [ -n "$bodytmp" ] && printf '%q ' --data-binary "@$bodytmp"
    printf '\n'
  } >> "$out"

  printf '  Method: HTTP %s %s\n' "$method" "$(redact_text <<<"$url")"
  if [ "$OPT_VERBOSE" -eq 1 ]; then
    printf '  Command: curl -i -sS --max-time %s -X %s \\\n' "$timeout" "$method"
    printf '           "%s"' "$(redact_text <<<"$url")"
    for h in "${hdrs[@]+"${hdrs[@]}"}"; do
      printf ' \\\n           -H "%s"' "$(redact_text <<<"$h")"
    done
    if [ -n "$bodytmp" ]; then
      printf ' \\\n           -d @%s' "$bodytmp"
    fi
    printf '\n\n'

    printf '  Outgoing headers:\n'
    if [ "${#hdrs[@]}" -eq 0 ]; then
      printf '    (none)\n'
    else
      for h in "${hdrs[@]}"; do
        printf '    %s\n' "$(redact_text <<<"$h")"
      done
    fi
    if [ -n "$bodytmp" ]; then
      printf '  Request body:\n'
      redact_text < "$bodytmp" | head -n 20 | indent_deep | dim_text
    fi
    printf '\n'
  fi

  local -a curl_args
  curl_args=(-sS --max-time "$timeout" -X "$method" -D "$headersfile" -o "$bodyfile" -w '%{http_code}')
  for h in "${hdrs[@]+"${hdrs[@]}"}"; do
    curl_args+=(-H "$h")
  done
  [ -n "$bodytmp" ] && curl_args+=(--data-binary "@$bodytmp")
  curl_args+=("$url")
  actual_code="$(curl "${curl_args[@]}" 2>"$errfile")"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    actual_code="000"
  fi

  actual_body="$(cat "$bodyfile" 2>/dev/null || true)"
  header_blob="$(cat "$headersfile" 2>/dev/null || true)"

  if [ "$OPT_VERBOSE" -eq 1 ]; then
    printf '  Raw Response:\n'
    if [ -s "$headersfile" ]; then
      sed 's/^/    /' "$headersfile" | dim_text
    elif [ "$actual_code" = "000" ]; then
      printf '    (no HTTP response - connection failed)\n' | dim_text
    fi
    if [ -s "$errfile" ]; then
      printf '  curl stderr:\n'
      redact_text < "$errfile" | head -n 20 | indent_deep | dim_text
    fi
    printf '  Response body:\n'
    print_file_indented "$bodyfile" 60
    printf '\n'
  elif [ "$actual_code" = "000" ]; then
    printf '  Response: connection failed (see artifacts for details)\n'
  fi

  # Compare status.
  if [ -z "$VB_EXPECT_STATUS" ]; then
    status_ok=0
  elif status_matches "$VB_EXPECT_STATUS" "$actual_code"; then
    status_ok=1
  else
    status_ok=0
  fi

  if [ -n "$VB_EXPECT_BODY" ]; then
    if text_contains "$actual_body" "$VB_EXPECT_BODY"; then body_ok=1; else body_ok=0; fi
  fi
  if [ -n "$VB_EXPECT_REGEX" ]; then
    if printf '%s' "$actual_body" | grep -Eq -- "$VB_EXPECT_REGEX"; then regex_ok=1; else regex_ok=0; fi
  fi
  if [ -n "$VB_EXPECT_NOT" ]; then
    if text_contains "$actual_body" "$VB_EXPECT_NOT"; then not_ok=0; else not_ok=1; fi
  fi
  if [ -n "$VB_EXPECT_JSON" ]; then
    if printf '%s' "$actual_body" | jq -e "$VB_EXPECT_JSON" >/dev/null 2>&1; then json_ok=1; else json_ok=0; fi
  fi
  if [ -n "$VB_EXPECT_HEADER" ]; then
    if printf '%s' "$header_blob" | grep -Fqi -- "$VB_EXPECT_HEADER"; then header_ok=1; else header_ok=0; fi
  fi

  if [ "$status_ok" -eq 1 ] && [ "$body_ok" -eq 1 ] && [ "$regex_ok" -eq 1 ] && [ "$not_ok" -eq 1 ] && [ "$json_ok" -eq 1 ] && [ "$header_ok" -eq 1 ]; then
    pass=1
  fi

  cmp_add "  Expected Code : ${VB_EXPECT_STATUS:-(not specified)}"
  cmp_add "  Actual Code   : $actual_code"
  cmp_add "  Status Match  : $([ "$status_ok" -eq 1 ] && printf 'EXACT MATCH' || printf 'MISMATCH')"
  if [ -n "$VB_EXPECT_HEADER" ]; then
    cmp_add "  Header Match  : $([ "$header_ok" -eq 1 ] && printf 'MATCH' || printf 'MISMATCH')"
  fi
  if [ -n "$VB_EXPECT_BODY" ]; then
    cmp_add "  Body Contains : $([ "$body_ok" -eq 1 ] && printf 'MATCH' || printf 'MISMATCH')"
  fi
  if [ -n "$VB_EXPECT_REGEX" ]; then
    cmp_add "  Body Regex    : $([ "$regex_ok" -eq 1 ] && printf 'MATCH' || printf 'MISMATCH')"
  fi
  if [ -n "$VB_EXPECT_NOT" ]; then
    cmp_add "  Body Excludes : $([ "$not_ok" -eq 1 ] && printf 'MATCH' || printf 'MISMATCH')"
  fi
  if [ -n "$VB_EXPECT_JSON" ]; then
    cmp_add "  JSON Assert   : $([ "$json_ok" -eq 1 ] && printf 'MATCH' || printf 'MISMATCH')"
  fi
  if [ -z "$VB_EXPECT_STATUS" ]; then
    cmp_add "  Note          : HTTP check has no expect_status; treated as FAILED (strict mode)."
  fi

  {
    printf '### EXPECTED\n'
    print_expected_block "" >> "$out"
    printf '### ACTUAL CODE: %s\n' "$actual_code"
    printf '### ACTUAL BODY\n'
    cat "$bodyfile" >> "$out" 2>/dev/null || true
  } >> "$out"

  [ "$pass" -eq 1 ]
}

# ---------------------------------------------------------------------------
# Check execution: command / SQL / Playwright
# ---------------------------------------------------------------------------
run_check_command() {
  local req_num="$1" check_num="$2" out="$3"
  local cmd timeout exit_expected actual_exit pass=1 contains_ok=1 regex_ok=1 not_ok=1
  local stdoutfile="$WORKDIR/cmd_out_${req_num}_${check_num}.txt"
  local run_cmd="$VB_RUN"
  local sql_mode=0 dburl=""

  timeout="${VB_TIMEOUT:-$CMD_TIMEOUT}"
  exit_expected="${VB_EXPECT_EXIT:-0}"

  if [ -n "$VB_SQL" ]; then
    sql_mode=1
    dburl="${SUPABASE_DB_URL:-${DATABASE_URL:-}}"
    if [ -z "$dburl" ]; then
      printf '  Command: (not run)\n'
      cmp_add "  Expected : SQL check against SUPABASE_DB_URL / DATABASE_URL"
      cmp_add "  Actual   : database URL is not set; check could not execute"
      cmp_add "  Match    : MISMATCH"
      return 1
    fi
    cmd="psql $(printf '%q' "$dburl") -v ON_ERROR_STOP=1 -Atc $(printf '%q' "$VB_SQL")"
  else
    if [ -z "$run_cmd" ]; then
      printf '  Command: (missing run: field)\n'
      cmp_add "  Expected : a non-empty run: command"
      cmp_add "  Actual   : missing run: field"
      cmp_add "  Match    : MISMATCH"
      return 1
    fi
    cmd="bash -c $(printf '%q' "$run_cmd")"
  fi

  if [ "$sql_mode" -eq 1 ]; then
    printf '  Method: SQL check via psql\n'
    if [ "$OPT_VERBOSE" -eq 1 ]; then
      printf '  Command: psql %s -v ON_ERROR_STOP=1 -Atc %s\n' \
        "$(redact_text <<<"$(printf '%q' "$dburl")")" \
        "$(shell_quote_readable "$VB_SQL")"
    fi
  else
    printf '  Method: command: %s\n' "$(printf '%s' "$run_cmd" | head -n 1)"
    if [ "$OPT_VERBOSE" -eq 1 ]; then
      printf '  Command: bash -c %s\n' "$(shell_quote_readable "$(redact_text <<<"$run_cmd")")"
    fi
  fi

  if [ "$sql_mode" -eq 1 ]; then
    # Run psql directly so the SQL is not re-parsed by an extra shell.
    run_limited "$timeout" psql "$dburl" -v ON_ERROR_STOP=1 -Atc "$VB_SQL" > "$stdoutfile" 2>&1
    actual_exit=$?
  else
    run_limited "$timeout" bash -c "$run_cmd" > "$stdoutfile" 2>&1
    actual_exit=$?
  fi

  local actual_text
  actual_text="$(cat "$stdoutfile" 2>/dev/null || true)"

  if [ "$OPT_VERBOSE" -eq 1 ]; then
    printf '  Raw stdout/stderr:\n'
    print_file_indented "$stdoutfile" 100
    printf '  Actual exit code: %s\n\n' "$actual_exit"
  fi

  if ! exit_matches "$exit_expected" "$actual_exit"; then pass=0; fi
  if [ -n "$VB_EXPECT_CONTAINS" ]; then
    if text_contains "$actual_text" "$VB_EXPECT_CONTAINS"; then contains_ok=1; else contains_ok=0; pass=0; fi
  fi
  if [ -n "$VB_EXPECT_REGEX" ]; then
    if printf '%s' "$actual_text" | grep -Eq -- "$VB_EXPECT_REGEX"; then regex_ok=1; else regex_ok=0; pass=0; fi
  fi
  if [ -n "$VB_EXPECT_NOT" ]; then
    if text_contains "$actual_text" "$VB_EXPECT_NOT"; then not_ok=0; pass=0; else not_ok=1; fi
  fi

  cmp_add "  Expected Exit : $exit_expected"
  cmp_add "  Actual Exit   : $actual_exit"
  cmp_add "  Exit Match    : $(exit_matches "$exit_expected" "$actual_exit" && printf 'EXACT MATCH' || printf 'MISMATCH')"
  if [ -n "$VB_EXPECT_CONTAINS" ]; then
    cmp_add "  Output Contains : $([ "$contains_ok" -eq 1 ] && printf 'MATCH' || printf 'MISMATCH')"
  fi
  if [ -n "$VB_EXPECT_REGEX" ]; then
    cmp_add "  Output Regex    : $([ "$regex_ok" -eq 1 ] && printf 'MATCH' || printf 'MISMATCH')"
  fi
  if [ -n "$VB_EXPECT_NOT" ]; then
    cmp_add "  Output Excludes : $([ "$not_ok" -eq 1 ] && printf 'MATCH' || printf 'MISMATCH')"
  fi

  {
    printf '### COMMAND\n%s\n' "$(redact_text <<<"$cmd")"
    printf '### EXPECTED EXIT: %s\n### ACTUAL EXIT: %s\n' "$exit_expected" "$actual_exit"
    printf '### OUTPUT\n'
    cat "$stdoutfile" >> "$out" 2>/dev/null || true
  } >> "$out"

  [ "$pass" -eq 1 ]
}

# ---------------------------------------------------------------------------
# Check execution: file assertions
# ---------------------------------------------------------------------------
run_check_file() {
  local req_num="$1" check_num="$2" out="$3"
  local paths p matchfile="$WORKDIR/file_matches_${req_num}_${check_num}.txt"
  local found=0 total_files=0 pass=1 contains_ok=1 regex_ok=1 absent_ok=1
  : > "$matchfile"

  paths="$VB_PATH $VB_FILES"
  paths="$(printf '%s' "$paths" | LC_ALL=C tr ',' ' ')"
  if [ -z "$(trim "$paths")" ]; then
    printf '  File Check Error: no path/files specified.\n'
    cmp_add "  Expected : a path: or files: field"
    cmp_add "  Actual   : missing file path"
    cmp_add "  Match    : MISMATCH"
    return 1
  fi

  printf '  Method: file check %s\n' "$(redact_text <<<"$(trim "$paths")")"
  if [ "$OPT_VERBOSE" -eq 1 ]; then
    printf '  Command: grep -n (file assertions)'
    local _first_path=1
    for p in $paths; do
      if [ "$_first_path" -eq 1 ]; then
        printf ' \\\n             %s' "$(redact_text <<<"$p")"
        _first_path=0
      else
        printf ' \\\n             %s' "$(redact_text <<<"$p")"
      fi
    done
    printf '\n\n'
  fi

  for p in $paths; do
    p="$(expand_env "$p")"
    # Expand a glob relative to the repository root, or use it as-is.
    local expanded=""
    case "$p" in
      /*) expanded="$p" ;;
      *) expanded="$REPO_ROOT/$p" ;;
    esac
    local matched=0 f
    # shellcheck disable=SC2086
    for f in $expanded; do
      [ -e "$f" ] || continue
      [ -f "$f" ] || continue
      matched=1
      total_files=$((total_files + 1))
      if [ -n "$VB_EXPECT_CONTAINS" ]; then
        if grep -nF -- "$VB_EXPECT_CONTAINS" "$f" >> "$matchfile" 2>/dev/null; then
          found=1
        else
          contains_ok=0
          pass=0
        fi
      fi
      if [ -n "$VB_EXPECT_REGEX" ]; then
        if grep -nE -- "$VB_EXPECT_REGEX" "$f" >> "$matchfile" 2>/dev/null; then
          found=1
        else
          regex_ok=0
          pass=0
        fi
      fi
      if [ -n "$VB_EXPECT_NOT" ]; then
        if grep -nF -- "$VB_EXPECT_NOT" "$f" >> "$matchfile" 2>/dev/null; then
          absent_ok=0
          pass=0
        fi
      fi
    done
    if [ "$matched" -eq 0 ]; then
      printf '  Missing file : %s\n' "$(redact_text <<<"$p")"
      pass=0
    fi
  done

  printf '  Files checked : %s\n' "$total_files"
  if [ "$OPT_VERBOSE" -eq 1 ]; then
    printf '  Raw matches:\n'
    if [ -s "$matchfile" ]; then
      print_file_indented "$matchfile" 60
    else
      printf '    (no matches)\n'
    fi
    printf '\n'
  fi

  [ -n "$VB_EXPECT_CONTAINS" ] && cmp_add "  Contains      : $([ "$contains_ok" -eq 1 ] && printf 'MATCH' || printf 'MISMATCH')"
  [ -n "$VB_EXPECT_REGEX" ] && cmp_add "  Regex         : $([ "$regex_ok" -eq 1 ] && printf 'MATCH' || printf 'MISMATCH')"
  [ -n "$VB_EXPECT_NOT" ] && cmp_add "  Absent        : $([ "$absent_ok" -eq 1 ] && printf 'MATCH' || printf 'MISMATCH')"
  [ -z "$VB_EXPECT_CONTAINS$VB_EXPECT_REGEX$VB_EXPECT_NOT" ] && {
    cmp_add "  Note          : file check has no contains/regex/absent expectation; treated as FAILED."
    pass=0
  }

  {
    printf '### FILE CHECK\n'
    printf '### EXPECTED CONTAINS: %s\n' "${VB_EXPECT_CONTAINS:-}"
    printf '### EXPECTED REGEX: %s\n' "${VB_EXPECT_REGEX:-}"
    printf '### EXPECTED ABSENT: %s\n' "${VB_EXPECT_NOT:-}"
    printf '### MATCHES\n'
    cat "$matchfile" >> "$out" 2>/dev/null || true
  } >> "$out"

  [ "$pass" -eq 1 ]
}

# ---------------------------------------------------------------------------
# Repository context and static evidence for the LLM
# ---------------------------------------------------------------------------
is_text_candidate() {
  local f="$1"
  case "$f" in
    .env.example) return 0 ;;
    verify.sh|package-lock.json) return 1 ;;
    .env|.env.*|*.local|*.pem|*.key|*.crt|*.p12|*.pfx|*.log|*.lock|*.png|*.jpg|*.jpeg|*.gif|*.svg|*.ico|*.woff|*.woff2|*.ttf|*.eot|*.pdf|*.zip|*.gz|*.mp4|*.mov|*.webp) return 1 ;;
  esac
  case "$f" in
    *.ts|*.tsx|*.js|*.jsx|*.json|*.sql|*.md|*.txt|*.yml|*.yaml|*.toml|*.css|*.html|*.sh|*.xml) return 0 ;;
  esac
  return 1
}

always_include() {
  case "$1" in
    README.md|package.json|.env.example|src/lib/api.ts|src/lib/types.ts|src/lib/status.ts|src/lib/supabase.ts|src/App.tsx|src/components/ActionButtons.tsx|src/components/HistoryTimeline.tsx|supabase/migrations/*.sql) return 0 ;;
  esac
  return 1
}

get_repo_files() {
  if have git && git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$REPO_ROOT" ls-files --cached --others --exclude-standard 2>/dev/null
  else
    (cd "$REPO_ROOT" && find . -type f \
      -not -path './.git/*' -not -path './node_modules/*' -not -path './dist/*' \
      -not -path './coverage/*' -not -path './.verify*' \
      -print 2>/dev/null | sed 's#^\./##')
  fi
}

get_repo_files > "$WORKDIR/all_files.txt"

build_keywords() {
  local text="$1" lower
  lower="$(printf '%s' "$text" | LC_ALL=C tr 'A-Z' 'a-z')"
  KWS=""
  add_kw() {
    case " $KWS " in
      *" $1 "*) ;;
      *) KWS="$KWS $1" ;;
    esac
  }
  add_if() {
    local pattern="$1" terms="$2" t
    if printf '%s' "$lower" | grep -Eqi -- "$pattern"; then
      for t in $terms; do add_kw "$t"; done
    fi
  }

  # Latin tokens from the requirement.
  local tok
  for tok in $(printf '%s' "$text" | grep -oE '[A-Za-z][A-Za-z0-9_-]{3,}' | tr 'A-Z' 'a-z' | sort -u | head -30); do
    case "$tok" in
      requirement|requirements|should|must|shall|with|that|this|from|have|when|then|only|also|into|over|under|which|where|their|there|they|will|would|could|user|users|using|code|test|tests|data|system|application|app|need|needs|make|made|does|not|can|cannot) continue ;;
    esac
    add_kw "$tok"
  done

  # Requirement vocabulary -> implementation vocabulary (RU/EN).
  add_if 'rls|row.level|policy|policy|политик' 'rls policy policies'
  add_if 'доступ|прав|access|permission' 'access auth policy rls'
  add_if 'безопас|security|secure' 'security policy rls auth'
  add_if 'исполнител|worker|assignee' 'worker assignee tasks'
  add_if 'постановщик|руководител|менеджер|manager' 'manager role profiles'
  add_if 'роль|roles?' 'role manager worker profiles'
  add_if 'задач|task' 'task tasks status'
  add_if 'объект|стройк|object|site' 'object objects'
  add_if 'статус|переход|status|transition' 'status transition trigger enforce'
  add_if 'истори|history|audit' 'history audit task_history trigger HistoryTimeline'
  add_if 'действ|action|кнопк|button' 'action actions ActionButtons button availableActions'
  add_if 'карточк|card|modal' 'TaskModal ObjectDetail TaskRow card modal'
  add_if 'список|list' 'list map filteredTasks TaskRow ObjectCard'
  add_if 'экран|screen|page' 'page pages App route screen'
  add_if 'регистрац|signup|sign-up|registration' 'auth signup login register'
  add_if 'вход|логин|login|password' 'login auth password'
  add_if 'ключ|секрет|secret|service_role' 'secret service_role key env'
  add_if 'интерфейс|кнопк|экран|ui|screen|button' 'ui button page component'
  add_if 'комментар|comment' 'comment revision_comment transition_comment'
  add_if 'проверк|review|approve|accept' 'review accepted under_review'
  add_if 'доработк|revision|rework' 'revision revision_requested'
  add_if 'удал|delete|remove' 'delete revoke'
  add_if 'редактир|edit|update' 'update edit'
  add_if 'созда|create|insert' 'create insert'
  add_if 'вид|видит|visible|visibility' 'select visible visibility'
  add_if 'фильтр|filter' 'filter'
  add_if 'язык|локал|localized|language' 'i18n language locale translations'
  add_if 'email|email' 'email auth'
  add_if 'supabase|postgres|database|база' 'supabase postgres sql'
  add_if 'api|rest|endpoint' 'api rest client'

  # Keep the context focused.
  set -- $KWS
  KWS=""
  local n=0
  for tok in "$@"; do
    add_kw "$tok"
    n=$((n + 1))
    [ "$n" -ge 18 ] && break
  done
}

select_context_files() {
  local text="$1" forced="$2" out="$3" regex="" k f score c ui_only=0
  build_keywords "$text"

  # For a pure UI/screen requirement, full SQL migrations add a lot of noise
  # and can crowd out the small action/history components.  The compact
  # security summary is still supplied separately in the evidence section.
  if printf '%s' "$text" | grep -Eqi 'screen|page|ui|button|card|modal|login|sign.in|экран|интерфейс|карточк|кнопк|список|меню|форма|вход|логин|мои задачи|my tasks'; then
    if ! printf '%s' "$text" | grep -Eqi 'rls|policy|trigger|database|supabase|доступ|безопас|secret|ключ|регистрац|audit|подделать|нельзя|api|service_role|база|базы'; then
      ui_only=1
    fi
  fi
  for k in $KWS; do
    regex="$regex|$(printf '%s' "$k" | sed 's/[.[\*^$()+?{|]/\\&/g')"
  done
  regex="${regex#|}"

  : > "$WORKDIR/file_scores.tsv"
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    [ -f "$REPO_ROOT/$f" ] || continue
    is_text_candidate "$f" || continue
    if [ "$ui_only" -eq 1 ]; then
      case "$f" in
        supabase/migrations/*.sql|supabase/seed.sql) continue ;;
      esac
    fi
    case "$f" in
      src/i18n/translations.ts|src/i18n/errors.ts|src/i18n/LanguageProvider.tsx|src/i18n/language-context.ts)
        if ! printf '%s' "$text" | grep -Eqi 'i18n|language|locale|localized|translation|язык|локал|перевод|english|russian|англ|русск'; then
          continue
        fi
        ;;
      src/lib/demoApi.ts|src/lib/demoAccounts.ts|supabase/seed.sql)
        if ! printf '%s' "$text" | grep -Eqi 'demo|seed|localStorage|демо|сид|пример'; then
          continue
        fi
        ;;
    esac
    score=0
    if [ -n "$regex" ]; then
      c="$(grep -Eic -- "$regex" "$REPO_ROOT/$f" 2>/dev/null || true)"
      [ -n "$c" ] && score=$((score + c))
    fi
    if always_include "$f"; then
      score=$((score + 6))
    fi
    if printf '%s' "$text" | grep -Eqi 'регистрац|signup|sign-up|registration'; then
      if grep -q 'prevent_public_signup' "$REPO_ROOT/$f" 2>/dev/null; then
        score=$((score + 100))
      fi
    fi
    case "$f" in
      supabase/migrations/*.sql) score=$((score + 3)) ;;
      src/pages/*|src/components/*) score=$((score + 1)) ;;
    esac
    if [ "$score" -gt 0 ]; then
      printf '%s\t%d\n' "$f" "$score" >> "$WORKDIR/file_scores.tsv"
    fi
  done < "$WORKDIR/all_files.txt"

  # Forced focus files get a large bonus.
  if [ -n "$forced" ]; then
    local ff
    for ff in $(printf '%s' "$forced" | LC_ALL=C tr ',' ' '); do
      ff="$(trim "$ff")"
      [ -n "$ff" ] || continue
      printf '%s\t1000\n' "$ff" >> "$WORKDIR/file_scores.tsv"
    done
  fi

  sort -t$'\t' -k2,2nr "$WORKDIR/file_scores.tsv" 2>/dev/null | awk -F '\t' '!seen[$1]++ {print $1}' | head -n 16 > "$out"

  if [ ! -s "$out" ]; then
    for f in README.md package.json .env.example src/lib/api.ts src/lib/types.ts src/lib/status.ts supabase/migrations/20260101_init.sql; do
      [ -f "$REPO_ROOT/$f" ] && printf '%s\n' "$f" >> "$out"
    done
  fi
}

build_context() {
  local text="$1" forced="$2" out="$3" total=0 f path size remaining nlines
  select_context_files "$text" "$forced" "$WORKDIR/selected_files.txt"
  : > "$out"
  {
    printf '=== REPOSITORY: %s ===\n' "$REPO_ROOT"
    printf '=== FILE TREE (partial) ===\n'
    head -n 250 "$WORKDIR/all_files.txt"
    printf '\n'
  } >> "$out"

  while IFS= read -r f; do
    [ -n "$f" ] || continue
    path="$REPO_ROOT/$f"
    [ -f "$path" ] || continue
    case "$f" in
      .env|.env.*|*.local|*.pem|*.key|*.crt|*.p12|*.pfx) continue ;;
    esac
    size=$(wc -c < "$path" 2>/dev/null | tr -d ' ')
    remaining=$((CONTEXT_CHARS - total))
    if [ "$remaining" -lt 1500 ]; then
      break
    fi
    {
      printf -- '--- BEGIN FILE: %s ---\n' "$f"
      nlines=$(lines_in "$path")
      awk -v max="$LLM_FILE_LINES" '
        { printf "%5d: %s\n", NR, $0 }
        NR >= max { print "  [... file truncated ...]"; exit }
      ' "$path" | redact_text
      printf -- '--- END FILE: %s ---\n\n' "$f"
    } >> "$out" 2>/dev/null
    size=$(wc -c < "$out" | tr -d ' ')
    total="$size"
    if [ "$nlines" -gt "$LLM_FILE_LINES" ] && [ "$OPT_VERBOSE" -eq 1 ]; then
      printf '    (context: %s truncated to %s lines)\n' "$f" "$LLM_FILE_LINES" >&2
    fi
  done < "$WORKDIR/selected_files.txt"
}

collect_static_evidence() {
  local text="$1" out="$2" matches signup_matches signup_calls scan rls_tables policy_names deleted reg_migration
  : > "$out"
  {
    printf '=== MACHINE FINDINGS (deterministic; authoritative for existence) ===\n'
    printf 'The harness extracted these facts directly from the repository. '
    printf 'Do not claim that a policy, trigger, grant, or file listed here is absent.\n\n'

    printf -- '--- SECURITY SUMMARY ---\n'
    if [ -d "$REPO_ROOT/supabase" ]; then
      rls_tables="$(grep -Rh --include='*.sql' -E 'alter table .* enable row level security' "$REPO_ROOT/supabase" 2>/dev/null | sed -E 's/.*alter table (public\.[a-z_]+).*/\1/' | sort -u | tr '\n' ' ')"
      policy_names="$(grep -Rh --include='*.sql' -E '^[[:space:]]*create policy ' "$REPO_ROOT/supabase" 2>/dev/null | sed -E 's/.*create policy ([a-z0-9_]+).*/\1/' | sort -u | tr '\n' ' ')"
      printf '  RLS enabled tables: %s\n' "${rls_tables:-none found}"
      printf '  Declared policies : %s\n' "${policy_names:-none found}"
      if grep -RhiE '^[[:space:]]*(create policy .*for delete|grant .*delete|grant delete)' "$REPO_ROOT/supabase" 2>/dev/null | grep -q .; then
        printf '  DELETE policy/grant: present\n'
      else
        printf '  DELETE policy/grant: NONE FOUND\n'
      fi
      if grep -RqiE 'create or replace function public\.enforce_task_status_transition' "$REPO_ROOT/supabase" 2>/dev/null; then
        printf '  State-machine trigger function: present\n'
      else
        printf '  State-machine trigger function: NONE FOUND\n'
      fi
      if grep -RqiE 'grant (insert|update|delete).*task_history' "$REPO_ROOT/supabase" 2>/dev/null; then
        printf '  task_history write grants: PRESENT\n'
      else
        printf '  task_history write grants: none (select-only)\n'
      fi
    else
      printf '  No supabase/ directory found.\n'
    fi
    signup_matches="$(grep -RIn --include='*.tsx' --include='*.ts' -E 'signUp|signup|register|registration' "$REPO_ROOT/src" 2>/dev/null | head -n 5 || true)"
    signup_calls="$(grep -RIn --include='*.tsx' --include='*.ts' -E '\.signUp[[:space:]]*\(|auth\.signUp|/signup|/register' "$REPO_ROOT/src" 2>/dev/null | head -n 5 || true)"
    if [ -n "$signup_calls" ]; then
      printf '  Signup UI/client calls: PRESENT (review below)\n'
    else
      printf '  Signup UI/client calls: none found under src/\n'
    fi
    if grep -RqiE 'prevent_public_signup|on_auth_user_created_prevent_signup' "$REPO_ROOT/supabase" 2>/dev/null; then
      printf '  Database registration guard: PRESENT (prevent_public_signup trigger)\n'
    else
      printf '  Database registration guard: NONE FOUND\n'
    fi
    if have git && git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      scan="$(git -C "$REPO_ROOT" grep -nE 'sk-or-v1-[A-Za-z0-9]{20,}|service_role[[:space:]]*[:=][[:space:]]*[A-Za-z0-9._-]{10,}|SUPABASE_SERVICE_ROLE_KEY[[:space:]]*=[[:space:]]*[^[:space:]]+' -- . 2>/dev/null | head -n 5 || true)"
    else
      scan="$(grep -RInE 'sk-or-v1-[A-Za-z0-9]{20,}|service_role[[:space:]]*[:=][[:space:]]*[A-Za-z0-9._-]{10,}|SUPABASE_SERVICE_ROLE_KEY[[:space:]]*=[[:space:]]*[^[:space:]]+' "$REPO_ROOT/src" "$REPO_ROOT/supabase" "$REPO_ROOT/.env.example" 2>/dev/null | head -n 5 || true)"
    fi
    if [ -n "$scan" ]; then
      printf '  High-confidence secret literals: FOUND (see secret scan below)\n'
    else
      printf '  High-confidence secret literals: none found in tracked files\n'
    fi
    printf '\n'

    if [ -d "$REPO_ROOT/supabase" ]; then
      if printf '%s' "$text" | grep -Eqi 'rls|row.level|policy|доступ|прав|безопас|security|role|роль|worker|исполнител|manager|постановщик|permission|чуж'; then
        printf -- '--- RLS POLICY DEFINITIONS (exact source) ---\n'
        awk '
          /^[[:space:]]*(create|drop) policy / { p = 1 }
          p { print FILENAME ":" FNR ": " $0 }
          p && /;[[:space:]]*$/ { p = 0; print "" }
        ' "$REPO_ROOT"/supabase/migrations/*.sql 2>/dev/null | head -n 160
        printf '\n'

        printf -- '--- ACCESS HELPER FUNCTIONS (exact source) ---\n'
        awk '
          /^create or replace function public\.(is_manager|can_view_object|can_access_task)/ { f = 1 }
          f { print FILENAME ":" FNR ": " $0 }
          f && /^\$\$;/ { f = 0; print "" }
        ' "$REPO_ROOT"/supabase/migrations/*.sql 2>/dev/null | head -n 120
        printf '\n'

        printf -- '--- WORKER FIELD-LOCK TRIGGER (exact source) ---\n'
        awk '
          /^create or replace function public\.enforce_task_status_transition/ { f = 1 }
          f { print FILENAME ":" FNR ": " $0 }
          f && /^\$\$;/ { f = 0; print "" }
        ' "$REPO_ROOT"/supabase/migrations/*.sql 2>/dev/null | head -n 140
        printf '\n'

        printf -- '--- TABLE GRANTS / REVOKES ---\n'
        grep -Rh --include='*.sql' -E '^(grant|revoke) .* on table ' "$REPO_ROOT/supabase" 2>/dev/null | sed 's/^[[:space:]]*//' | sed 's/^/  /'
        printf '\n'
      fi

      if printf '%s' "$text" | grep -Eqi 'статус|переход|status|transition|state machine|workflow|проверк|review|доработк|revision|принят|accept|в работу|in_progress'; then
        printf -- '--- STATE MACHINE CHECKS (exact source) ---\n'
        grep -Rn --include='*.sql' -E "old\.status = |new\.status in \(|Invalid status transition|Only a manager|Only the assigned worker|revision request requires|Workers can only|Tasks can only be assigned|New tasks must start" "$REPO_ROOT/supabase" 2>/dev/null | sed "s#^$REPO_ROOT/##" | head -n 60
        printf '\n'
      fi

      if printf '%s' "$text" | grep -Eqi 'истори|history|audit'; then
        printf -- '--- HISTORY / AUDIT (exact source) ---\n'
        grep -Rn --include='*.sql' -E 'create trigger tasks_log_history|create policy task_history|grant .*task_history|revoke .*task_history|log_task_status_change|tasks_enforce_status_transition' "$REPO_ROOT/supabase" 2>/dev/null | sed "s#^$REPO_ROOT/##" | head -n 40
        printf '\n'
      fi
    fi

    printf -- '--- ROUTES / UI COMPOSITION ---\n'
    if [ -f "$REPO_ROOT/src/App.tsx" ]; then
      grep -nE '<Route|element=\{' "$REPO_ROOT/src/App.tsx" 2>/dev/null | head -n 30 | sed 's/^/  src\/App.tsx:/'
    fi
    grep -RIn --include='*.tsx' --include='*.ts' -E "<(TaskModal|TaskDetailPage|HistoryTimeline|ActionButtons|ObjectDetailPage|ObjectsPage|MyTasksPage)[ >/]|import .*(TaskModal|TaskDetailPage|HistoryTimeline|ActionButtons|ObjectDetailPage|ObjectsPage|MyTasksPage)" "$REPO_ROOT/src" 2>/dev/null | sed "s#^$REPO_ROOT/##" | head -n 40 | sed 's/^/  /'
    printf '\n'

    if printf '%s' "$text" | grep -Eqi 'роль|roles|постановщик|manager|исполнител|worker'; then
      printf -- '--- ROLE TABLE MAPPING (authoritative) ---\n'
      printf '  Постановщик / manager: create, edit, delete objects and tasks; assign workers; accept or request revision; see everything.\n'
      printf '  Исполнитель / worker: see only own tasks and objects with own tasks; start work; submit for review.\n'
      printf '  Manager-only policies are correct. Do not report them as a missing worker capability.\n\n'
    fi

    if printf '%s' "$text" | grep -Eqi 'карточк[а-я]*[[:space:]]+объект|object card|object detail'; then
      printf -- '--- OBJECT DETAIL MAPPING (authoritative) ---\n'
      printf '  "Карточка объекта со списком задач" maps to the detail route /objects/:id (ObjectDetailPage), not the portfolio ObjectCard in the list view.\n'
      printf '  ObjectDetailPage renders all associated tasks through filteredTasks.map(TaskRow).\n'
      printf '  A truncated task preview in the list-view ObjectCard is not a failure when the detail page shows the full list.\n\n'
    fi

    printf -- '--- TASK LIST RENDERING (exact source) ---\n'
    grep -RIn --include='*.tsx' -E 'filteredTasks\.map|TaskRow key=|<TaskRow|StatusBadge status=' "$REPO_ROOT/src/pages/ObjectDetail.tsx" "$REPO_ROOT/src/pages/Objects.tsx" 2>/dev/null | sed "s#^$REPO_ROOT/##" | head -n 20 | sed 's/^/  /'
    printf '\n'

    printf -- '--- UI ROLE / ACTION GATING ---\n'
    matches="$(grep -RIn --include='*.tsx' --include='*.ts' -E "role[[:space:]]*===[[:space:]]*['\"](manager|worker)|isManager|canAccept|canRequestRevision|revision_requested|under_review|availableActions" "$REPO_ROOT/src" 2>/dev/null | head -n 45 || true)"
    if [ -n "$matches" ]; then
      printf '%s\n' "$matches" | sed "s#^$REPO_ROOT/##" | sed 's/^/  /'
    else
      printf '  No role/action gating expressions found under src/.\n'
    fi
    printf '\n'

    printf -- '--- MANAGER-ONLY FORMS / WORKER GUARDS (exact source) ---\n'
    grep -RIn --include='*.tsx' -E 'isManager|profile\.role !== .worker.|TaskFormModal|ObjectModal|TaskModal' "$REPO_ROOT/src/pages/ObjectDetail.tsx" "$REPO_ROOT/src/pages/MyTasks.tsx" 2>/dev/null | sed "s#^$REPO_ROOT/##" | head -n 40 | sed 's/^/  /'
    printf '\n'

    if printf '%s' "$text" | grep -Eqi 'регистрац|signup|sign-up|registration'; then
      printf -- '--- REGISTRATION / SIGNUP ---\n'
      if [ -n "$signup_matches" ]; then
        printf '%s\n' "$signup_matches" | sed "s#^$REPO_ROOT/##" | sed 's/^/  /'
      else
        printf '  No signup/registration UI or client call found under src/.\n'
      fi
      printf '\n'

      printf -- '--- DATABASE REGISTRATION GUARD (exact source) ---\n'
      if grep -RqiE 'prevent_public_signup|on_auth_user_created_prevent_signup' "$REPO_ROOT/supabase" 2>/dev/null; then
        printf '  Database registration guard: PRESENT (prevent_public_signup trigger on auth.users)\n'
        grep -Rn --include='*.sql' -E 'prevent_public_signup|on_auth_user_created_prevent_signup|disable_public_registration|Public registration is disabled' "$REPO_ROOT/supabase" 2>/dev/null | sed "s#^$REPO_ROOT/##" | head -n 40 | sed 's/^/  /'
        reg_migration="$REPO_ROOT/supabase/migrations/20260104_disable_public_registration.sql"
        if [ -f "$reg_migration" ]; then
          printf '\n  Full migration source:\n'
          awk '{ printf "  %s:%d: %s\n", FILENAME, FNR, $0 }' "$reg_migration" | head -n 80
        fi
      else
        printf '  Database registration guard: NONE FOUND\n'
      fi
      printf '\n'
    fi

    if printf '%s' "$text" | grep -Eqi 'ключ|секрет|secret|service_role|api key|token'; then
      printf -- '--- SECRET SCAN ---\n'
      if [ -n "$scan" ]; then
        printf 'Potential secret material in tracked files (redacted):\n'
        printf '%s\n' "$scan" | redact_text | sed 's/^/  /'
      else
        printf '  No high-confidence secret literals found in tracked files.\n'
      fi
      printf '\n'
    fi
  } >> "$out" 2>/dev/null
}

collect_keyword_hits() {
  local text="$1" out="$2" k hits count=0 specific="" general=""
  # Identifiers such as TaskRow, HistoryTimeline, filteredTasks are far more
  # useful than broad words such as "list" or "map"; put them first.
  for k in $KWS; do
    case "$k" in
      *[A-Z]*) specific="$specific $k" ;;
      *) general="$general $k" ;;
    esac
  done
  : > "$out"
  {
    printf '=== TARGETED CODE HITS (case-insensitive grep, specific identifiers first) ===\n'
    for k in $specific $general; do
      [ "$count" -ge 120 ] && break
      case "$k" in
        task|status|api|ui|data|code|page|object|worker|manager|role|auth|email|user|users|system|application|app|update|create|delete|insert|select|filter|password|language|locale) continue ;;
      esac
      hits="$(grep -RIn --include='*.ts' --include='*.tsx' --include='*.sql' --include='*.md' -i -- "$k" "$REPO_ROOT/src" "$REPO_ROOT/supabase" 2>/dev/null | head -n 6 || true)"
      if [ -n "$hits" ]; then
        printf '%s\n' "$hits" | redact_text | sed "s#^$REPO_ROOT/##" | sed 's/^/  /'
        count=$((count + $(printf '%s\n' "$hits" | wc -l | tr -d ' ')))
      fi
    done
    printf '\n'
  } > "$out" 2>/dev/null
}

# ---------------------------------------------------------------------------
# LLM semantic verification
# ---------------------------------------------------------------------------
extract_json_from_text() {
  # Emit every balanced JSON object in the text, separated by RS (0x1e).
  # Models often include example JSON in their reasoning before the final
  # answer; the caller selects the last candidate that has a "verdict" key.
  local file="$1"
  awk '
    BEGIN { started = 0; depth = 0; in_str = 0; esc = 0; buf = "" }
    {
      for (i = 1; i <= length($0); i++) {
        c = substr($0, i, 1)
        if (!started) {
          if (c == "{") {
            started = 1
            depth = 1
            in_str = 0
            esc = 0
            buf = "{"
          }
          continue
        }
        buf = buf c
        if (in_str) {
          if (esc) esc = 0
          else if (c == "\\") esc = 1
          else if (c == "\"") in_str = 0
        } else {
          if (c == "\"") in_str = 1
          else if (c == "{") depth++
          else if (c == "}") {
            depth--
            if (depth == 0) {
              printf "%s\036", buf
              started = 0
              buf = ""
            }
          }
        }
      }
    }
  ' "$file"
}

build_llm_prompt() {
  local title="$1" body="$2" context="$3" evidence="$4" out="$5" num="$6" total="$7"
  {
    cat <<'PROMPT_HEAD'
You are a strict senior QA verification engine. Your job is to decide whether
the repository actually satisfies ONE requirement from a software specification.

RULES:
- Treat README/markdown prose as claims, not proof. Cite implementation files.
- For database/security requirements, inspect SQL migrations, policies, triggers,
  grants, and edge functions. UI hiding is not database enforcement.
- For UI requirements, inspect routes, pages, components, auth context, and
  server/API calls. Use the ROUTES / UI COMPOSITION evidence to map a named
  screen to the correct page. Do not confuse a summary card in a list with the
  full detail screen, and follow component imports/usages to the actual render.
- For role-table requirements, evaluate each row separately. "Постановщик" /
  manager clauses are satisfied by manager-only permissions. "Исполнитель" /
  worker clauses are satisfied by worker restrictions. Never report a
  manager-only action as a missing worker permission: workers must NOT create,
  edit, delete, assign, accept, or request revisions unless the spec says so.
- If a requirement asks for a "card"/"detail screen" that contains a list of
  related records (for example, "Карточка объекта со списком задач"), evaluate
  the detail page for that record (route with an id), not the summary card in
  the list view. A truncated preview in the list-view ObjectCard is not a
  failure when the object detail page renders all associated tasks.
- LIVE RUNTIME EVIDENCE contains actual HTTP responses from the deployment.
  Use its status codes and payloads as proof of runtime behavior, including
  registration disabled or RLS rejection. Do not return INCONCLUSIVE merely
  because a setting is deployed rather than hard-coded in the repository.
- A requirement passes only if EVERY clause is implemented. If any clause is
  missing or contradicted, return FAIL.
- If neither the code nor the live-runtime evidence can establish a clause,
  return INCONCLUSIVE.
- Never invent file names, line numbers, or quotes. Each evidence.quote MUST be
  copied verbatim from one line (or one contiguous block) of the provided
  numbered context. Do not add semicolons, merge separate lines, or paraphrase.
  If several lines matter, use several evidence entries with their real line
  numbers.
- Use at most 6 evidence entries, each for a distinct file/line. Never repeat
  the same quote. Evidence is supporting proof, not an exhaustive dump.
- Do not accept comments as evidence of behavior; look for executable logic.
- Return ONLY one JSON object. No markdown fences, no commentary. Keep the
  whole JSON object under roughly 2500 tokens.

PROMPT_HEAD
    printf '=== SPECIFICATION ===\n%s\n\n' "$SPEC_BASENAME"
    printf '=== REQUIREMENT %s OF %s ===\n%s\n\n' "$num" "$total" "$title"
    printf '=== REQUIREMENT TEXT ===\n'
    grep -v '^===' "$body" 2>/dev/null || cat "$body"
    printf '\n=== MACHINE-COLLECTED EVIDENCE ===\n'
    cat "$evidence" 2>/dev/null || true
    printf '\n=== REPOSITORY CONTEXT ===\n'
    cat "$context" 2>/dev/null || true
    cat <<'PROMPT_TAIL'

=== OUTPUT JSON SCHEMA ===
{
  "verdict": "PASS" | "FAIL" | "INCONCLUSIVE",
  "confidence": 0,
  "expected": "concise statement of what the requirement demands",
  "actual": "concise statement of what the implementation does, with file references",
  "evidence": [
    {"file": "path/from/repo/root", "line": 123, "quote": "short exact quote"}
  ],
  "missing": ["specific missing behavior or proof"],
  "reason": "one-sentence justification"
}

Confidence must be an integer 0-100. For PASS, include at least one concrete
evidence entry pointing at executable implementation. For FAIL, explain which
clause is violated. For INCONCLUSIVE, state what proof is unavailable.
PROMPT_TAIL
  } > "$out"
}

call_llm() {
  local prompt_file="$1" out_json="$2" log_prefix="$3"
  local payload response attempt=1 code content err finish verdict
  payload="$(jq -n --arg model "$OR_MODEL" --arg prompt "$(cat "$prompt_file")" \
    '{model:$model, messages:[{role:"user", content:$prompt}], temperature:0, max_tokens:5000, response_format:{type:"json_object"}, reasoning:{max_tokens:1000, exclude:true}}')"
  printf '%s\n' "$payload" > "${log_prefix}.payload.json"

  while [ "$attempt" -le 3 ]; do
    code=""
    OR_API_CALLS=$((OR_API_CALLS + 1))
    response="$(call_api "POST" "/chat/completions" "$payload" "$LLM_TIMEOUT" 2>/dev/null || true)"
    printf '%s\n' "$response" > "$out_json"
    if [ -z "$response" ]; then
      err="empty response"
    else
      code="$(printf '%s' "$response" | jq -r '.error.code // empty' 2>/dev/null || true)"
      if [ -n "$code" ]; then
        err="$(printf '%s' "$response" | jq -r '.error.metadata.raw // .error.message // "OpenRouter error"' 2>/dev/null || true)"
        case "$code" in
          400)
            # Some free models reject response_format or a large output cap.
            if printf '%s' "$err" | grep -Eqi 'response_format|json mode|json_object|structured'; then
              payload="$(printf '%s' "$payload" | jq 'del(.response_format)')"
              printf '%s\n' "$payload" > "${log_prefix}.payload.json"
              err="model does not support response_format; retrying without it"
            elif printf '%s' "$err" | grep -Eqi 'reasoning'; then
              payload="$(printf '%s' "$payload" | jq 'del(.reasoning)')"
              printf '%s\n' "$payload" > "${log_prefix}.payload.json"
              err="model does not support the reasoning cap; retrying without it"
            elif printf '%s' "$err" | grep -Eqi 'max_tokens|maximum context|too many tokens|too large'; then
              payload="$(printf '%s' "$payload" | jq '.max_tokens = 2500')"
              printf '%s\n' "$payload" > "${log_prefix}.payload.json"
              err="model rejected max_tokens; retrying with 2500"
            fi
            ;;
          401|402|403)
            printf 'ERROR: OpenRouter rejected the request (HTTP %s): %s\n' "$code" "$err" >&2
            return 2
            ;;
        esac
      else
        content="$(printf '%s' "$response" | jq -r '.choices[0].message.content // empty' 2>/dev/null || true)"
        if [ -z "$content" ]; then
          content="$(printf '%s' "$response" | jq -r '.choices[0].message.reasoning // empty' 2>/dev/null || true)"
        fi
        finish="$(printf '%s' "$response" | jq -r '.choices[0].finish_reason // empty' 2>/dev/null || true)"
        if [ -n "$content" ]; then
          if [ "$finish" = "length" ] && ! printf '%s' "$content" | jq -e . >/dev/null 2>&1; then
            err="response truncated before a complete JSON object (finish_reason=length)"
            if ! grep -q 'HARNESS CORRECTION' "$prompt_file" 2>/dev/null; then
              {
                printf '\nHARNESS CORRECTION: The previous answer exceeded the output limit. '
                printf 'Return a complete JSON object under roughly 2500 tokens. '
                printf 'Use at most 6 distinct evidence entries and do not repeat quotes.\n'
              } >> "$prompt_file"
              payload="$(printf '%s' "$payload" | jq --arg prompt "$(cat "$prompt_file")" '.messages[0].content = $prompt')"
            fi
            payload="$(printf '%s' "$payload" | jq '.max_tokens = 8000 | .reasoning.max_tokens = 500')"
            printf '%s\n' "$payload" > "${log_prefix}.payload.json"
          elif printf '%s' "$content" | jq -e . >/dev/null 2>&1; then
            verdict="$(printf '%s' "$content" | jq -r '.verdict // empty' 2>/dev/null || true)"
            case "$(printf '%s' "$verdict" | LC_ALL=C tr 'a-z' 'A-Z')" in
              PASS|PASSED|OK|FAIL|FAILED|NO|INCONCLUSIVE|UNKNOWN|PARTIAL)
                printf '%s' "$content" > "${log_prefix}.content.txt"
                printf '%s' "$response" > "${log_prefix}.response.json"
                return 0
                ;;
              *)
                err="response JSON had a null or invalid verdict"
                if ! grep -q 'HARNESS CORRECTION: The previous response had a null or invalid verdict' "$prompt_file" 2>/dev/null; then
                  {
                    printf '\nHARNESS CORRECTION: The previous response had a null or invalid verdict. '
                    printf 'Set "verdict" to exactly "PASS", "FAIL", or "INCONCLUSIVE". '
                    printf 'Fill "expected", "actual", "reason", and at least one concrete "evidence" entry with file, line, and quote. '
                    printf 'Do not return null fields.\n'
                  } >> "$prompt_file"
                  payload="$(printf '%s' "$payload" | jq --arg prompt "$(cat "$prompt_file")" '.messages[0].content = $prompt')"
                  printf '%s\n' "$payload" > "${log_prefix}.payload.json"
                fi
                ;;
            esac
          else
            # Prose is handled later by repair_llm_json; keep the response.
            printf '%s' "$content" > "${log_prefix}.content.txt"
            printf '%s' "$response" > "${log_prefix}.response.json"
            return 0
          fi
        else
          err="response contained no assistant content"
        fi
      fi
    fi
    if [ "$attempt" -lt 3 ]; then
      printf '    (LLM transient failure: %s; retrying %d/3)\n' "$err" "$((attempt + 1))" >&2
      sleep 4
    fi
    attempt=$((attempt + 1))
  done
  printf 'ERROR: LLM request failed after 3 attempts: %s\n' "$err" >&2
  if [ "${code:-}" = "429" ]; then
    return 3
  fi
  return 1
}

repair_llm_json() {
  local raw_file="$1" out_json="$2" log_prefix="$3"
  local prompt_file="$WORKDIR/repair_prompt.txt" payload response content
  {
    printf 'Convert the following verification answer into ONE valid JSON object '
    printf 'with keys verdict, confidence, expected, actual, evidence, missing, reason. '
    printf 'Do not add commentary or markdown fences.\n\nANSWER:\n'
    cat "$raw_file"
  } > "$prompt_file"
  payload="$(jq -n --arg model "$OR_MODEL" --arg prompt "$(cat "$prompt_file")" \
    '{model:$model, messages:[{role:"user", content:$prompt}], temperature:0, max_tokens:3000, reasoning:{max_tokens:500, exclude:true}}')"
  OR_API_CALLS=$((OR_API_CALLS + 1))
  response="$(call_api "POST" "/chat/completions" "$payload" "$LLM_TIMEOUT" 2>/dev/null || true)"
  printf '%s\n' "$response" > "$out_json"
  content="$(printf '%s' "$response" | jq -r '.choices[0].message.content // empty' 2>/dev/null || true)"
  if [ -z "$content" ]; then
    content="$(printf '%s' "$response" | jq -r '.choices[0].message.reasoning // empty' 2>/dev/null || true)"
  fi
  if [ -n "$content" ]; then
    printf '%s' "$content" > "${log_prefix}.content.txt"
    printf '%s' "$response" > "${log_prefix}.response.json"
    return 0
  fi
  return 1
}

validate_evidence_json() {
  local json="$1" file line quote total=0 valid=0 norm nq
  local qtokens token matches token_total need nlines
  while IFS=$'\t' read -r file line quote; do
    [ -n "$file" ] || continue
    total=$((total + 1))
    [ -f "$REPO_ROOT/$file" ] || continue
    if [ -z "$quote" ]; then
      valid=$((valid + 1))
      continue
    fi

    # 1. Whitespace-insensitive contiguous match.  This handles re-indented
    #    or line-wrapped snippets copied from the numbered context.
    norm="$WORKDIR/evidence_norm_${total}_$$.txt"
    nq="$(printf '%s' "$quote" | LC_ALL=C tr -d '[:space:]')"
    LC_ALL=C tr -d '[:space:]' < "$REPO_ROOT/$file" 2>/dev/null > "$norm"
    if [ -n "$nq" ] && grep -Fq -- "$nq" "$norm" 2>/dev/null; then
      valid=$((valid + 1))
      rm -f "$norm" 2>/dev/null || true
      continue
    fi
    rm -f "$norm" 2>/dev/null || true

    # 2. Token coverage over the whole cited file.  Models often condense
    #    several nearby JSX/SQL lines into one quote; requiring the cited
    #    line +/-3 lines was too fragile (TaskModal/MyTasks/ObjectDetail).
    #    A grounded multi-line quote still has most of its identifiers in
    #    the file, while a fabricated quote does not.
    qtokens="$(printf '%s' "$quote" | grep -oE '[A-Za-z_][A-Za-z0-9_]{2,}|[А-Яа-яЁё]{4,}' | LC_ALL=C tr 'A-Z' 'a-z' | sort -u)"
    token_total=0
    matches=0
    for token in $qtokens; do
      token_total=$((token_total + 1))
      if grep -Fqi -- "$token" "$REPO_ROOT/$file" 2>/dev/null; then
        matches=$((matches + 1))
      fi
    done
    if [ "$token_total" -gt 0 ]; then
      need=$(( (token_total * 70 + 99) / 100 ))
      [ "$need" -lt 1 ] && need=1
      if [ "$matches" -ge "$need" ]; then
        valid=$((valid + 1))
        continue
      fi
    fi

    # 3. If the quote has no extractable identifiers, accept it when the
    #    cited line exists (e.g. a punctuation-only snippet).
    if [ "$token_total" -eq 0 ] && [[ "$line" =~ ^[0-9]+$ ]] && [ "$line" -gt 0 ]; then
      nlines=$(lines_in "$REPO_ROOT/$file")
      if [ "$line" -le "$nlines" ]; then
        valid=$((valid + 1))
      fi
    fi
  done < <(printf '%s' "$json" | jq -r '.evidence[]? | [.file // "", (.line // ""), (.quote // "")] | @tsv' 2>/dev/null)
  printf '%s/%s' "$valid" "$total"
}

parse_llm_result() {
  local raw_file="$1" json_file="$2"
  local json verdict confidence
  LLM_VERDICT=""
  LLM_CONFIDENCE=""
  LLM_EXPECTED=""
  LLM_ACTUAL=""
  LLM_REASON=""
  LLM_MISSING=""
  LLM_EVIDENCE=""
  LLM_EVIDENCE_CHECK=""
  LLM_RAW_CONTENT="$(cat "$raw_file" 2>/dev/null || true)"

  json=""
  local _cand _first=""
  while IFS= read -r -d $'\036' _cand; do
    [ -n "$_cand" ] || continue
    [ -z "$_first" ] && _first="$_cand"
    if printf '%s' "$_cand" | jq -e '.verdict' >/dev/null 2>&1; then
      json="$_cand"
    fi
  done < <(extract_json_from_text "$raw_file" 2>/dev/null)
  [ -z "$json" ] && json="$_first"

  if [ -n "$json" ] && printf '%s' "$json" | jq -e . >/dev/null 2>&1; then
    printf '%s' "$json" > "$json_file"
    verdict="$(printf '%s' "$json" | jq -r '.verdict // empty' 2>/dev/null || true)"
    confidence="$(printf '%s' "$json" | jq -r '.confidence // empty' 2>/dev/null || true)"
    LLM_EXPECTED="$(printf '%s' "$json" | jq -r '.expected // empty' 2>/dev/null || true)"
    LLM_ACTUAL="$(printf '%s' "$json" | jq -r '.actual // empty' 2>/dev/null || true)"
    LLM_REASON="$(printf '%s' "$json" | jq -r '.reason // empty' 2>/dev/null || true)"
    LLM_MISSING="$(printf '%s' "$json" | jq -r '.missing[]? // empty' 2>/dev/null || true)"
    LLM_EVIDENCE="$(printf '%s' "$json" | jq -r '.evidence[]? | "\(.file // "?")\(if (.line // null) then ":" + (.line | tostring) else "" end) - \(.quote // .why // "")"' 2>/dev/null || true)"
    LLM_EVIDENCE_CHECK="$(validate_evidence_json "$json")"
    case "$(printf '%s' "$verdict" | tr 'a-z' 'A-Z')" in
      PASS|PASSED|OK) LLM_VERDICT="PASS" ;;
      FAIL|FAILED|NO) LLM_VERDICT="FAIL" ;;
      INCONCLUSIVE|UNKNOWN|PARTIAL) LLM_VERDICT="INCONCLUSIVE" ;;
      *) LLM_VERDICT="" ;;
    esac
    case "$confidence" in
      ''|*[!0-9]*) LLM_CONFIDENCE="" ;;
      *) LLM_CONFIDENCE="$confidence" ;;
    esac
    if [ "$LLM_VERDICT" = "PASS" ] && [[ "$LLM_EVIDENCE_CHECK" == 0/* ]]; then
      LLM_VERDICT="INCONCLUSIVE"
      LLM_REASON="PASS cited no verifiable code quote (${LLM_EVIDENCE_CHECK} found). ${LLM_REASON}"
    fi
    [ -n "$LLM_VERDICT" ] && return 0
  fi

  # Fallback for models that ignore the JSON instruction.
  if grep -Eqi 'VERDICT[^A-Za-z]*(PASS|PASSED)' "$raw_file" 2>/dev/null; then
    LLM_VERDICT="PASS"
  elif grep -Eqi 'VERDICT[^A-Za-z]*(FAIL|FAILED)' "$raw_file" 2>/dev/null; then
    LLM_VERDICT="FAIL"
  elif grep -Eqi 'VERDICT[^A-Za-z]*(INCONCLUSIVE|UNKNOWN)' "$raw_file" 2>/dev/null; then
    LLM_VERDICT="INCONCLUSIVE"
  fi
  [ -n "$LLM_VERDICT" ] && return 0
  return 1
}

run_llm_verification() {
  local req_num="$1" title="$2" body="$3" forced="$4" log_prefix="$5"
  local prompt_file="$WORKDIR/llm_prompt_${req_num}.txt"
  local context_file="$WORKDIR/llm_context_${req_num}.txt"
  local evidence_file="$WORKDIR/llm_evidence_${req_num}.txt"
  local live_evidence_file="$WORKDIR/live_evidence_${req_num}.txt"
  local hits_file="$WORKDIR/llm_hits_${req_num}.txt"
  local raw_file="$WORKDIR/llm_content_${req_num}.txt"
  local json_file="$WORKDIR/llm_result_${req_num}.json"
  local raw_text combined _ev
  combined="$title
$(cat "$body" 2>/dev/null || true)"

  build_context "$combined" "$forced" "$context_file"
  collect_static_evidence "$combined" "$evidence_file"
  collect_live_runtime_evidence "$combined" "$live_evidence_file"
  cat "$live_evidence_file" >> "$evidence_file" 2>/dev/null || true
  collect_keyword_hits "$combined" "$hits_file"
  cat "$hits_file" >> "$evidence_file" 2>/dev/null || true
  build_llm_prompt "$title" "$body" "$context_file" "$evidence_file" "$prompt_file" "$req_num" "$REQ_COUNT"

  printf '  Method: LLM semantic review via %s\n' "$OR_MODEL"
  if [ "$OPT_VERBOSE" -eq 1 ]; then
    printf '  Command: POST %s/chat/completions\n' "$OR_API_BASE"
    printf '  Model  : %s\n' "$OR_MODEL"
    printf '  Headers: Authorization: Bearer [REDACTED] | Content-Type: application/json\n'
    printf '  Payload: {"model":"%s","messages":[{"role":"user","content":"<verification prompt>"}],"temperature":0}\n' "$OR_MODEL"
    printf '  Payload file: %s.payload.json\n' "$log_prefix"
    printf '  Context files:\n'
    if [ -s "$WORKDIR/selected_files.txt" ]; then
      sed 's/^/    /' "$WORKDIR/selected_files.txt"
    else
      printf '    (none selected)\n'
    fi
    printf '  Prompt : %s (%s bytes)\n' "$prompt_file" "$(wc -c < "$prompt_file" | tr -d ' ')"
    printf '  --- PROMPT BEGIN ---\n'
    cat "$prompt_file" | indent
    printf '  --- PROMPT END ---\n'
  fi
  printf '  Request: POST /chat/completions\n'

  local call_rc=0 served_model=""
  call_llm "$prompt_file" "$WORKDIR/llm_response_${req_num}.json" "$log_prefix" || call_rc=$?
  if [ "$call_rc" -eq 2 ]; then
    preflight_die "OpenRouter authentication/authorization failed while checking requirement $req_num. Fix the key and re-run."
  elif [ "$call_rc" -eq 3 ]; then
    preflight_die "OpenRouter free-model quota/rate limit is exhausted while checking requirement $req_num. It resets at 00:00 UTC (in $(duration_fmt "$(secs_until_utc_midnight)")). Use another key or wait."
  elif [ "$call_rc" -ne 0 ]; then
    if [ "$OPT_VERBOSE" -eq 1 ]; then
      printf '  Raw Response:\n    (no usable response)\n\n' | dim_text
    else
      printf '  Response: no usable LLM response (use -v for details)\n'
    fi
    LLM_VERDICT="FAIL"
    LLM_EXPECTED="$title"
    LLM_ACTUAL="The LLM request failed; no semantic verdict could be obtained."
    LLM_REASON="OpenRouter request failed."
    return 1
  fi

  served_model="$(jq -r '.model // empty' "$WORKDIR/llm_response_${req_num}.json" 2>/dev/null || true)"
  if [ "$OPT_VERBOSE" -eq 1 ] && [ -n "$served_model" ]; then
    printf '  Served model: %s\n' "$served_model"
  fi

  cp "${log_prefix}.content.txt" "$raw_file" 2>/dev/null || : > "$raw_file"
  raw_text="$(cat "$raw_file" 2>/dev/null || true)"

  if [ "$OPT_VERBOSE" -eq 1 ]; then
    printf '  Raw Response:\n'
    if [ -n "$raw_text" ]; then
      printf '%s\n' "$raw_text" | head -n "$TRACE_LINES" | indent | dim_text
      local n
      n=$(printf '%s\n' "$raw_text" | wc -l | tr -d ' ')
      if [ "$n" -gt "$TRACE_LINES" ]; then
        printf '  [... %d more raw response line(s) in %s ...]\n' "$((n - TRACE_LINES))" "$raw_file"
      fi
    else
      printf '    (empty)\n' | dim_text
    fi
    printf '\n'
  fi

  if ! parse_llm_result "$raw_file" "$json_file"; then
    # One repair attempt for models that answer in prose.
    if [ "$OPT_VERBOSE" -eq 1 ]; then
      printf '  Response was not valid JSON; requesting a JSON repair...\n' >&2
    else
      printf '  Response was not valid JSON; retrying with a JSON repair...\n' >&2
    fi
    if repair_llm_json "$raw_file" "$WORKDIR/llm_repair_${req_num}.json" "$WORKDIR/llm_repair_${req_num}"; then
      cp "$WORKDIR/llm_repair_${req_num}.content.txt" "$raw_file" 2>/dev/null || true
      parse_llm_result "$raw_file" "$json_file" || true
    fi
  fi

  if [ -z "$LLM_VERDICT" ]; then
    LLM_VERDICT="FAIL"
    LLM_EXPECTED="$title"
    LLM_ACTUAL="The model did not return a parseable verdict."
    LLM_REASON="Unparseable LLM response (see artifact log)."
  fi
  if [ "$LLM_VERDICT" = "PASS" ] && [ -z "$LLM_EVIDENCE" ]; then
    LLM_VERDICT="INCONCLUSIVE"
    LLM_REASON="The model returned PASS without citing concrete code evidence (${LLM_REASON:-no evidence})."
  fi

  cmp_add "  Expected : ${LLM_EXPECTED:-$title}"
  if [ "$OPT_VERBOSE" -eq 1 ]; then
    cmp_add "  Actual   : ${LLM_ACTUAL:-.}"
    if [ -n "$LLM_EVIDENCE" ]; then
      cmp_add "  Evidence :"
      while IFS= read -r _ev; do
        [ -n "$_ev" ] && cmp_add "    - $_ev"
      done <<EOF
$(printf '%s\n' "$LLM_EVIDENCE" | head -n 8)
EOF
      if [ "$(printf '%s\n' "$LLM_EVIDENCE" | wc -l | tr -d ' ')" -gt 8 ]; then
        cmp_add "    [... additional citations in $json_file ...]"
      fi
    fi
    if [ -n "$LLM_MISSING" ]; then
      cmp_add "  Missing  :"
      while IFS= read -r _ev; do
        [ -n "$_ev" ] && cmp_add "    - $_ev"
      done <<EOF
$(printf '%s\n' "$LLM_MISSING" | head -n 6)
EOF
    fi
  else
    cmp_add "  Actual   : $(printf '%s' "${LLM_ACTUAL:-.}" | LC_ALL=C tr '\n' ' ')"
  fi
  [ -n "$LLM_EVIDENCE_CHECK" ] && cmp_add "  Evidence check: $LLM_EVIDENCE_CHECK quote(s) matched against repository files"
  [ -n "$LLM_CONFIDENCE" ] && cmp_add "  Confidence: $LLM_CONFIDENCE%"
  case "$LLM_VERDICT" in
    PASS) cmp_add "  Match    : SEMANTIC MATCH" ;;
    FAIL) cmp_add "  Match    : MISMATCH" ;;
    *) cmp_add "  Match    : INCONCLUSIVE (strict mode treats this as failure)" ;;
  esac
  if [ -n "$LLM_REASON" ]; then
    if [ "$OPT_VERBOSE" -eq 1 ]; then
      cmp_add "  Reason   : $LLM_REASON"
    else
      cmp_add "  Reason   : $(printf '%s' "$LLM_REASON" | LC_ALL=C tr '\n' ' ')"
    fi
  fi

  {
    printf '### LLM VERDICT: %s\n' "$LLM_VERDICT"
    printf '### EXPECTED\n%s\n' "${LLM_EXPECTED:-$title}"
    printf '### ACTUAL\n%s\n' "${LLM_ACTUAL:-}"
    printf '### EVIDENCE\n%s\n' "${LLM_EVIDENCE:-}"
    printf '### EVIDENCE CHECK\n%s\n' "${LLM_EVIDENCE_CHECK:-}"
    printf '### MISSING\n%s\n' "${LLM_MISSING:-}"
    printf '### REASON\n%s\n' "${LLM_REASON:-}"
    printf '### RAW\n%s\n' "$raw_text"
  } >> "$log_prefix.log"

  [ "$LLM_VERDICT" = "PASS" ] || return 1
  if [ "$MIN_CONFIDENCE" -gt 0 ] && [ -n "$LLM_CONFIDENCE" ] && [ "$LLM_CONFIDENCE" -lt "$MIN_CONFIDENCE" ]; then
    cmp_add "  Note     : PASS rejected because confidence $LLM_CONFIDENCE% < required $MIN_CONFIDENCE%."
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# Auto-repair context (--fix)
# ---------------------------------------------------------------------------
json_array_from_lines() {
  local file="$1"
  if [ -s "$file" ]; then
    jq -R -s 'split("\n") | map(select(length > 0))' < "$file"
  else
    printf '[]'
  fi
}

collect_fix_target_files() {
  local req_num="$1" body="$2" out="$3"
  local llm_json="$WORKDIR/llm_result_${req_num}.json"
  local pat targets f

  : > "$out"

  # Files selected for the semantic review are the most likely edit targets.
  if [ -f "$WORKDIR/selected_files.txt" ]; then
    cat "$WORKDIR/selected_files.txt" >> "$out" 2>/dev/null || true
  fi

  # Files cited by the model as evidence.
  if [ -f "$llm_json" ]; then
    jq -r '.evidence[]?.file // empty' "$llm_json" 2>/dev/null >> "$out" || true
  fi

  # Files named by the last embedded check.
  targets="$(printf '%s %s' "$VB_PATH" "$VB_FILES" | LC_ALL=C tr ',' ' ')"
  for pat in $targets; do
    [ -n "$pat" ] || continue
    case "$pat" in
      /*)
        [ -f "$pat" ] && printf '%s\n' "$pat" >> "$out"
        ;;
      *)
        for f in $REPO_ROOT/$pat; do
          [ -f "$f" ] || continue
          printf '%s\n' "${f#"$REPO_ROOT"/}" >> "$out"
        done
        ;;
    esac
  done

  # Database/access-control requirements normally live in migrations.
  if grep -Eqi 'rls|row.level|policy|policies|trigger|database|supabase|postgres|sql|доступ|безопас|баз[аы]|миграц|delete|удал' "$body" 2>/dev/null; then
    find "$REPO_ROOT/supabase/migrations" -maxdepth 1 -type f -name '*.sql' 2>/dev/null \
      | while IFS= read -r f; do printf '%s\n' "${f#"$REPO_ROOT"/}"; done >> "$out"
  fi

  awk 'NF && !seen[$0]++' "$out" | while IFS= read -r f; do
    case "$f" in
      /*) [ -f "$f" ] && printf '%s\n' "$f" ;;
      *) [ -f "$REPO_ROOT/$f" ] && printf '%s\n' "$f" ;;
    esac
  done > "$out.tmp"
  mv "$out.tmp" "$out"
}

generate_fix_context() {
  local req_num="$1" title="$2" body="$3"
  local fix_json="$WORKDIR/fix_req_${req_num}.json"
  local fix_md="$WORKDIR/fix_req_${req_num}.md"
  local missing_file="$WORKDIR/fix_missing_${req_num}.txt"
  local evidence_file="$WORKDIR/fix_evidence_${req_num}.txt"
  local comparison_file="$WORKDIR/fix_comparison_${req_num}.txt"
  local targets_file="$WORKDIR/fix_targets_${req_num}.txt"
  local reason instruction

  : > "$missing_file"
  : > "$evidence_file"
  : > "$comparison_file"

  if [ "${#CMP_LINES[@]}" -gt 0 ]; then
    printf '%s\n' "${CMP_LINES[@]}" | sed 's/^[[:space:]]*//' > "$comparison_file"
  fi

  if [ -n "$LLM_MISSING" ]; then
    printf '%s\n' "$LLM_MISSING" | sed 's/^[[:space:]]*//' | awk 'NF && !seen[$0]++' >> "$missing_file"
  fi
  printf '%s\n' "${CMP_LINES[@]+"${CMP_LINES[@]}"}" \
    | grep -Ei 'mismatch|missing|not set|failed|inconclusive|no verification|no matches' \
    | sed 's/^[[:space:]]*//' \
    | awk 'NF && !seen[$0]++' >> "$missing_file" || true

  if [ -n "$LLM_EVIDENCE" ]; then
    printf '%s\n' "$LLM_EVIDENCE" | sed 's/^[[:space:]]*//' > "$evidence_file"
  fi

  reason="$LLM_REASON"
  if [ -z "$reason" ]; then
    reason="$(printf '%s\n' "${CMP_LINES[@]+"${CMP_LINES[@]}"}" \
      | grep -Ei 'mismatch|failed|missing|not set|inconclusive|no verification' \
      | sed 's/^[[:space:]]*//' \
      | head -n 8 \
      | awk 'NR > 1 { printf "; " } { printf "%s", $0 }')"
  fi
  [ -z "$reason" ] && reason="Requirement verification failed."

  collect_fix_target_files "$req_num" "$body" "$targets_file"

  instruction="Apply the smallest code change that satisfies this requirement. Do not modify the specification file. Use the target files and failure details in this context, then re-run the verifier for this requirement."

  jq -n \
    --argjson requirement_number "$req_num" \
    --arg title "$title" \
    --rawfile requirement_text "$body" \
    --arg failure_reason "$reason" \
    --argjson missing_code_or_policy "$(json_array_from_lines "$missing_file")" \
    --argjson evidence "$(json_array_from_lines "$evidence_file")" \
    --argjson comparison "$(json_array_from_lines "$comparison_file")" \
    --argjson target_files "$(json_array_from_lines "$targets_file")" \
    --arg spec_file "$SPEC_ABS" \
    --arg repo_root "$REPO_ROOT" \
    --arg verification_log "$WORKDIR/req_${req_num}/verification.log" \
    --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg instruction "$instruction" \
    '{
      schema_version: 1,
      requirement_number: $requirement_number,
      title: $title,
      requirement_text: $requirement_text,
      failure_reason: $failure_reason,
      missing_code_or_policy: $missing_code_or_policy,
      evidence: $evidence,
      comparison: $comparison,
      target_files: $target_files,
      spec_file: $spec_file,
      repo_root: $repo_root,
      verification_log: $verification_log,
      generated_at: $generated_at,
      instruction: $instruction
    }' > "$fix_json"

  {
    printf '# Fix context: requirement %s - %s\n\n' "$req_num" "$title"
    printf '## Failure reason\n\n%s\n\n' "$reason"
    printf '## Missing code / policy\n\n'
    if [ -s "$missing_file" ]; then
      sed 's/^/- /' "$missing_file"
    else
      printf -- '- (not reported)\n'
    fi
    printf '\n## Target files\n\n'
    if [ -s "$targets_file" ]; then
      sed 's/^/- /' "$targets_file"
    else
      printf -- '- (not identified; inspect the requirement and repository)\n'
    fi
    printf '\n## Instruction\n\n%s\n\n' "$instruction"
    printf 'The specification file was not modified.\n'
  } > "$fix_md"

  printf '\n[FIX MODE] Failure context generated for requirement %s. Applying code repairs...\n' "$req_num"
  printf '  JSON         : %s\n' "$fix_json"
  printf '  Instructions : %s\n' "$fix_md"
  printf '  Target files : %s\n' "$(tr '\n' ' ' < "$targets_file" 2>/dev/null || true)"
}

run_fix_patcher() {
  local fix_json="$1" req_num="$2"
  [ -n "${VERIFY_FIX_COMMAND:-}" ] || return 2
  printf '  [FIX MODE] Running VERIFY_FIX_COMMAND for requirement %s...\n' "$req_num"
  if bash -c "$VERIFY_FIX_COMMAND" verify-fix "$fix_json" "$REPO_ROOT"; then
    return 0
  fi
  return 1
}

# ---------------------------------------------------------------------------
# One requirement: 4-step verification trace
# ---------------------------------------------------------------------------
verify_requirement() {
  local req_num="$1" title="$2" body="$3" attempt="${4:-1}"
  local req_dir="$WORKDIR/req_${req_num}"
  local log="$req_dir/verification.log"
  local block_count block_file check_num=0 checks_passed=0 checks_total=0 req_pass=1
  local block_pass fix_rc

  mkdir -p "$req_dir"
  : > "$log"
  vb_reset
  CMP_LINES=()
  LLM_VERDICT=""
  LLM_CONFIDENCE=""
  LLM_EXPECTED=""
  LLM_ACTUAL=""
  LLM_REASON=""
  LLM_MISSING=""
  LLM_EVIDENCE=""
  LLM_EVIDENCE_CHECK=""
  block_count="$(extract_verify_blocks "$body" "$req_dir")"

  rule
  printf '%s[REQUIREMENT %02d/%02d]: "%s"%s\n' "$C_BOLD$C_CYAN" "$req_num" "$REQ_COUNT" "$title" "$C_RESET"
  rule
  step_label "[1. EXPECTED RESULT]:"

  if [ "$block_count" -gt 0 ]; then
    checks_total="$block_count"
    for ((check_num = 1; check_num <= block_count; check_num++)); do
      block_file="$(printf '%s/verify_block_%03d.txt' "$req_dir" "$check_num")"
      parse_verify_block "$block_file"
      if [ "$OPT_VERBOSE" -eq 1 ]; then
        if [ "$block_count" -gt 1 ]; then
          print_expected_block "Check $check_num/$block_count:"
        else
          print_expected_block ""
        fi
      else
        if [ "$block_count" -gt 1 ]; then
          print_expected_brief "Check $check_num/$block_count:"
        else
          print_expected_brief ""
        fi
      fi
      [ "$check_num" -lt "$block_count" ] && printf '\n'
    done
  else
    checks_total=1
    printf '  Criteria:\n'
    if [ "$OPT_VERBOSE" -eq 1 ]; then
      print_criteria_from_body "$body" 25
    else
      print_criteria_from_body "$body" 4
    fi
    if [ "$NO_LLM" -eq 1 ]; then
      printf '  Proof method    : DISABLED (--no-llm); this requirement cannot be verified.\n'
    else
      printf '  Proof method    : LLM semantic code review (OpenRouter, strict evidence).\n'
    fi
  fi
  printf '\n'
  step_label "[2. EXECUTING TEST]:"

  if [ "$block_count" -gt 0 ]; then
    for ((check_num = 1; check_num <= block_count; check_num++)); do
      block_file="$(printf '%s/verify_block_%03d.txt' "$req_dir" "$check_num")"
      parse_verify_block "$block_file"
      [ "$block_count" -gt 1 ] && printf '  --- Check %d/%d (%s) ---\n' "$check_num" "$block_count" "${VB_TYPE:-unknown}"
      [ "$block_count" -gt 1 ] && CMP_LINES+=("  Check $check_num/$block_count (${VB_TYPE:-unknown}):")
      block_pass=0
      case "$VB_TYPE" in
        http)
          if run_check_http "$req_num" "$check_num" "$log"; then block_pass=1; fi
          ;;
        command|playwright|sql)
          if run_check_command "$req_num" "$check_num" "$log"; then block_pass=1; fi
          ;;
        file)
          if run_check_file "$req_num" "$check_num" "$log"; then block_pass=1; fi
          ;;
        llm)
          local llm_body="$body"
          if [ -n "$VB_EXPECTED" ]; then
            llm_body="$req_dir/llm_criteria_${check_num}.txt"
            {
              printf 'The embedded verification expects:\n%s\n\n' "$VB_EXPECTED"
              printf 'Specification context:\n'
              cat "$body"
            } > "$llm_body"
          fi
          if run_llm_verification "$req_num" "$title" "$llm_body" "$VB_FILES" "$WORKDIR/llm_${req_num}_${check_num}"; then block_pass=1; fi
          ;;
        *)
          printf '  ERROR: unsupported or incomplete verify block (type=%s).\n' "${VB_TYPE:-unknown}"
          cmp_add "  Expected : one of http, command, sql, playwright, file, llm."
          cmp_add "  Actual   : ${VB_TYPE:-missing}"
          cmp_add "  Match    : MISMATCH"
          ;;
      esac
      [ "$block_pass" -eq 1 ] && checks_passed=$((checks_passed + 1)) || req_pass=0
      [ "$check_num" -lt "$block_count" ] && printf '\n'
    done
  else
    if [ "$NO_LLM" -eq 1 ]; then
      printf '  Command: (not executed)\n'
      printf '  Reason : --no-llm was supplied and the requirement has no embedded check.\n'
      cmp_add "  Expected : evidence that the requirement is satisfied"
      cmp_add "  Actual   : no verification performed (--no-llm)"
      cmp_add "  Match    : MISMATCH"
      req_pass=0
    else
      if run_llm_verification "$req_num" "$title" "$body" "" "$WORKDIR/llm_${req_num}_0"; then
        req_pass=1
      else
        req_pass=0
      fi
    fi
  fi

  printf '\n'
  step_label "[3. COMPARISON]:"
  if [ "${#CMP_LINES[@]}" -gt 0 ]; then
    local _cmp
    for _cmp in "${CMP_LINES[@]}"; do
      printf '%s\n' "$_cmp"
    done
  else
    printf '  (no comparison data)\n'
  fi
  if [ "$block_count" -gt 0 ]; then
    printf '  Checks passed : %s/%s\n' "$checks_passed" "$checks_total"
    if [ "$checks_passed" -eq "$checks_total" ]; then
      printf '  Overall match : ALL EXPECTATIONS MET\n'
    else
      printf '  Overall match : ONE OR MORE EXPECTATIONS FAILED\n'
    fi
  else
    case "${LLM_VERDICT:-}" in
      PASS) printf '  Overall match : SEMANTIC MATCH\n' ;;
      FAIL) printf '  Overall match : MISMATCH\n' ;;
      *) printf '  Overall match : INCONCLUSIVE (strict failure)\n' ;;
    esac
  fi

  if [ "$req_pass" -eq 0 ] && [ "$FIX_MODE" -eq 1 ] && [ "$attempt" -eq 1 ]; then
    printf '\n'
    generate_fix_context "$req_num" "$title" "$body"
    run_fix_patcher "$WORKDIR/fix_req_${req_num}.json" "$req_num"
    fix_rc=$?
    if [ "$fix_rc" -eq 0 ]; then
      printf '  [FIX MODE] Repair command succeeded; re-verifying requirement %02d...\n' "$req_num"
      verify_requirement "$req_num" "$title" "$body" 2
      return $?
    elif [ "$fix_rc" -eq 2 ]; then
      printf '  [FIX MODE] No VERIFY_FIX_COMMAND configured. Apply the changes yourself and re-run; the specification file was not modified.\n'
    else
      printf '  [FIX MODE] External repair command failed; keeping the failure verdict.\n'
    fi
  fi

  printf '\n'
  printf '%s[4. VERDICT]:%s ' "$C_BOLD$C_BLUE" "$C_RESET"
  if [ "$req_pass" -eq 1 ]; then
    printf '%s[PASSED]%s\n' "$C_GREEN" "$C_RESET"
    PASSED=$((PASSED + 1))
  else
    printf '%s[FAILED]%s\n' "$C_RED" "$C_RESET"
    FAILED=$((FAILED + 1))
    FAILED_TITLES+=("[$req_num] $title")
  fi

  {
    printf '### REQUIREMENT %s: %s\n' "$req_num" "$title"
    printf '### RESULT: %s\n' "$([ "$req_pass" -eq 1 ] && printf PASSED || printf FAILED)"
  } >> "$log"
  rule
  printf '\n'
}

# ---------------------------------------------------------------------------
# Interactive mode: preview, manual reproduction, prompt
# ---------------------------------------------------------------------------
manual_url_for() {
  local body="$1" lang="en" base="${APP_URL:-http://localhost:5173}" path=""
  # Cyrillic UTF-8 starts with byte 0xD0 or 0xD1; bracket ranges are unreliable
  # under non-UTF-8 locales.
  if printf '%s' "$body" | LC_ALL=C grep -q $'\xD0' || printf '%s' "$body" | LC_ALL=C grep -q $'\xD1'; then
    lang="ru"
  fi
  if printf '%s' "$body" | grep -Eqi 'my.tasks|мои задачи'; then
    path="/$lang/my-tasks"
  elif printf '%s' "$body" | grep -Eqi 'login|sign.in|вход|авторизац|регистрац|signup|sign-up|registration'; then
    path="/$lang/login"
  elif printf '%s' "$body" | grep -Eqi 'task.card|карточк[а-я]*[[:space:]]+задач'; then
    path="/$lang/objects/<object-id>"
  elif printf '%s' "$body" | grep -Eqi 'object.card|карточк[а-я]*[[:space:]]+объект|object.detail'; then
    path="/$lang/objects/<object-id>"
  elif printf '%s' "$body" | grep -Eqi 'object|объект|site|стройк'; then
    path="/$lang"
  else
    path="/$lang"
  fi
  printf '%s%s' "${base%/}" "$path"
}

print_manual_instructions() {
  local body_file="$1" body url manager worker role_mode="both" expected block_count
  local -a steps
  steps=()
  body="$(cat "$body_file" 2>/dev/null || true)"
  block_count="$(count_verify_blocks "$body_file")"
  url="$(manual_url_for "$body")"
  manager="${MANAGER_EMAIL:-${DEMO_MANAGER_EMAIL:-manager@example.com}}"
  worker="${WORKER_EMAIL:-${DEMO_WORKER_EMAIL:-worker@example.com}}"

  if printf '%s' "$body" | grep -Eqi 'исполнител|worker'; then
    if ! printf '%s' "$body" | grep -Eqi 'постановщик|руководител|manager'; then
      role_mode="worker"
    fi
  elif printf '%s' "$body" | grep -Eqi 'постановщик|руководител|manager'; then
    role_mode="manager"
  fi

  if printf '%s' "$body" | grep -Eqi 'rls|row.level|policy|права доступа|доступ к|безопас|security|чуж|permission|auth'; then
    steps+=("Sign in as Worker 1 in one browser profile and Manager in another (or two private windows).")
    steps+=("Open $url and note one task/object that belongs to the current worker and one that belongs to another worker.")
    steps+=("Try the same action in the UI and, when the requirement has an embedded HTTP/SQL check, use that exact request.")
    steps+=("Expected: the foreign record is not visible, or the API returns 0 rows / 403 / an RLS error.")
  elif printf '%s' "$body" | grep -Eqi 'роль|roles|постановщик|manager|исполнител|worker' && \
       ! printf '%s' "$body" | grep -Eqi 'статус|переход|status|transition|workflow|my.tasks|мои задачи'; then
    steps+=("Sign in as Manager and as Worker 1 in two separate sessions.")
    steps+=("As Manager, create/edit an object and a task, assign a worker, and confirm full portfolio visibility.")
    steps+=("As Worker, confirm only assigned objects/tasks are visible and only field actions are offered.")
    steps+=("Try a forbidden create/delete/accept action through the API; expect 403 / RLS rejection.")
    steps+=("Expected: the capabilities and visibility match the role table.")
  elif printf '%s' "$body" | grep -Eqi 'карточк[а-я]*[[:space:]]+задач'; then
    steps+=("Sign in as Manager and as Worker 1; open a task from the object detail or My Tasks ($url).")
    steps+=("Verify the card shows the task data and only the action buttons allowed for the current role and status.")
    steps+=("Change the status and verify a history entry appears with actor, time, from/to status and comment.")
    steps+=("Try to edit or delete a history entry through the API; expect 403 / RLS rejection.")
    steps+=("Expected: task data, available actions and history all match the requirement.")
  elif printf '%s' "$body" | grep -Eqi 'статус|переход|status|transition|принят|accepted|доработк|revision'; then
    steps+=("Sign in as Manager and as the assigned Worker; open a task in each status ($url).")
    steps+=("Verify the visible buttons match the role and current status (start/submit for the worker; accept/request revision for the manager).")
    steps+=("Try a forbidden transition through the UI and through the embedded curl/SQL check.")
    steps+=("Expected: only allowed actions are shown and the database rejects invalid transitions.")
  elif printf '%s' "$body" | grep -Eqi 'истори|history|audit'; then
    steps+=("Open a task, change its status, and refresh the task card ($url).")
    steps+=("Verify the history shows who, when, from-status, to-status and any comment.")
    steps+=("Try to update or delete a task_history row through the API; expect 403 / RLS rejection.")
    steps+=("Expected: the audit trail is append-only and visible to both roles.")
  elif printf '%s' "$body" | grep -Eqi 'регистрац|signup|sign-up|registration'; then
    steps+=("Open $url and confirm the login form works with email and password.")
    steps+=("Confirm there is no public sign-up link or registration form.")
    steps+=("If testing the API, call the Supabase sign-up endpoint and expect it to be disabled.")
    steps+=("Expected: open registration is unavailable; users are created by an administrator.")
  elif printf '%s' "$body" | grep -Eqi 'ключ|секрет|secret|service_role|api key'; then
    steps+=("Search tracked files and the built frontend bundle for service_role / secret key values.")
    steps+=("Confirm only the public anon/publishable key is present in VITE_* variables.")
    steps+=("Expected: no service_role or private key material is exposed.")
  elif printf '%s' "$body" | grep -Eqi 'login|sign.in|вход|авторизац'; then
    steps+=("Open $url and sign in with each account below.")
    steps+=("Confirm invalid credentials are rejected and a valid session opens the workspace.")
    steps+=("Expected: email/password sign-in works and protected pages require a session.")
  elif printf '%s' "$body" | grep -Eqi 'my.tasks|мои задачи'; then
    steps+=("Sign in as Worker 1 and open $url.")
    steps+=("Confirm the queue shows only tasks assigned to that worker, with the next action and due date.")
    steps+=("Sign in as Manager and confirm the worker queue is not available as a manager screen.")
    steps+=("Expected: the worker-only My Tasks screen lists only the signed-in worker's tasks.")
  elif printf '%s' "$body" | grep -Eqi 'object|объект|site|стройк'; then
    steps+=("Sign in as Manager and open $url.")
    steps+=("Create or edit an object and add/assign at least one task.")
    steps+=("Sign in as Worker and confirm only assigned objects and tasks are visible.")
    steps+=("Expected: the object/task data and role-specific visibility match the requirement.")
  elif printf '%s' "$body" | grep -Eqi 'задач|task'; then
    steps+=("Sign in as Manager and open $url.")
    steps+=("Open a task, change its status, and verify the task card shows data, allowed actions and history.")
    steps+=("Sign in as Worker and confirm only assigned tasks and allowed actions are visible.")
    steps+=("Expected: the task screen and actions match the requirement.")
  else
    steps+=("Open $url and sign in with the accounts below.")
    steps+=("Perform the action described in the requirement.")
    steps+=("Compare the result with the expected criteria shown above.")
  fi

  if [ "$block_count" -gt 0 ]; then
    steps+=("An embedded executable check is present; its exact command and raw result are shown after you proceed.")
  fi

  expected="$(printf '%s\n' "$body" | strip_verify_blocks | render_markdown_tables | grep -v '^===' | grep -vE '^[[:space:]]*\|?[[:space:]]*:?-{3,}' | sed '/^[[:space:]]*$/d' | head -n 4)"
  [ -z "$expected" ] && expected="The behavior described in the requirement is visible and matches the acceptance criteria."

  printf '  Manual reproduction:\n'
  printf '    URL      : %s\n' "$url"
  case "$role_mode" in
    manager) printf '    Account  : Manager: %s\n' "$manager" ;;
    worker)  printf '    Account  : Worker : %s\n' "$worker" ;;
    *)       printf '    Accounts : Manager: %s\n' "$manager"
             printf '               Worker : %s\n' "$worker" ;;
  esac
  printf '    Steps    :\n'
  local _n=1 _step
  for _step in "${steps[@]}"; do
    printf '      %d. %s\n' "$_n" "$_step"
    _n=$((_n + 1))
  done
  if [ "$(printf '%s\n' "$expected" | grep -c .)" -le 1 ]; then
    printf '    Expected : %s\n' "$expected"
  else
    printf '    Expected :\n'
    printf '%s\n' "$expected" | sed 's/^/      /'
  fi
}

print_requirement_preview() {
  local req_num="$1" title="$2" body="$3" block_count
  block_count="$(count_verify_blocks "$body")"
  rule
  printf '%s[REQUIREMENT %02d/%02d]: "%s"%s\n' "$C_BOLD$C_CYAN" "$req_num" "$REQ_COUNT" "$title" "$C_RESET"
  rule
  printf 'Expected:\n'
  print_criteria_from_body "$body" 5 2
  printf 'Method   : '
  if [ "$block_count" -gt 0 ]; then
    printf '%s embedded executable check(s)\n' "$block_count"
  else
    printf 'LLM semantic code review\n'
  fi
  print_manual_instructions "$body"
  printf '\n'
}

prompt_continue() {
  local answer
  while :; do
    printf '%sProceed? [y]es / [n]o / [s]kip / [a]lways (default: y): %s' "$C_BOLD$C_YELLOW" "$C_RESET"
    IFS= read -r answer || answer=""
    if [ ! -t 0 ]; then printf '\n'; fi
    case "${answer:-y}" in
      y|Y|yes|YES|Yes) return 0 ;;
      n|N|no|NO|No) return 1 ;;
      s|S|skip|SKIP|Skip) return 2 ;;
      a|A|always|ALWAYS|Always)
        ASSUME_YES=1
        INTERACTIVE=0
        printf '%s[ALWAYS]%s Continuing without prompts for all remaining requirements.\n' "$C_BOLD$C_YELLOW" "$C_RESET"
        return 0
        ;;
      *) printf 'Please enter y, n, s, or a.\n' ;;
    esac
  done
}

print_skip_block() {
  local req_num="$1" title="$2"
  rule
  printf '%s[REQUIREMENT %02d/%02d]: "%s"%s\n' "$C_BOLD$C_CYAN" "$req_num" "$REQ_COUNT" "$title" "$C_RESET"
  rule
  printf '\n'
  printf '%s[4. VERDICT]:%s %s[SKIPPED]%s\n' "$C_BOLD$C_BLUE" "$C_RESET" "$C_YELLOW" "$C_RESET"
  rule
  printf '\n'
}

# Print the preview and prompt to the terminal that runs the script.  When
# stdout is piped (for example `./verify.sh spec.md | tee test.log`), the
# preview and prompt must go to /dev/tty so they do not end up in the log.
# Uses the UI color palette because the tty may be a color terminal even when
# stdout is redirected.
interactive_gate() {
  local req_num="$1" title="$2" body="$3" rc=0
  local s_reset="$C_RESET" s_bold="$C_BOLD" s_red="$C_RED" s_green="$C_GREEN"
  local s_yellow="$C_YELLOW" s_blue="$C_BLUE" s_cyan="$C_CYAN"

  C_RESET="$UI_RESET"; C_BOLD="$UI_BOLD"; C_RED="$UI_RED"
  C_GREEN="$UI_GREEN"; C_YELLOW="$UI_YELLOW"; C_BLUE="$UI_BLUE"; C_CYAN="$UI_CYAN"

  case "$PROMPT_DEST" in
    tty)
      { print_requirement_preview "$req_num" "$title" "$body"; prompt_continue; rc=$?; } 1>/dev/tty
      ;;
    stderr)
      { print_requirement_preview "$req_num" "$title" "$body"; prompt_continue; rc=$?; } 1>&2
      ;;
    *)
      print_requirement_preview "$req_num" "$title" "$body"
      prompt_continue
      rc=$?
      ;;
  esac

  C_RESET="$s_reset"; C_BOLD="$s_bold"; C_RED="$s_red"
  C_GREEN="$s_green"; C_YELLOW="$s_yellow"; C_BLUE="$s_blue"; C_CYAN="$s_cyan"
  return "$rc"
}

print_interactive_banner() {
  local msg='Interactive mode: y/Enter runs, n aborts, s skips, a runs all remaining. Use -y for continuous mode.'
  case "$PROMPT_DEST" in
    tty) printf '%s\n\n' "$msg" >/dev/tty ;;
    stderr) printf '%s\n\n' "$msg" >&2 ;;
    *) printf '%s\n\n' "$msg" ;;
  esac
}

# ---------------------------------------------------------------------------
# Main verification loop
# ---------------------------------------------------------------------------
# Interactive mode is driven by stdin: if a user can type answers, prompt by
# default even when stdout is piped to tee or a log file.
if [ "$ASSUME_YES" -eq 1 ]; then
  INTERACTIVE=0
elif [ "$FORCE_INTERACTIVE" -eq 1 ]; then
  INTERACTIVE=1
elif [ -t 0 ]; then
  INTERACTIVE=1
else
  INTERACTIVE=0
fi

# If stdout is redirected, send previews/prompts to the controlling terminal.
PROMPT_DEST="stdout"
if [ "$INTERACTIVE" -eq 1 ] && [ ! -t 1 ]; then
  if { true >/dev/tty; } 2>/dev/null; then
    PROMPT_DEST="tty"
  else
    PROMPT_DEST="stderr"
  fi
fi

setup_ui_colors

if [ "$INTERACTIVE" -eq 1 ]; then
  print_interactive_banner
fi

for ((i = 0; i < REQ_COUNT; i++)); do
  req_num=$((i + 1))
  if [ -n "$ONLY_REQ" ] && [ "$req_num" -ne "$ONLY_REQ" ]; then
    continue
  fi
  title="${REQ_TITLES[$i]}"
  body="${REQ_BODIES[$i]}"
  if [ "$INTERACTIVE" -eq 1 ]; then
    interactive_gate "$req_num" "$title" "${body:-}"
    answer=$?
    if [ "$answer" -eq 1 ]; then
      ABORTED=1
      printf '\n%sAborted by user at requirement %02d.%s\n' "$C_BOLD$C_YELLOW" "$req_num" "$C_RESET"
      break
    fi
    if [ "$answer" -eq 2 ]; then
      SKIPPED=$((SKIPPED + 1))
      SKIPPED_TITLES+=("[$req_num] $title")
      print_skip_block "$req_num" "$title"
      continue
    fi
  fi
  verify_requirement "$req_num" "$title" "$body"
done

# ---------------------------------------------------------------------------
# Executive summary
# ---------------------------------------------------------------------------
print_executive_summary() {
  [ "$SUMMARY_PRINTED" -eq 1 ] && return 0
  SUMMARY_PRINTED=1
  refresh_end_quota

  local tested pct
  tested=$((PASSED + FAILED))
  pct="$(awk -v p="$PASSED" -v t="$tested" 'BEGIN { if (t > 0) printf "%.1f", p * 100 / t; else printf "0.0" }')"

  rule
  printf '%sEXECUTIVE SUMMARY%s\n' "$C_BOLD$C_CYAN" "$C_RESET"
  rule
  printf 'Total Requirements Parsed  : %d\n' "$PARSED_TOTAL"
  printf 'Total Requirements Tested  : %d (of %d scheduled)\n' "$tested" "$REQ_COUNT"
  printf 'Total Passed               : %d\n' "$PASSED"
  printf 'Total Failed               : %d\n' "$FAILED"
  printf 'Total Skipped              : %d\n' "$SKIPPED"
  printf 'Overall Compliance         : %s%% (passed / tested; skipped excluded)\n' "$pct"
  printf '\n'
  printf 'Total OpenRouter API Calls : %d\n' "$OR_API_CALLS"
  if [ "$NO_LLM" -eq 1 ]; then
    printf 'Starting Quota             : n/a (LLM disabled)\n'
    printf 'Remaining Daily Quota      : n/a\n'
  else
    if [ -n "$START_QUOTA_REMAINING" ] && [ -n "$START_QUOTA_LIMIT" ]; then
      printf 'Starting Quota             : %s/%s\n' "$START_QUOTA_REMAINING" "$START_QUOTA_LIMIT"
    else
      printf 'Starting Quota             : n/a\n'
    fi
    if [ -n "$END_QUOTA_REMAINING" ] && [ -n "$END_QUOTA_LIMIT" ]; then
      printf 'Remaining Daily Quota      : %s/%s\n' "$END_QUOTA_REMAINING" "$END_QUOTA_LIMIT"
    else
      printf 'Remaining Daily Quota      : n/a\n'
    fi
    printf 'Quota Reset                : 00:00 UTC (in %s)\n' "$(duration_fmt "$(secs_until_utc_midnight)")"
  fi

  if [ "$FAILED" -gt 0 ]; then
    printf '\nFailed requirements:\n'
    for t in "${FAILED_TITLES[@]+"${FAILED_TITLES[@]}"}"; do
      printf '  - %s\n' "$t"
    done
  fi
  if [ "$SKIPPED" -gt 0 ]; then
    printf '\nSkipped requirements:\n'
    for t in "${SKIPPED_TITLES[@]+"${SKIPPED_TITLES[@]}"}"; do
      printf '  - %s\n' "$t"
    done
  fi

  printf '\n'
  if [ "$FAILED" -gt 0 ]; then
    printf 'Result                     : FAIL\n'
  elif [ "$ABORTED" -eq 1 ]; then
    printf 'Result                     : ABORTED (incomplete)\n'
  elif [ "$SKIPPED" -gt 0 ]; then
    printf 'Result                     : INCOMPLETE (requirements skipped)\n'
  else
    printf 'Result                     : PASS\n'
  fi
  rule

  if [ "$FAILED" -ne 0 ] || [ "$SKIPPED" -ne 0 ] || [ "$ABORTED" -ne 0 ]; then
    KEEP_ON_FAIL=1
  fi
  if [ "$KEEP_ON_FAIL" -eq 1 ] || [ "$KEEP_LOGS" -eq 1 ]; then
    printf 'Artifacts: %s\n' "$WORKDIR"
  fi
}

print_executive_summary

if [ "$ABORTED" -ne 0 ] || [ "$FAILED" -ne 0 ] || [ "$SKIPPED" -ne 0 ]; then
  exit 1
fi
exit 0
