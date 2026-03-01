# Claude Usage Monitor

<div align="center">

![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-orange?style=for-the-badge&logo=anthropic)
![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=nodedotjs)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

**See your Claude Code usage limits every time you start a session**

*Colored progress bars, smart alerts, and zero configuration*

[Installation](#installation) •
[Features](#features) •
[Output](#output) •
[Configuration](#configuration) •
[How It Works](#how-it-works)

</div>

---

## Overview

Claude Usage Monitor is a Claude Code plugin that automatically displays your usage consumption when you open a session. No commands to remember — it just works.

**What you see on every session start:**
- **5-Hour limit** — Current utilization with reset countdown
- **7-Day limit** — Weekly usage across all models
- **Sonnet limit** — Weekly Sonnet-specific usage
- **Plan & Extra Usage** — Your subscription plan and extra credits balance

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

Clone the repository into your Claude Code plugins directory:

```bash
cd ~/.claude/plugins
git clone https://github.com/JohnPitter/claude-usage-monitor.git
```

**That's it!** Open a new Claude Code session and you'll see your usage card.

---

## Features

| Feature | Description |
|---------|-------------|
| **Auto Display** | Shows usage on every session start via SessionStart hook |
| **Progress Bars** | 10-char ASCII bars with filled/empty indicators |
| **Color Coding** | Green (<60%), Yellow (60-80%), Red (>80%) |
| **Smart Alerts** | Warning message when approaching any limit |
| **Reset Countdown** | Shows time until each limit resets |
| **Extra Usage** | Displays monthly credit balance if enabled |
| **Token Refresh** | Auto-refreshes expired OAuth tokens |
| **Silent Fallback** | Never blocks session start — fails silently on errors |
| **Zero Config** | Works out of the box with your existing Claude Code OAuth |
| **Fast** | 5-second timeout — won't slow down your workflow |

---

## Output

### Normal Usage

```
┌─ Claude Code Usage ────────────────────────────┐
│  5-Hour:   ████░░░░░░  42%  (resets 2h 15m)   │
│  7-Day:    ██████░░░░  62%  (resets 3d)        │
│  Sonnet:   ████░░░░░░  42%  (resets 3d)        │
│  Plan: Pro  │  Extra: $2.40 / $20.00           │
└─────────────────────────────────────────────────┘
```

### High Usage Alert

When any limit exceeds 80%, you get a colored warning:

```
┌─ Claude Code Usage ────────────────────────────┐
│  5-Hour:   ██████████  95%  (resets 45m)       │
│  ⚠  Approaching 5-hour limit!                  │
│  7-Day:    ██████░░░░  62%  (resets 3d)        │
│  Sonnet:   ████░░░░░░  42%  (resets 3d)        │
│  Plan: Pro  │  Extra: $2.40 / $20.00           │
└─────────────────────────────────────────────────┘
```

### API Key Mode

If using an API key instead of OAuth:

```
┌─ Claude Code Usage ────────────────────────────┐
│  Mode: API Key (no usage limits available)     │
└─────────────────────────────────────────────────┘
```

---

## Configuration

**No configuration needed.** The plugin reads your existing Claude Code OAuth credentials from `~/.claude/.credentials.json`.

### Color Thresholds

| Usage Level | Color | Indicator |
|-------------|-------|-----------|
| Below 60% | Green | Normal usage |
| 60% - 80% | Yellow | Moderate usage |
| Above 80% | Red | High usage + alert message |

### Behavior

| Scenario | Behavior |
|----------|----------|
| OAuth connected | Shows full usage card with all limits |
| API key only | Shows simplified card |
| No credentials | Silent — shows nothing |
| API timeout (>5s) | Silent — shows nothing |
| Token expired | Auto-refreshes, then shows card |
| Network error | Silent — shows nothing |

---

## How It Works

1. **SessionStart hook** triggers when you open Claude Code
2. Plugin reads `~/.claude/.credentials.json` for OAuth token
3. If token is expiring soon (<10min), auto-refreshes it
4. Calls `api.anthropic.com/api/oauth/usage` with Bearer token
5. Parses response and renders colored ASCII card
6. Outputs card to terminal — Claude Code displays it

### API Response

The plugin reads these fields from the Anthropic Usage API:

| Field | Description |
|-------|-------------|
| `five_hour.utilization` | 5-hour rolling window usage (%) |
| `five_hour.resets_at` | When the 5-hour window resets |
| `seven_day.utilization` | 7-day rolling window usage (%) |
| `seven_day_sonnet.utilization` | 7-day Sonnet-specific usage (%) |
| `extra_usage.is_enabled` | Whether extra credits are active |
| `extra_usage.used_credits` | Credits consumed this month |
| `extra_usage.monthly_limit` | Monthly credit cap |

---

## Plugin Structure

```
claude-usage-monitor/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest
├── hooks/
│   └── hooks.json           # SessionStart hook config
├── lib/
│   └── usage-check.js       # Main script (Node.js)
├── docs/
│   └── plans/               # Design documents
├── README.md
├── LICENSE
└── .gitignore
```

---

## Compatibility

| Plan | Usage Card | Extra Usage |
|------|-----------|-------------|
| Pro | All limits | If enabled |
| Max | All limits | If enabled |
| Team | All limits | If enabled |
| Free | API Key card | N/A |
| API Key | API Key card | N/A |

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
