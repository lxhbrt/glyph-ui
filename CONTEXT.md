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
| **Client-Shell** | Chat-UI, Composer, Sidebars, Buch-Panel | `client/src/App.jsx`, `client/src/main.jsx` | Bridge-Events |
| **Palette / Type** | Eine Gold-Hex, eine Danger-Hex, Neutrals via `color-mix`; IBM Plex; Type-Scale fest | `client/src/styles.css` (`:root`) | Client-Shell |
| **LVL-Bar** | Kontext-Jagd: grau = Füllung, gold = Leseposition; Klick öffnet Legende | `ContextLvlBar.jsx` | Client-Shell |
| **Tool-Karte** | Aufklappbare ACP-Toolzeile (Verb + Ziel, Diff/Ausgabe nach Klick) | `client/src/components/ToolCard.jsx`, `client/src/utils/toolCard.js`, `server/toolTitle.mjs` | Bridge `type: tool` |
| **Composer / Slash** | Eingabe, Slash-Popup, Skills/Commands einfügen | `client/src/components/SlashPopup.jsx`, `ExtensionsModal.jsx` | `server/skills.js`, `server/commands.js` |
| **Ordner-Suche** | °_Agent: Pixel-Apfel über ↵ (rot, ohne extra Höhe). Aus = keine Vault-Suche. An → `/api/vault/find`, Treffer nur im Panel, Default aus, nur aktivierte in den Kontext. | `VaultSearchToggle.jsx`, `VaultSearchHits.jsx`, `utils/vaultSearch.js`, `server/vaultFlags.mjs` | glyph-agent `POST /vault/find`, `/chat` `vault_search` / `vault_selected` |
| **Sessions** | Session-Liste, Überblick, Summaries | `server/sessions.js`, `client/…/CommandOverview.jsx` | Bridge |
| **Bindings** | API-Keys / OAuth-Status + Kabelplan (hängende Kabel) | `server/bindings.js`, `BindingsPanel.jsx`, `utils/cables.js` | `~/.glyph-ui/bindings.json` |
| **Graph** | Vollfenster pechschwarz. Grok/Agent/Code = Snake-Köpfe um Glyph; Vaults/Roots = Punkte. Klick → Legende. | `CableLage.jsx`, `GraphLegend.jsx`, `utils/lageLayout.js`, `utils/bindingsModels.js` | Bindings, Vaults, Workspaces |
| **BindPanel** | Kompakt-Liste im Buch (Fallback) | `BindPanel.jsx`, `useBindResource.js` | Vaults-UI, Workspaces-UI |
| **Vaults-UI** | Kabelsalat °_Agent | `VaultsPanel.jsx` → Proxy `/api/…` | **glyph-agent** `/vaults` |
| **Workspaces-UI** | Kabelsalat ^_Code | `WorkspacesPanel.jsx` → `/api/workspaces` | **glyph-agent** `/workspaces` |
| **Plan / Recurring** | Kalender-Tab Plan | `server/plan.js`, `PlanBar.jsx` | glyph-agent `/recurring` |
| **Domain-SoT** | Begriffe + settled decisions | **diese** `CONTEXT.md`, `docs/adr/` | `~/.glyph/AGENTS.md` |

**Nicht hier:** Vault-Inhalte, HSEQ-Jobs, Embedding — das ist `glyph-agent`.

**Crux (häufige Bugs):** Write/Shell-Genehmigung und Workspace-Modi leben in **glyph-agent** (`code_loop` / `code_tools`), nicht in der UI. UI zeigt nur Popup/Banner. ACP-Bridge ≠ HTTP-API der Engine.

**Session zusammenfassen → Skill:** Button **Zusammenfassen** im Header (rechts neben der Kette), sobald Agent verbunden + Session da; Grok zusätzlich in der Lupe. Beim Speichern (≥3 Nutzer-Turns) Workflow-Skill unter `~/.glyph/skills/<slug>/` (`source: session-summary`). Hand-Skills ohne Flag: nur `references/`. Opt-out im Dialog. Titel = letzte substanzielle Nutzerzeile, nicht Test-Pings („TEST TEST TEST“). Code: `server/summaries.js` (`buildDraftFromTurns`) + `SummarizeDialog.jsx`.

## Language

