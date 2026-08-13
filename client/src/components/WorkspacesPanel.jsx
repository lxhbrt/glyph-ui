/**
 * Kabelsalat — Code-Workspaces an ^_Code anbinden/lösen.
 * SoT: ~/.glyph/workspaces.json via glyph-agent /workspaces
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { BindPanel } from "./BindPanel.jsx";

const MODE_TITLES = {
  r: "Nur Lesen (Auge) — kein Write, keine Shell",
  rw: "Lesen + Schreiben + Whitelist-Shell (elevated = Popup)",
  private: "Gesperrt (Schloss) — kein Zugriff für ^_Code",
};

const MODE_LABELS = {
  r: "r",
  rw: "r+w",
  private: "gesperrt",
};

export function WorkspacesPanel() {
  return (
    <BindPanel
      hub="^_Code"
      resource="Workspace"
      listKey="workspaces"
      apiBase="/api/workspaces"
      title="Kabelsalat · Workspaces"
      hint={
        <>
          ^_Code ↔ Code-Roots. SoT: <code>~/.glyph/workspaces.json</code>.{" "}
          <strong>+</strong> absoluter Pfad oder Ordnername unter <code>$HOME</code>.
          Rechte: r → r+w → gesperrt.
        </>
      }
      attachPlaceholder="Pfad · z. B. ~/glyph-ui oder /Users/…/projekt"
      defaultAttachMode="rw"
      modeTitles={MODE_TITLES}
      modeLabels={MODE_LABELS}
      confirmDetach="Workspace vom Kabelsalat lösen?"
    />
  );
}
