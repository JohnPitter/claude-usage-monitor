#!/usr/bin/env bash
# Claude Usage Monitor — SessionStart hook

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

node "${PLUGIN_ROOT}/lib/usage-check.js" 2>/dev/null || echo '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":""}}'

exit 0
