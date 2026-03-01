# Claude Usage Monitor — Design Document

## Overview

Claude Code CLI plugin that displays a usage consumption card on every session start. Uses Anthropic's OAuth API to fetch real-time usage limits and renders a colored ASCII card in the terminal.

## Architecture

**Type:** SessionStart hook → Node.js script

**Flow:**
1. Hook `SessionStart` triggers `lib/usage-check.js`
2. Script reads `~/.claude/.credentials.json` for OAuth token
3. Calls `https://api.anthropic.com/api/oauth/usage` with Bearer token
4. Parses response and renders ASCII card with colored progress bars
5. If token expired, refreshes via `https://console.anthropic.com/v1/oauth/token`

## Plugin Structure

```
claude-usage-monitor/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   ├── hooks.json
│   └── usage-check.sh          # Wrapper that calls Node.js
├── lib/
│   └── usage-check.js          # Main logic (Node.js)
├── docs/
│   └── plans/
│       └── 2026-03-01-usage-monitor-design.md
├── README.md
└── LICENSE
```

## Hook Configuration

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/lib/usage-check.js\""
          }
        ]
      }
    ]
  }
}
```

## Script Flow (usage-check.js)

1. **Read credentials** — `~/.claude/.credentials.json` → extract `claudeAiOauth`
2. **Check token** — If `expiresAt - now < 10min`, refresh
3. **Call API** — `GET api.anthropic.com/api/oauth/usage` with Bearer token
4. **Parse response** — Extract `five_hour`, `seven_day`, `seven_day_sonnet`, `extra_usage`
5. **Render card** — ASCII progress bars with ANSI colors based on thresholds
6. **Output via stdout** — Hook captures stdout and displays to user
7. **Silent fallback** — On any error (no credentials, API offline, no OAuth), display nothing

**Timeout:** 5 seconds max. If API doesn't respond, silently ignore.

## Card Output

### Normal (all < 60%):
```
┌─ Claude Code Usage ─────────────────────────┐
│  5-Hour:   ████░░░░░░ 42%  (resets 2h15m)  │
│  7-Day:    ██████░░░░ 62%  (resets 3d)      │
│  Sonnet:   ████░░░░░░ 42%  (resets 3d)      │
│  Plan: Pro  │  Extra: $2.40 / $20.00        │
└─────────────────────────────────────────────┘
```

### With alert (any > 80%):
```
┌─ Claude Code Usage ─────────────────────────┐
│  5-Hour:   ██████████ 95%  (resets 45m)     │
│  ⚠  Approaching 5-hour limit!               │
│  7-Day:    ██████░░░░ 62%  (resets 3d)      │
│  Sonnet:   ████░░░░░░ 42%  (resets 3d)      │
│  Plan: Pro  │  Extra: $2.40 / $20.00        │
└─────────────────────────────────────────────┘
```

### API Key mode (no OAuth):
```
┌─ Claude Code Usage ─────────────────────────┐
│  Mode: API Key (no usage limits available)  │
└─────────────────────────────────────────────┘
```

## Color Thresholds

| Usage Level | Color | ANSI Code |
|-------------|-------|-----------|
| < 60% | Green | `\x1b[32m` |
| 60-80% | Yellow | `\x1b[33m` |
| > 80% | Red | `\x1b[31m` |

## Rendering Rules

- Progress bar: 10 chars (`█` filled, `░` empty)
- Each bar colored individually per threshold
- Alert line only appears if any limit > 80%
- If `extra_usage` not enabled, shows `Extra: disabled`
- If no `seven_day_sonnet`, omit Sonnet line
- `resets` = difference between `resetsAt` and `now`, formatted as `Xh Ym` or `Xd`

## API Details

**Usage endpoint:** `GET https://api.anthropic.com/api/oauth/usage`
- Header: `Authorization: Bearer <token>`
- Header: `anthropic-beta: oauth-2025-04-20`

**Token refresh:** `POST https://console.anthropic.com/v1/oauth/token`
- Body: `{ grant_type: "refresh_token", refresh_token: "<token>", client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e" }`

**Response shape:**
```json
{
  "five_hour": { "utilization": 0.42, "resets_at": "2026-03-01T15:00:00Z" },
  "seven_day": { "utilization": 0.62, "resets_at": "2026-03-04T00:00:00Z" },
  "seven_day_sonnet": { "utilization": 0.42, "resets_at": "2026-03-04T00:00:00Z" },
  "extra_usage": {
    "is_enabled": true,
    "monthly_limit": 20.0,
    "used_credits": 2.40,
    "utilization": 0.12
  }
}
```

## Error Handling

- No credentials file → silent exit
- No `claudeAiOauth` key → show API Key card
- Token expired + refresh fails → silent exit
- API returns non-200 → silent exit
- Timeout (>5s) → silent exit
- Any unexpected error → silent exit (never block session start)
