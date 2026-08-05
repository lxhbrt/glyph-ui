/**
 * Unit tests: context LVL meter math + window map.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  contextFillRatio,
  estimateTokensFromTexts,
  formatContextTooltip,
  formatTokenCount,
  goldFillRatio,
  resolveContextWindow,
  scrollMetrics,
} from "../../shared/contextMeter.mjs";

describe("resolveContextWindow", () => {
  it("maps gpt-5.6-luna to 1M", () => {
    const r = resolveContextWindow("openai/gpt-5.6-luna", "glyph-agent");
    assert.equal(r.window, 1_000_000);
    assert.equal(r.source, "map");
  });

  it("maps sonnet-5 style ids to 1M", () => {
    assert.equal(resolveContextWindow("claude-sonnet-5", "claude").window, 1_000_000);
    assert.equal(resolveContextWindow("anthropic/claude-sonnet-5", "claude").window, 1_000_000);
  });

  it("maps deepseek-v4-flash to 1M", () => {
    assert.equal(
      resolveContextWindow("deepseek-v4-flash-0731", "glyph-agent").window,
      1_000_000,
    );
  });

  it("maps deepseek-reasoner to 1M", () => {
    assert.equal(
      resolveContextWindow("deepseek-reasoner", "glyph-agent").window,
      1_000_000,
    );
    assert.equal(
      resolveContextWindow("deepseek/deepseek-reasoner", "glyph-agent").window,
      1_000_000,
    );
  });

  it("maps grok-4.5 to 500k", () => {
    assert.equal(resolveContextWindow("grok-4.5", "grok").window, 500_000);
  });

  it("falls back to profile default", () => {
    const r = resolveContextWindow("", "claude");
    assert.equal(r.window, 1_000_000);
    assert.equal(r.source, "profile");
  });

  it("ignores sticky grok model when profile is glyph-agent", () => {
    const r = resolveContextWindow("grok-4.5", "glyph-agent");
    assert.equal(r.window, 1_000_000);
    assert.equal(r.source, "profile");
    assert.equal(r.matchedKey, "glyph-agent");
  });

  it("ignores sticky grok model when profile is claude", () => {
    const r = resolveContextWindow("grok-4.5", "claude");
    assert.equal(r.window, 1_000_000);
    assert.equal(r.source, "profile");
  });

  it("glyph-agent profile default is 1M with empty model", () => {
    const r = resolveContextWindow("", "glyph-agent");
    assert.equal(r.window, 1_000_000);
    assert.equal(r.source, "profile");
  });
});

describe("contextFillRatio / goldFillRatio", () => {
  it("computes fill from used/window", () => {
    assert.equal(contextFillRatio(250_000, 500_000), 0.5);
    assert.equal(contextFillRatio(0, 500_000), 0);
    assert.equal(contextFillRatio(600_000, 500_000), 1);
  });

  it("gold = full context without overflow", () => {
    assert.equal(goldFillRatio(0.48, 0.2, false), 0.48);
  });

  it("gold = scroll × context with overflow", () => {
    assert.ok(Math.abs(goldFillRatio(0.5, 0.5, true) - 0.25) < 1e-9);
    assert.equal(goldFillRatio(0.5, 0, true), 0);
    assert.equal(goldFillRatio(0.5, 1, true), 0.5);
  });
});

describe("estimateTokensFromTexts / format", () => {
  it("estimates ~chars/4", () => {
    assert.equal(estimateTokensFromTexts(["abcd"]), 1);
    assert.equal(estimateTokensFromTexts(["a".repeat(40)]), 10);
  });

  it("formats token counts", () => {
    assert.equal(formatTokenCount(500), "500");
    assert.equal(formatTokenCount(241_000), "241k");
    assert.equal(formatTokenCount(1_000_000), "1M");
  });

  it("builds tooltip with optional approx", () => {
    const t = formatContextTooltip({
      used: 500_000,
      window: 1_000_000,
      model: "gpt-5.6-luna",
      estimated: true,
      softCapPercent: 80,
    });
    assert.match(t, /~/);
    assert.match(t, /gpt-5.6-luna/);
    assert.match(t, /50%/);
    assert.match(t, /soft-cap 80%/);
  });
});

describe("scrollMetrics", () => {
  it("no overflow → ratio 1", () => {
    assert.deepEqual(
      scrollMetrics({ scrollTop: 0, scrollHeight: 100, clientHeight: 100 }),
      { scrollRatio: 1, hasOverflow: false },
    );
  });

  it("mid scroll", () => {
    const m = scrollMetrics({
      scrollTop: 50,
      scrollHeight: 200,
      clientHeight: 100,
    });
    assert.equal(m.hasOverflow, true);
    assert.equal(m.scrollRatio, 0.5);
  });
});
