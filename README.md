# Grok Build Terminal

Browser-UI für **Grok Build** (Terminal/Agent) über ACP (Agent Client Protocol).

**Erstellt von [Lx Hbrt](https://github.com/lxhbrt)** · Copyright © 2026 · [MIT License](./LICENSE)

**Anwendungshandbuch (DE):** [HANDBUCH.md](./HANDBUCH.md)

```
Browser (React)  --WebSocket-->  Node Bridge  --stdio ACP-->  grok agent
```

## Voraussetzungen

- Node.js 22+
- [`grok`](https://x.ai) im PATH und eingeloggt (`grok login` / vorhandenes `~/.grok/auth.json`)

## Installation

```bash
git clone https://github.com/lxhbrt/grok-chat-ui.git
cd grok-chat-ui
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

Doppelklick auf `scripts/Open Grok Build Terminal.command`  
oder: `npm run open` → öffnet **http://127.0.0.1:5174/**

### Smoke-Tests

```bash
npm test                  # temp. Server: Health + WS + Sessions
SMOKE_URL=http://127.0.0.1:5174 npm test   # gegen laufenden Prod-Service
```

## Nutzung

1. Nachricht tippen, **Enter** senden (Shift+Enter = Zeilenumbruch)
2. Streaming: Antwort, Thoughts, Tool-Aufrufe
3. Composer-Aktion wählen: **Chat** (normal), **Deep Search** (`/deep-research`), **Fork** (Session branchen)
4. Status-Button **verbunden** / **offline**: klicken startet den lokalen Grok-Agent neu
5. **Neue Session** startet eine frische ACP-Session
6. **Overview** listet lokale Grok-Sessions und erlaubt Schließen mit optionalem Wiki-Archiv

Details: [HANDBUCH.md](./HANDBUCH.md)

## Umgebungsvariablen

Siehe [`.env.example`](./.env.example). Wichtige Variablen:

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `PORT` | `5174` | Prod-Port (UI + Bridge; Dev-Bridge ebenfalls) |
| `HOST` | `127.0.0.1` | Bind-Adresse |
| `GROK_CHAT_CWD` | Home-Verzeichnis | Workspace für `session/new` |
| `GROK_BIN` | `grok` | Pfad zur Grok-CLI |
| `XAI_API_KEY` | — | Voice (STT/TTS) — [console.x.ai](https://console.x.ai) |

Beispiel:

```bash
GROK_CHAT_CWD="$HOME/mein-projekt" npm run dev
```

## Architektur

| Pfad | Rolle |
|------|--------|
| `server/` | Express + WebSocket-Bridge, spawnt `grok agent` (ACP stdio) |
| `client/` | Vite + React Chat-UI |
| `scripts/` | macOS LaunchAgent, Dock-Icon |
| `assets/` | App-Icons |

## Sicherheit

Nur auf **localhost** laufen lassen. Die Bridge startet Grok mit `--always-approve` (volle Tool-Rechte). Nicht ungeschützt ins Netz hängen.

## Urheberrecht & Marken

- **Software:** Copyright © 2026 [Lx Hbrt](https://github.com/lxhbrt) (Alexander Hubert). Lizenziert unter [MIT](./LICENSE).
- **Autorenliste:** [AUTHORS](./AUTHORS) · [NOTICE](./NOTICE)
- „Grok“ / „Grok Build“ sind Marken der jeweiligen Rechteinhaber (xAI / SpaceXAI). Dieses Projekt ist eine unabhängige Browser-Oberfläche für die lokale CLI und steht in keiner offiziellen Partnerschaft, sofern nicht anders angegeben.

## Contributing

Issues und Pull Requests willkommen. Bitte den Copyright-Hinweis und die MIT-Lizenz in abgeleiteten Werken beibehalten.

## Lizenz

[MIT](./LICENSE) © 2026 Lx Hbrt (Alexander Hubert)
