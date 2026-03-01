#!/usr/bin/env node

/**
 * Claude Usage Monitor — Status Line Script
 *
 * Reads cached usage data and session info from stdin,
 * outputs a compact usage summary for the Claude Code status line.
 *
 * Called by Claude Code after each assistant message.
 * Reads cached data written by the SessionStart hook.
 */

const { readFileSync } = require("fs");
const { homedir } = require("os");
const { join } = require("path");

const CACHE_PATH = join(homedir(), ".claude", ".usage-cache.json");
const SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

// ANSI colors
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";

function readThinkingMode() {
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf-8");
    const settings = JSON.parse(raw);
    return settings.alwaysThinkingEnabled === true;
  } catch {
    return false;
  }
}

function getColor(fraction) {
  if (fraction >= 0.8) return RED;
  if (fraction >= 0.6) return YELLOW;
  return GREEN;
}

function renderMiniBar(fraction) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(clamped * 5);
  const empty = 5 - filled;
  const color = getColor(clamped);
  return `${color}${"█".repeat(filled)}${DIM}${"░".repeat(empty)}${RESET}`;
}

function formatResetShort(resetsAt) {
  if (!resetsAt) return "";
  const diffMs = new Date(resetsAt).getTime() - Date.now();
  if (diffMs <= 0) return "soon";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) return `${Math.floor(hours / 24)}d`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function readCache() {
  try {
    const raw = readFileSync(CACHE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function main() {
  // Read session info from stdin (Claude Code sends JSON)
  let stdinData = "";
  try {
    stdinData = readFileSync(0, "utf-8");
  } catch {
    // stdin may not be available
  }

  let session = {};
  try {
    session = JSON.parse(stdinData);
  } catch {
    // ignore parse errors
  }

  const cache = readCache();
  if (!cache || !cache.usage) {
    // No cached data — show minimal info
    const cost = session?.cost?.total_cost_usd;
    if (cost != null) {
      console.log(`${DIM}Usage: no data${RESET}  ${CYAN}$${Number(cost).toFixed(2)}${RESET}`);
    } else {
      console.log(`${DIM}Usage: no data${RESET}`);
    }
    return;
  }

  const usage = cache.usage;
  const parts = [];

  // Opus 5-hour
  if (usage.five_hour) {
    const frac = Math.max(0, Math.min(100, usage.five_hour.utilization || 0)) / 100;
    const pct = Math.round(frac * 100);
    const bar = renderMiniBar(frac);
    const color = getColor(frac);
    const reset = formatResetShort(usage.five_hour.resets_at);
    parts.push(`${BOLD}Opus 5h${RESET} ${bar} ${color}${pct}%${RESET}${DIM}(${reset})${RESET}`);
  }

  // All models 7-day
  if (usage.seven_day) {
    const frac = Math.max(0, Math.min(100, usage.seven_day.utilization || 0)) / 100;
    const pct = Math.round(frac * 100);
    const bar = renderMiniBar(frac);
    const color = getColor(frac);
    const reset = formatResetShort(usage.seven_day.resets_at);
    parts.push(`${BOLD}All 7d${RESET} ${bar} ${color}${pct}%${RESET}${DIM}(${reset})${RESET}`);
  }

  // Sonnet 7-day
  if (usage.seven_day_sonnet) {
    const frac = Math.max(0, Math.min(100, usage.seven_day_sonnet.utilization || 0)) / 100;
    const pct = Math.round(frac * 100);
    const bar = renderMiniBar(frac);
    const color = getColor(frac);
    const reset = formatResetShort(usage.seven_day_sonnet.resets_at);
    parts.push(`${BOLD}Sonnet 7d${RESET} ${bar} ${color}${pct}%${RESET}${DIM}(${reset})${RESET}`);
  }

  // Extra usage
  const extra = usage.extra_usage;
  if (extra?.is_enabled) {
    const used = extra.used_credits >= 1000 ? extra.used_credits / 100 : extra.used_credits;
    const limit = extra.monthly_limit >= 1000 ? extra.monthly_limit / 100 : extra.monthly_limit;
    parts.push(`${CYAN}Extra $${used.toFixed(0)}/$${limit.toFixed(0)}${RESET}`);
  }

  // Thinking mode
  const thinking = readThinkingMode();
  if (thinking) {
    parts.push(`${MAGENTA}${BOLD}Think:ON${RESET}`);
  } else {
    parts.push(`${DIM}Think:OFF${RESET}`);
  }

  console.log(parts.join("  "));
}

main();
