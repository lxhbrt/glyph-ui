# Glyph

Browser-UI für mehrere lokale und Cloud-Agenten über ACP (Agent Client Protocol). Profilneutraler Client für grok, claude und glyph-agent.

## Orient (für ^_Code / Agenten)

1. Diese Datei zuerst lesen — **nicht** blind ListDir/Grep über das ganze Repo.
2. Aufgabe → passende **Node** unten → nur deren Quellen öffnen.
3. Struktur ändert sich (neuer Tab, neuer Server-Endpoint, Profil-Split) → Map hier nachziehen, nicht parallel erfinden.

## System map

| Node | Tut | Quellen (Einstieg) | Hängt an |
|------|-----|--------------------|----------|
| **Bridge** | Browser ↔ WebSocket ↔ ACP stdio (`grok agent` / glyph-agent-acp). Drei Sitze: `desk` · `phone` · `web`. | `server/index.js`, `server/seats.js`, `server/webSurface.mjs`, `server/glyph-agent-acp.mjs`, `server/acpIdle.mjs` | Sessions, Agents |
| **Client-Shell** | Chat-UI, Composer, Sidebars, Buch-Panel. Header-Unterzeile: Term · ACP (Handy nur am Sitz phone). cwd nicht in der Zeile — Tooltip auf Glyph #N + Workspace-Button. Verlauf: letzte 40 Nachrichten im DOM, ältere per Button. Graph / Buch / Kalender lazy. **Web-Fläche** auf glyph-ui.com: maximierter °_Agent-Chat, kein Admin-Chrome. | `client/src/App.jsx`, `client/src/main.jsx`, `client/src/utils/messages.js` (`transcriptWindow`), `client/src/utils/webSurface.js` | Bridge-Events |
| **Palette / Type** | Eine Gold-Hex, eine Danger-Hex, Neutrals via `color-mix`; IBM Plex; Type-Scale fest | `client/src/styles.css` (`:root`) | Client-Shell |
| **LVL-Bar** | Kontext-Jagd: grau = Füllung, gold = Leseposition; Klick öffnet Legende. Über Soft-Cap (Grok): **Zusammenpressen** → `/compact`. | `ContextLvlBar.jsx` | Client-Shell |
| **Arbeitsleiste** | Angedockte Fläche über der LVL-Leiste: Plan, Ordner-Suche, **Aktiver Task**. Gleiches Chrome (Label · Zähler · ×). Kein Mitte-Modal. | `ComposerSheet.jsx`, `PlanBar.jsx`, `VaultSearchHits.jsx` | Client-Shell |
| **Tool-Karte** | Aufklappbare ACP-Toolzeile (Verb + Ziel, Diff/Ausgabe nach Klick). ^_Code: *Warum erlaubt?* | `client/src/components/ToolCard.jsx`, `client/src/utils/toolCard.js`, `server/toolTitle.mjs` | Bridge `type: tool` |
| **Composer / Slash** | Eingabe, Slash-Popup, Skills/Commands einfügen. Idle-Senden = Graph-Kopf (Grok Build / °_Agent / ^_Code); Arbeit = Snack. Modus **Chat · Deep Search · Fork · Swarm**: Fork = `x.ai/session/fork` dann ACP `session/fork`; Deep Search = Grok `/deep-research` (andere Köpfe ausgegraut); Swarm = °_Agent/^_Code `POST /chat` `swarm: true`. | `client/src/App.jsx`, `client/src/components/GraphFaces.jsx`, `shared/composerActions.mjs`, `server/glyph-agent-acp.mjs` | Bridge |
| **Ordner-Suche** | °_Agent: Pixel-Apfel über dem Kopf (rot, ohne extra Höhe). Aus = keine Vault-Suche. An → `/api/vault/find`, Treffer in der Arbeitsleiste, Default aus, nur aktivierte in den Kontext. | `VaultSearchToggle.jsx`, `VaultSearchHits.jsx`, `utils/vaultSearch.js`, `server/vaultFlags.mjs` | glyph-agent `POST /vault/find`, `/chat` `vault_search` / `vault_selected` |
| **Sessions** | Session-Liste, Überblick, **Name** (`/rename`) | `server/sessions.js`, `client/…/CommandOverview.jsx` | Bridge |
| **Rewind** | Nutzer-Turn und alles danach aus dem Verlauf. Esc Esc, `/rewind`, ↺ an der Nachricht. Dateien bleiben. | `shared/rewind.mjs`, `RewindPicker.jsx`, Bridge `type: rewind` | Sessions, Bridge |
| **Prompt-History** | ↑ auf leerem Composer: letzte Prompts (lokal, pro Profil) | `utils/promptHistory.js`, `PromptHistoryPopup.jsx` | Composer |
| **Bindings** | Keys/Host/Modell: zweites Blatt **Anbindung** in der Graph-Legende (nicht die erste Fläche). Polling der Pille: GET `/api/bindings`; POST `/api/models/apply` nur bei Verbindung, Speichern oder mismatch-Klick. | `server/bindings.js`, `GraphLegend.jsx` (`CloudBind`), `utils/bindingsModels.js` | `~/.glyph-ui/bindings.json` |
| **Graph** | Vollfenster pechschwarz. Modal: Fokusfalle, Rail/Chat `inert`. Aktiver Kopf hervorgehoben. Vaults/Workspaces erst beim Öffnen. Ab 8 Ordnern Suche + „Nur verbunden“. Klick → kompakte Legende (Status, Rechte, Nachbarn); Keys hinter Anbindung. | `CableLage.jsx`, `GraphLegend.jsx`, `utils/lageLayout.js`, `utils/focusTrap.js` | Bindings, Vaults, Workspaces |
| **BindPanel** | Kompakt-Liste im Buch (Fallback) | `BindPanel.jsx`, `useBindResource.js` | Vaults-UI, Workspaces-UI |
| **Vaults-UI** | Kabelsalat °_Agent | `VaultsPanel.jsx` → Proxy `/api/…` | **glyph-agent** `/vaults` |
| **Workspaces-UI** | Kabelsalat ^_Code | `WorkspacesPanel.jsx` → `/api/workspaces` | **glyph-agent** `/workspaces` |
| **Plan / Recurring** | Kalender-Tab Plan: **Aufgaben** (Übergabe) + wiederkehrende To-dos. Panel lazy. | `ActivityCalendar.jsx`, `TaskHandoffDialog.jsx`, `server/index.js` (`/api/tasks`) | glyph-agent `/tasks`, `/recurring`; Skill `einmal-job` |
| **Domain-SoT** | Begriffe + settled decisions | **diese** `CONTEXT.md`, `docs/adr/` | `~/.glyph/AGENTS.md` |

