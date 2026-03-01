#!/usr/bin/env node

/**
 * Claude Usage Monitor — Full Costs Card (/full-costs command)
 *
 * Fetches fresh usage data and outputs a detailed card
 * with all usage information formatted for display.
 */

const { readFile, writeFile } = require("fs/promises");
const { homedir } = require("os");
const { join } = require("path");

const CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");
const SETTINGS_PATH = join(homedir(), ".claude", "settings.json");
const CACHE_PATH = join(homedir(), ".claude", ".usage-cache.json");
const CLAUDE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const REQUEST_TIMEOUT = 5000;

// ─── Credentials ────────────────────────────────────────────

async function readCredentials() {
  try {
    return JSON.parse(await readFile(CREDENTIALS_PATH, "utf-8"));
  } catch { return null; }
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
    await writeFile(CREDENTIALS_PATH, JSON.stringify({ ...creds, claudeAiOauth: newOauth }, null, 2), "utf-8");
    return data.access_token;
  } catch { return null; }
}

async function getOAuthToken() {
  const creds = await readCredentials();
  const oauth = creds?.claudeAiOauth;
  if (!oauth?.accessToken) return { token: null, creds };
  const needsRefresh = oauth.expiresAt && (oauth.expiresAt - Date.now() < 10 * 60 * 1000);
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
      "User-Agent": "claude-usage-monitor/1.1.0",
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
  return Math.max(0, Math.min(100, raw)) / 100;
}

function renderBar(fraction, width = 20) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(clamped * width);
  const empty = width - filled;
  return "\u2588".repeat(filled) + "\u2591".repeat(empty);
}

function getStatusLabel(fraction) {
  if (fraction >= 0.8) return "CRITICAL";
  if (fraction >= 0.6) return "MODERATE";
  return "OK";
}

function formatResetTime(resetsAt) {
  if (!resetsAt) return "N/A";
  const diffMs = new Date(resetsAt).getTime() - Date.now();
  if (diffMs <= 0) return "resetting now";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const rh = hours % 24;
    return rh > 0 ? `${days}d ${rh}h ${minutes}m` : `${days}d ${minutes}m`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDateTime(isoStr) {
  if (!isoStr) return "N/A";
  const d = new Date(isoStr);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
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

function renderCard(usage, creds) {
  const subType = creds?.claudeAiOauth?.subscriptionType ?? "unknown";
  const planLabel = subType.charAt(0).toUpperCase() + subType.slice(1);
  const extra = usage.extra_usage;
  const thinking = readThinkingMode();

  const entries = [
    {
      title: "Opus (5-hour rolling window)",
      desc: "Limits Opus model usage within a 5-hour period.",
      data: usage.five_hour,
    },
    {
      title: "All Models (7-day rolling window)",
      desc: "Combined usage across Opus, Sonnet, and Haiku over 7 days.",
      data: usage.seven_day,
    },
    {
      title: "Sonnet (7-day rolling window)",
      desc: "Limits Sonnet model usage within a 7-day period.",
      data: usage.seven_day_sonnet,
    },
  ];

  const sections = [];

  for (const { title, desc, data } of entries) {
    if (!data) continue;
    const frac = normalizeUtilization(data.utilization);
    const pct = Math.round(frac * 100);
    const bar = renderBar(frac);
    const status = getStatusLabel(frac);
    const reset = formatResetTime(data.resets_at);
    const resetDate = formatDateTime(data.resets_at);

    let block = "";
    block += `## ${title}\n`;
    block += `${desc}\n\n`;
    block += `\`${bar}\` **${pct}%** — ${status}\n\n`;
    block += `Resets in **${reset}** (${resetDate})`;

    if (frac >= 0.8) {
      block += `\n\n> **WARNING:** Approaching limit! Consider reducing usage or enabling extra credits.`;
    }

    sections.push(block);
  }

  // Extra usage
  let extraBlock = "## Extra Usage (monthly)\n";
  if (extra?.is_enabled) {
    const used = formatDollars(extra.used_credits);
    const limit = formatDollars(extra.monthly_limit);
    const usedNum = parseFloat(used);
    const limitNum = parseFloat(limit);
    const frac = limitNum > 0 ? usedNum / limitNum : 0;
    const bar = renderBar(frac);
    const pct = Math.round(frac * 100);

    extraBlock += `Overage charges applied when included usage limits are reached.\n\n`;
    extraBlock += `\`${bar}\` **${pct}%**\n\n`;
    extraBlock += `Spent: **$${used}** / $${limit}`;
  } else {
    extraBlock += `Extra usage is **disabled**.\n\n`;
    extraBlock += `Enable at [console.anthropic.com](https://console.anthropic.com) to avoid hard rate limits when caps are hit.`;
  }
  sections.push(extraBlock);

  // Header
  const thinkingSuffix = thinking ? " | **Thinking:** ON" : "";
  const header = `# Claude Code Usage Monitor\n**Plan:** ${planLabel}${thinkingSuffix}\n`;

  return header + "\n---\n\n" + sections.join("\n\n---\n\n");
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const { token, creds } = await getOAuthToken();

  if (!token) {
    if (creds && !creds.claudeAiOauth) {
      console.log("Claude Code Usage: API Key mode — no usage limits available.");
    } else {
      console.log("Could not retrieve usage data. Check your OAuth credentials.");
    }
    return;
  }

  const usage = await fetchUsageLimits(token);
  if (!usage) {
    console.log("Failed to fetch usage data from Anthropic API.");
    return;
  }

  try {
    await writeFile(CACHE_PATH, JSON.stringify({ usage, ts: Date.now() }), "utf-8");
  } catch {}

  console.log(renderCard(usage, creds));
}

const globalTimeout = setTimeout(() => {
  console.log("Timeout fetching usage data.");
}, REQUEST_TIMEOUT + 1000);
globalTimeout.unref();

main()
  .catch(() => console.log("Error fetching usage data."))
  .finally(() => clearTimeout(globalTimeout));
