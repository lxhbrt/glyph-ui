# 0005 · Merken statt Session-Zusammenfassen

Session-Persistenz läuft über Skill `/merken` (Vorlage, Chat-Ja, Ablehnen ohne Suchwert). Der Header-Button Zusammenfassen, die Lupe-Aktion und Auto-Skills aus Sessions entfallen. `summaries/` bekommt keine neuen Dateien.

## Considered

- Button und merken parallel — zwei Einstiege; Krümel in `summaries/` ohne Retrieval.
- Merken nur Wiki — Regeln landen nicht im geladenen Prompt.
- Auto-Skill aus Verlauf — Dateiname = letzter Prompt, Slash-Rauschen.

## Consequences

- Kein `/api/sessions/:id/summarize/*`, kein Capability `summarize`.
- Wiki-Karte: Aufgabe / Lösung / Datei-oder-Beleg / Suchbegriffe. Bestehende Seite zuerst.
- Session-Schließen schreibt **nicht** ins Wiki. Roharchiv `sources/grok-sessions/` und `summaries/` sind tot (Hygiene-Korb). Persistenz nur `/merken`.
