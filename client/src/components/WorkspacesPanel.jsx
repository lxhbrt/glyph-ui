/**
 * Kabelsalat — Code-Workspaces an ^_Code anbinden/lösen.
 * SoT: ~/.glyph/workspaces.json via glyph-agent /workspaces
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { BindPanel } from "./BindPanel.jsx";

const MODE_TITLES = {
  r: "Nur lesen — kein Write, keine Shell",
  rw: "Lesen, schreiben, Whitelist-Shell",
  private: "Zu — kein Zugriff für ^_Code",
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
      title="Workspaces"
      hint="Pfad oder Ordner unter $HOME — Rechte in der Zeile."
      attachPlaceholder="~/glyph-ui oder /Users/…/projekt"
      defaultAttachMode="rw"
      modeTitles={MODE_TITLES}
      modeLabels={MODE_LABELS}
      confirmDetach="Workspace vom Kabelsalat lösen?"
    />
  );
}
