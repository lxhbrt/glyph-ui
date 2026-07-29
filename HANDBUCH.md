# Grok Build Terminal — Handbuch

Browser-Oberfläche für **Grok Build** (lokaler Coding-Agent).  
Du schreibst im Browser; im Hintergrund läuft der echte Grok-Agent auf deinem Mac.

**Erstellt von Lx Hbrt** · Copyright © 2026 · MIT License

```
Browser (React)  ──WebSocket──►  Node-Bridge  ──stdio ACP──►  grok agent
```

---

## 1. Voraussetzungen & Start

### Brauchst du

- **Node.js 22+**
- **`grok`** im PATH und eingeloggt (`grok login` bzw. `~/.grok/auth.json`)

### Entwicklung starten

```bash
cd ~/grok-chat-ui
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
npm run open              # oder Doppelklick: scripts/Open Grok Build Terminal.command
npm test                  # Smoke: Health + WS + Sessions
```

Produktion ohne Service:

```bash
npm run build
npm start                 # UI + Bridge auf Port 5174
```

---

## 2. Oberfläche auf einen Blick

```
┌──────┬────────────────────────────────────────────┐
│ Lupe │  Grok Build Terminal          [verbunden]  │
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
| **Grok-Antworten** | Flach auf dem Hintergrund — **kein** Kartenrahmen |
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

**Sicherheit:** Die Bridge startet Grok mit `--always-approve` (volle Tool-Rechte). **Nur auf localhost** nutzen, nicht ins Netz hängen.

---

## 5. Chat schreiben & senden

1. Status **verbunden** sicherstellen.
2. Nachricht tippen (Pfad, Fehler, Ziel — je klarer, desto besser).
3. **Enter** senden · **Shift+Enter** = neue Zeile. Der runde Button zeigt idle **↵**, während Grok arbeitet **Snack** (Klick / leerer Enter = Stopp).
4. Antwort streamt live flach im Chat; dein Prompt erscheint als Bubble. Rollen: **Grok**, **Thinking**, **Tool**, **System** (Prompts ohne „Du“-Label).

### Composer-Aktionen

| Aktion | Wirkung |
|--------|---------|
| **Chat** | Normale Nachricht |
| **Deep Search** | Strukturierte Multi-Quellen-Recherche (TUI: `/deep-research`) |
| **Fork** | Session branchen (TUI: `/fork`); Text = optionale Directive |

Die gewählte Aktion gilt für den nächsten Enter/Senden-Klick.

---

## 5b. Sprache (Grok Voice: STT + TTS)

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

## 6. Während Grok arbeitet

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

```
~/ObsidianVaults/OpenClaw memory-wiki/sources/grok-sessions/
```

Seiten sind als Rohquellen markiert und haben einen eigenen Index in diesem Ordner (OpenClaw-Hauptindex bleibt unberührt).

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

Workspace steuert, wo der Agent Dateien liest/schreibt (Standard oft Home oder `GROK_CHAT_CWD`).

---

## 10. Was Grok in dieser UI kann

| Bereich | Beispiele |
|---------|-----------|
| Code & Dateien | Lesen, schreiben, refaktorieren im Workspace |
| Terminal | Shell, Builds, Tests, Git |
| Recherche | Web/Docs; Deep Search für tiefergehende Quellenarbeit |
| Medien | Bilder/Video oft als Freitext; TUI: `/imagine`, `/imagine-video` |
| Erweiterungen | Skills, Workflows, Subagents, MCPs (je nach Installation) |

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
| `GROK_CHAT_CWD` | Startverzeichnis | Workspace für neue Sessions |
| `GROK_BIN` | `grok` | Pfad zur CLI |
| `GROK_HOME` | `~/.grok` | Sessions & Auth |
| `OPENCLAW_WIKI_PATH` | `~/ObsidianVaults/OpenClaw memory-wiki` | Wiki-Archiv |
| `GROK_CHAT_STATE_DIR` | `~/.grok-chat-ui` | UI-State (z. B. Closed-Log) |

Beispiel:

```bash
GROK_CHAT_CWD="$HOME/mein-projekt" npm run dev
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
| `server/index.js` | Express + WebSocket, spawnt `grok agent … stdio`, ACP-Bridge |
| `server/sessions.js` | Session-Liste, Close, Transcript |
| `server/activity.js` | Heatmap aus `events.jsonl` |
| `server/wiki-archive.js` | Wiki-Seiten beim Schließen |

---

## 16. Schnell-Checkliste

- [ ] `grok` eingeloggt  
- [ ] UI offen, Status **verbunden**  
- [ ] Workspace passt (Header-Pfad / `GROK_CHAT_CWD`)  
- [ ] Enter = senden, Shift+Enter = Zeile  
- [ ] Während Arbeit: Text → Queue, leer → Stop  
- [ ] Sessions: Lupe · Aktivität: Kalender · Wissen: Wiki  
- [ ] Sprache: `XAI_API_KEY` (falls nötig) · Mic diktieren · Lautsprecher vorlesen  

---

*Stand: passend zur lokalen App `grok-chat-ui`. In der App: **Buch** ganz unten in der Leiste → Kurzhandbuch; **Befehle** in der Mitte → Legende.*
