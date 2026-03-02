# Claude Usage Monitor

<div align="center">

![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-orange?style=for-the-badge&logo=anthropic)
![Version](https://img.shields.io/badge/Version-1.1.0-purple?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=nodedotjs)

**See your Claude Code usage limits at a glance — always.**

*Startup card + persistent status line + live updates + zero configuration*

[Installation](#installation) •
[Features](#features) •
[Output](#what-you-see) •
[How It Works](#how-it-works) •
[Contributing](#contributing)

</div>

---

## What You See

### Startup Card

Every time you open a session, a full usage summary appears automatically:

```
✅ Opus (5-hour rolling): ████░░░░░░ 42% (resets in 2h 15m)
✅ All models (7-day rolling): ██████░░░░ 62% (resets in 3d)
✅ Sonnet (7-day rolling): ████░░░░░░ 42% (resets in 3d)

Plan: Max | Extra: $10.49 / $275.00
```

### Status Line

A compact bar at the bottom of your terminal, always visible, updating after each response:

```
Opus 5h █░░░░ 21%(2h)  All 7d █░░░░ 29%(4d)  Sonnet 7d █░░░░ 4%(4d)  Think:OFF
```

### Smart Alerts

When any limit exceeds 80%, you get a warning:

```
⚠️ Opus (5-hour rolling): ██████████ 95% (resets in 45m)
   ⚠️ WARNING: Approaching limit!
✅ All models (7-day rolling): ██████░░░░ 62% (resets in 3d)
✅ Sonnet (7-day rolling): ████░░░░░░ 42% (resets in 3d)

Plan: Max | Extra: $10.49 / $275.00
```

---

## Features

| Feature | Description |
|---------|-------------|
| **Startup Card** | Full usage summary on session start via `systemMessage` |
| **Status Line** | Compact bar at the bottom of the terminal, always visible |
| **Live Updates** | Usage data refreshes after each Claude response |
| **Progress Bars** | Unicode bars with color-coded thresholds (green/yellow/red) |
| **Smart Alerts** | Warning when approaching any limit (>80%) |
| **Reset Countdown** | Time until each limit resets |
| **Thinking Mode** | Shows if extended thinking is ON/OFF (detected from transcript) |
| **Extra Usage** | Monthly credit balance if enabled |
| **Token Refresh** | Auto-refreshes expired OAuth tokens |
| **Silent Fallback** | Never blocks session — fails silently on errors |
| **Smart Caching** | Only re-fetches API when cache is older than 2 minutes |
| **Zero Config** | Works out of the box with your existing Claude Code OAuth |
| **`/full-costs`** | Slash command for detailed usage card on demand |

---

## Installation

### Requirements

| Requirement | Details |
|-------------|---------|
| Claude Code CLI | Latest version |
| Node.js | 18+ |
| Authentication | OAuth (Pro/Max/Team plans) |

### Install via Marketplace (Recommended)

**Step 1:** Add the marketplace

```bash
claude plugin marketplace add https://github.com/JohnPitter/claude-usage-monitor
```

**Step 2:** Install the plugin

```bash
claude plugin install claude-usage-monitor
```

**Step 3:** Open a new Claude Code session — the usage card appears automatically.

### Install via Claude Code

```bash
claude /install-plugin https://github.com/JohnPitter/claude-usage-monitor
```

### Status Line Setup

After installing, add the status line to your `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/plugins/cache/<marketplace-hash>/claude-usage-monitor/1.1.0/lib/statusline.js"
  }
}
```

> **Tip:** The exact path depends on your installation method. Check `~/.claude/plugins/cache/` for your plugin's location, or use the absolute path from `~/.claude/plugins/installed_plugins.json`.

---

## Configuration

**No configuration needed.** The plugin reads your existing Claude Code OAuth credentials from `~/.claude/.credentials.json`.

### Behavior by Scenario

| Scenario | Behavior |
|----------|----------|
| OAuth connected | Full startup card + live status line |
| API key only | Startup message (no usage limits) |
| No credentials | Silent |
| API timeout (>5s) | Silent |
| Token expired | Auto-refreshes, then shows data |
| Network error | Silent |

### Plan Compatibility

| Plan | Startup Card | Status Line | Extra Usage |
|------|:---:|:---:|:---:|
| Pro | All limits | All limits | If enabled |
| Max | All limits | All limits | If enabled |
| Team | All limits | All limits | If enabled |
| Free | API Key msg | No data | N/A |
| API Key | API Key msg | No data | N/A |

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

1. **SessionStart** — `usage-check.js` fetches the Anthropic Usage API, displays the startup card via `systemMessage`, injects data as `additionalContext` for Claude, and caches the response.
2. **Status Line** — `statusline.js` reads cached data and session info (transcript path for thinking detection), outputs a compact colored summary.
3. **Stop Hook** — `refresh-cache.js` runs after each Claude response. If the cache is older than 2 minutes, re-fetches the API to keep the status line current.
4. **`/full-costs`** — On-demand detailed usage card with wider progress bars, timestamps, and extra usage breakdown.

### API

Calls `GET https://api.anthropic.com/api/oauth/usage` with:

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer <oauth_token>` |
| `anthropic-beta` | `oauth-2025-04-20` |

### Color Coding

| Color | Usage Level |
|-------|-------------|
| Green | Below 60% |
| Yellow | 60% - 80% |
| Red | Above 80% |

---

## Plugin Structure

```
claude-usage-monitor/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace manifest
├── plugins/
│   └── claude-usage-monitor/
│       ├── .claude-plugin/
│       │   └── plugin.json       # Plugin metadata
│       ├── hooks/
│       │   ├── hooks.json        # Hook definitions (SessionStart)
│       │   └── session-start.sh  # Bash wrapper (fallback)
│       ├── lib/
│       │   ├── usage-check.js    # SessionStart: fetch + display + cache
│       │   ├── statusline.js     # Status line: compact colored bar
│       │   ├── refresh-cache.js  # Stop hook: refresh cache if stale
│       │   └── full-costs.js     # /full-costs command: detailed card
│       ├── commands/
│       │   └── full-costs.md     # Slash command definition
│       └── LICENSE
├── README.md
└── .gitignore
```

---

## Known Limitations

| Issue | Description | Workaround |
|-------|-------------|------------|
| VS Code extension | `systemMessage` not displayed in VS Code ([#15344](https://github.com/anthropics/claude-code/issues/15344)) | Use the CLI for full experience |
| Status line setup | Requires manual `settings.json` edit | Follow the [Status Line Setup](#status-line-setup) section |

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

## License

MIT License — see [LICENSE](plugins/claude-usage-monitor/LICENSE) file.

---

## Support

- **Issues:** [GitHub Issues](https://github.com/JohnPitter/claude-usage-monitor/issues)
- **Discussions:** [GitHub Discussions](https://github.com/JohnPitter/claude-usage-monitor/discussions)
