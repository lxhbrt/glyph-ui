# Glyph

Browser-UI für mehrere lokale und Cloud-Agenten über ACP (Agent Client Protocol). Profilneutraler Client für grok, claude und glyph-agent.

## Orient (für ^_Code / Agenten)

1. Diese Datei zuerst lesen — **nicht** blind ListDir/Grep über das ganze Repo.
2. Aufgabe → passende **Node** unten → nur deren Quellen öffnen.
3. Struktur ändert sich (neuer Tab, neuer Server-Endpoint, Profil-Split) → Map hier nachziehen, nicht parallel erfinden.

## System map

| Node | Tut | Quellen (Einstieg) | Hängt an |
|------|-----|--------------------|----------|
| **Bridge** | Browser ↔ WebSocket ↔ ACP stdio (`grok agent` / glyph-agent-acp). Zwei Sitze: `desk` · `phone`. | `server/index.js`, `server/seats.js`, `server/glyph-agent-acp.mjs`, `server/acpIdle.mjs` | Sessions, Agents |
| **Client-Shell** | Chat-UI, Composer, Sidebars, Buch-Panel. Header-Unterzeile: Term · ACP (Handy nur am Sitz phone). cwd nicht in der Zeile — Tooltip auf Glyph #N + Workspace-Button. | `client/src/App.jsx`, `client/src/main.jsx` | Bridge-Events |
| **Palette / Type** | Eine Gold-Hex, eine Danger-Hex, Neutrals via `color-mix`; IBM Plex; Type-Scale fest | `client/src/styles.css` (`:root`) | Client-Shell |
| **LVL-Bar** | Kontext-Jagd: grau = Füllung, gold = Leseposition; Klick öffnet Legende. Über Soft-Cap (Grok): **Zusammenpressen** → `/compact`. | `ContextLvlBar.jsx` | Client-Shell |
| **Arbeitsleiste** | Angedockte Fläche über der LVL-Leiste: Plan, Ordner-Suche, Zusammenfassen. Gleiches Chrome (Label · Zähler · ×). Kein Mitte-Modal. | `ComposerSheet.jsx`, `PlanBar.jsx`, `VaultSearchHits.jsx`, `SummarizeDialog.jsx` | Client-Shell |
| **Tool-Karte** | Aufklappbare ACP-Toolzeile (Verb + Ziel, Diff/Ausgabe nach Klick) | `client/src/components/ToolCard.jsx`, `client/src/utils/toolCard.js`, `server/toolTitle.mjs` | Bridge `type: tool` |
| **Composer / Slash** | Eingabe, Slash-Popup, Skills/Commands einfügen. Modus **Chat · Deep Search · Fork · Swarm**: Fork = `x.ai/session/fork` dann ACP `session/fork`; Deep Search = Grok `/deep-research` (andere Köpfe ausgegraut); Swarm = °_Agent/^_Code `POST /chat` `swarm: true`. | `client/src/App.jsx`, `shared/composerActions.mjs`, `server/glyph-agent-acp.mjs` | Bridge |
| **Ordner-Suche** | °_Agent: Pixel-Apfel über ↵ (rot, ohne extra Höhe). Aus = keine Vault-Suche. An → `/api/vault/find`, Treffer in der Arbeitsleiste, Default aus, nur aktivierte in den Kontext. | `VaultSearchToggle.jsx`, `VaultSearchHits.jsx`, `utils/vaultSearch.js`, `server/vaultFlags.mjs` | glyph-agent `POST /vault/find`, `/chat` `vault_search` / `vault_selected` |
| **Sessions** | Session-Liste, Überblick, Summaries, **Name** (`/rename`) | `server/sessions.js`, `client/…/CommandOverview.jsx` | Bridge |
| **Rewind** | Nutzer-Turn und alles danach aus dem Verlauf. Esc Esc, `/rewind`, ↺ an der Nachricht. Dateien bleiben. | `shared/rewind.mjs`, `RewindPicker.jsx`, Bridge `type: rewind` | Sessions, Bridge |
| **Prompt-History** | ↑ auf leerem Composer: letzte Prompts (lokal, pro Profil) | `utils/promptHistory.js`, `PromptHistoryPopup.jsx` | Composer |
| **Bindings** | API-Keys / OAuth-Status + Kabelplan (hängende Kabel) | `server/bindings.js`, `BindingsPanel.jsx`, `utils/cables.js` | `~/.glyph-ui/bindings.json` |
| **Graph** | Vollfenster pechschwarz. Grok/Agent/Code = Snake-Köpfe um Glyph; Vaults/Roots = Punkte. Klick → Legende. | `CableLage.jsx`, `GraphLegend.jsx`, `utils/lageLayout.js`, `utils/bindingsModels.js` | Bindings, Vaults, Workspaces |
| **BindPanel** | Kompakt-Liste im Buch (Fallback) | `BindPanel.jsx`, `useBindResource.js` | Vaults-UI, Workspaces-UI |
| **Vaults-UI** | Kabelsalat °_Agent | `VaultsPanel.jsx` → Proxy `/api/…` | **glyph-agent** `/vaults` |
| **Workspaces-UI** | Kabelsalat ^_Code | `WorkspacesPanel.jsx` → `/api/workspaces` | **glyph-agent** `/workspaces` |
| **Plan / Recurring** | Kalender-Tab Plan | `server/plan.js`, `PlanBar.jsx` | glyph-agent `/recurring` |
| **Domain-SoT** | Begriffe + settled decisions | **diese** `CONTEXT.md`, `docs/adr/` | `~/.glyph/AGENTS.md` |