**Nicht hier:** Vault-Inhalte, HSEQ-Jobs, Embedding — das ist `glyph-agent`.

**Crux (häufige Bugs):** Workspace-Recht und Freigaben leben in **glyph-agent** (`code_loop` / `code_tools`). UI zeigt Dialog, Aktiven Task und Banner — sie entscheidet nicht. `r+w` ist Capability, nicht Auto-Write. ACP-Bridge ≠ HTTP-API der Engine. Composer-Caret: Overlay (Slash-Gold) nur wenn ein Katalog-Command im Entwurf steht — sonst malt die Textarea selbst. Extra-Pad nur auf dem Mirror wrappt früher → Caret ab Zeile 2 mitten im Text.

**Merken:** Skill `/merken` (Befehle / Skills), kein Header-Button. Schicht-Router; Wiki nur nach Vorlage und Chat-Ja. Ablehnen ohne Suchwert. Code: `shared/merkenOutcome.mjs`, Skill `~/.glyph/skills/merken/`. ADR `docs/adr/0005-merken-not-summarize.md`.

## Language

**Composer**:
Das Nachrichteneingabefeld im Chat-Footer (Textarea), in dem der Nutzer Tippt, Anhänge anhängt und Sendungen auslöst. Sendemodus: **Chat**, **Deep Search**, **Fork**, **Swarm**.
_Avoid_: Prompt-Box, Input, Chatbox

**Deep Search**:
Grok-Composer-Aktion: `session/prompt` mit `/deep-research <query>`. Grok-ACP fängt den Slash im Agent ab (nicht der TUI-Pager). Andere Profile: ausgegraut.
_Avoid_: TinyFish/Exa als dieser Button; `/workflows`-Dashboard in Glyph

**Fork**:
Composer-Aktion: aktuelle Session branchen. Grok `x.ai/session/fork`, sonst ACP `session/fork` (°_Agent/^_Code: Verlaufskopie im Adapter). Directive = erster Prompt der neuen Session.
_Avoid_: `/fork` als Chat-Text; Worktree-Dialog

**Swarm**:
Composer-Aktion (4. Menüpunkt). Köpfe **°_Agent** und **^_Code**: Engine Planer → Websuche → Synthese mit Quellen. Grok ausgegraut (dort Deep Search). Nicht Sitze, nicht Crew-Dashboard.
_Avoid_: Grok-Bot-Schwarm als Sitz-Ersatz; `/workflows`-Dashboard; Swarm auf Grok

**Slash-Popup**:
Eine flüchtige, filterbare Befehlsliste, die erscheint, während der Nutzer im Composer `/` tippt — nicht ein separates Vollbild-Modal.
_Avoid_: Dropdown (zu generisch), Autocomplete (kann Code-Vorschläge meinen)

**Extensions-Modal**:
Ein modaler Dialog in Glyph zum Durchsuchen und Auswählen von Erweiterungen (Skills, ggf. Plugins/Hooks) — das Glyph-Gegenstück zu Groks Extensions-Oberfläche.
_Avoid_: Settings, Preferences, Command-Palette (andere Oberfläche)

**Command-Legend**:
Hilfe-Modal **Buch**: Tabs Handbuch · **Legende** (UI-Doku) · Anbindung · Vaults · Workspaces. Dokumentiert Bedienung; führt Skills/Commands **nicht** aus.
_Avoid_: Extensions-Modal / „Befehle und Skills“ (ausführbarer Katalog)

**Command-Overview**:
Bestehendes Modal zum Suchen und Öffnen von Sessions (Lupe).
_Avoid_: Extensions-Modal, Command-Legend

**Menü-Auswahl**:
Tastatur- und Maus-Navigation in einer listenbasierten UI: Filter, Hervorheben einer Zeile, Bestätigen (Enter/Klick), Abbrechen (Escape).
_Avoid_: Focus (nur DOM-Fokus), Selection (Textauswahl)

**Tool-Karte**:
Eine aufklappbare Zeile im Chat für einen ACP-Tool-Aufruf: Verb + Ziel in der Zusammenfassung, Input/Diff/Ausgabe erst nach Klick. Fehlgeschlagene Tools öffnen sich selbst. Bei ^_Code immer *Warum erlaubt?* — **einmal**, **Auftrag** oder **Task**-Name. Preview: `?toolcard=demo`.
_Avoid_: Tool-Card (EN), Paper-Card, grok-build-web Disclosure; erlaubtes Tool ohne Scope-Hinweis

