# Glyph

Browser-UI für mehrere lokale und Cloud-Agenten über ACP (Agent Client Protocol). Profilneutraler Client für grok, claude und glyph-agent.

## Orient (für ^_Code / Agenten)

1. Diese Datei zuerst lesen — **nicht** blind ListDir/Grep über das ganze Repo.
2. Aufgabe → passende **Node** unten → nur deren Quellen öffnen.
3. Struktur ändert sich (neuer Tab, neuer Server-Endpoint, Profil-Split) → Map hier nachziehen, nicht parallel erfinden.

## System map

| Node | Tut | Quellen (Einstieg) | Hängt an |
|------|-----|--------------------|----------|
| **Bridge** | Browser ↔ WebSocket ↔ ACP stdio (`grok agent` / glyph-agent-acp) | `server/index.js`, `server/glyph-agent-acp.mjs` | Sessions, Agents |
| **Client-Shell** | Chat-UI, Composer, Sidebars, Buch-Panel | `client/src/App.jsx`, `client/src/main.jsx` | Bridge-Events |
| **Composer / Slash** | Eingabe, Slash-Popup, Skills/Commands einfügen | `client/src/components/SlashPopup.jsx`, `ExtensionsModal.jsx` | `server/skills.js`, `server/commands.js` |
| **Sessions** | Session-Liste, Überblick, Summaries | `server/sessions.js`, `client/…/CommandOverview.jsx` | Bridge |
| **Bindings** | API-Keys / OAuth-Status speichern | `server/bindings.js`, `BindingsPanel.jsx` | `~/.glyph-ui/bindings.json` |
| **BindPanel** | Gemeinsames Kabelsalat-UI (Vaults + Workspaces) | `BindPanel.jsx`, `useBindResource.js` | Vaults-UI, Workspaces-UI |
| **Vaults-UI** | Kabelsalat °_Agent | `VaultsPanel.jsx` → Proxy `/api/…` | **glyph-agent** `/vaults` |
| **Workspaces-UI** | Kabelsalat ^_Code | `WorkspacesPanel.jsx` → `/api/workspaces` | **glyph-agent** `/workspaces` |
| **Plan / Recurring** | Kalender-Tab Plan | `server/plan.js`, `PlanBar.jsx` | glyph-agent `/recurring` |
| **Domain-SoT** | Begriffe + settled decisions | **diese** `CONTEXT.md`, `docs/adr/` | `~/.glyph/AGENTS.md` |

**Nicht hier:** Vault-Inhalte, HSEQ-Jobs, Embedding — das ist `glyph-agent`.

**Crux (häufige Bugs):** Write/Shell-Genehmigung und Workspace-Modi leben in **glyph-agent** (`code_loop` / `code_tools`), nicht in der UI. UI zeigt nur Popup/Banner. ACP-Bridge ≠ HTTP-API der Engine.

**Session zusammenfassen → Skill:** Beim Speichern (Lupe / Active-Session) wird bei ≥3 Nutzer-Turns ein Workflow-Skill unter `~/.glyph/skills/<slug>/` angelegt oder erweitert (`source: session-summary`). Hand-Skills ohne dieses Flag: nur `references/`. Opt-out im Dialog. Code: `server/summaries.js` + `SummarizeDialog.jsx`.

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

**Multiline (Composer)**:
Verhalten, bei dem Enter eine neue Zeile einfügt und eine andere Geste sendet — in Glyph heute: Shift+Enter = Zeile, Enter = Senden. Kein globaler Multiline-Toggle in v1.
_Avoid_: textarea rows (nur visuelle Höhe)

**Agent-Command**:
Ein vom verbundenen Agenten per ACP gemeldeter Slash-Befehl (Live-Katalog `available_commands`), z. B. `/compact`, `/plan`.
_Avoid_: Skill (lokal/dateibasiert, nicht zwingend vom Agenten gelistet)

**Skill (Glyph-UI)**:
Ein entdeckbarer, benennbarer Prompt-/Workflow-Eintrag (z. B. aus `~/.grok/skills` oder gebündelten Quellen), den die UI im Extensions-Modal und ggf. im Slash-Popup anbietet.
_Avoid_: Plugin, Hook, Agent-Command

**Agent-Profil**:
Eines der wählbaren ACP-Agenten in Glyph: **grok**, **`^_Code`** (`_code`), **`°_Agent`** (id `glyph-agent`). Glyph spawnt ein anderes Binary/Env, nicht „ein anderes Modell“.
_Avoid_: OpenRouter (kein UI-Profil mehr), Claude (ersetzt durch ^_Code), Provider, Modell (als Profilname)

**Anbindung**:
Tab im **Buch**-Panel (Handbuch · Befehle · Anbindung · Vaults · Workspaces) zum Prüfen von OAuth/Service-Status und Speichern von API-Keys (`DIRECT_API_KEY` + `DIRECT_API_URL`, `OPENROUTER_API_KEY`, `XAI_API_KEY`) unter `~/.glyph-ui/bindings.json`. Direct-Key ist OpenAI-kompatibel (DeepSeek, Grok, …). Kein eigenes Leisten-Icon. Grok-OAuth bleibt Terminal (`grok login`).
_Avoid_: Settings (zu generisch), Login-Dialog (impliziert eingebettetes OAuth), Kalender (nur Grok-Aktivität, oft disabled)

**Workspaces (Kabelsalat)**:
Tab im **Buch**-Panel: Code-Roots an **^_Code** anbinden/lösen, Rechte r · r+w · 🔒 gesperrt, Primär★. SoT `~/.glyph/workspaces.json` via glyph-agent `/workspaces` und UI-Proxy `/api/workspaces`. Analog **Vaults** (für °_Agent).
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
