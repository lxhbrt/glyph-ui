/**
 * Kabelsalat — Obsidian-Vaults an °_Agent anbinden/lösen.
 * SoT: ~/.glyph/vaults.json via glyph-agent /vaults
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { BindPanel } from "./BindPanel.jsx";

const MODE_TITLES = {
  r: "Nur Lesen (Auge) — angebunden, gold-gestrichelt",
  rw: "Lesen + Schreiben (Auge + Stift)",
  private: "Privat (Schloss) — kein Index, kein Schreiben",
};

const MODE_LABELS = {
  r: "r",
  rw: "r+w",
  private: "privat",
};

export function VaultsPanel() {
  return (
    <BindPanel
      hub="°_Agent"
      resource="Vault"
      listKey="vaults"
      apiBase="/api/vaults"
      title="Kabelsalat · Vaults"
      hint={
        <>
          °_Agent ↔ Obsidian-Vaults. SoT: <code>~/.glyph/vaults.json</code>.{" "}
          <strong>+</strong> Pfad, Vault-Name oder{" "}
          <code>obsidian://open?vault=…</code>. Rechte: r → r+w → privat.
        </>
      }
      attachPlaceholder="Pfad · Vault-Name · obsidian://open?vault=…"
      defaultAttachMode="r"
      modeTitles={MODE_TITLES}
      modeLabels={MODE_LABELS}
      confirmDetach="Vault vom Kabelsalat lösen?"
      extraNode={(v) =>
        v.pins?.length ? (
          <span className="vaults-node-pins">
            {v.pins
              .slice(0, 3)
              .map((p) => p.label || p.path)
              .join(" · ")}
            {v.pins.length > 3 ? "…" : ""}
          </span>
        ) : null
      }
      extraActions={(v) =>
        v.obsidian_uri ? (
          <a className="ghost vaults-open" href={v.obsidian_uri}>
            Obsidian
          </a>
        ) : null
      }
      extraDetail={(v) =>
        v.pins?.length ? (
          <ul className="vaults-pin-list">
            {v.pins.map((p) => (
              <li key={p.path}>
                <span className="vaults-pin-src">{p.source}</span>{" "}
                {p.label || p.path}
                <code className="vaults-pin-path">{p.path}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="overview-hint">Keine Pins (Haupt-MDs).</p>
        )
      }
    />
  );
}
