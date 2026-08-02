# Glyph

**Build Term for Grok** — unabhängige Browser-UI für lokale Agenten über ACP (Agent Client Protocol).

**Erstellt von [Lx Hbrt](https://github.com/lxhbrt)** · Copyright © 2026 · [MIT License](./LICENSE)

> Unofficial / independent — **not affiliated with or endorsed by xAI**. „Grok“ und „Grok Build“ sind Marken der jeweiligen Rechteinhaber.

**Anwendungshandbuch (DE):** [HANDBUCH.md](./HANDBUCH.md)

```
Browser (React)  --WebSocket-->  Node Bridge  --stdio ACP-->  Agent-Profil
                                                               (grok | claude | openrouter | glyph-agent)
```

## Voraussetzungen

- Node.js 22+
- [`grok`](https://x.ai) im PATH und eingeloggt (`grok login` / vorhandenes `~/.grok/auth.json`) — nur für das **grok**-Profil
- Andere Profile nach Bedarf (siehe [Agent-Profile](#agent-profile--glyph-agent))

## Installation

```bash
git clone https://github.com/lxhbrt/glyph-ui.git
cd glyph-ui
npm install
```

## Ports (ein Modell)

| Modus | UI | Bridge / API / WS |
|-------|----|-------------------|
| **Produktion** (`npm start`, LaunchAgent) | **http://127.0.0.1:5174** | derselbe Port (static + API + `/ws`) |
| **Entwicklung** (`npm run dev`) | **http://localhost:5173** (Vite) | **5174** — Vite proxied `/api` und `/ws` |

Merksatz: **Prod immer 5174.** Port 5173 nur Dev-UI; die Bridge bleibt auf 5174.

## Start

### Entwicklung

```bash
npm run dev
```

Dann öffnen:

- UI: http://localhost:5173 *(nur Dev)*  
- Bridge-API: http://localhost:5174/api/health  

### Produktion

```bash
npm run build
npm start
# UI + Bridge auf http://127.0.0.1:5174
```

### macOS Dauerbetrieb (LaunchAgent)

```bash
npm run service:install   # baut client/dist immer neu, dann LaunchAgent
npm run service:status
npm run service:uninstall
```

### App öffnen (macOS)

Doppelklick auf `scripts/Open Glyph.command`  
oder: `npm run open` → öffnet **http://127.0.0.1:5174/**

### Tests & CI

```bash
npm test                  # Unit + Smoke (temp. Server: Health + WS + CSRF + Sessions)
npm run lint              # ESLint
SMOKE_URL=http://127.0.0.1:5174 npm test   # Smoke gegen laufenden Prod-Service
```

Auf `main` und bei Pull Requests läuft dasselbe über GitHub Actions (Node 22 → `npm ci` → lint → test).

## Nutzung

1. Nachricht tippen, **Enter** senden (Shift+Enter = Zeilenumbruch)
2. Streaming: Antwort, Thoughts, Tool-Aufrufe
3. Composer-Aktion wählen: **Chat** (normal), **Deep Search** (`/deep-research`), **Fork** (Session branchen)
4. Status-Button **verbunden** / **offline**: klicken startet den lokalen Grok-Agent neu
5. **Neue Session** startet eine frische ACP-Session
6. **Overview** listet lokale Grok-Sessions und erlaubt Schließen mit optionalem Wiki-Archiv (**Löschen** ≈ TUI `/delete`)

Details: [HANDBUCH.md](./HANDBUCH.md)

## Agent-Profile & glyph-agent

Glyph ist ein **ACP-Client** (kein Modell-Client): Das aktive Profil spawnet ein anderes
Binary/adapter, statt auf eine andere API zu zeigen. Profile in `server/agents.js`,
Auswahl in der UI (Header), Start-Profil via `GLYPH_AGENT` (Default `grok`).

| Profil | Spawnt | Hinweis |
|--------|--------|---------|
| **grok** (Default) | `grok agent --always-approve --no-leader stdio` | Volle Fähigkeiten (Sessions, Deep Search, Aktivität) |
| **claude** | `claude-agent-acp` (od. `npx …`) | Sessions unter `~/.claude/projects` (nicht in Glyph gelistet) |
| **openrouter** | `node server/openrouter-acp.mjs` | `OPENROUTER_API_KEY`; Cloud-Modelle zum Testen/Anbinden |
| **glyph-agent** | `node server/glyph-agent-acp.mjs` | Dünne Brücke zum lokalen glyph-agent-Dienst |

**glyph-agent** (separate Codebasis `~/glyph-agent/`) ist die lokale Tool-/Recherche-Schicht:
HTTP-Dienst (`server.py`, localhost**:18899**) mit kontrolliertem Tool-Loop, lokalem Modell-
Adapter (Qwen, austauschbar) und Vault-/Recherche-Tools. Die Brücke `server/glyph-agent-acp.mjs`
übersetzt ACP ↔ HTTP und streamt die Antwort als Chunks zurück.

- **Vault intern:** Lesen (`VaultSearch`, `ReadNote`) · Schreiben (`CreateNote`, `ProposeEdit`/Diff, `ApplyEdit`) nur mit Bestätigung
- **Recherche extern:** `WebSearch` (Exa) — getrennt von internen Daten

Voraussetzung: lokalen Dienst starten → `cd ~/glyph-agent && python server.py`, prüfen mit
`curl http://127.0.0.1:18899/health` (→ `ok`).

## UI-Design (Grok Chat Stil)

| Element | Look |
|---------|------|
| Chat-Fläche | Schwarz wie die Umgebung (`--bg`) |
| Antworten | Flach, ohne Karte |
| Prompts | Rechte Sprechblasen |
| Composer | Bubble-Eingabe, runder **↵** / runder **Snack-Stopp** |

Siehe [HANDBUCH.md §2 Design](./HANDBUCH.md#design-grok-chat-stil).

## Umgebungsvariablen

Siehe [`.env.example`](./.env.example). `npm start` / `npm run dev` laden `.env` nativ (`node --env-file-if-exists=.env`); die Datei ist optional.

Wichtige Variablen:

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `PORT` | `5174` | Prod-Port (UI + Bridge; Dev-Bridge ebenfalls) |
| `HOST` | `127.0.0.1` | Bind-Adresse |
| `GLYPH_UI_CWD` | Home-Verzeichnis | Workspace für `session/new` |
| `GROK_BIN` | `grok` | Pfad zur Grok-CLI |
| `GLYPH_AGENT` | `grok` | Agent-Profil beim Start (grok \| claude \| openrouter \| glyph-agent) |
| `GLYPH_AGENT_URL` | `http://127.0.0.1:18899` | glyph-agent-HTTP-Dienst (nur Profil glyph-agent) |
| `GLYPH_AGENT_TIMEOUT` | `300000` | Timeout (ms) für glyph-agent-Antwort |
| `XAI_API_KEY` | — | Voice (STT/TTS) — [console.x.ai](https://console.x.ai) |

Beispiel:

```bash
GLYPH_UI_CWD="$HOME/mein-projekt" npm run dev
```

## Architektur

| Pfad | Rolle |
|------|--------|
| `server/` | Express + WebSocket-Bridge, spawnt das aktive Agent-Profil (ACP stdio) |
| `server/agents.js` | Agent-Profile (grok, claude, openrouter, glyph-agent) + Auflösung |
| `client/` | Vite + React Chat-UI |
| `scripts/` | macOS LaunchAgent, Dock-Icon |
| `assets/` | App-Icons |

## Sicherheit

Nur auf **localhost** laufen lassen. Die Bridge startet Grok mit `--always-approve` (volle Tool-Rechte). Nicht ungeschützt ins Netz hängen.

## Urheberrecht & Marken

- **Produktname:** **Glyph** (eigenständig; „Build Term for Grok“ ist die Funktionsbeschreibung).
- **Software:** Copyright © 2026 [Lx Hbrt](https://github.com/lxhbrt) (Alexander Hubert). Lizenziert unter [MIT](./LICENSE).
- **Autorenliste:** [AUTHORS](./AUTHORS) · [NOTICE](./NOTICE)
- „Grok“ / „Grok Build“ sind Marken der jeweiligen Rechteinhaber (xAI / SpaceXAI). Dieses Projekt ist eine **unabhängige, inoffizielle** Browser-Oberfläche für die **lokale** Grok-Build-CLI. Es steht in **keiner** Partnerschaft mit xAI und wird von xAI **nicht** unterstützt oder freigegeben, sofern nicht ausdrücklich anders angegeben.
- Glyph nutzt Grok nur als **Interoperabilitätsbezug** (CLI/ACP). Keine xAI-Logos oder offiziellen Assets als eigene Marke.

## Contributing

Issues und Pull Requests willkommen. Bitte den Copyright-Hinweis und die MIT-Lizenz in abgeleiteten Werken beibehalten.

## Lizenz

[MIT](./LICENSE) © 2026 Lx Hbrt (Alexander Hubert)
