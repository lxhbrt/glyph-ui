# Glyph — Handbuch

**Glyph** — unabhängige Browser-Oberfläche für mehrere lokale/Cloud-Agenten über ACP
(Agent Client Protocol). Du schreibst im Browser; im Hintergrund läuft ein Agent-Profil
deiner Wahl (Standard: **grok**).

**Entwicklung:** Glyph startete als reine Grok-Oberfläche („Build Term for Grok“) und hat sich
zu einer **offenen Multi-Agenten-UI** entwickelt (grok · ^_Code · °_Agent).
Daher nennen manche Kapitel noch „Grok“ — die Bedienung gilt aber für **alle** Profile gleich;
wo ein Bereich nur für ein bestimmtes Profil gilt (z. B. Voice = nur grok), ist es markiert.

**Erstellt von Lx Hbrt** · Copyright © 2026 · MIT License  
*Inoffiziell / unabhängig — nicht von xAI unterstützt oder freigegeben.*

```
Browser (React)  ──WebSocket──►  Node-Bridge  ──stdio ACP──►  Agent-Profil
                                                              (grok | ^_Code | °_Agent)
```

### Agent-Profile im Überblick

| Profil | Typ | Auth | Fähigkeiten (in Glyph) |
|--------|-----|------|-------------------------|
| **grok** (Standard) | Cloud | OAuth | Sessions ✅ · Deep Search ✅ · Aktivität ✅ · Voice ✅ |
| **^_Code** | Lokal + Cloud (DeepSeek) | OpenRouter | Read/Write/Shell mit Genehmigung in Glyph |
| **°_Agent** (id `glyph-agent`) | Lokal + Cloud-Antwort | — | VaultFind, Web-Recherche, Cloud-Antwort (Engine); Trace/Steps in der UI |

> 📊 Grafische Abläufe (warum + wie jedes Profil): `docs/glyph-profile-diagrams.html`
> · Volltext der Bedienung unten; die Kapitel dieses Handbuchs gelten profilunabhängig,
> wo nicht anders markiert.

---

## 1. Voraussetzungen & Start

### Brauchst du

- **Node.js 22+**
- Mindestens **ein** Agent-Profil (Standard `grok` unten). Weitere Profile sind optional.

| Profil | Voraussetzung |
|--------|---------------|
| **grok** (Default) | `grok` im PATH + eingeloggt (`grok login` / `~/.grok/auth.json`) |
| **claude** | `claude` CLI mit OAuth-Login (`~/.claude`); ACP-Adapter via `npx` (auto) oder global `npm i -g @agentclientprotocol/claude-agent-acp` |
| **°_Agent** | Lokaler Dienst `server.py` auf `127.0.0.1:18899` (`~/glyph-agent`) |

### Entwicklung starten

```bash
cd ~/glyph-ui
npm install
npm run dev
```

| Was | Adresse |
|-----|---------|
| UI (nur Dev) | http://localhost:5173 |
| Bridge / API / Prod-UI | http://127.0.0.1:5174 |

**Port-Modell:** Produktion immer **5174** (UI + API + WebSocket). Port **5173** nur Vite-Dev-UI (proxy zu 5174).

### Dauerbetrieb (macOS LaunchAgent)

```bash
npm run service:install   # baut UI neu + Start bei Login
npm run service:status
npm run service:uninstall # wieder entfernen
npm run open              # oder Doppelklick: scripts/Open Glyph.command
npm test                  # Smoke: Health + WS + Sessions
```

Produktion ohne Service:

```bash
npm run build
npm start                 # UI + Bridge auf Port 5174
```

### Remote (Tailscale)

Ziel: Glyph vom iPhone bedienen, **ohne** die Bridge ins öffentliche Netz zu hängen.

| Schicht | Rolle |
|---------|--------|
| Glyph | bleibt `127.0.0.1:5174` |
| Tailscale Serve | HTTPS im **eigenen** Tailnet, Standard-Port **8443** |
| OpenClaw | falls vorhanden: Serve auf **:443** — wird nicht überschrieben |