**Composer**:
Das Nachrichteneingabefeld im Chat-Footer (Textarea), in dem der Nutzer Tippt, Anhänge anhängt und Sendungen auslöst.
_Avoid_: Prompt-Box, Input, Chatbox

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
Manueller Vault-Zugriff im Profil **°_Agent**. Pixel-Apfel **über dem Senden-Button** (nicht zwischen + und Chat), ohne die Composer-Höhe zu erhöhen. Minecraft: roter Körper, brauner Stiel, grünes Blatt; inaktiv abgedunkelt; an = Gold-Outline + Puls. Standard aus — Agent antwortet ohne VaultFind/ListVaultDir. An: nächste Sendung sucht, Treffer nur im Panel (nicht im Chat-Verlauf), jedes Ergebnis startet aus; nur explizit an = in den Agent-Kontext. Zustand pro Session (`sessionStorage`). Jobs/Engine ohne Flag bleiben beim B+-Precheck. ACP sendet `vault_search` nur wenn mindestens ein Treffer aktiv ist.
_Avoid_: automatische Vault-Suche bei jeder °_Agent-Nachricht; Apfel zwischen + und Chat; Lupe (Sessions); Treffer als Chat-Nachrichten; Gold-gefüllter Apfel

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
Eines der wählbaren ACP-Agenten in Glyph: **grok**, **`^_Code`** (`_code`), **`°_Agent`** (id `glyph-agent`). Glyph spawnt ein anderes Binary/Env, nicht „ein anderes Modell“.
_Avoid_: OpenRouter (kein UI-Profil mehr), Claude (ersetzt durch ^_Code), Provider, Modell (als Profilname)

**Anbindung**:
Keys, Host-URL und Modelle unter `~/.glyph-ui/bindings.json`. Header-Pille öffnet den **Graph** auf dem aktiven Kopf. °_Agent / ^_Code-Legende setzt Direct-Key, OpenRouter-Key, Host (`DIRECT_API_URL`) und Modell (ohne Slash = Direct-ID, mit Slash = OpenRouter-Slug). Grok-OAuth bleibt Terminal (`grok login`).
_Avoid_: Settings (zu generisch), Login-Dialog (impliziert eingebettetes OAuth), Kalender (nur Grok-Aktivität, oft disabled)

**Graph**:
Vollfenster, pechschwarz, kein Bild — auch im hellen App-Theme. Mitte = Glyph-Symbol. Köpfe = Snake-Pixel Grok / °_Agent / ^_Code, radial (Grok oben, Agent links, Code rechts). Klick Kopf → rutscht in die Mitte, zeigt Abhängigkeiten. Ordner (Vaults, Roots) = Kreise; Favorit und aktuell gewählter Ordner = Goldstern (*). Rechte am Knoten: ungebunden = eine Stufe dunkler, keine Linie; lesen = Standardkreis + vier kurze Striche; privat = eine Stufe dunkler + Punkte. Jeder Ordner darf an jeden Kopf, jede Kante eigene Rechte (`heads`: lesen / schreiben / privat / ungebunden). Grok startet offen (schreiben), außer Privat — einschränken, nicht erst freigeben. Kanten: Glyph↔Köpfe = Achse (dünn, ~40 % Opacity). Rechte: schreiben solid, lesen gestrichelt, privat gepunktet — pro Kopf. Auswahl eines Ordners: nur dessen Rechte-Kanten voll, Rest stark gedimmt. Klick Knoten: Name + Nachbarn; Legende setzt Rechte pro Kopf. Labels nur Hover/Selektion. `?graph=`.
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

### Ordner-Suche (2026-08-15)

- °_Agent-Composer: Pixel-Apfel (Minecraft: rot / Stiel braun / Blatt grün) **über ↵**, außerhalb des Flow — Composer-Höhe unverändert. Standard **aus**. An = Gold-Outline + Puls, nicht goldene Füllung.
- An: Suche erst beim Senden; Treffer nur im Ordner-Suche-Panel, nie im Chat-Verlauf. Default **aus**; nur explizit aktivierte Treffer gehen in den Agent-Kontext (`vault_search` + `vault_selected`). Ohne Auswahl: normale Nachricht, kein Vault.
- Toggle-Zustand pro Session, nicht global.
- Interaktives ACP: `vault_search` nur bei mindestens einem aktivierten Treffer. Fehlt/aus = kein VaultFind. Jobs/`/chat` ohne Flag: B+ unverändert.
- Suchfehler (404 etc.) rot im Panel; Chat bleibt sendbar.
