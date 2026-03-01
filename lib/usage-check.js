#!/usr/bin/env node

/**
 * Claude Usage Monitor — SessionStart Hook
 *
 * Reads OAuth credentials from ~/.claude/.credentials.json,
 * fetches usage limits from Anthropic API, and outputs JSON
 * with usage data as additionalContext for the session.
 *
 * Silent on any error — never blocks session start.
 */

const { readFile, writeFile } = require("fs/promises");
const { homedir } = require("os");
const { join } = require("path");

const CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");
const CLAUDE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const TOKEN_REFRESH_MARGIN = 10 * 60 * 1000;
const REQUEST_TIMEOUT = 5000;

// ─── Credentials ────────────────────────────────────────────

async function readCredentials() {
  try {
    const raw = await readFile(CREDENTIALS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function refreshOAuthToken(creds) {
  const oauth = creds.claudeAiOauth;
  if (!oauth?.refreshToken) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const res = await fetch("https://console.anthropic.com/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: oauth.refreshToken,
        client_id: CLAUDE_OAUTH_CLIENT_ID,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();

    const newOauth = {
      ...oauth,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? oauth.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    const updatedCreds = { ...creds, claudeAiOauth: newOauth };
    await writeFile(CREDENTIALS_PATH, JSON.stringify(updatedCreds, null, 2), "utf-8");

    return data.access_token;
  } catch {
    return null;
  }
}

async function getOAuthToken() {
  const creds = await readCredentials();
  const oauth = creds?.claudeAiOauth;
  if (!oauth?.accessToken) return { token: null, creds };

  const needsRefresh = oauth.expiresAt && (oauth.expiresAt - Date.now() < TOKEN_REFRESH_MARGIN);
  if (needsRefresh && oauth.refreshToken) {
    const newToken = await refreshOAuthToken(creds);
    return { token: newToken ?? oauth.accessToken, creds };
  }

  return { token: oauth.accessToken, creds };
}

// ─── API ────────────────────────────────────────────────────

async function fetchUsageLimits(token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "User-Agent": "claude-usage-monitor/1.0.0",
    },
    signal: controller.signal,
  });

  clearTimeout(timeout);

  if (!res.ok) return null;

  return res.json();
}

// ─── Rendering ──────────────────────────────────────────────

function normalizeUtilization(raw) {
  if (raw == null) return 0;
  const pct = Math.max(0, Math.min(100, raw));
  return pct / 100;
}

function getStatusIcon(fraction) {
  if (fraction >= 0.8) return "\u26A0\uFE0F";
  if (fraction >= 0.6) return "\u26A1";
  return "\u2705";
}

function renderBar(fraction) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(clamped * 10);
  const empty = 10 - filled;
  return "\u2588".repeat(filled) + "\u2591".repeat(empty);
}

function formatResetTime(resetsAt) {
  if (!resetsAt) return "";

  const now = Date.now();
  const resetMs = new Date(resetsAt).getTime();
  const diffMs = resetMs - now;

  if (diffMs <= 0) return "soon";

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }

  if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  return `${minutes}m`;
}

function formatDollars(cents) {
  if (cents == null) return "0.00";
  const dollars = cents >= 1000 ? cents / 100 : cents;
  return dollars.toFixed(2);
}

function buildUsageContext(usage, creds) {
  const subType = creds?.claudeAiOauth?.subscriptionType ?? "Unknown";
  const planLabel = subType.charAt(0).toUpperCase() + subType.slice(1);

  const lines = [];
  lines.push("Claude Code Usage Monitor:");
  lines.push("");

  const entries = [
    { label: "5-Hour", data: usage.five_hour },
    { label: "7-Day", data: usage.seven_day },
    { label: "Sonnet 7-Day", data: usage.seven_day_sonnet },
  ];

  for (const { label, data } of entries) {
    if (!data) continue;
    const fraction = normalizeUtilization(data.utilization);
    const pct = Math.round(fraction * 100);
    const bar = renderBar(fraction);
    const icon = getStatusIcon(fraction);
    const reset = formatResetTime(data.resets_at);

    lines.push(`${icon} ${label}: ${bar} ${pct}% (resets ${reset})`);

    if (fraction >= 0.8) {
      lines.push(`   \u26A0\uFE0F WARNING: Approaching ${label} limit!`);
    }
  }

  lines.push("");

  const extra = usage.extra_usage;
  if (extra?.is_enabled) {
    const used = formatDollars(extra.used_credits);
    const limit = formatDollars(extra.monthly_limit);
    lines.push(`Plan: ${planLabel} | Extra Usage: $${used} / $${limit}`);
  } else {
    lines.push(`Plan: ${planLabel} | Extra Usage: disabled`);
  }

  return lines.join("\n");
}

// ─── Output ─────────────────────────────────────────────────

function outputJson(context) {
  const result = {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  };
  console.log(JSON.stringify(result));
}

function outputEmpty() {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: "",
    },
  }));
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const { token, creds } = await getOAuthToken();

  if (!token) {
    if (creds && !creds.claudeAiOauth) {
      outputJson("Claude Code Usage: API Key mode (no usage limits available)");
    } else {
      outputEmpty();
    }
    return;
  }

  const usage = await fetchUsageLimits(token);
  if (!usage) {
    outputEmpty();
    return;
  }

  outputJson(buildUsageContext(usage, creds));
}

// Run with global timeout
const globalTimeout = setTimeout(() => {
  outputEmpty();
  process.exit(0);
}, REQUEST_TIMEOUT);
globalTimeout.unref();

main()
  .catch(() => outputEmpty())
  .finally(() => clearTimeout(globalTimeout));
