#!/usr/bin/env node

/**
 * Claude Usage Monitor — SessionStart Hook
 *
 * Reads OAuth credentials from ~/.claude/.credentials.json,
 * fetches usage limits from Anthropic API, and renders a
 * colored ASCII card in the terminal.
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

// ANSI color codes
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

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

/**
 * Normalize utilization value to a 0-1 fraction.
 * The API returns percentage values (e.g. 42.0 = 42%).
 */
function normalizeUtilization(raw) {
  if (raw == null) return 0;
  // API returns values like 6.0, 28.0, 42.0 (already percentages)
  // Clamp to 0-100 range, then convert to 0-1
  const pct = Math.max(0, Math.min(100, raw));
  return pct / 100;
}

function getColor(fraction) {
  if (fraction >= 0.8) return RED;
  if (fraction >= 0.6) return YELLOW;
  return GREEN;
}

function renderBar(fraction) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(clamped * 10);
  const empty = 10 - filled;
  const color = getColor(clamped);
  return `${color}${"█".repeat(filled)}${DIM}${"░".repeat(empty)}${RESET}`;
}

function formatPercent(fraction) {
  const pct = Math.round(fraction * 100);
  const color = getColor(fraction);
  return `${color}${String(pct).padStart(3)}%${RESET}`;
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

/**
 * Strip ANSI escape codes to calculate visible string length.
 */
function visibleLength(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "").length;
}

/**
 * Pad a string containing ANSI codes to a target visible width.
 */
function ansiPadEnd(str, targetWidth) {
  const visible = visibleLength(str);
  const padding = Math.max(0, targetWidth - visible);
  return str + " ".repeat(padding);
}

function renderUsageLine(label, entry) {
  if (!entry) return null;

  const fraction = normalizeUtilization(entry.utilization);
  const bar = renderBar(fraction);
  const pct = formatPercent(fraction);
  const reset = formatResetTime(entry.resets_at);
  const paddedLabel = label.padEnd(8);

  return { content: `  ${paddedLabel} ${bar} ${pct}  ${DIM}(resets ${reset})${RESET}`, fraction };
}

function formatDollars(cents) {
  if (cents == null) return "0.00";
  // API may return cents (27500 = $275.00) or dollars — normalize
  // Values > 1000 are likely cents
  const dollars = cents >= 1000 ? cents / 100 : cents;
  return dollars.toFixed(2);
}

/** Wraps content in box row: │ <content padded to W> │ */
function boxRow(content, W) {
  return `${DIM}│${RESET}${ansiPadEnd(content, W - 2)}${DIM}│${RESET}`;
}

function renderCard(usage, creds) {
  const extra = usage.extra_usage;

  const subType = creds?.claudeAiOauth?.subscriptionType ?? "Unknown";
  const planLabel = subType.charAt(0).toUpperCase() + subType.slice(1);

  const lines = [];
  const W = 49; // total inner width between │ and │

  // Top border
  lines.push(`${DIM}┌─${RESET}${BOLD} Claude Code Usage ${RESET}${DIM}${"─".repeat(W - 21)}┐${RESET}`);

  // Usage lines with alerts
  const entries = [
    { label: "5-Hour:", data: usage.five_hour, alertName: "5-hour" },
    { label: "7-Day:", data: usage.seven_day, alertName: "7-day" },
    { label: "Sonnet:", data: usage.seven_day_sonnet, alertName: "Sonnet" },
  ];

  for (const { label, data, alertName } of entries) {
    const result = renderUsageLine(label, data);
    if (!result) continue;

    lines.push(boxRow(result.content, W));

    if (result.fraction >= 0.8) {
      lines.push(boxRow(`  ${RED}${BOLD}\u26A0  Approaching ${alertName} limit!${RESET}`, W));
    }
  }

  // Plan + Extra usage line
  let extraStr;
  if (extra?.is_enabled) {
    const used = formatDollars(extra.used_credits);
    const limit = formatDollars(extra.monthly_limit);
    extraStr = `Extra: $${used} / $${limit}`;
  } else {
    extraStr = "Extra: disabled";
  }

  lines.push(boxRow(`  Plan: ${CYAN}${planLabel}${RESET}  ${DIM}│${RESET}  ${extraStr}`, W));

  // Bottom border
  lines.push(`${DIM}└${"─".repeat(W)}┘${RESET}`);

  return lines.join("\n");
}

function renderApiKeyCard() {
  const W = 49;
  const lines = [];
  lines.push(`${DIM}┌─${RESET}${BOLD} Claude Code Usage ${RESET}${DIM}${"─".repeat(W - 21)}┐${RESET}`);
  lines.push(boxRow(`  Mode: API Key ${DIM}(no usage limits available)${RESET}`, W));
  lines.push(`${DIM}└${"─".repeat(W)}┘${RESET}`);
  return lines.join("\n");
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const { token, creds } = await getOAuthToken();

  // No OAuth credentials — check if API key mode
  if (!token) {
    const rawCreds = await readCredentials();
    if (rawCreds && !rawCreds.claudeAiOauth) {
      console.log(renderApiKeyCard());
    }
    // No credentials at all — silent exit
    return;
  }

  const usage = await fetchUsageLimits(token);
  if (!usage) return;

  console.log(renderCard(usage, creds));
}

// Run with global timeout
const globalTimeout = setTimeout(() => process.exit(0), REQUEST_TIMEOUT);
globalTimeout.unref();

main()
  .catch(() => {})
  .finally(() => clearTimeout(globalTimeout));
