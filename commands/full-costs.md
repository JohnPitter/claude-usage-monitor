---
name: full-costs
description: Display detailed Claude Code usage with progress bars, reset timers, and extra credits info
user_invocable: true
---

Run the full-costs script using Bash and display its output to the user:

```
node ~/.claude/plugins/cache/local/claude-usage-monitor/1.0.0/lib/full-costs.js
```

If that path fails, try:

```
node ~/.claude/plugins/claude-usage-monitor/lib/full-costs.js
```

Display the EXACT output from the command to the user. Do not modify, summarize, or paraphrase it — the output is already formatted as markdown.
