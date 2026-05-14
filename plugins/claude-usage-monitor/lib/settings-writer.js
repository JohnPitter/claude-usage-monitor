/**
 * Atomically merges a `statusLine` block into ~/.claude/settings.json.
 *
 * Idempotent: only writes when the field is missing, or when it points to a
 * different file (e.g. the user's plugin path moved between cache versions).
 *
 * Atomic write: writes to a sibling temp file then renames, so a crash
 * mid-write cannot leave the user with an empty or half-parsed settings file.
 */

const { readFile, writeFile, rename, mkdir } = require("fs/promises");
const { homedir } = require("os");
const { dirname, join } = require("path");

const SETTINGS_PATH = join(homedir(), ".claude", "settings.json");
const PLUGIN_MARKER = "claude-usage-monitor";

const DEFAULT_REFRESH_INTERVAL = 60;

async function readSettings() {
  try {
    const raw = await readFile(SETTINGS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

async function writeSettingsAtomic(settings) {
  await mkdir(dirname(SETTINGS_PATH), { recursive: true });
  const tmp = `${SETTINGS_PATH}.tmp.${process.pid}`;
  await writeFile(tmp, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  await rename(tmp, SETTINGS_PATH);
}

function isOurStatusLine(statusLine) {
  if (!statusLine || typeof statusLine !== "object") return false;
  const cmd = typeof statusLine.command === "string" ? statusLine.command : "";
  return cmd.includes(PLUGIN_MARKER);
}

/**
 * Returns one of:
 *   "added"    — wrote a new statusLine block
 *   "updated"  — replaced an existing statusLine that pointed to an old path
 *   "kept"     — already correct, no write
 *   "deferred" — user has a different statusLine; we did not overwrite
 */
async function ensureStatusLineConfigured({ pluginRoot }) {
  if (!pluginRoot) return "deferred";

  const statuslineScript = join(pluginRoot, "lib", "statusline.js");
  const desiredCommand = `node "${statuslineScript}"`;
  const desiredBlock = {
    type: "command",
    command: desiredCommand,
    refreshInterval: DEFAULT_REFRESH_INTERVAL,
  };

  let settings;
  try {
    settings = await readSettings();
  } catch {
    return "deferred";
  }

  const existing = settings.statusLine;

  if (existing && !isOurStatusLine(existing)) {
    return "deferred";
  }

  if (
    existing &&
    existing.command === desiredCommand &&
    existing.type === "command"
  ) {
    return "kept";
  }

  const action = existing ? "updated" : "added";
  settings.statusLine = desiredBlock;

  try {
    await writeSettingsAtomic(settings);
  } catch {
    return "deferred";
  }

  return action;
}

module.exports = { ensureStatusLineConfigured };
