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

const { readFileSync, openSync, readSync, closeSync, statSync } = require("fs");
const { homedir } = require("os");
const { join } = require("path");

const CACHE_PATH = join(homedir(), ".claude", ".usage-cache.json");

// ANSI colors
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
// Context window limits per model (tokens)
const CONTEXT_LIMITS = {
  "claude-opus-4-6": 1000000,
  "claude-sonnet-4-6": 1000000,
  "claude-haiku-4-5": 200000,
  default: 1000000,
};

/**
 * Read the tail of the session transcript and extract:
 * - thinking mode (from the last assistant turn)
 * - last input_tokens (context size from the most recent API response)
 *
 * Claude Code writes each content block as a separate JSONL entry.
 */
function parseTranscriptTail(transcriptPath) {
  const result = { thinking: null, inputTokens: null };
  if (!transcriptPath) return result;

  try {
    const stat = statSync(transcriptPath);
    const readSize = Math.min(120000, stat.size);
    const buffer = Buffer.alloc(readSize);
    const fd = openSync(transcriptPath, "r");
    readSync(fd, buffer, 0, readSize, Math.max(0, stat.size - readSize));
    closeSync(fd);

    const tail = buffer.toString("utf-8");
    const lines = tail.split("\n").filter(Boolean);

    // Parse all entries and group into turns separated by user/system entries
    const turns = [];
    let currentTurn = { hasThinking: false, hasText: false, inputTokens: null };

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === "assistant" && entry.message) {
          if (entry.message.content) {
            for (const block of entry.message.content) {
              if (block.type === "thinking") currentTurn.hasThinking = true;
              if (block.type === "text") currentTurn.hasText = true;
            }
          }
          // Extract token usage from assistant response
          // Total context = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
          // With prompt caching, input_tokens is often 1 (placeholder), real tokens are in cache fields
          const usage = entry.message.usage ?? entry.usage;
          if (usage) {
            const base = usage.input_tokens || 0;
            const cacheCreation = usage.cache_creation_input_tokens || 0;
            const cacheRead = usage.cache_read_input_tokens || 0;
            const total = base + cacheCreation + cacheRead;
            if (total > 0) {
              currentTurn.inputTokens = total;
            }
          }
        } else if (entry.type === "user") {
          if (currentTurn.hasText || currentTurn.inputTokens) turns.push(currentTurn);
          currentTurn = { hasThinking: false, hasText: false, inputTokens: null };
        }
      } catch {
        // skip malformed lines
      }
    }
    // Don't forget the last (current) turn
    if (currentTurn.hasText || currentTurn.inputTokens) turns.push(currentTurn);

    if (turns.length > 0) {
      const lastTurn = turns[turns.length - 1];
      result.thinking = lastTurn.hasThinking;

      // Find the last turn with token data (might not be the very last)
      for (let i = turns.length - 1; i >= 0; i--) {
        if (turns[i].inputTokens != null) {
          result.inputTokens = turns[i].inputTokens;
          break;
        }
      }
    }

    return result;
  } catch {
    return result;
  }
}

/**
 * Format token count in compact form: 45.2k, 123.4k, etc.
 */
function formatTokens(tokens) {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${tokens}`;
}

/**
 * Render a context window bar with color based on usage fraction
 */
function renderContextBar(fraction) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(clamped * 5);
  const empty = 5 - filled;
  let color = GREEN;
  if (clamped >= 0.85) color = RED;
  else if (clamped >= 0.65) color = YELLOW;
  return `${color}${"█".repeat(filled)}${DIM}${"░".repeat(empty)}${RESET}`;
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

  // Parse transcript for thinking mode and context tokens
  const transcriptData = parseTranscriptTail(session?.transcript_path);

  // Context window usage
  const inputTokens = transcriptData.inputTokens;
  if (inputTokens != null) {
    const modelKey = session?.model ?? "default";
    const limit = CONTEXT_LIMITS[modelKey] ?? CONTEXT_LIMITS.default;
    const frac = Math.max(0, Math.min(1, inputTokens / limit));
    const bar = renderContextBar(frac);
    const color = frac >= 0.85 ? RED : frac >= 0.65 ? YELLOW : GREEN;
    parts.push(`${BOLD}Ctx${RESET} ${bar} ${color}${formatTokens(inputTokens)}${RESET}${DIM}/${formatTokens(limit)}${RESET}`);
  }

  // Thinking mode
  if (transcriptData.thinking === true) {
    parts.push(`${MAGENTA}${BOLD}Think:ON${RESET}`);
  } else if (transcriptData.thinking === false) {
    parts.push(`${DIM}Think:OFF${RESET}`);
  }

  console.log(parts.join("  "));
}

main();
