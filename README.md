# Claude Usage Monitor

<div align="center">

![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-orange?style=for-the-badge&logo=anthropic)
![Version](https://img.shields.io/badge/Version-1.3.0-purple?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=nodedotjs)

**See your Claude Code usage limits at a glance — always.**

*Startup card + persistent status line + live updates + zero configuration*

> **v1.3.0** — Reads OAuth credentials from the macOS Keychain and Windows Credential Manager, and configures the persistent status line on first run. No more manual `settings.json` edits.

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

A compact bar at the bottom of your terminal, always visible. Refreshes after each response **and** on a configurable timer (default 60 s) so you can see usage drain in real time even while idle:

```
Opus 4.7    Opus 5h █░░░░ 21%(2h)    All 7d █░░░░ 29%(4d)    Ctx ██░░░ 245k/1.0M    Think:ON
Sonnet 4.6  Sonnet 7d ██░░░ 33%(4d)  All 7d █░░░░ 29%(4d)    Ctx █░░░░ 45.2k/1.0M
Haiku 4.5   Haiku 7d █░░░░ 12%(4d)   All 7d █░░░░ 29%(4d)    Ctx █░░░░ 12.1k/200k
```

The order is always: **model name → model-specific limit → All 7d → context window → thinking mode**. Each model shows its own relevant limit first (Opus shows the 5-hour window, Sonnet/Haiku show their 7-day windows), then the shared all-models 7-day window.

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
| **Current Model** | Status line shows which model is active (`Opus 4.7`, `Sonnet 4.6`, `Haiku 4.5`, …) |
| **Live Updates** | Refreshes after each Claude response **and** on a configurable interval (default 60 s) so usage stays accurate even while idle |
| **Context Window** | Live `Ctx` bar showing tokens used vs the model's context limit |
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

**Automatic on first run** (since v1.3.0). On the first session start after install, the plugin writes the correct `statusLine` block into your `~/.claude/settings.json` — no manual edit needed. Restart Claude Code once and the bar appears at the bottom of your terminal.

The plugin only writes if `statusLine` is missing or already points to itself. If you have a different status line (`ccstatusline`, `starship-claude`, etc.), the plugin leaves your config alone.

To customize, edit `~/.claude/settings.json` directly:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /absolute/path/to/lib/statusline.js",
    "refreshInterval": 60
  }
}
```

`refreshInterval` (in seconds) tells Claude Code to re-run the status line on a timer in addition to the default event-driven updates. Set it to `60` for once-a-minute refreshes, or omit it if you only want updates after each assistant turn. Minimum value is `1`.

---

## Configuration

**No configuration needed.** The plugin reads your existing Claude Code OAuth credentials from the platform's secure storage:

| Platform | Source |
|----------|--------|
| macOS | Keychain item `Claude Code-credentials` |
| Windows | Credential Manager target `Claude Code-credentials` |
| Linux | `~/.claude/.credentials.json` |

If the secure store lookup fails on macOS or Windows, the plugin falls back to `~/.claude/.credentials.json`, so manual file installs still work.

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
| Windows credentials reader | Implemented from Win32 API docs but not yet exercised on a real Windows host | Falls back to `~/.claude/.credentials.json`. Open an issue if you hit a problem. |

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
