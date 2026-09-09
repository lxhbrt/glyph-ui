/**
 * /merken Wiki-Karte: Ablehnen ohne Suchwert, Vorlage nur wenn ok.
 * Copyright (c) 2026 Alexander Hubert · MIT
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateMerkenWikiCard,
  isTrivialMerkenTitle,
  renderMerkenWikiCard,
} from "../../shared/merkenOutcome.mjs";

test("trivialer Titel wird abgelehnt", () => {
  assert.equal(isTrivialMerkenTitle("test"), true);
  assert.equal(isTrivialMerkenTitle("TEST TEST TEST"), true);
  assert.equal(isTrivialMerkenTitle("Apfel außerhalb des Composers"), false);
});

test("Wiki-Karte ohne Lösung/Datei/Suchbegriffe → ablehnen", () => {
  assert.equal(
    evaluateMerkenWikiCard({
      title: "Apfel außerhalb des Composers",
      loesung: "wir haben diskutiert",
      datei: "client/src/App.jsx",
      suchbegriffe: ["Apfel"],
    }).ok,
    false,
  );
  assert.equal(
    evaluateMerkenWikiCard({
      title: "Apfel außerhalb des Composers",
      loesung: "Pixel-Apfel sitzt über dem Senden-Button, nicht zwischen + und Chat.",
      suchbegriffe: ["Apfel"],
    }).reason,
    "Weder Datei-Pfad noch Beleg-Seite",
  );
  assert.equal(
    evaluateMerkenWikiCard({
      title: "Apfel außerhalb des Composers",
      loesung: "Pixel-Apfel sitzt über dem Senden-Button, nicht zwischen + und Chat.",
      datei: "client/src/components/VaultSearchToggle.jsx",
    }).reason,
    "Keine Suchbegriffe",
  );
});

test("vollständige Karte → ok und Vorlage", () => {
  const card = {
    title: "Apfel außerhalb des Composers",
    aufgabe: "Apfel-Button nicht in der Composer-Höhe",
    loesung: "Pixel-Apfel sitzt über dem Senden-Button, nicht zwischen + und Chat.",
    datei: "client/src/components/VaultSearchToggle.jsx",
    suchbegriffe: ["Apfel", "Ordner-Suche", "Composer"],
  };
  assert.equal(evaluateMerkenWikiCard(card).ok, true);
  const md = renderMerkenWikiCard(card);
  assert.match(md, /^# Apfel außerhalb des Composers/m);
  assert.match(md, /Datei: `client\/src\/components\/VaultSearchToggle\.jsx`/);
  assert.match(md, /Suchbegriffe: Apfel, Ordner-Suche, Composer/);
});