**Ordner-Suche**:
Manueller Vault-Zugriff im Profil **°_Agent**. Pixel-Apfel **über dem Senden-Button** (nicht zwischen + und Chat), ohne die Composer-Höhe zu erhöhen. Minecraft: roter Körper, brauner Stiel, grünes Blatt; inaktiv abgedunkelt; an = Gold-Outline + Puls. Standard aus — Agent antwortet ohne VaultFind/ListVaultDir. An: nächste Sendung sucht, Treffer in der **Arbeitsleiste** über der LVL-Leiste (nicht als Overlay über der Eingabe), nie im Chat-Verlauf, jedes Ergebnis startet aus; nur explizit an = in den Agent-Kontext. Zustand pro Session (`sessionStorage`). Jobs/Engine ohne Flag bleiben beim B+-Precheck. ACP sendet `vault_search` nur wenn mindestens ein Treffer aktiv ist. Vault leer → **KomNet** (`komnet.nrw.de`) einmal via Exa+TinyFish; ohne Treffer **DGUV** (`dguv.de`) ebenso. Kein HTML-Scrape, kein offenes Web.
_Avoid_: automatische Vault-Suche bei jeder °_Agent-Nachricht; Apfel zwischen + und Chat; Lupe (Sessions); Treffer als Chat-Nachrichten; Gold-gefüllter Apfel; Treffer-Popup über der Composer-Box; KomNet-HTML direkt; KomNet und DGUV parallel; allgemeine Websuche als Apfel-Fallback

**Rewind**:
Einen Nutzer-Turn und alles danach aus dem Chat-Verlauf nehmen. Dateien auf Disk bleiben (wie TUI `/rewind`). Einstiege: Esc Esc (idle, leerer Composer), `/rewind` / `/undo`, ↺ an der Nutzer-Nachricht. °_Agent/^_Code: Adapter `session.rewind`. Grok: ACP `x.ai/rewind*` oder Disk-Schnitt + `session/load`.
_Avoid_: Dateien zurückdrehen; Rewind während der Agent arbeitet

**Prompt-History**:
Die letzten gesendeten Composer-Texte, lokal pro Profil. ↑ auf leerem Composer blättert (neuste zuerst); ↓ hinter dem neuesten schließt und stellt den Entwurf wieder her.
_Avoid_: Grok-Memory, TUI `prompt_history.jsonl` als Pflichtquelle

**Session-Titel**:
Manueller Name einer Grok-Disk-Session (`title_is_manual`). Lupe: Button **Name** oder `r`. Composer: `/rename Titel`.
_Avoid_: Auto-Titel überschreiben ohne Flag

**Arbeitsleiste**:
Angedockte Fläche über der LVL-Leiste für laufende Arbeit am Composer: **Plan**, **Ordner-Suche**, **Aktiver Task**. Ein Chrome (Gold-Rand, Label, Zähler, ×, optionale Primäraktion). Nicht Bildschirmmitte, nicht zweites Overlay-System. Freigabe-Dialog (^_Code) bleibt eigenes Blocking-Modal.
_Avoid_: Ordner-Suche als schwebendes Overlay; Freigabe als Leisten-Fläche; zweite Bildsprache für diese Flächen; Session-Zusammenfassen in der Leiste

**Plan-Freigabe**:
Aktionen an der Plan-Leiste (Arbeitsleiste), solange jeder Eintrag `pending` ist: **Umsetzen** sendet den Auftrag, **Ändern** fokussiert den Composer. Kein TUI-Plan-Modus (`plan.md` / Approve-Preview).
_Avoid_: Plan-Mode, plan.md-Editor, automatisches Senden

**Einmal-Job**:
Skill `einmal-job`: wiederkehrende Arbeit erst 1× mit Plan-Freigabe, dann Recurring im Kalender-Tab Plan. Pflichtfeld **Fertig wenn** (`pass`) — ohne prüfbares Ergebnis kein Job. Leerlauf: erste Zeile `LEER` (nicht Erfolg, Stamp trotzdem). Irreversibles wartet auf Ja. Leben-Admin nicht in den Vault.
_Avoid_: Grok Bot; Cloud-VM; Chat-Cron; `recurring.json` per Hand patchen; Timeout/Retry/Manager-Bot; Fertig-Kriterium als Gefühl

**Zusammenpressen**:
`/compact` aus der LVL-Legende, sobald die Füllung den Soft-Cap erreicht (nur Grok, idle).
_Avoid_: Compact für °_Agent/^_Code; Compact-Button immer sichtbar

**Multiline (Composer)**:
Desk: Enter = senden, Shift+Enter = Zeile. Phone: Tastatur-Enter = Zeile; der runde **Kopf** sendet (⌘/Ctrl+Enter ebenfalls). Erster Tap auf den Kopf sendet — die Tastatur darf den Klick nicht schlucken. Idle-Kopf = Graph-Pixel (Grok Build · °_Agent · ^_Code), gleicher `SnakeHead` wie im Graph. Klick startet Snack wie bisher. Slash-Popup: Enter = auswählen, beide Sitze. Kein globaler Multiline-Toggle.
_Avoid_: textarea rows (nur visuelle Höhe); erster Tap schließt nur die Tastatur; ↵-Glyph als Send-Icon

