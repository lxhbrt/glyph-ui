/**
 * Kabelsalat — Obsidian-Vaults an °_Agent anbinden/lösen.
 * SoT: ~/.glyph/vaults.json via glyph-agent /vaults
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { BindPanel } from "./BindPanel.jsx";

const MODE_TITLES = {
  r: "Nur lesen",
  rw: "Lesen und schreiben",
  private: "Zu — kein Index, kein Schreiben",
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
      title="Vaults"
      hint="Pfad, Name oder obsidian:// — Rechte in der Zeile."
      attachPlaceholder="Pfad, Name oder obsidian://…"
      defaultAttachMode="r"
      modeTitles={MODE_TITLES}
      modeLabels={MODE_LABELS}
      confirmDetach="Vault lösen?"
      extraActions={(v) =>
        v.obsidian_uri ? (
          <a className="vaults-tool vaults-open" href={v.obsidian_uri}>
            Obsidian
          </a>
        ) : null
      }
      extraDetail={(v) =>
        v.pins?.length ? (
          <ul className="vaults-pin-list">
            {v.pins.map((p) => (
              <li key={p.path}>{p.label || p.path}</li>
            ))}
          </ul>
        ) : null
      }
    />
  );
}
