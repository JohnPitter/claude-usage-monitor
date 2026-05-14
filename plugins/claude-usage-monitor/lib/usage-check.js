#!/usr/bin/env node

/**
 * Claude Usage Monitor — SessionStart Hook
 *
 * Reads OAuth credentials from the platform-appropriate store
 * (macOS Keychain / Windows Credential Manager / Linux file),
 * fetches usage limits from Anthropic API, and outputs JSON
 * with usage data as additionalContext for the session. Also
 * auto-configures the persistent statusLine on first run.
 *
 * Silent on any error — never blocks session start.
 */

const { writeFile } = require("fs/promises");
const { homedir } = require("os");
const { join, dirname } = require("path");

const { readCredentials, writeCredentials } = require("./credentials");
const { ensureStatusLineConfigured } = require("./settings-writer");

const SETTINGS_PATH = join(homedir(), ".claude", "settings.json");
const CACHE_PATH = join(homedir(), ".claude", ".usage-cache.json");
const CLAUDE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const TOKEN_REFRESH_MARGIN = 10 * 60 * 1000;
const REQUEST_TIMEOUT = 5000;

const PLUGIN_ROOT = dirname(__dirname);

// ─── Credentials ────────────────────────────────────────────

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

    await writeCredentials({ ...creds, claudeAiOauth: newOauth });

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

function readThinkingMode() {
  try {
    const raw = require("fs").readFileSync(SETTINGS_PATH, "utf-8");
    const settings = JSON.parse(raw);
    return settings.alwaysThinkingEnabled === true;
  } catch {
    return false;
  }
}

function buildUsageCard(usage, creds, statusLineNotice) {
  const subType = creds?.claudeAiOauth?.subscriptionType ?? "Unknown";
  const planLabel = subType.charAt(0).toUpperCase() + subType.slice(1);
  const thinking = readThinkingMode();

  const lines = [];

  const entries = [
    { label: "Opus (5-hour rolling)", data: usage.five_hour },
    { label: "All models (7-day rolling)", data: usage.seven_day },
    { label: "Sonnet (7-day rolling)", data: usage.seven_day_sonnet },
  ];

  for (const { label, data } of entries) {
    if (!data) continue;
    const fraction = normalizeUtilization(data.utilization);
    const pct = Math.round(fraction * 100);
    const bar = renderBar(fraction);
    const icon = getStatusIcon(fraction);
    const reset = formatResetTime(data.resets_at);

    lines.push(`${icon} ${label}: ${bar} ${pct}% (resets in ${reset})`);

    if (fraction >= 0.8) {
      lines.push(`   \u26A0\uFE0F WARNING: Approaching limit!`);
    }
  }

  lines.push("");

  const extra = usage.extra_usage;
  if (extra?.is_enabled) {
    const used = formatDollars(extra.used_credits);
    const limit = formatDollars(extra.monthly_limit);
    const thinkSuffix = thinking ? " | \uD83E\uDDE0 Thinking: ON" : "";
    lines.push(`Plan: ${planLabel} | Extra: $${used} / $${limit}${thinkSuffix}`);
  } else {
    const thinkSuffix = thinking ? " | \uD83E\uDDE0 Thinking: ON" : "";
    lines.push(`Plan: ${planLabel} | Extra: disabled${thinkSuffix}`);
  }

  if (statusLineNotice) {
    lines.push("");
    lines.push(statusLineNotice);
  }

  return lines.join("\n");
}

function statusLineMessageFor(action) {
  if (action === "added") {
    return "\u2728 Persistent status line enabled. Restart Claude Code to see the bar at the bottom.";
  }
  if (action === "updated") {
    return "\u2728 Status line path refreshed for the current plugin version. Restart Claude Code to apply.";
  }
  return "";
}

// ─── Output ─────────────────────────────────────────────────

function outputUsage(card, context) {
  const result = {
    systemMessage: card,
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

// ─── Native rate_limits support (CLI v2.1.80+) ─────────────

/**
 * Check if a fresh native cache exists (written by statusline.js
 * from the CLI's rate_limits field). If so, reuse it instead of
 * making an API call.
 */
function readNativeCache() {
  try {
    const raw = require("fs").readFileSync(CACHE_PATH, "utf-8");
    const cache = JSON.parse(raw);
    if (cache.source === "native" && cache.ts && (Date.now() - cache.ts < 5 * 60 * 1000)) {
      return cache.usage;
    }
  } catch {}
  return null;
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const statusLineAction = await ensureStatusLineConfigured({
    pluginRoot: PLUGIN_ROOT,
  }).catch(() => "deferred");
  const statusLineNotice = statusLineMessageFor(statusLineAction);

  // First check if we have fresh native data (no API call needed)
  const nativeUsage = readNativeCache();
  if (nativeUsage) {
    const creds = await readCredentials();
    const card = buildUsageCard(nativeUsage, creds, statusLineNotice);
    outputUsage(card, card);
    return;
  }

  const { token, creds } = await getOAuthToken();

  if (!token) {
    if (creds && !creds.claudeAiOauth) {
      outputUsage(
        "Claude Code Usage: API Key mode (no usage limits available)",
        "User is in API Key mode, no usage limits available."
      );
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

  // Cache usage data for the status line
  try {
    await writeFile(CACHE_PATH, JSON.stringify({ usage, ts: Date.now() }), "utf-8");
  } catch {
    // non-critical, status line will just show "no data"
  }

  const card = buildUsageCard(usage, creds, statusLineNotice);
  outputUsage(card, card);
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