**Agent-Command**:
Ein vom verbundenen Agenten per ACP gemeldeter Slash-Befehl (Live-Katalog `available_commands`), z. B. `/compact`, `/plan`.
_Avoid_: Skill (lokal/dateibasiert, nicht zwingend vom Agenten gelistet)

**Skill (Glyph-UI)**:
Ein entdeckbarer, benennbarer Prompt-/Workflow-Eintrag (z. B. aus `~/.grok/skills` oder gebündelten Quellen), den die UI im Extensions-Modal und ggf. im Slash-Popup anbietet.
_Avoid_: Plugin, Hook, Agent-Command

**Merken**:
Skill `/merken`: eine Erkenntnis in die richtige Schicht. Wiki-Karte nur nach Vorlage (Aufgabe · Lösung · Datei oder Beleg · Suchbegriffe), erst nach **Ja** im Chat. Ablehnen, wenn der Satz ohne den Chat nichts sucht. Gleiches Thema → bestehende Seite. MEMORY / CONTEXT / pending: eine Zeile.
_Avoid_: Header-Button Zusammenfassen; Auto-Skill aus Session; Dump nach `summaries/` oder `grok-sessions/`; Chat-Dump ins Wiki; Ja+Wiki beim Session-Schließen

**Sitz**:
Gerätessessel: **`desk`** (Schreibtisch), **`phone`** (Handy), **`web`** (glyph-ui.com). Jeder Sitz hat eigenen ACP-Prozess und eigene Live-Session. SoT (Vaults, Roots, Vertrag) ist eins. Kein Crew: nicht dieselbe Aufgabe parallel. Query `?seat=` · Header `X-Glyph-Seat`. Öffentliche Domain erzwingt `web` — Query kann nicht auf desk/phone eskalieren. Dieselbe Session-ID nicht auf zwei Sitzen gleichzeitig offen.
_Avoid_: Schwarm, mehrere Agenten an einer Aufgabe, Geräte = Profile; glyph-ui.com = desk

**Web-Sitz**:
Sitz `web` für die Domain glyph-ui.com (Arbeits-PC). Eigener ACP-Prozess, fest °_Agent. Schreibt nicht in den Schreibtisch-Chat.
_Avoid_: Funnel; geteilter Live-Chat mit dem Mac; Grok Build oder ^_Code auf der Domain

**Web-Fläche**:
Maximierte Chat-Oberfläche auf glyph-ui.com: eine Konversation = Verlauf + Composer. Kein Graph, kein Agent-Picker, kein Grok/^_Code. Header begrenzt: Stift · Befehle · Theme · Schloss · **UI neu laden**. Kein **Beenden** (Kette) — Tab schließen beendet den Browser, nicht den Agenten. Dieselben Themen-/Wiki-Schreibrechte wie am Schreibtisch (°_Agent Fortschreiben).
_Avoid_: volle Admin-UI hinter der Domain; Session-Lupe (Grok); Beenden auf glyph-ui.com

**Fortschreiben**:
°_Agent legt an und ergänzt `Themen/` und Wiki-Seiten. Kein Löschen, kein Leeren. Engine-SoT: glyph-agent CONTEXT + ADR 0002.
_Avoid_: Delete-Tool; Vorlagen aus dem Chat umschreiben

**Admin-Fläche**:
Volle Glyph-UI (Grok Build, ^_Code, °_Agent, Graph, Anbindung) auf Loopback. Nicht auf glyph-ui.com.
_Avoid_: Admin über die öffentliche Domain; Admin über Tailscale

**Web-Tor**:
Passwort vor der Web-Fläche. Wer eingeloggt ist, ändert es in der Web-UI (Schloss). Cloudflare Access darf zusätzlich davor sitzen. Agent-only ersetzt das Tor nicht.
_Avoid_: offene Domain; °_Agent öffentlich ohne Sperre; Passwort nur auf dem Mac ändern

**Agent-Profil**:
Eines der wählbaren ACP-Agenten in Glyph: **Grok Build** (`grok`), **`^_Code`** (`_code`), **`°_Agent`** (id `glyph-agent`). Glyph spawnt ein anderes Binary/Env, nicht „ein anderes Modell“.
_Avoid_: OpenRouter (kein UI-Profil mehr), Claude (ersetzt durch ^_Code), Provider, Modell (als Profilname); UI-String „Grok“ allein als Profil-/Kopf-Name

**Grok Build**:
UI-Label des grok-Profils (id bleibt **`grok`**). Die Grok-Build-CLI, nicht Grok Chat. Header: Picker **Grok Build**, Pille = Modell (oder CLI) — nicht noch einmal „Grok“.
_Avoid_: Dropdown-/Pille-/Graph-Label „Grok“ (ergibt „Grok Grok“)

**Anbindung**:
Keys, Host-URL und Modelle unter `~/.glyph-ui/bindings.json`. Header-Pille öffnet den **Graph** auf dem aktiven Kopf und das Blatt **Anbindung**. Pille zeigt nur das **eingesetzte** Modell (Kürzel) — Primary→Reserve bleibt Graph/Tooltip. °_Agent / ^_Code: Direct-Key, OpenRouter-Key, Host (`DIRECT_API_URL`) und Modell (ohne Slash = Direct-ID, mit Slash = OpenRouter-Slug) hinter **Anbindung**, nicht auf der ersten Graph-Fläche. **Schreiben gilt sofort** am laufenden Agent — kein Kickstart, kein zweites Terminal. Schlägt der Live-Push fehl, steht das als Fehler, nicht als „Gespeichert“. Ein Direct-Key für beide Köpfe. Grok-OAuth bleibt Terminal (`grok login`).
_Avoid_: Settings (zu generisch), Login-Dialog (impliziert eingebettetes OAuth), Kalender (nur Grok-Aktivität, oft disabled)

