# Claude Usage Monitor

<div align="center">

![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-orange?style=for-the-badge&logo=anthropic)
![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=nodedotjs)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

**See your Claude Code usage limits every time you start a session**

*Progress bars, smart alerts, and zero configuration*

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
| **Progress Bars** | 10-char Unicode bars (█/░) with percentage |
| **Status Icons** | ✅ (<60%), ⚡ (60-80%), ⚠️ (>80%) |
| **Smart Alerts** | Warning message when approaching any limit |
| **Reset Countdown** | Shows time until each limit resets |
| **Extra Usage** | Displays monthly credit balance if enabled |
| **Token Refresh** | Auto-refreshes expired OAuth tokens |
| **Silent Fallback** | Never blocks session start — fails silently on errors |
| **Zero Config** | Works out of the box with your existing Claude Code OAuth |
| **Fast** | 5-second timeout — won't slow down your workflow |

---

## Output

The plugin injects usage data as session context via the `additionalContext` hook output. Claude sees this data at the start of every session.

### Normal Usage

```
Claude Code Usage Monitor:

✅ 5-Hour: ████░░░░░░ 42% (resets 2h 15m)
✅ 7-Day: ██████░░░░ 62% (resets 3d)
✅ Sonnet 7-Day: ████░░░░░░ 42% (resets 3d)

Plan: Pro | Extra Usage: $2.40 / $20.00
```

### High Usage Alert

When any limit exceeds 80%, you get a warning:

```
Claude Code Usage Monitor:

⚠️ 5-Hour: ██████████ 95% (resets 45m)
   ⚠️ WARNING: Approaching 5-Hour limit!
✅ 7-Day: ██████░░░░ 62% (resets 3d)
✅ Sonnet 7-Day: ████░░░░░░ 42% (resets 3d)

Plan: Pro | Extra Usage: $2.40 / $20.00
```

### API Key Mode

If using an API key instead of OAuth:

```
Claude Code Usage: API Key mode (no usage limits available)
```

---

## Configuration

**No configuration needed.** The plugin reads your existing Claude Code OAuth credentials from `~/.claude/.credentials.json`.

### Color Thresholds

| Usage Level | Icon | Indicator |
|-------------|------|-----------|
| Below 60% | ✅ | Normal usage |
| 60% - 80% | ⚡ | Moderate usage |
| Above 80% | ⚠️ | High usage + warning message |

### Behavior

| Scenario | Behavior |
|----------|----------|
| OAuth connected | Injects full usage data with all limits |
| API key only | Injects API key mode message |
| No credentials | Silent — empty context |
| API timeout (>5s) | Silent — empty context |
| Token expired | Auto-refreshes, then injects usage data |
| Network error | Silent — empty context |

---

## How It Works

1. **SessionStart hook** triggers when you open Claude Code
2. Plugin reads `~/.claude/.credentials.json` for OAuth token
3. If token is expiring soon (<10min), auto-refreshes it
4. Calls `api.anthropic.com/api/oauth/usage` with Bearer token
5. Parses response and builds usage summary with progress bars
6. Outputs JSON with `hookSpecificOutput.additionalContext` — Claude Code injects it as session context

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
│   ├── hooks.json           # SessionStart hook config
│   └── session-start.sh     # Bash wrapper for Node.js script
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

## Known Limitations

| Issue | Description | Workaround |
|-------|-------------|------------|
| `CLAUDE_PLUGIN_ROOT` not set | The env var is not available during SessionStart hooks ([#24529](https://github.com/anthropics/claude-code/issues/24529)) | Plugin uses `node` command; for manual install, add hook with absolute path to `settings.json` |
| Local plugins skip hooks | Locally installed plugins may not execute hooks ([#11509](https://github.com/anthropics/claude-code/issues/11509)) | Add the hook directly to `~/.claude/settings.json` |

### Manual Hook Setup (if auto-detection doesn't work)

Add this to your `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/claude-usage-monitor/lib/usage-check.js"
          }
        ]
      }
    ]
  }
}
```

Replace `/path/to/` with the actual plugin installation path.

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