**Nicht hier:** Vault-Inhalte, HSEQ-Jobs, Embedding — das ist `glyph-agent`.

**Crux (häufige Bugs):** Write/Shell-Genehmigung und Workspace-Modi leben in **glyph-agent** (`code_loop` / `code_tools`), nicht in der UI. UI zeigt nur Popup/Banner. ACP-Bridge ≠ HTTP-API der Engine.

**Session zusammenfassen → Skill:** Button **Zusammenfassen** im Header (rechts neben der Kette), sobald Agent verbunden + Session da; Grok zusätzlich in der Lupe. Vorschau in der **Arbeitsleiste** über der LVL-Leiste (kein Mitte-Modal). Beim Speichern (≥3 Nutzer-Turns) Workflow-Skill unter `~/.glyph/skills/<slug>/` (`source: session-summary`). Hand-Skills ohne Flag: nur `references/`. Opt-out in der Leiste. Titel = letzte substanzielle Nutzerzeile, nicht Test-Pings („TEST TEST TEST“). Code: `server/summaries.js` (`buildDraftFromTurns`) + `SummarizeDialog.jsx`.

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
Eine aufklappbare Zeile im Chat für einen ACP-Tool-Aufruf: Verb + Ziel in der Zusammenfassung, Input/Diff/Ausgabe erst nach Klick. Fehlgeschlagene Tools öffnen sich selbst. Preview: `?toolcard=demo`.
_Avoid_: Tool-Card (EN), Paper-Card, grok-build-web Disclosure

**Ordner-Suche**:
Manueller Vault-Zugriff im Profil **°_Agent**. Pixel-Apfel **über dem Senden-Button** (nicht zwischen + und Chat), ohne die Composer-Höhe zu erhöhen. Minecraft: roter Körper, brauner Stiel, grünes Blatt; inaktiv abgedunkelt; an = Gold-Outline + Puls. Standard aus — Agent antwortet ohne VaultFind/ListVaultDir. An: nächste Sendung sucht, Treffer in der **Arbeitsleiste** über der LVL-Leiste (nicht als Overlay über der Eingabe), nie im Chat-Verlauf, jedes Ergebnis startet aus; nur explizit an = in den Agent-Kontext. Zustand pro Session (`sessionStorage`). Jobs/Engine ohne Flag bleiben beim B+-Precheck. ACP sendet `vault_search` nur wenn mindestens ein Treffer aktiv ist.
_Avoid_: automatische Vault-Suche bei jeder °_Agent-Nachricht; Apfel zwischen + und Chat; Lupe (Sessions); Treffer als Chat-Nachrichten; Gold-gefüllter Apfel; Treffer-Popup über der Composer-Box

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
Angedockte Fläche über der LVL-Leiste für laufende Arbeit am Composer: **Plan**, **Ordner-Suche**, **Zusammenfassen**. Ein Chrome (Gold-Rand, Label, Zähler, ×, optionale Primäraktion). Nicht Bildschirmmitte, nicht zweites Overlay-System. Freigabe-Modal (^_Code Write/Shell) bleibt eigenes Blocking-Modal.
_Avoid_: Zusammenfassen als Vollbild-Dialog; Ordner-Suche als schwebendes Overlay; zweite Bildsprache für diese drei Flächen