**Graph**:
Vollfenster, pechschwarz, kein Bild — auch im hellen App-Theme. Modal: Tab bleibt im Graph; Rail und Chat `inert`. Mitte = Glyph-Symbol. Köpfe = Snake-Pixel Grok Build / °_Agent / ^_Code, radial (Grok Build oben, Agent links, Code rechts). Der aktive UI-Kopf ist hervorgehoben (`aria-current`). Klick Kopf → rutscht in die Mitte, zeigt Abhängigkeiten. Erste Legende: Status, Nachbarn, Rechte, An-/Abbindung. Keys/Host/Modell = Blatt **Anbindung**. Ordner (Vaults, Roots) = Kreise; Favorit und aktuell gewählter Ordner = Goldstern (*). Rechte am Knoten: ungebunden = eine Stufe dunkler, keine Linie; lesen = Standardkreis + vier kurze Striche; privat = eine Stufe dunkler + Punkte. Jeder Ordner darf an jeden Kopf, jede Kante eigene Rechte (`heads`: lesen / schreiben / privat / ungebunden). Grok Build startet offen (schreiben), außer Privat — einschränken, nicht erst freigeben. Kanten: Glyph↔Köpfe = Achse (dünn, ~40 % Opacity). Rechte: schreiben solid, lesen gestrichelt, privat gepunktet — pro Kopf; Kanten-Legende sichtbar im Feld. Auswahl eines Ordners: nur dessen Rechte-Kanten voll, Rest stark gedimmt. Labels nur Hover/Selektion; voller Name in der Legende und als `title`. Ab 8 Ordnern: Suche + Filter „Nur verbunden“. Vaults/Workspaces laden erst beim Öffnen. `?graph=`.
_Avoid_: Lage, Gefäß, Tunnel-Foto, Tafel-Chips, hängende Kabel; ein Kopf pro Ordner; Kreis für den Favoriten; Keys/Modelle als erste Graph-Fläche

**Plan & Aktivität (Tafel-Symbol)**:
Kalender-Icon, Tabs Plan / Aktivität. Plan: übergebene **Aufgaben** (Zielkopf optional, Übernehmen in den Composer) plus wiederkehrende To-dos. In der Leiste: nur die Zeichen (und die Tafel-Linie) in `currentColor` — Dunkel grau/weiß, Hell schwarz/grau, wie Lupe und Buch. Keine gefüllte Platte.
_Avoid_: gelbe/schwarze Tafel-Füllung in der Leiste; Aufgabe = Recurring-To-do; Aufgabe = Task-Freigabe

**Workspaces (Kabelsalat)**:
Tab im **Buch**-Panel: Code-Roots anbinden/lösen, **Workspace-Recht** r · r+w · 🔒, Primär★. SoT `~/.glyph/workspaces.json` via glyph-agent `/workspaces` und UI-Proxy `/api/workspaces`. Analog **Vaults**. Mehrfach-Anbindung (`heads` je Kopf) lebt im **Graph**; Buch-Tab setzt weiter das Heim-Recht (Code bzw. Agent). `r+w` heißt beschreibbar, nicht auto-schreiben.
_Avoid_: Vaults-Tab (Obsidian/°_Agent), Finder-„Workspace“-Leistenbutton (nur cwd öffnen); r+w = Dauerberechtigung

**Workspace-Recht**:
Stehende Capability eines angebundenen Roots für einen Kopf: **ungebunden**, **r**, **r+w**, **privat**. Formel: Recht + zeitlich begrenzte **Freigabe** = Aktion. `r` = lesen/Grep/Liste/Diff. `r+w` = lesen und Apply grundsätzlich möglich, Apply trotzdem nur mit Freigabe. `privat` = für ^_Code unsichtbar. Ungebunden = kein Zugriff. Kein allgemeines `w` im Kabelsalat; Schreiben-ohne-Lesen höchstens später als Spezialrecht für Ausgabeordner.
_Avoid_: r+w = Write ohne Dialog; Session-Always; `w` als Klickzyklus; Recht als Berechtigung für git/Netzwerk/Install

**Freigabe**:
Zeitlich begrenzte Erlaubnis, eine konkrete Aktion oder einen **Änderungssatz** anzuwenden. Drei Stufen: **Einmal**, **Auftrag**, **Task**. Nie „immer“. Dialog bleibt Blocking-Modal (Diff, Pfad, Umfang, Kommando). Task-Freigabe: Scope im Dialog editierbar (Pfade, Aktionsklassen). Widerruf jederzeit am **Aktiven Task**. Preview: `?grant=demo`.
_Avoid_: Grant in UI-Text; Genehmigung (außer Altcode); „Für diese Session erlauben“; Session-Always; Immer-erlauben

**Einmal**:
Freigabe-Stufe für genau diese eine Dateiänderung, diesen einen Befehl oder diesen einen vorgelegten **Änderungssatz**. Danach tot.
_Avoid_: Allow-once als versteckte Session-Freigabe

**Auftrag**:
Eine Nutzeranweisung bzw. ein Änderungssatz („Ersetze die alte Toolkarte“). Freigabe gilt nur solange dieser Auftrag läuft: Workspace, erlaubte Pfade, Aktionsklassen, Testbefehle. Endet bei Abschluss, Abbruch, Fehler oder Zeitlimit.
_Avoid_: Job (SoT-Jobs = Recurring/To-do); Turn; Session; Chat als Scope

