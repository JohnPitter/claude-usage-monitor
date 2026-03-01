# Claude Usage Monitor

<div align="center">

![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-orange?style=for-the-badge&logo=anthropic)
![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=nodedotjs)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Version](https://img.shields.io/badge/Version-1.1.0-purple?style=for-the-badge)

**See your Claude Code usage limits at a glance — always**

*Startup card, persistent status line, live updates, and zero configuration*

[Installation](#installation) •
[Features](#features) •
[Output](#output) •
[Status Line](#status-line) •
[Configuration](#configuration) •
[How It Works](#how-it-works)

</div>

---

## Overview

Claude Usage Monitor is a Claude Code plugin that displays your usage consumption in two ways:

1. **Startup card** — Full usage summary shown when you open a session
2. **Status line** — Compact, always-visible bar at the bottom of the terminal that updates live

No commands to remember — it just works.

**What you see:**
- **5-Hour limit** — Current utilization with reset countdown
- **7-Day limit** — Weekly usage across all models
- **Sonnet limit** — Weekly Sonnet-specific usage
- **Plan & Extra Usage** — Your subscription plan and extra credits balance
- **Session cost** — Real-time cost of your current session

---

## Installation

### Requirements

| Requirement | Version |
|-------------|---------|
| Claude Code CLI | Latest |
| Node.js | 18+ |
| Authentication | OAuth (Pro/Max/Team plans) |

### Install via Claude Code

```bash
claude /install-plugin https://github.com/JohnPitter/claude-usage-monitor
```

### Manual Install

1. Clone the repository:

```bash
git clone https://github.com/JohnPitter/claude-usage-monitor.git ~/.claude/plugins/claude-usage-monitor
```

2. Add the hooks and status line to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/plugins/claude-usage-monitor/lib/usage-check.js"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/plugins/claude-usage-monitor/lib/refresh-cache.js"
          }
        ]
      }
    ]
  },
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/plugins/claude-usage-monitor/lib/statusline.js"
  }
}
```

3. Open a new Claude Code session.

---

## Features

| Feature | Description |
|---------|-------------|
| **Startup Card** | Full usage summary shown on session start via `systemMessage` |
| **Status Line** | Compact bar at the bottom of the terminal, always visible |
| **Live Updates** | Usage data refreshes automatically after each Claude response |
| **Progress Bars** | Unicode bars (█/░) with color-coded thresholds |
| **Status Icons** | ✅ (<60%), ⚡ (60-80%), ⚠️ (>80%) |
| **Smart Alerts** | Warning when approaching any limit |
| **Reset Countdown** | Time until each limit resets |
| **Session Cost** | Real-time session cost in the status line |
| **Extra Usage** | Monthly credit balance if enabled |
| **Token Refresh** | Auto-refreshes expired OAuth tokens |
| **Silent Fallback** | Never blocks session — fails silently on errors |
| **Smart Caching** | Only re-fetches API when cache is older than 2 minutes |
| **Zero Config** | Works out of the box with your existing Claude Code OAuth |

---

## Output

### Startup Card

Displayed once when you open Claude Code, via the `systemMessage` hook output:

```
SessionStart:startup says:
✅ 5-Hour: ████░░░░░░ 42% (resets 2h 15m)
✅ 7-Day: ██████░░░░ 62% (resets 3d)
✅ Sonnet 7-Day: ████░░░░░░ 42% (resets 3d)

Plan: Pro | Extra Usage: $2.40 / $20.00
```

### High Usage Alert

When any limit exceeds 80%:

```
⚠️ 5-Hour: ██████████ 95% (resets 45m)
   ⚠️ WARNING: Approaching 5-Hour limit!
✅ 7-Day: ██████░░░░ 62% (resets 3d)
✅ Sonnet 7-Day: ████░░░░░░ 42% (resets 3d)

