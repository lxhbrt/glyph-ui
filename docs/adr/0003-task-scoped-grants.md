# Task-scoped Freigaben statt Session-Always

`r+w` hieß bisher: schreiben ohne Dialog. Der ACP-Dialog bot für Nicht-Elevated „Für diese Session erlauben“. Beides macht eine Anbindung oder einen Klick zur Dauerberechtigung.

Entscheidung: Workspace-Recht ist nur Capability. Jede Apply-Aktion braucht **Einmal**, **Auftrag** oder **Task**. Die Chat-Session ist kein Scope. Task nur explizit schließen; außerhalb des Scopes greift kein Grant. Einmal = gesamter Änderungssatz. Kein `w` im Kabelsalat. Kein Immer-Button.

## Considered Options

- **Session-Always wie Codex** — zu weit; Chat ≠ Task, nächste Aufgabe erbt die Rechte.
- **Write weiter auto unter r+w, Popup nur elevated** — Status quo, abgelehnt.
- **Immer erlauben** als vierter Button — falscher Default.

## Consequences

- Freigabe-Dialog: drei Buttons, Task-Scope editierbar.
- Arbeitsleiste: Aktiver Task; Tool-Karte: *Warum erlaubt?*
- Policy und Grant-Store bleiben in glyph-agent; UI zeigt nur an.
- AGENTS.md-Tabelle (`r+w` = Write ohne Popup) ist überholt — Vertragsvorschlag in `pending-contract.md`.