**Task**:
Explizit benannte Arbeit („Baue die Codex-Bridge ein“), nicht die Chat-Session. Freigabe hängt an Name, Workspace, Pfaden und Aktionsklassen. Sichtbar als **Aktiver Task**, jederzeit widerrufbar. Nur **explizit** schließen (oder Workspace-Wechsel, Widerruf, 2h Inaktivität). Ein neuer Prompt startet keinen neuen Task. Aktion außerhalb des Scopes → Grant greift nicht; Hinweis, neuen Task zu starten oder den aktuellen abzuschließen.
_Avoid_: Session-Freigabe; Chat-weit; Immer; Recurring-To-do; Prompt-Themenklassifikation; mit **Aufgabe** (Übergabe) verwechseln

**Aufgabe**:
Manuell übergebene Arbeit zwischen Köpfen. Kette an einer Antwort → Titel, **Fertig wenn** (`pass`, Pflicht), optionales Ziel, optionales Artefakt, Notiz. Glyph speichert nur die gewählten Belege (Meldung, Antwort, kompakter Trace, Anhang-Pfade) in `~/.glyph/tasks.json` — nie die ganze Session, nie Vault-Inhalt. Zielkopf Default leer; später im Plan zuweisen. **Übernehmen** legt den Startkontext in den Composer. **Fertig** nur mit Artefakt (Pfad oder Ort) — Chat-Belege sind Kontext, kein Ergebnis. Kein automatischer Kopfwechsel.
_Avoid_: Analyse als Kopf; ganze Session übertragen; Recurring-To-do; Task-Freigabe; Auto-Switch des Profils; Fertig ohne Artefakt; „done“ im Chat als Abschluss

**Aktiver Task**:
Feld in der Arbeitsleiste: Name, Workspace, Restzeit, erlaubte Pfade/Aktionen, **Widerrufen**. Zeigt den stehenden Scope; ersetzt nicht den Freigabe-Dialog. Preview: `?task=demo`.
_Avoid_: Freigabe-Modal als einzige Anzeige; Session-Badge; × ohne Widerruf-Label (Grant würde still enden)

**Änderungssatz**:
Mehrere Dateiänderungen, gesammelt, als ein Gesamt-Diff gezeigt, nach Freigabe atomar angewendet. Einmal auf einen Satz = den ganzen Satz einmal, nicht Datei für Datei. Live-Diff pro Task, nicht nur Einzeldatei.
_Avoid_: Apply ohne Gesamt-Diff; Teil-Apply nach Sammel-Freigabe

**Aktionsklasse**:
Art einer Aktion, die eine Freigabe decken darf: Dateiänderung, Test, git_commit, Netzwerk, Paketinstall, Deploy. Nicht in `r+w` enthalten. `git commit` immer mit Diff + expliziter Freigabe; `git push`/Deploy/Remote immer einzeln; `npm install`/`npx` immer explizit; Netzwerk eigenes Popup mit Zielhost.
_Avoid_: Shell-Whitelist als Berechtigung; git commit unter r+w ohne Dialog

**^_Code**:
Code-Profil (id `_code`): Workspace-Tools, Freigabe in Glyph. Direct `deepseek-v4-flash-vision-exp` für Text und Screenshots, Reserve OpenRouter `deepseek/deepseek-v4-flash-0731`. Dieselbe ACP-Brücke wie `°_Agent` mit `GLYPH_AGENT_MODE=code`.
_Avoid_: Claude-Profil, Anthropic-OAuth; Gemini als ^_Code-Default; Bild-Hop auf ein zweites Modell; r+w als Schreib-Dauerrecht

**°_Agent**:
UI-Label des Vault/Tools-Profils (id bleibt **`glyph-agent`**). Bindet die lokale Engine `~/glyph-agent` an (Vault/Tools + Cloud-Antwort). Engine-Vokabular lebt in `glyph-agent/CONTEXT.md`.
_Avoid_: OpenRouter-Profil, openrouter (als Profil-ID); UI-String „glyph-agent“ (nur id/Technik/Pfad)

**glyph-agent (Engine / id)**:
Technischer Name: Repo `~/glyph-agent`, Profil-id `glyph-agent`, HTTP-Dienst. In der UI heißt das Profil **`°_Agent`**.
_Avoid_: als sichtbares Dropdown-Label

**Cloud-Antwort**:
Nutzer-tauglicher Name für die Cloud-formulierte Antwort hinter dem Profil `°_Agent`. Technik-Detail „OpenRouter“ gehört nicht in UI-Labels.
_Avoid_: OpenRouter-Antwort in UI-Strings

## Settled decisions (grill 2026-08-05)

### Extensions / Slash (früher)

