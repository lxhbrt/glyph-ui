# Extensions-Modal und Slash-Popup: nur Composer-Einfügen, kein Auto-Senden

Glyph bekommt zwei Einstiege für Skills und Agent-Commands (Slash-Popup bei `/`, Extensions-Modal per Sidebar **Befehle** und `Cmd/Ctrl+K`). Eine bestätigte Menü-Auswahl schreibt nur `/{name} ` in den Composer (Token-Ersatz) und sendet die Nachricht nicht. So bleiben Argumente editierbar und der Nutzer behält die Kontrolle vor dem Agenten-Turn — bewusst anders als manches TUI-Verhalten, das Slash-Befehle sofort ausführt.

## Considered Options

- **Auto-Senden** nach Auswahl — schneller, aber bricht Argument-Skills und überrascht bei Fehlklicks.
- **Nur Modal, kein Slash-Popup** — weniger Code, schlechtere Tastatur-Geschwindigkeit.
- **Plugins/Hooks in v1** — Grok-Parity, aber ohne stabilen Glyph-API-Bedarf und höheren Scope.

## Consequences

- Server braucht eine profilabhängige Skill-Discovery-API; Agent-Commands bleiben ACP-Live-Katalog.
- Command-Legend bleibt über **Buch** erreichbar; **Befehle** bedeutet ab v1 „ausführbare Liste“, nicht mehr die Hilfslegende.
- Multiline im Composer bleibt Enter=Senden / Shift+Enter=Zeile; offenes Popup/Modal stiehlt Enter für Menü-Auswahl.