```bash
# Einmal / nach Reboot prüfen:
npm run service:remote
# oder: bash scripts/enable-tailscale-remote.sh
```

Das Script:

1. startet Tailscale falls nötig  
2. setzt Serve `https://<MagicDNS>:8443` → `http://127.0.0.1:5174`  
3. schreibt LaunchAgent-Env (`GLYPH_ALLOW_TAILSCALE_ORIGIN=1`, Host, Port) und lädt den Service neu  

**Mac am Dock (Strom):** Systemschlaf am Netzstrom aus (`sleep 0`), Wake-on-LAN an — Host bleibt erreichbar, wenn der Rechner an ist.

**iPhone / iPad (Checkliste):**

1. Tailscale-App installieren, **gleiches Konto**, Status „Connected“  
2. Safari: `https://<dein-mac>.ts.net:8443/`  
3. Profil **°_Agent** (oder grok) wählen  
4. Optional: Teilen → **Zum Home-Bildschirm** (PWA-ähnlich)  
5. ACL in [login.tailscale.com/admin/acls](https://login.tailscale.com/admin/acls): nur Mac + iPhone (strenge Device-Tags/Quellen)

**Smoke (Mac):**

```bash
curl -fsS http://127.0.0.1:5174/api/health
curl -fsS "https://$(tailscale status --json | python3 -c 'import sys,json;print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))'):8443/api/health"
tailscale serve status
```

**Nicht v1:** öffentliches Funnel, native iOS-App, WhatsApp-Anbindung an Glyph.

---

## 2. Oberfläche auf einen Blick

```
┌──────┬────────────────────────────────────────────┐
│ Lupe │  Glyph                        [verbunden]  │
│ Stift│────────────────────────────────────────────│
│ !    │                                            │
│ Cal  │     Antworten flach auf Schwarz            │
│ ──── │          Prompt-Bubbles →                  │
│ Wiki │                    │ Snack-Scrollbar       │
│ Ordn.│                    │ (Schlange / Apfel)    │
│ ☀/🌙 │────────────────────────────────────────────│
│ ↻    │  [WARTE-Warteschlange, falls gefüllt]      │
│      │  Composer-Bubble · Aktionen · ↵ / Snack ○  │
└──────┴────────────────────────────────────────────┘
```

### Design (Grok-Chat-Stil)

Chat und Composer folgen der **Grok Chat App**-Ästhetik: schwarze Fläche, Prompts als Sprechblasen, runde Controls.

| Element | Darstellung |
|---------|-------------|
| **Chat-Hintergrund** | Gleich wie App-Chrome (`--bg`, nahezu schwarz) |
| **Agent-Antworten** | Flach auf dem Hintergrund — **kein** Kartenrahmen |
| **Deine Prompts** | Rechte **Sprechblase** (Fill `--user`, abgerundet) |
| **Thinking / Tool / System** | Transparent; System mit feinem Gold-Strich links |
| **Composer** | Bubble-Shell (gleiche Fill-Familie wie Prompts), großer Radius, weicher Schatten |
| **Senden ↵** | **Runder** Button |
| **Snack / Stopp** | Derselbe **Kreis** während der Arbeit; Stopp-Ziel = roter **Punkt** (nicht Rechteck); Arena 4×4, rund geclippt |
| **Theme** | Hell/Dunkel; Light: hellere Bubble, Antworten weiter flach |

CSS-Tokens u. a. in `client/src/styles.css` (`--bg`, `--user`, `--assistant`, Snack-Palette). Snack-Logik: `client/src/components/Snack.jsx`.

---

## 3. Linke Leiste

| Symbol | Name | Funktion |
|--------|------|----------|
| **Lupe** | Sessions | Suche, öffnen; Schließen: Ja + Wiki · Löschen (`/delete`) |
| **Stift** | Neuer Chat | Frische ACP-Session, leerer Verlauf (TUI `/new` — Disk bleibt) |
| **Befehle** | Legende | Filterbare Befehls-Legende (Slash, Composer, Leiste) |
| **Buch** (unten) | Handbuch | Kurzhandbuch ganz unten in der Leiste |
| **4 Kästchen** | Kalender | Aktivitäts-Heatmap (wann / woran gearbeitet) |
| **Wiki (i)** | Wiki | Öffnet den Wiki-Index (`.md`) in Obsidian / Standard-App |
| **Workspace** | Ordner | Öffnet den aktuellen Arbeitsordner (`cwd`) im Finder |
| **Theme** | Hell/Dunkel | Darstellung umschalten |
| **Refresh** | Neu laden | UI neu laden (Ersatz für ⌘⇧R) |

---

## 4. Verbinden & Status

Oben rechts:

| Anzeige | Bedeutung | Klick |
|---------|-----------|--------|
| **verbunden** (gold) | Agent läuft | Beenden (wie `/quit`) |
| **offline** | kein Agent | Starten / neu verbinden |
| **verbindet… / trennt…** | gerade umschalten | warten |

Ohne **verbunden** ist das Eingabefeld deaktiviert.

**Sicherheit:** Die Bridge startet den Agenten mit vollem Tool-Zugriff (grok mit `--always-approve`). **Nur auf localhost** nutzen, nicht ins Netz hängen.

---

## 5. Chat schreiben & senden

1. Status **verbunden** sicherstellen.
2. Nachricht tippen (Pfad, Fehler, Ziel — je klarer, desto besser).
3. **Enter** senden · **Shift+Enter** = neue Zeile. Der runde Button zeigt idle **↵**, während der
   Agent arbeitet **Snack** (Klick / leerer Enter = Stopp).
4. Antwort streamt live flach im Chat; dein Prompt erscheint als Bubble. Rollen: **Agent** (der
   aktive Name, z. B. Grok), **Thinking**, **Tool**, **System** (Prompts ohne „Du“-Label).

### Composer-Aktionen

| Aktion | Wirkung | Profil |
|--------|---------|--------|
| **Chat** | Normale Nachricht | alle |
| **Deep Search** | Strukturierte Multi-Quellen-Recherche (TUI: `/deep-research`) | **grok** (für andere Profile ausgegraut) |
| **Fork** | Session branchen (TUI: `/fork`); Text = optionale Directive | alle |

Die gewählte Aktion gilt für den nächsten Enter/Senden-Klick.

---

## 5b. Sprache (Voice: STT + TTS) — nur das grok-Profil

> ⚠️ Voice ist **ausschließlich** über xAI/Grok verfügbar (xAI Voice APIs). Bei den Profilen
> claude und glyph-agent gibt es diese Funktion **nicht** — sie ist in der UI
> ausgegraut.

Die UI nutzt die **xAI Voice APIs** (dieselbe Stack-Familie wie Grok Voice):

| Funktion | API | In der UI |
|----------|-----|-----------|
| **Diktieren** (Speech → Text) | `POST /v1/stt` | Button **Mic** im Composer |
| **Vorlesen** (Text → Speech) | `POST /v1/tts` | Lautsprecher an Grok-Nachrichten |
| **Stimme wählen** | `GET /v1/tts/voices` | Dropdown neben Mic |

### API-Key (Pflicht für Voice)

Voice läuft **nicht** über den lokalen `grok agent` allein — der Server braucht einen Key:

```bash
export XAI_API_KEY="xai-…"   # Console: https://console.x.ai
```

Fallback: Token aus `~/.grok/auth.json` (nach `grok login`). Wenn der OIDC-Token **keine** Voice-Rechte hat, erscheint ein Hinweis — dann `XAI_API_KEY` setzen.

Optional:

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `GROK_TTS_VOICE` | `eve` | Standard-Stimme |
| `GROK_STT_LANGUAGE` | `de` | STT-Formatierung |
| `GROK_TTS_LANGUAGE` | `de` | TTS-Sprache |

### Diktieren

1. **Mic** klicken → Browser fragt Mikrofon-Erlaubnis  
2. Sprechen  
3. Nochmal **Stop** → Transkript landet im Composer  
4. Mit Enter senden (oder weiter tippen)

### Vorlesen

1. Stimme im Dropdown wählen (Eve, Ara, Rex, …)  
2. An einer **fertigen** Grok-Antwort auf den Lautsprecher klicken  
3. Nochmal klicken = stoppen  

Markdown (Codeblöcke, Links, …) wird vor dem TTS grob bereinigt.

**Hinweis:** Volles Speech-to-Speech (`/v1/realtime`) ist hier **nicht** eingebaut — nur Diktat + Vorlesen, passend zum Coding-Chat.

---

## 6. Während der Agent arbeitet

> Gilt für alle Profile gleich (grok, claude, glyph-agent).

### Senden-Button / Snack

| Zustand | Was passiert |
|---------|----------------|
| Idle | Button zeigt **↵** (Enter) → senden |
| Arbeitet | Snack-Animation (Schlange jagt Apfel) |
| Text + Enter während Arbeit | Nachricht landet in der **Warteschlange** |
| Leerer Klick / Snack während Arbeit | **Soft-Stop** (ACP-Cancel). Kritische Tools können noch sauber enden |

### Warteschlange (WARTE)

- Follow-ups parken, während die Antwort läuft (wie im TUI).
- Nach dem aktuellen Turn werden sie **automatisch nacheinander** gesendet.
- **×** = Eintrag entfernen · **Leeren** = ganze Queue löschen.

### Scrollen & „Neue Ausgabe“

- Snack-Scrollbar rechts: goldene **Schlange** jagt den roten **Apfel** (Ziel = Scroll-Ende).
- Scrolle hoch → Chat „klebt“ nicht mehr am Ende.
- Button **Neue Ausgabe ↓** springt wieder ans aktuelle Ende.

---

## 7. Sessions (Lupe)

> ⚠️ **Nur das grok-Profil** hat eine Session-Liste in Glyph. Die Lupe liest
> `~/.grok/sessions`. Claude speichert unter `~/.claude/projects` (in Glyph nicht gelistet);
> glyph-agent führt In-Session-Kontext ohne persistente Session-Liste.

Sessions sind gespeicherte **Chats** unter `~/.grok/sessions`.

### Bedienung

| Aktion | Tasten / Klick |
|--------|----------------|
| Markieren | Klick oder **↑ / ↓** |
| Öffnen / laden | **Enter**, Doppelklick oder Button **Öffnen** |
| Panel zu | **Esc** |
| Suchen | Suchfeld: Titel, Workspace, Model… |

### Schließen einer Session

Aktive Chat-Session ist **geschützt** (nicht schließbar) — zuerst **Stift** (TUI `/new`), dann die alte Session schließen. Entspricht dem TUI-Muster: aktuelle Session nicht aus dem Picker löschen, solange sie live ist.

| Option | Wirkung | TUI-Äquivalent |
|--------|---------|----------------|
| **Ja + Wiki** | Transcript-Auszug → Wiki, dann Session-Ordner löschen | (UI-Erweiterung) |
| **Löschen** | Session-Historie endgültig von Disk entfernen, ohne Wiki | **`/delete`** (bzw. `/resume` → `d` → `y`) |
| **Abbrechen** | Nichts | — |

**Wichtig:** Nur „archiviert“ markieren spart **keinen** Speicher. Erst das **Löschen des Session-Ordners** entlastet die Disk (Sessions können hunderte MB sein). **Stift** (`/new`) leert nur den Chat — die alte Session bleibt auf Disk, bis du sie in der Lupe schließt.

### Wiki-Ziel

Standard:

```
~/.glyph-ui/wiki/sources/grok-sessions/
```

Mit `OPENCLAW_WIKI_PATH` auf einen beliebigen Ordner umleiten (z. B. Obsidian-Vault). Seiten sind als Rohquellen markiert und haben einen eigenen Index in diesem Ordner (OpenClaw-Hauptindex bleibt unberührt).

---

## 8. Aktivitäts-Kalender

Symbol: **4 Kästchen** in der linken Leiste.

| Kästchen im Icon | Bedeutung |
|------------------|-----------|
| Rot | Apfel (Snack-Stil) |
| Dunkel + Punkt | Kopf / Peak-Tag |
| Gold | mittlere Aktivität |
| Hellgold | leichte Aktivität |

### Heatmap

- **Gelb/Gold** = aktiver Tag  
- **Heller** = weniger Events · **Dunkler** = mehr Events  
- **Peak** = dunkelstes Kästchen mit kleinem „Auge“ (höchste Frequenz)

### Events & Sessions (Begriffe)

| Begriff | Bedeutung |
|---------|-----------|
| **Session** | Ein Chat / eine Arbeitsrunde |
| **Event** | Ein protokollierter Eintrag in `events.jsonl` (Nachricht, Tool-Schritt, Update …) |

Beispiel: *12 Events · 2 Sessions* = an dem Tag 12 Aktivitätseinträge in 2 verschiedenen Chats.

**Klick** auf ein Kästchen → Sessions dieses Tages → ggf. **Öffnen**.

---

## 9. Wiki & Workspace

| Button | Öffnet |
|--------|--------|
| **Wiki** | Index-Datei (z. B. `00 Index` / `WIKI.md` / `index.md`) im Vault |
| **Workspace** | Aktuellen `cwd` im Finder |

Workspace steuert, wo der Agent Dateien liest/schreibt (Standard oft Home oder `GLYPH_UI_CWD`).

---

## 10. Was der Agent in dieser UI kann

**Nicht alle Fähigkeiten gelten für alle Profile.** **grok** hat als einziges Sessions-Liste, Deep Search und Aktivitäts-Kalender. Terminal/Shell und freies Workspace-Schreiben sind **nicht** bei °_Agent.

| Bereich | Beispiele | Profile |
|---------|-----------|---------|
| Code & Dateien | Lesen, schreiben, refaktorieren im Workspace (Grep/SearchReplace/…) | **grok**, **^_Code** (nur `CODE_WORKSPACE_ROOTS`) |
| Terminal / Shell | Builds, Tests, Git (Whitelist bei ^_Code; kein `rm`/`push`) | **grok**, **^_Code** — **nicht** °_Agent |
| Recherche | Web/Docs; Deep Search für tiefergehende Quellenarbeit | **grok** (Deep Search); **°_Agent** (Exa/TinyFish/BrowseUrl) |
| Medien | Bilder/Video oft als Freitext; TUI: `/imagine`, `/imagine-video` | **grok** |
| Erweiterungen | Skills, Workflows, Subagents, MCPs (je nach Installation) | **grok** |
| Vault & Notizen | Obsidian-Vault-Suche, Wiki-Aliase, PDF, Mail, Diff+Backup | **°_Agent** |
| Cloud-Modelle | viele Modelle zum Testen/Anbinden über eine API | **grok** |

---

## 11. Slash-Befehle (Überblick)

Viele `/Befehle` sind **TUI-Builtins**. Im Browser reichen oft **Freitext** + die verdrahteten Aktionen (Deep Search, Fork, Sessions).

| Befehl | Nutzen |
|--------|--------|
| `/new` · `/clear` | Neue Session (UI: Stift; Disk bleibt) |
| `/delete` | Session-Historie löschen (UI: Lupe → Schließen → **Löschen**) |
| `/resume` · `/dashboard` | Sessions (UI: Lupe) |
| `/fork` | Session branchen (UI: Fork) |
| `/compact [notiz]` | Kontext komprimieren |
| `/context` · `/session-info` | Status / Context |
| `/plan` · `/view-plan` | Erst planen, dann umsetzen |
| `/effort low\|medium\|high\|xhigh` | Reasoning-Tiefe (TUI) |
| `/model <name>` | Modell (TUI) |
| `/deep-research <query>` | Recherche (UI: Deep Search) |
| `/workflow` · `/goal` | Workflows / längere Goals |
| `/imagine` · `/imagine-video` | Bild / Video |
| `/skills` · `/plugins` · `/mcps` | Erweiterungen |
| `/remember` · `/memory` | Memory (teilw. experimentell) |
| `/copy` · `/export` | Antwort / Gespräch exportieren |
| `/doctor` · `/docs` · `/login` | Diagnose, Doku, Auth |
| `/quit` · `/exit` | Agent beenden (UI: Status-Pill) |

Vollständige Liste im TUI: **`/docs`**  
Datei: `~/.grok/docs/user-guide/04-slash-commands.md`

In der App: Symbol **Befehle** (filterbare Legende).

---

## 12. Umgebungsvariablen

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `PORT` | `5174` | Prod + Dev-Bridge (Vite-UI separat auf 5173) |
| `HOST` | `127.0.0.1` | Nur lokal |
| `GLYPH_UI_CWD` | Startverzeichnis | Workspace für neue Sessions |
| `GROK_BIN` | `grok` | Pfad zur CLI |
| `GROK_HOME` | `~/.grok` | Sessions & Auth |
| `GLYPH_AGENT` | `grok` | Agent-Profil beim Start (grok \| _code \| glyph-agent) |
| `GLYPH_AGENT_URL` | `http://127.0.0.1:18899` | glyph-agent-HTTP-Dienst (nur Profil °_Agent) |
| `GLYPH_AGENT_TIMEOUT` | `300000` | Timeout (ms) für °_Agent-Antwort |
| `OPENCLAW_WIKI_PATH` | `~/.glyph-ui/wiki` | Wiki-Archiv (optional Obsidian-Vault o. Ä.) |
| `GLYPH_UI_STATE_DIR` | `~/.glyph-ui` | UI-State (z. B. Closed-Log) |

Beispiel:

```bash
GLYPH_UI_CWD="$HOME/mein-projekt" npm run dev
```

---

## 13. Typische Abläufe

### A) Schnell etwas im Home-Workspace erledigen

1. App öffnen → **verbunden**  
2. Aufgabe schreiben → **Enter**  
3. Optional Follow-ups in die Warteschlange  

### B) Alte Session fortsetzen

1. **Lupe** → suchen → **Öffnen**  
2. Weiterchatten  

### C) Platz freimachen, Wissen behalten

1. **Lupe** → Session **Schließen** → **Ja + Wiki**  
2. Optional im Vault nachlesen  

### D) Sehen, wann du gearbeitet hast

1. **Kalender** → Heatmap  
2. Tag anklicken → Sessions des Tages  

### E) Neues Thema, sauberer Kontext

1. **Stift** (Neuer Chat)  
2. Oder **Fork**, wenn du den bisherigen Verlauf behalten und abzweigen willst  

---

## 14. Probleme & Tipps

| Problem | Idee |
|---------|------|
| **offline** bleibt | Status klicken; `grok` im PATH? `grok login`? Bridge-Log / `npm run service:status` |
| Eingabe grau | Erst verbinden |
| Agent „hängt“ | Leerer Snack-Klick = Stop; sonst Refresh + neu verbinden |
| Disk voll | Lupe → Schließen → Ja + Wiki oder Löschen (`/delete`); große Ordner unter `~/.grok/sessions` |
| UI wirkt veraltet | **Refresh** in der Leiste |
| Slash tut „nichts“ | Viele Befehle sind TUI-only — Freitext formulieren oder Deep Search/Fork/Lupe nutzen |

Diagnose im TUI: **`/doctor`**.

---

## 15. Architektur (kurz)

| Teil | Rolle |
|------|--------|
| `client/` | React-UI (Vite) |
| `server/index.js` | Express + WebSocket, spawnt das aktive Agent-Profil … stdio, ACP-Bridge |
| `server/agents.js` | Agent-Profile (grok, ^_Code, °_Agent) + Auflösung |
| `server/sessions.js` | Session-Liste, Close, Transcript |
| `server/activity.js` | Heatmap aus `events.jsonl` |
| `server/wiki-archive.js` | Wiki-Seiten beim Schließen |

Glyph ist ein **ACP-Client**, kein Modell-Client: Ein Profil zu wechseln bedeutet, ein anderes
Binary/den anderen Adapter zu spawnen (nicht auf eine andere API zu zeigen). Alles, was über ACP
fließt (Chat, Thoughts, Tools, Pläne, Anhänge, Fork), funktioniert profilunabhängig; Grok-spezifische
Extras (Sessions, Deep Search) sind pro Profil deklariert, damit die UI sie ausgraut statt zur
Laufzeit zu scheitern.

---

## 15b. Agent-Profile & °_Agent

Glyph kennt mehrere **Agent-Profile** (Auswahl üblicherweise oben in der Status-/Header-Zeile).
Aktives Profil wird beim Start aus `GLYPH_AGENT` übernommen (Default: `grok`).

| Profil | Spawnt | Hinweis |
|--------|--------|---------|
| **grok** (Default) | `grok agent --always-approve --no-leader stdio` | `GROK_BIN`; volle Fähigkeiten (Sessions, Deep Search, Aktivität) |
| **^_Code** (id `_code`) | `node server/glyph-agent-acp.mjs` + `GLYPH_AGENT_MODE=code` | DeepSeek CODE · Write/Shell mit Glyph-Freigabe |
| **°_Agent** (id `glyph-agent`) | `node server/glyph-agent-acp.mjs` | Vault/Tools + Cloud-Antwort; dünne ACP-Brücke zum lokalen Dienst auf `127.0.0.1:18899` |

### °_Agent (Vault/Tools + Cloud-Antwort)

> 📊 **Diagramme:** `docs/glyph-profile-diagrams.html` zeigt für jedes Profil ein
grafisches Ablauf-/Architektur-Diagramm (*warum hinzugefügt* + *wie es funktioniert*).
> Im Browser öffnen oder direkt in die App einbetten.

Das Profil **°_Agent** (interne id `glyph-agent`) verbindet Glyph mit der separaten
**glyph-agent**-Engine (`~/glyph-agent/`): ein lokaler HTTP-Dienst (`server.py`, Port **18899**,
localhost-only) mit kontrolliertem Tool-Loop (**B+**). Lokal: VaultFind (Embedding + Keyword)
und Tools; Web nur bei Bedarf; die **Cloud-Antwort** formuliert der Cloud-Denker in der Engine
(Technik-Provider nur in Config/CONSTITUTION — kein separates UI-Profil).

Dünne Brücke (`glyph-agent-acp.mjs`) — **keine Agentenlogik**: Sie übersetzt ACP ↔ HTTP und
streamt die Antwort als Text-Chunks zurück an Glyph. Tool-Schicht und Cloud-Antwort bleiben in
der Engine gekapselt.

**Fähigkeiten (Tool-Schicht):**

| Bereich | Tools | Zugriff |
|---------|-------|---------|
| **Vault intern** | VaultFind, ReadNote | Lesen ✅ (Vault-Daten bleiben intern) |
| **Vault schreiben** | CreateNote, ProposeEdit (Diff), ApplyEdit | Nur mit Bestätigung ✅ |
| **Recherche extern** | WebSearch (Exa grob), ExtractUrl/FetchUrl (TinyFish fein) | Nur bei Bedarf — getrennt von internen Daten |

**Voraussetzung:** Der lokale Dienst muss laufen, sonst antwortet das Profil mit
`glyph-agent HTTP <code>` anstelle einer Antwort:

```bash
cd ~/glyph-agent && python server.py   # POST /chat, GET /health auf 127.0.0.1:18899
curl http://127.0.0.1:18899/health    # → ok
```

**HTTP-Schnittstelle:** `POST /chat` `{"message": "…"}` → `{"answer": "…", …}` · `GET /health`.
Nur localhost gebunden; keine Internet-Exposition. Die UI zeigt Trace/Steps (z. B. VaultFind).

**Umgebungsvariablen (Adapter):**

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `GLYPH_AGENT_URL` | `http://127.0.0.1:18899` | glyph-agent-HTTP-Dienst |
| `GLYPH_AGENT_TIMEOUT` | `300000` | Timeout (ms) für die Antwort |

**Warum die Mischung:** Drei unabhängige Bestandsquellen, damit kein einzelner Anbieter zum
Blockierer wird. Vault/Recherche → **°_Agent**; breite Kontextarbeit/Sessions → **grok**
oder **^_Code**. Grafische Abläufe: `docs/glyph-profile-diagrams.html`.

---

## 15c. Anhänge & Uploads (Kurzfassung)

Anhänge werden über die Chat-Oberfläche entgegengenommen (Datei, Drag&Drop, Einfügen) und
je nach Profil verarbeitet:

| Profil | Textanhänge | Bilder |
|--------|-------------|--------|
| **°_Agent** | ✅ | ❌ (Stufe-1-Hinweis) |
| **grok** | ✅ | ✅ native ACP |

- **Textformate:** `.txt` `.md` `.csv` `.json` `.xml` `.yaml` `.log` `.html` · max. **2 MiB**
- **Bildformate (grok u. a., nicht °_Agent):** PNG, JPEG, WebP, GIF · max. **4 MiB**
- **Limit:** max. **8 Anhänge** / max. **12 MiB** pro Datei
- **Fehler:** ungültiger Typ / kaputtes Base64 / zu groß → blockiert mit klarer Meldung,
  nie still verworfen und nie an das Modell gesendet.
- **°_Agent + Bild:** wird **nicht** an das Modell übertragen → sichtbarer Hinweis.
- **Datenschutz:** Bilder können den Rechner verlassen (Cloud-Profile). Keys nur in
  geschützten Env/.env (gitignored), nie in Dateien/Logs/Commits. Sensible Uploads nicht
  ungeprüft an externe Modelle; dafür bleibt `glyph-agent` (lokal).

Volle Details + Beispiele: siehe README → „Anhänge & Uploads".

---

## 16. Schnell-Checkliste

- [ ] Mindestens ein Profil verfügbar (Default `grok` eingeloggt)  
- [ ] UI offen, Status **verbunden**  
- [ ] Aktives Profil passt (Header / `GLYPH_AGENT`)  
- [ ] °_Agent-Profil: lokaler Dienst läuft (`server.py` auf 18899, `curl /health` = ok)  
- [ ] °_Agent Cloud-Antwort: `OPENROUTER_API_KEY` in der glyph-agent-Umgebung (Technik)  
- [ ] Workspace passt (Header-Pfad / `GLYPH_UI_CWD`)  
- [ ] Enter = senden, Shift+Enter = Zeile  
- [ ] Während Arbeit: Text → Queue, leer → Stop  
- [ ] Sessions: Lupe · Aktivität: Kalender · Wissen: Wiki  
- [ ] Sprache (nur grok): `XAI_API_KEY` (falls nötig) · Mic diktieren · Lautsprecher vorlesen  

---

*Stand: passend zur lokalen App **Glyph** (Repo-Ordner: `glyph-ui`). In der App: **Buch** ganz unten in der Leiste → Kurzhandbuch; **Befehle** in der Mitte → Legende.*