- **Inhalt Extensions-Modal / Slash-Popup v1:** Skills **und** Agent-Commands (kein Plugins/Hooks in v1).
- **Zwei Einstiege:** Slash-Popup bei `/` im Composer **und** volles Extensions-Modal (Button/Shortcut). Command-Legend bleibt vorerst eigenständig (Hilfe), wird nicht ersetzt.
- **Menü-Auswahl:** Eintrag bestätigt → Text in den Composer (`/name `), Fokus zurück; **kein** automatisches Senden.
- **Tastatur im Popup/Modal:** Solange die Liste offen ist, steuern Pfeile/Enter die Menü-Auswahl; Enter sendet **nicht** die Chat-Nachricht.
- **Skill-Quellen:** profilabhängig **plus Shared SoT** — alle Profile scannen `~/.glyph/skills/`; zusätzlich profilspezifische Roots (grok → `.grok/skills`; ^_Code → code-skills/Claude; glyph-agent → `.glyph-agent/skills`).
- **Shared SoT (2026-08-09):** `~/.glyph/AGENTS.md` = eine Wahrheit für Grok/^_Code/°_Agent; Grok lädt `~/.grok/rules/glyph-shared.md`. Geklärtes nicht pro Profil neu erzählen.
- **Offline:** Modal und Slash-Popup nutzbar; Skills von Disk, Agent-Commands leer bis Verbindung.
- **Öffnen Extensions-Modal:** Sidebar-Button **und** `Cmd/Ctrl+K` (kein `Ctrl+P` wegen Browser-Print).
- **Slash-Popup-Trigger:** `/` am Zeilenanfang oder nach Whitespace; nicht mitten in Pfaden/URLs.
- **Sidebar:** Button **Befehle und Skills** öffnet Extensions-Modal (Live Skills + Agent-Commands); **Buch** = Handbuch + UI-**Legende** (kein Live-Befehlskatalog). Kein zweiter Erweiterungs-Button.
- **Listung:** Gruppen Skills → Agent-Commands; bei Filter Fuzzy-Score innerhalb der Gruppen.
- **Einfügen:** Ersetzt das aktuelle `/partial`-Token durch `/{name} ` (Trailing Space); `inputHint` nur als UI-Hinweis, nicht als Text.
- **v1-Scope:** Desktop-first; Skill-Scan-Pfade profilabhängig an Harness-Konventionen; siehe ADR `docs/adr/0001-extensions-slash-insert-only.md`.

### B+ / „fertig?“ (diese Session)

- **Fertig-Definition (Q1=C):** Live-Test glyph-agent (Antwort + Trace/Steps) **plus** Doku ohne OpenRouter-Profil-Reste **plus** kein OpenClaw-Rückimport heikler Privat-Inhalte.
- **Bundle (Q2/Q7=A):** `service:install` + UI prüfen (Orchestrator); danach E2E.
- **OpenClaw (Q3=A):** `unsafeLocal.paths` ohne Privat/Behörden-Pfade (Backup + 7 Pfade entfernt).
- **Sprache (Q4):** UI „°_Agent / Cloud-Antwort“; „OpenRouter“ nur Config/CONSTITUTION/Technik; id/Pfad weiter `glyph-agent`.
- **Kontexte (Q5=B):** `glyph-ui/CONTEXT.md` = UI; `glyph-agent/CONTEXT.md` = Engine. Kein Vermischen.
- **Doku-Purge (Q6=A):** sichtbare UI-Strings + HANDBUCH/README (kein OpenRouter-Profil). Code-Zweige = Folge-PR (B).
- **Live-Test grün (Q8=B):** Profil `°_Agent` → Antwort + Meta Schritte **und** VaultFind erkennbar.
- **UI-Label (2026-08-07):** Profil-Label `glyph-agent` → **`°_Agent`** (analog `^_Code`); id `glyph-agent` unverändert. Früher `-_Agent`; Alias `-_Agent` bleibt in `resolveAgent` gültig.
- **ADR (Q9=C):** kein ADR; CONTEXT reicht.

### TUI-Übernahme (2026-08-19)

- **Rein:** Rewind, Prompt-History, Session-Titel, Plan-Freigabe (pending-only), LVL-Zusammenpressen (Grok ab Soft-Cap).
- **Nicht:** MCP-UI (`mcpServers: []` bleibt — Grok lädt `~/.grok/config.toml` selbst, TinyFish/Exa laufen), Grok-YOLO, Plugins/Hooks, Grok-Memory, Dashboard/Crew.
- Kein ADR — CONTEXT reicht.

### Ordner-Suche (2026-08-15)

- °_Agent-Composer: Pixel-Apfel (Minecraft: rot / Stiel braun / Blatt grün) **über dem Kopf**, außerhalb des Flow — Composer-Höhe unverändert. Standard **aus**. An = Gold-Outline + Puls, nicht goldene Füllung.
- An: Suche erst beim Senden; Treffer in der Arbeitsleiste über der LVL-Leiste, nie im Chat-Verlauf. Default **aus**; nur explizit aktivierte Treffer gehen in den Agent-Kontext (`vault_search` + `vault_selected`). Ohne Auswahl: normale Nachricht, kein Vault.
- Erster Kopf-Klick startet die Suche und **leert den Composer**; Query steht in der Leiste. Weiterer Prompt sofort tippbar.
- Suche abbrechen: × in der Leiste, Snack, oder Kopf ohne neuen Text. Fetch bricht ab — Leiste zu ≠ Suche läuft weiter.
- Toggle-Zustand pro Session, nicht global.
- Interaktives ACP: `vault_search` nur bei mindestens einem aktivierten Treffer. Fehlt/aus = kein VaultFind. Jobs/`/chat` ohne Flag: B+ unverändert.
- Suchfehler (404 etc.) rot in der Arbeitsleiste; Chat bleibt sendbar.
- Treffer: Ordner- und Dateinamen auf Disk (nicht nur Index-Eltern). Gleichnamige Ordner in HSEQ Sync und Hauptarchiv beide listen.
- Vault leer: Exa+TinyFish auf KomNet; 0 Treffer → dieselben auf DGUV. Gleiche Leiste, Label **KOMNET** / **DGUV**, `kind: web`. Nur aktivierte URLs in den Kontext — nicht als Vault-Pfad.
- Nach einer Auswahl: Follow-up sendet mit letzter Auswahl, kein zweiter Picker. × verwirft die Liste — neu fragen. Erste `sessionId` hält die Auswahl; Chat-Wechsel setzt sie zurück.