**Plan-Freigabe**:
Aktionen an der Plan-Leiste (Arbeitsleiste), solange jeder Eintrag `pending` ist: **Umsetzen** sendet den Auftrag, **Ändern** fokussiert den Composer. Kein TUI-Plan-Modus (`plan.md` / Approve-Preview).
_Avoid_: Plan-Mode, plan.md-Editor, automatisches Senden

**Zusammenpressen**:
`/compact` aus der LVL-Legende, sobald die Füllung den Soft-Cap erreicht (nur Grok, idle).
_Avoid_: Compact für °_Agent/^_Code; Compact-Button immer sichtbar

**Multiline (Composer)**:
Desk: Enter = senden, Shift+Enter = Zeile. Phone: Tastatur-Enter = Zeile; der runde ↵-Button sendet (⌘/Ctrl+Enter ebenfalls). Slash-Popup: Enter = auswählen, beide Sitze. Kein globaler Multiline-Toggle.
_Avoid_: textarea rows (nur visuelle Höhe)

**Agent-Command**:
Ein vom verbundenen Agenten per ACP gemeldeter Slash-Befehl (Live-Katalog `available_commands`), z. B. `/compact`, `/plan`.
_Avoid_: Skill (lokal/dateibasiert, nicht zwingend vom Agenten gelistet)

**Skill (Glyph-UI)**:
Ein entdeckbarer, benennbarer Prompt-/Workflow-Eintrag (z. B. aus `~/.grok/skills` oder gebündelten Quellen), den die UI im Extensions-Modal und ggf. im Slash-Popup anbietet.
_Avoid_: Plugin, Hook, Agent-Command

**Sitz**:
Gerätessessel für dasselbe Agent-Profil: **`desk`** (Schreibtisch) und **`phone`** (Handy). Jeder Sitz hat eigenen ACP-Prozess und eigene Live-Session. SoT (Vaults, Roots, Vertrag) ist eins. Kein Crew: nicht dieselbe Aufgabe parallel. Query `?seat=phone` · Header `X-Glyph-Seat`. Dieselbe Session-ID nicht auf zwei Sitzen gleichzeitig offen.
_Avoid_: Schwarm, mehrere Agenten an einer Aufgabe, Geräte = Profile

**Agent-Profil**:
Eines der wählbaren ACP-Agenten in Glyph: **Grok Build** (`grok`), **`^_Code`** (`_code`), **`°_Agent`** (id `glyph-agent`). Glyph spawnt ein anderes Binary/Env, nicht „ein anderes Modell“.
_Avoid_: OpenRouter (kein UI-Profil mehr), Claude (ersetzt durch ^_Code), Provider, Modell (als Profilname); UI-String „Grok“ allein als Profil-/Kopf-Name

**Grok Build**:
UI-Label des grok-Profils (id bleibt **`grok`**). Die Grok-Build-CLI, nicht Grok Chat. Header: Picker **Grok Build**, Pille = Modell (oder CLI) — nicht noch einmal „Grok“.
_Avoid_: Dropdown-/Pille-/Graph-Label „Grok“ (ergibt „Grok Grok“)

**Anbindung**:
Keys, Host-URL und Modelle unter `~/.glyph-ui/bindings.json`. Header-Pille öffnet den **Graph** auf dem aktiven Kopf. Pille zeigt nur das **eingesetzte** Modell (Kürzel) — Primary→Reserve bleibt Graph/Tooltip. °_Agent / ^_Code-Legende setzt Direct-Key, OpenRouter-Key, Host (`DIRECT_API_URL`) und Modell (ohne Slash = Direct-ID, mit Slash = OpenRouter-Slug). Grok-OAuth bleibt Terminal (`grok login`).
_Avoid_: Settings (zu generisch), Login-Dialog (impliziert eingebettetes OAuth), Kalender (nur Grok-Aktivität, oft disabled)