Plan: Max | Extra Usage: $10.49 / $275.00
```

### API Key Mode

If using an API key instead of OAuth:

```
Claude Code Usage: API Key mode (no usage limits available)
```

---

## Status Line

The status line sits at the bottom of your terminal, alongside the permission mode indicator. It shows a compact, color-coded summary that updates after each Claude response.

```
5h █░░░░ 21%(2h)  7d █░░░░ 29%(4d)  $10/275  session:$0.15
```

| Element | Description |
|---------|-------------|
| `5h █░░░░ 21%(2h)` | 5-hour limit: mini bar, percentage, reset time |
| `7d █░░░░ 29%(4d)` | 7-day limit: mini bar, percentage, reset time |
| `$10/275` | Extra usage: used / monthly limit |
| `session:$0.15` | Current session cost (from Claude Code) |

### Color Coding

The status line uses ANSI colors for quick visual scanning:

| Color | Usage Level |
|-------|-------------|
| Green | Below 60% |
| Yellow | 60% - 80% |
| Red | Above 80% |

---

## Configuration

**No configuration needed.** The plugin reads your existing Claude Code OAuth credentials from `~/.claude/.credentials.json`.

### Behavior

| Scenario | Behavior |
|----------|----------|
| OAuth connected | Full startup card + live status line |
| API key only | Startup message (no usage limits) |
| No credentials | Silent |
| API timeout (>5s) | Silent |
| Token expired | Auto-refreshes, then shows data |
| Network error | Silent |

---

## How It Works

### Architecture

```
SessionStart hook                   Stop hook
       │                                │
       ▼                                ▼
  usage-check.js                 refresh-cache.js
       │                                │
       ├─► Fetch API ──────────────────►├─► Fetch API (if cache >2min)
       ├─► systemMessage (user sees)    │
       ├─► additionalContext (Claude)   │
       └─► Write cache ◄───────────────└─► Write cache
                │
                ▼
        ~/.claude/.usage-cache.json
                │
                ▼
         statusline.js ──► Status bar (after each response)
```

### Flow

1. **SessionStart** — `usage-check.js` fetches the Anthropic Usage API, displays the startup card via `systemMessage`, injects data as `additionalContext`, and caches the response
2. **Status line** — `statusline.js` reads the cached data and session info (cost, model) from stdin, outputs a compact colored summary
3. **Stop hook** — `refresh-cache.js` runs after each Claude response; if the cache is older than 2 minutes, re-fetches the API to keep the status line current

### API

The plugin calls `GET https://api.anthropic.com/api/oauth/usage` with:

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer <oauth_token>` |
| `anthropic-beta` | `oauth-2025-04-20` |

Response fields used:

| Field | Description |
|-------|-------------|
| `five_hour.utilization` | 5-hour rolling window usage (%) |
| `five_hour.resets_at` | When the 5-hour window resets |
| `seven_day.utilization` | 7-day rolling window usage (%) |
| `seven_day_sonnet.utilization` | 7-day Sonnet-specific usage (%) |
| `extra_usage.is_enabled` | Whether extra credits are active |
| `extra_usage.used_credits` | Credits consumed this month (cents) |
| `extra_usage.monthly_limit` | Monthly credit cap (cents) |

---

## Plugin Structure

```
claude-usage-monitor/
├── .claude-plugin/
│   └── plugin.json            # Plugin manifest
├── hooks/
│   ├── hooks.json             # Hook definitions (SessionStart)
│   └── session-start.sh       # Bash wrapper (fallback)
├── lib/
│   ├── usage-check.js         # SessionStart: fetch + display + cache
│   ├── statusline.js          # Status line: compact colored bar
│   └── refresh-cache.js       # Stop hook: refresh cache if stale
├── docs/
│   └── plans/                 # Design documents
├── README.md
├── LICENSE
└── .gitignore
```

---

## Compatibility

| Plan | Startup Card | Status Line | Extra Usage |
|------|-------------|-------------|-------------|
| Pro | All limits | All limits | If enabled |
| Max | All limits | All limits | If enabled |
| Team | All limits | All limits | If enabled |
| Free | API Key message | No data | N/A |
| API Key | API Key message | No data | N/A |

---

## Known Limitations

| Issue | Description | Workaround |
|-------|-------------|------------|
| `CLAUDE_PLUGIN_ROOT` not set | Env var unavailable during SessionStart hooks ([#24529](https://github.com/anthropics/claude-code/issues/24529)) | Use absolute path in `settings.json` hooks |
| Local plugins skip hooks | Locally installed plugins may not execute hooks ([#11509](https://github.com/anthropics/claude-code/issues/11509)) | Add hooks directly to `~/.claude/settings.json` |
| VS Code extension | `systemMessage` not displayed in VS Code ([#15344](https://github.com/anthropics/claude-code/issues/15344)) | Use the CLI for full experience |

---

## License

MIT License — see [LICENSE](LICENSE) file.

---

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

## Support

- **Issues:** [GitHub Issues](https://github.com/JohnPitter/claude-usage-monitor/issues)
- **Discussions:** [GitHub Discussions](https://github.com/JohnPitter/claude-usage-monitor/discussions)