### Direct Vision-Exp (2026-08-21)

- °_Agent und ^_Code: Direct `deepseek-v4-flash-vision-exp` (Text + Bilder). Reserve `deepseek/deepseek-v4-flash-0731`.
- Kein Auto-Hop nur bei Screenshot. Graph/Anbindung Default und Placeholder = Vision-Exp.

### Arbeitsleiste (2026-08-20)

- Plan und Ordner-Suche teilen **ein** Chrome über der LVL-Leiste (`ComposerSheet`, Vorbild Plan).
- Freigabe Write/Shell bleibt Blocking-Modal (unterbricht). Slash-Popup / Rewind / Lupe selbst bleiben eigene Flächen.
- Kein ADR — CONTEXT reicht.

### Merken statt Zusammenfassen (2026-08-28)

- Kein Header-Button, keine Lupe-Aktion, keine neuen `summaries/` / `grok-sessions/`, keine Auto-Skills aus Sessions.
- Persistenz: Skill `/merken`. Chat-Ja vor Wiki-Schreiben. Ablehnen ohne Suchwert.
- Lupe **Schließen** = Disk-Ordner weg, kein Wiki-Dump.
- Router bleibt: Wiki-Karte **oder** MEMORY / CONTEXT / pending.
- ADR `docs/adr/0005-merken-not-summarize.md`.

### ^_Code Freigabe (2026-08-22)

- Formel: **Workspace-Recht + konkrete, zeitlich begrenzte Freigabe = Aktion.**
- `r+w` = Workspace beschreibbar. Nicht: ^_Code schreibt dauerhaft ohne Nachfrage.
- Kein `w` im Kabelsalat. Schreiben-ohne-Lesen nur später als Ausgabeordner-Spezialrecht.
- Freigabe-Dialog: **Einmal** · **Für Auftrag** · **Für Task**. Kein „immer“, kein „Für diese Session“.
- Task nur explizit schließen. Prompt außerhalb Scope → kein Grant, Hinweis statt Themenklassifikation.
- Einmal = gesamter vorgelegter Änderungssatz (ein Diff, eine Freigabe, transaktional). Nächste Agentenidee = neuer Satz.
- Task-Freigabe: Scope im Dialog editierbar (Pfade, Aktionsklassen, Testbefehle; ohne Netzwerk/Install/Commit außer explizit).
- Arbeitsleiste: **Aktiver Task** (Name, Workspace, Restzeit, Pfade/Aktionen, Widerrufen).
- Tool-Karte: *Warum erlaubt?*
- Änderungssatz: Gesamt-Diff, atomarer Apply, danach Tests, kein Auto-Commit.
- Engine-Policy: `glyph-agent` CONTEXT + ADR `docs/adr/0001-task-scoped-grants.md`. UI: ADR `docs/adr/0003-task-scoped-grants.md`.
- Reihenfolge danach (nicht dieser Schnitt): Plan vor Änderungen → Task-Freigaben → Gesamt-Diff/Test-Gate → Git (Branch/Worktree, Commit nur explizit) → optionale isolierte Worktrees → Audit pro Task.
- Hebt auf: Phase-1 „Write flüssig unter r+w“ und ACP-Option „Für diese Session erlauben“.

### Web-Fläche / glyph-ui.com (2026-08-26)

- glyph-ui.com ist Produktfläche (Cloudflare-Tunnel auf Loopback). Hebt auf: HANDBUCH „kein öffentliches Funnel“.
- Sitz **`web`**: eigener ACP-Prozess, nicht desk/phone. Arbeits-PC spiegelt den Mac-Chat nicht.
- Nur **°_Agent**. Grok Build und ^_Code bleiben Admin-Fläche (Mac / Loopback).
- Kein Tailscale Serve. Handy-Remote über das Tailnet ist abgezogen.
- UI: maximierter Chat (Verlauf + Composer). Eine Konversation = eine Fläche. Stift = neuer Chat. Header: **UI neu laden**, nicht Beenden (Kette bleibt Mac).
- Web-Tor Pflicht (Passwort). Eingeloggter Web-Nutzer ändert es in der Fläche (aktuell + neu). Origin exakt `https://glyph-ui.com`, kein Substring.
- ADR `docs/adr/0004-web-surface.md`.

### Aufgabe / Übergabe (2026-08-22)

- Aufgabe ≠ Task-Freigabe, ≠ Recurring-To-do.
- SoT `~/.glyph/tasks.json` (glyph-agent `/tasks`, UI-Proxy `/api/tasks`).
- Zielkopf optional; Default leer. Köpfe: Grok Build, ^_Code, °_Agent, Codex Build. **Kein** Kopf Analyse — Analyse bleibt Status.
- Neu: **Fertig wenn** Pflicht; **Fertig** nur mit Artefakt. Chat-Belege bleiben Kontext.
- Ketten-Button an der Antwort: speichern, dann Übernehmen in den Composer oder später im Plan zuweisen.
- MVP: kein automatischer Kopfwechsel, kein autonomes Weiterarbeiten.
- Belege ohne Blobs/Preview-URLs. Stale Engine (404 `/tasks`) → Hinweis, glyph-agent neu zu starten.
