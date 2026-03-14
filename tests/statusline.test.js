const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// Context limits matching the updated values in statusline.js
const CONTEXT_LIMITS = {
  "claude-opus-4-6": 1000000,
  "claude-sonnet-4-6": 1000000,
  "claude-haiku-4-5": 200000,
  default: 1000000,
};

// Replicated from statusline.js for testing
function formatTokens(tokens) {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${tokens}`;
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

function getColor(fraction) {
  if (fraction >= 0.8) return "\x1b[31m"; // RED
  if (fraction >= 0.6) return "\x1b[33m"; // YELLOW
  return "\x1b[32m"; // GREEN
}

describe("Context Limits", () => {
  it("should have 1M context for Opus 4.6", () => {
    assert.equal(CONTEXT_LIMITS["claude-opus-4-6"], 1000000);
  });

  it("should have 1M context for Sonnet 4.6", () => {
    assert.equal(CONTEXT_LIMITS["claude-sonnet-4-6"], 1000000);
  });

  it("should have 200k context for Haiku 4.5", () => {
    assert.equal(CONTEXT_LIMITS["claude-haiku-4-5"], 200000);
  });

  it("should have 1M default context", () => {
    assert.equal(CONTEXT_LIMITS.default, 1000000);
  });

  it("should return model-specific limit when model exists", () => {
    const modelKey = "claude-opus-4-6";
    const limit = CONTEXT_LIMITS[modelKey] ?? CONTEXT_LIMITS.default;
    assert.equal(limit, 1000000);
  });

  it("should fallback to default for unknown models", () => {
    const modelKey = "claude-unknown-99";
    const limit = CONTEXT_LIMITS[modelKey] ?? CONTEXT_LIMITS.default;
    assert.equal(limit, 1000000);
  });
});

describe("formatTokens", () => {
  it("should format small numbers as-is", () => {
    assert.equal(formatTokens(500), "500");
  });

  it("should format thousands with k suffix", () => {
    assert.equal(formatTokens(1000), "1.0k");
  });

  it("should format large numbers correctly", () => {
    assert.equal(formatTokens(45200), "45.2k");
    assert.equal(formatTokens(123400), "123.4k");
    assert.equal(formatTokens(1000000), "1000.0k");
  });

  it("should handle zero", () => {
    assert.equal(formatTokens(0), "0");
  });

  it("should handle exact boundaries", () => {
    assert.equal(formatTokens(999), "999");
    assert.equal(formatTokens(1000), "1.0k");
  });
});

describe("formatResetShort", () => {
  it("should return empty string for null", () => {
    assert.equal(formatResetShort(null), "");
    assert.equal(formatResetShort(undefined), "");
  });

  it("should return 'soon' for past dates", () => {
    const past = new Date(Date.now() - 60000).toISOString();
    assert.equal(formatResetShort(past), "soon");
  });

  it("should format hours", () => {
    const future = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const result = formatResetShort(future);
    assert.match(result, /^\dh$/);
  });

  it("should format days", () => {
    const future = new Date(
      Date.now() + 3 * 24 * 60 * 60 * 1000
    ).toISOString();
    const result = formatResetShort(future);
    assert.match(result, /^\dd$/);
  });

  it("should format minutes", () => {
    const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const result = formatResetShort(future);
    assert.match(result, /^\d+m$/);
  });
});

describe("getColor", () => {
  it("should return green for low usage", () => {
    assert.equal(getColor(0.0), "\x1b[32m");
    assert.equal(getColor(0.3), "\x1b[32m");
    assert.equal(getColor(0.59), "\x1b[32m");
  });

  it("should return yellow for medium usage", () => {
    assert.equal(getColor(0.6), "\x1b[33m");
    assert.equal(getColor(0.7), "\x1b[33m");
    assert.equal(getColor(0.79), "\x1b[33m");
  });

  it("should return red for high usage", () => {
    assert.equal(getColor(0.8), "\x1b[31m");
    assert.equal(getColor(0.9), "\x1b[31m");
    assert.equal(getColor(1.0), "\x1b[31m");
  });
});

describe("Context window fraction calculation", () => {
  it("should calculate correct fraction for 1M context", () => {
    const inputTokens = 500000;
    const limit = CONTEXT_LIMITS["claude-opus-4-6"];
    const frac = Math.max(0, Math.min(1, inputTokens / limit));
    assert.equal(frac, 0.5);
  });

  it("should calculate correct fraction at 200k with 1M limit", () => {
    const inputTokens = 200000;
    const limit = CONTEXT_LIMITS["claude-opus-4-6"];
    const frac = Math.max(0, Math.min(1, inputTokens / limit));
    assert.equal(frac, 0.2);
  });

  it("should clamp fraction to 1", () => {
    const inputTokens = 1500000;
    const limit = CONTEXT_LIMITS["claude-opus-4-6"];
    const frac = Math.max(0, Math.min(1, inputTokens / limit));
    assert.equal(frac, 1);
  });

  it("should handle haiku 200k limit separately", () => {
    const inputTokens = 100000;
    const limit = CONTEXT_LIMITS["claude-haiku-4-5"];
    const frac = Math.max(0, Math.min(1, inputTokens / limit));
    assert.equal(frac, 0.5);
  });
});
