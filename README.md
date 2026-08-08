# Glyph

**Offene Browser-UI für mehrere lokale & Cloud-Agenten** über ACP (Agent Client Protocol).
*Ursprünglich als „Build Term for Grok“ gestartet — heute ein profilneutrales Gesicht für
grok, ^_Code und °_Agent.*

**Erstellt von [Lx Hbrt](https://github.com/lxhbrt)** · Copyright © 2026 · [MIT License](./LICENSE)

> Unofficial / independent — **not affiliated with or endorsed by xAI**. „Grok“ und „Grok Build“ sind Marken der jeweiligen Rechteinhaber.

**Anwendungshandbuch (DE):** [HANDBUCH.md](./HANDBUCH.md)

```
Browser (React)  --WebSocket-->  Node Bridge  --stdio ACP-->  Agent-Profil
                                                               (grok | ^_Code | °_Agent)
```

## Von Grok zu einer offenen UI

Glyph startete als schlanke Browser-Oberfläche **nur** für die lokale **Grok Build**-CLI.
Seither hat es sich zu einer **offenen Multi-Agenten-UI** entwickelt: Weil Glyph ein
**ACP-Client** (Agent Client Protocol) ist und nicht an ein Modell gebunden, kam nach und
nach je ein weiteres Profil hinzu:

| Schritt | Profil | Grund |
|---------|--------|-------|
| Start | **grok** | Browser-Oberfläche für die lokale Grok-CLI (OAuth) |
| +1 | **^_Code** | DeepSeek V4 Flash (OpenRouter) · Workspace Read/Write/Shell · Genehmigung in Glyph |
| +2 | **°_Agent** | Vault/Tools + Cloud-Antwort intern (B+, Engine; id `glyph-agent`) |

Heute ist grok **nur noch das Standard-Profil**, nicht das Produkt. Alle Profile teilen
dieselbe Bedienung; Grok-spezifische Extras (Deep Search, Voice, Session-Liste) sind pro
Profil deklariert und in der UI ausgegraut, wo sie nicht gelten.

---

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

### Remote (iPhone/iPad über Tailscale)

Glyph bleibt auf **127.0.0.1**. Zugriff von unterwegs nur über **Tailscale Serve** (tailnet-only, kostenlos) — nicht über `0.0.0.0` / Funnel.

```bash
# Voraussetzung: LaunchAgent installiert, Tailscale App angemeldet
npm run service:remote
# = scripts/enable-tailscale-remote.sh
```

| Was | Adresse |
|-----|---------|
| Lokal | http://127.0.0.1:5174 |
| Remote (Serve) | `https://<MagicDNS>:8443/` |
| OpenClaw (falls gesetzt) | bleibt auf `:443` unangetastet |

**iPhone:** Tailscale-App (gleiches Konto) → Safari `https://…:8443/` → Profil **°_Agent** → optional „Zum Home-Bildschirm“.  
**ACL:** in der Tailscale-Admin-Console nur Mac + iPhone freigeben.  
Details: [HANDBUCH.md § Remote](./HANDBUCH.md#remote-tailscale).

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
3. Composer-Aktion wählen: **Chat** (normal), **Deep Search** (nur grok), **Fork** (Session branchen)
4. Status-Button **verbunden** / **offline**: klicken startet den aktiven Agenten neu
5. **Neue Session** startet eine frische ACP-Session
6. **Overview** listet lokale Grok-Sessions (nur grok-Profil) und erlaubt Schließen mit optionalem Wiki-Archiv (**Löschen** ≈ TUI `/delete`)

Details: [HANDBUCH.md](./HANDBUCH.md)

## Agent-Profile & °_Agent

Glyph ist ein **ACP-Client** (kein Modell-Client): Das aktive Profil spawnet ein anderes
Binary/adapter, statt auf eine andere API zu zeigen. Profile in `server/agents.js`,
Auswahl in der UI (Header), Start-Profil via `GLYPH_AGENT` (Default `grok`).

| Profil | Spawnt | Hinweis |
|--------|--------|---------|
| **grok** (Default) | `grok agent --always-approve --no-leader stdio` | Volle Fähigkeiten (Sessions, Deep Search, Aktivität) |
| **^_Code** | `node server/glyph-agent-acp.mjs` + `GLYPH_AGENT_MODE=code` | DeepSeek CODE · Write/Shell mit Glyph-Freigabe |
| **°_Agent** (id `glyph-agent`) | `node server/glyph-agent-acp.mjs` | Dünne Brücke zum lokalen glyph-agent-Dienst (Vault/Tools + Cloud-Antwort) |

**°_Agent** nutzt die Engine `~/glyph-agent/` — lokale Tool-/Recherche-Schicht:
HTTP-Dienst (`server.py`, localhost**:18899**) mit kontrolliertem Tool-Loop, Cloud-Denker
und Vault-/Recherche-Tools. Die Brücke `server/glyph-agent-acp.mjs` übersetzt ACP ↔ HTTP
und streamt die Antwort als Chunks zurück. Spielregeln: `glyph-agent/CONSTITUTION.md`.

- **Vault intern:** Lesen (`VaultFind`, `ReadNote`) · Schreiben (`CreateNote`, `ProposeEdit`/Diff, `ApplyEdit`) nur mit Bestätigung
- **Recherche extern:** grob Exa / fein TinyFish — getrennt von internen Daten

Voraussetzung: lokalen Dienst starten → `cd ~/glyph-agent && python server.py`, prüfen mit
`curl http://127.0.0.1:18899/health` (→ `ok`).

Grafische Ablaufdiagramme für jedes Profil (*warum hinzugefügt* + *wie es funktioniert*):
[`docs/glyph-profile-diagrams.html`](./docs/glyph-profile-diagrams.html).

## Anhänge & Uploads

Glyph nimmt Anhänge über `POST /api/attachments` entgegen (Datei-Oberfläche, Drag&Drop,
Kopieren). Danach erzeugt die ACP-Brücke die passenden Content-Blöcke. Die Verarbeitung
hängt vom aktiven Profil ab.

### Unterstützte Profile

| Profil | Textanhänge | Bilder | Hinweis |
|--------|-------------|--------|---------|
| **grok** | ✅ | ✅ | native ACP-Unterstützung gemäß Grok-Profil |
| **^_Code** | ✅ | ❌ | Textanhänge ja; Write/Shell brauchen Genehmigung |
| **°_Agent** | ✅ | ❌ | Bilder werden NICHT an das Modell übertragen (Stufe-1-Hinweis) |

### Erlaubte Formate & Limits

**Textdateien** (Stufe 1): `.txt`, `.md`/`.markdown`, `.csv`, `.json`, `.xml`, `.yaml`/`.yml`, `.log`, `.html`
- Whitelist-MIME: `text/*`, `application/json`, `application/xml`, `text/yaml`, `text/x-log`
- max. **2 MiB** extrahierte Zeichen pro Anhang · max. **4 MiB** Byte-Größe

**Bilder** (wo das Profil es unterstützt, z. B. grok): `image/png`, `image/jpeg`, `image/webp`, `image/gif`
- max. **4 MiB** pro Bild

**Allgemein:** max. **8 Anhänge pro Nachricht** · max. **12 MiB** pro Datei (Upload-Limit)

### Limit-/Fehler-Verhalten

- **Ungültiger MIME-Typ** (z. B. `application/pdf`, `image/tiff`): wird blockiert — geht **nie** an
  das Modell; es erscheint ein sichtbarer Hinweis statt eines Crashs.
- **Kaputtes / zu kurzes Base64** (Bild): Validierung (Zeichen + Dekodierung) lehnt ab.
- **Zu großer Anhang:** klare Fehlermeldung (`Textanhang zu groß` / `Bild zu groß`) —
  keine stille Verwerfung.
- **Leerer Anhang:** Hinweis `Übergangen (leer)`.
- **Bilder bei `glyph-agent`:** werden nicht an das Modell gesendet — ein Stufe-1-Hinweis
  (`[Übergangen: Bild (multimodale Stufe 2 …)]`) macht das sichtbar.

### Beispiele

**Textdatei** — Inhalte werden in die Nachricht eingebettet:

```text
[Anhang: bericht.txt]
…Dateiinhalt…
[Ende Anhang: bericht.txt]
```

**Textanhang mit `glyph-agent`** — `POST /chat` rückwärtskompatibel um `attachments` erweitert:

```json
{
  "message": "Fasse den Anhang zusammen.",
  "attachments": [{ "name": "notiz.md", "mime": "text/markdown", "content": "…" }]
}
```

### Datenschutz & Sicherheit

- **Bilder bei Cloud-fähigen Profilen** können den Rechner verlassen — bei sensiblen Bildern
  bewusst entscheiden.
- **API-Keys gehören ausschließlich** in geschützte Umgebungsvariablen / `.env` (gitignored) —
  **nie** in Dateien, Logs oder Commits.
- **Sensible Uploads** (persönliche/Vault-Inhalte) nicht ungeprüft an die Cloud; glyph-agent
  hält Vault lokal und kürzt Kontext vor der Cloud-Antwort (siehe Engine-CONSTITUTION).
## UI-Design (Grok-Chat-Stil als Designsprache)

Das Erscheinungsbild ist vom Grok-Chat inspiriert, gilt aber **für alle Profile** gleich:

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
| `GLYPH_AGENT` | `grok` | Agent-Profil beim Start (grok \| claude \| glyph-agent) |
| `GLYPH_AGENT_URL` | `http://127.0.0.1:18899` | glyph-agent-HTTP-Dienst (nur Profil glyph-agent) |
| `GLYPH_AGENT_TIMEOUT` | `300000` | Timeout (ms) für glyph-agent-Antwort |
| `XAI_API_KEY` | — | Voice (STT/TTS) — [console.x.ai](https://console.x.ai) |
| `GLYPH_ALLOW_TAILSCALE_ORIGIN` | `0` | `1` = MagicDNS-HTTPS-Origins für WS/API erlauben (Serve) |
| `GLYPH_TAILSCALE_HOST` | — | MagicDNS-Name (sonst Discovery via `tailscale status`) |
| `GLYPH_TAILSCALE_SERVE_PORTS` | `8443` | Serve-HTTPS-Ports für Origin-Allowlist |
| `GLYPH_WS_ORIGINS` | — | Zusätzliche erlaubte Origins (kommagetrennt) |
| `GLYPH_ALLOW_REMOTE` | `0` | `1` = non-loopback-Bind (nicht empfohlen; Prefer Serve) |

Beispiel:

```bash
GLYPH_UI_CWD="$HOME/mein-projekt" npm run dev
```

## Architektur

| Pfad | Rolle |
|------|--------|
| `server/` | Express + WebSocket-Bridge, spawnt das aktive Agent-Profil (ACP stdio) |
| `server/agents.js` | Agent-Profile (grok, claude, glyph-agent) + Auflösung |
| `client/` | Vite + React Chat-UI |
| `scripts/` | macOS LaunchAgent, Dock-Icon |
| `assets/` | App-Icons |

## Sicherheit

Bridge bindet standardmäßig nur **127.0.0.1**. WebSocket und mutierende API brauchen erlaubte Origin + WS-Token.  
Remote: **Tailscale Serve** (tailnet-only), nicht `GLYPH_ALLOW_REMOTE=1` und nicht Funnel/öffentliches Internet.  
Die Bridge startet den Agenten mit vollem Tool-Zugriff (grok mit `--always-approve`).

## Urheberrecht & Marken

- **Produktname:** **Glyph** (eigenständiger Name). Die Tagline hat sich mit der Entwicklung
  gewandelt: von „Build Term for Grok“ (Ursprung als Grok-UI) zu einer offenen UI für mehrere
  lokale & Cloud-Agenten.
- **Software:** Copyright © 2026 [Lx Hbrt](https://github.com/lxhbrt) (Alexander Hubert). Lizenziert unter [MIT](./LICENSE).
- **Autorenliste:** [AUTHORS](./AUTHORS) · [NOTICE](./NOTICE)
- „Grok“ / „Grok Build“ sind Marken der jeweiligen Rechteinhaber (xAI / SpaceXAI). Dieses
  Projekt ist eine **unabhängige, inoffizielle** Browser-Oberfläche, die Grok **als eines von
  mehreren** Profilen über ACP nutzt (Interoperabilitätsbezug). Es steht in **keiner**
  Partnerschaft mit xAI und wird von xAI **nicht** unterstützt oder freigegeben.
- Keine xAI-Logos oder offiziellen Assets als eigene Marke.

## Contributing

Issues und Pull Requests willkommen. Bitte den Copyright-Hinweis und die MIT-Lizenz in abgeleiteten Werken beibehalten.

## Lizenz

[MIT](./LICENSE) © 2026 Lx Hbrt (Alexander Hubert)
