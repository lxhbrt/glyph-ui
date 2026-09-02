/**
 * DSML must not reach the chat as the answer.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeDsml,
  publicAgentText,
  stripDsmlLeak,
} from "../../shared/dsml.mjs";

const LIVE = [
  "<\uFF5C\uFF5CDSML\uFF5C\uFF5Ctool_calls>",
  '<\uFF5C\uFF5CDSML\uFF5C\uFF5Cinvoke name="VaultFind">',
  '<\uFF5C\uFF5CDSML\uFF5C\uFF5Cparameter name="query" string="true">',
  "Kranbetrieb Kranführer Hebezeug Lastaufnahmemittel KFZ Werkstatt Prüfung",
  "</\uFF5C\uFF5CDSML\uFF5C\uFF5Cparameter>",
  "</\uFF5C\uFF5CDSML\uFF5C\uFF5Cinvoke>",
  "</\uFF5C\uFF5CDSML\uFF5C\uFF5Ctool_calls>",
].join("\n");

describe("stripDsmlLeak", () => {
  it("detects the live double-fullwidth VaultFind leak", () => {
    assert.equal(looksLikeDsml(LIVE), true);
    assert.equal(stripDsmlLeak(LIVE), "");
    assert.equal(publicAgentText(LIVE, "Bitte nochmal senden."), "Bitte nochmal senden.");
  });

  it("keeps prose before markup", () => {
    const raw = `Ich suche zuerst.\n${LIVE}`;
    assert.equal(stripDsmlLeak(raw), "Ich suche zuerst.");
    assert.equal(publicAgentText(raw), "Ich suche zuerst.");
  });

  it("leaves normal German alone", () => {
    const t = "Kranführer schriftlich beauftragen.";
    assert.equal(looksLikeDsml(t), false);
    assert.equal(publicAgentText(t), t);
  });

  it("detects ASCII || DSML", () => {
    const raw =
      '<||DSML||tool_calls><||DSML||invoke name="WebSearch"></||DSML||invoke>';
    assert.equal(looksLikeDsml(raw), true);
    assert.equal(stripDsmlLeak(raw), "");
  });
});