**Graph**:
Vollfenster, pechschwarz, kein Bild — auch im hellen App-Theme. Mitte = Glyph-Symbol. Köpfe = Snake-Pixel Grok Build / °_Agent / ^_Code, radial (Grok Build oben, Agent links, Code rechts). Klick Kopf → rutscht in die Mitte, zeigt Abhängigkeiten. Ordner (Vaults, Roots) = Kreise; Favorit und aktuell gewählter Ordner = Goldstern (*). Rechte am Knoten: ungebunden = eine Stufe dunkler, keine Linie; lesen = Standardkreis + vier kurze Striche; privat = eine Stufe dunkler + Punkte. Jeder Ordner darf an jeden Kopf, jede Kante eigene Rechte (`heads`: lesen / schreiben / privat / ungebunden). Grok Build startet offen (schreiben), außer Privat — einschränken, nicht erst freigeben. Kanten: Glyph↔Köpfe = Achse (dünn, ~40 % Opacity). Rechte: schreiben solid, lesen gestrichelt, privat gepunktet — pro Kopf. Auswahl eines Ordners: nur dessen Rechte-Kanten voll, Rest stark gedimmt. Klick Knoten: Name + Nachbarn; Legende setzt Rechte pro Kopf. Labels nur Hover/Selektion. `?graph=`.
_Avoid_: Lage, Gefäß, Tunnel-Foto, Tafel-Chips, hängende Kabel; ein Kopf pro Ordner; Kreis für den Favoriten

**Plan & Aktivität (Tafel-Symbol)**:
Kalender-Icon, Tabs Plan / Aktivität. In der Leiste: nur die Zeichen (und die Tafel-Linie) in `currentColor` — Dunkel grau/weiß, Hell schwarz/grau, wie Lupe und Buch. Keine gefüllte Platte.
_Avoid_: gelbe/schwarze Tafel-Füllung in der Leiste

**Workspaces (Kabelsalat)**:
Tab im **Buch**-Panel: Code-Roots anbinden/lösen, Rechte r · r+w · 🔒, Primär★. SoT `~/.glyph/workspaces.json` via glyph-agent `/workspaces` und UI-Proxy `/api/workspaces`. Analog **Vaults**. Mehrfach-Anbindung (`heads` je Kopf) lebt im **Graph**; Buch-Tab setzt weiter das Heim-Recht (Code bzw. Agent).
_Avoid_: Vaults-Tab (Obsidian/°_Agent), Finder-„Workspace“-Leistenbutton (nur cwd öffnen)

**^_Code**:
Code-Profil (id `_code`): DeepSeek V4 Flash via OpenRouter, Workspace-Tools, Genehmigung in Glyph. Nutzt dieselbe ACP-Brücke wie `°_Agent` mit `GLYPH_AGENT_MODE=code`.
_Avoid_: Claude-Profil, Anthropic-OAuth

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

- °_Agent-Composer: Pixel-Apfel (Minecraft: rot / Stiel braun / Blatt grün) **über ↵**, außerhalb des Flow — Composer-Höhe unverändert. Standard **aus**. An = Gold-Outline + Puls, nicht goldene Füllung.
- An: Suche erst beim Senden; Treffer in der Arbeitsleiste über der LVL-Leiste, nie im Chat-Verlauf. Default **aus**; nur explizit aktivierte Treffer gehen in den Agent-Kontext (`vault_search` + `vault_selected`). Ohne Auswahl: normale Nachricht, kein Vault.
- Toggle-Zustand pro Session, nicht global.
- Interaktives ACP: `vault_search` nur bei mindestens einem aktivierten Treffer. Fehlt/aus = kein VaultFind. Jobs/`/chat` ohne Flag: B+ unverändert.
- Suchfehler (404 etc.) rot in der Arbeitsleiste; Chat bleibt sendbar.

### Arbeitsleiste (2026-08-20)

- Plan, Ordner-Suche und Zusammenfassen teilen **ein** Chrome über der LVL-Leiste (`ComposerSheet`, Vorbild Plan).
- Zusammenfassen: kein Mitte-Modal. Header (aktive Session) und Lupe (andere Grok-Sessions) docken dieselbe Leiste; Lupe schließt vorher.
- Freigabe Write/Shell bleibt Blocking-Modal (unterbricht). Slash-Popup / Rewind / Lupe selbst bleiben eigene Flächen.
- Kein ADR — CONTEXT reicht.
