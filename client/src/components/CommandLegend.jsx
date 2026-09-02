/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { SideDrawer } from "./SideDrawer.jsx";

const COMMAND_LEGEND = [
  {
    group: "Linke Leiste (diese UI)",
    items: [
      {
        cmd: "Lupe",
        need: "empfohlen",
        desc: "Suche & Sessions als Seitenpanel (Desk an der Rail / Web Overlay). Schließen löscht den Disk-Ordner. Wissen: /merken.",
      },
      {
        cmd: "Graph",
        need: "empfohlen",
        desc: "Direkt unter der Lupe. Köpfe um Glyph. Punkt klicken → Legende.",
      },
      {
        cmd: "Stift · Neuer Chat",
        need: "optional",
        desc: "Neue ACP-Session, Chat leeren. Entspricht TUI /new (Disk bleibt).",
      },
      {
        cmd: "Befehle und Skills",
        need: "optional",
        desc: "Seitenpanel an der Rail (Desk links) bzw. Overlay rechts (Web); Chat bleibt in der Breite. Leisten-Button / ⌘/Ctrl+K / `/` im Composer: Skills + Agent-Commands. Auswahl fügt /name ein — sendet nicht; Panel bleibt offen (Einfügen & zu / Esc schließt). Live-Katalog.",
      },
      {
        cmd: "Buch · Handbuch / Legende",
        need: "optional",
        desc: "Kurzhandbuch und UI-Legende als Seitenpanel (Desk an der Rail / Web Overlay). Tab Legende = Bedienung erklären; Skills/Agent-Commands ausführen nur unter „Befehle und Skills“.",
      },
      {
        cmd: "Glyph · Plan & Aktivität",
        need: "optional",
        desc: "Kalender-Icon → Seitenpanel (Desk links an der Rail / Web Overlay rechts; Chat bleibt; Graph = Vollfläche-Ausnahme). Tab Plan = Aufgaben + To-dos (Übernehmen → Composer, Panel darf offen bleiben). Tab Aktivität = Heatmap (Grok). ACP-Session-Plan = Leiste über dem Composer.",
      },
      {
        cmd: "Wiki (i)",
        need: "optional",
        desc: "Öffnet Wiki-Index als .md (00 Index / WIKI.md / index.md) in Obsidian oder Standard-App.",
      },
      {
        cmd: "Workspace",
        need: "optional",
        desc: "Öffnet den aktuellen Arbeitsordner (cwd) im Finder.",
      },
      {
        cmd: "Theme",
        need: "optional",
        desc: "Hell / Dunkel umschalten.",
      },
      {
        cmd: "UI neu laden",
        need: "optional",
        desc: "UI neu laden (statt ⌘⇧R).",
      },
    ],
  },
  {
    group: "Composer & Chat",
    items: [
      {
        cmd: "Enter",
        need: "normal",
        desc: "Desk: Senden (ohne Shift), Shift+Enter = Zeile. Handy: Tastatur-Enter = Zeile, Kopf sendet beim ersten Tap. Slash-Popup: Enter = auswählen. Agent arbeitet → Warteschlange.",
      },
      {
        cmd: "/ · Skills-Seitenpanel",
        need: "empfohlen",
        desc: "Öffnet dasselbe Skills-Seitenpanel wie der Leisten-Button (Desk links / Web rechts Overlay). Filter, Einfügen, Esc.",
      },
      {
        cmd: "Warteschlange",
        need: "optional",
        desc: "Follow-ups parken während der Antwort (wie TUI). Danach automatisch senden. × / Leeren.",
      },
      {
        cmd: "↑ · Prompt-History",
        need: "empfohlen",
        desc: "Leerer Composer: letzte Prompts durchblättern (wie TUI). ↓ schließt. Esc stellt den Entwurf wieder her.",
      },
      {
        cmd: "Rewind",
        need: "empfohlen",
        desc: "Letzten Nutzer-Turn und alles danach aus dem Verlauf nehmen. Esc Esc, /rewind, oder ↺ an der Nachricht. Dateien bleiben.",
      },
      {
        cmd: "Kopf / Snack · Stopp",
        need: "auto",
        desc: "Runder Button: idle = Graph-Kopf (Grok Build · °_Agent · ^_Code; Handy: erster Tap sendet). Während Arbeit oder Vault-Suche: Text = Queue/neue Suche; leerer Klick/Snack = Stopp (ACP bzw. Fetch-Abbruch). Kritische Tools laufen sicher zu Ende mit Hinweis.",
      },
      {
        cmd: "Chat | Deep Search | Fork | Swarm",
        need: "empfohlen",
        desc: "Chat = Nachricht. Deep Search = Grok /deep-research (sonst ausgegraut). Fork = Session branchen. Swarm = °_Agent/^_Code Planer+Suche+Synthese.",
      },
      {
        cmd: "Kette · verbunden / offline",
        need: "empfohlen",
        desc: "Icon-Button: Agent starten/beenden. Gold-Kette = verbunden, rot = offline.",
      },
      {
        cmd: "/merken",
        need: "empfohlen",
        desc: "Skill (Befehle / Skills): eine Erkenntnis nach Chat-Ja. Wiki nur nach Vorlage (Aufgabe · Lösung · Datei/Beleg · Suchbegriffe). Ablehnen statt aufblähen.",
      },
      {
        cmd: "Name · /rename",
        need: "optional",
        desc: "Lupe: r oder Button Name. Composer: /rename Titel. Nur Grok-Sessions auf Disk.",
      },
      {
        cmd: "Freitext + Kontext",
        need: "normal",
        desc: "Aufgabe, Pfad, Fehlertext, Ziel — je klarer, desto besser.",
      },
      {
        cmd: "Mikrofon · Sprache",
        need: "optional",
        desc: "Diktieren (Grok STT). Klick starten/stoppen → Text im Composer. Braucht XAI_API_KEY.",
      },
      {
        cmd: "Lautsprecher · Vorlesen",
        need: "optional",
        desc: "Grok-Antwort vorlesen (Grok TTS). Button am Nachrichten-Kopf. Stimme wählbar.",
      },
      {
        cmd: "Kopieren",
        need: "optional",
        desc: "Klick auf die Nachricht: Kopieren/Vorlesen darunter. Letzte Antwort schiebt hoch, damit die Buttons nicht unter dem Composer liegen.",
      },
      {
        cmd: "Tool-Karte",
        need: "auto",
        desc: "Live-Tools: Verb + Ziel. Klick öffnet Input/Diff/Ausgabe. Fehlgeschlagene Tools öffnen sich selbst.",
      },
      {
        cmd: "Plan-Freigabe",
        need: "optional",
        desc: "Arbeitsleiste über LVL. Frischer Plan (alles offen): Umsetzen sendet, Ändern fokussiert den Composer.",
      },
      {
        cmd: "LVL · Zusammenpressen",
        need: "optional",
        desc: "Klick auf die Leiste: Legende. Über Soft-Cap (Grok): Zusammenpressen sendet /compact.",
      },
    ],
  },
  {
    group: "Was Grok Build kann",
    items: [
      {
        cmd: "Code & Dateien",
        need: "auto",
        desc: "Lesen, schreiben, refaktorieren im Workspace (ACP-Tools).",
      },
      {
        cmd: "Terminal",
        need: "auto",
        desc: "Shell, Builds, Tests, Git — lokal über den Bridge-Agent.",
      },
      {
        cmd: "Recherche",
        need: "bei Bedarf",
        desc: "Web/Docs; oder Deep Search für strukturierte Multi-Quellen-Recherche.",
      },
      {
        cmd: "Bilder / Video",
        need: "auf Anfrage",
        desc: "Über Agent-Slash-Befehle (live unten) oder Freitext.",
      },
      {
        cmd: "Skills · Workflows · Subagents",
        need: "optional",
        desc: "Installierte Skills/Workflows; parallele Agenten bei komplexen Tasks.",
      },
    ],
  },
  {
    group: "Overview-Tasten",
    items: [
      {
        cmd: "↑ / ↓",
        need: "optional",
        desc: "Session markieren.",
      },
      {
        cmd: "Enter · Doppelklick",
        need: "optional",
        desc: "Session laden / öffnen.",
      },
      {
        cmd: "r",
        need: "optional",
        desc: "Markierte Session umbenennen.",
      },
      {
        cmd: "Esc",
        need: "optional",
        desc: "Panel schließen oder Bestätigung abbrechen.",
      },
    ],
  },
];

const COMMAND_HINTS = {
  group: "Hinweis",
  items: [
    {
      cmd: "Befehle und Skills",
      need: "hilfreich",
      desc: "Live Skills + Agent-Commands im Seitenpanel: Leiste, ⌘/Ctrl+K oder / im Composer. Nicht in dieser Legende ausführen.",
    },
    {
      cmd: "Slash in dieser UI",
      need: "hilfreich",
      desc: "Live-Liste = was der Agent wirklich anbietet. Glyph-eigene Aktionen: Deep Search, Fork, Rewind, /rename, Sessions, Kopieren, Plan-Leiste.",
    },
    {
      cmd: "TUI-Doku",
      need: "optional",
      desc: "Zusätzlich: ~/.grok/docs/user-guide/04-slash-commands.md · TUI /docs",
    },
  ],
};

/** Render short handbook lines with optional **bold** spans. */
function HandbookText({ children }) {
  const text = String(children ?? "");
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/**
 * Kurzhandbuch (In-App) — verdichtet aus HANDBUCH.md.
 * Absichtlich kurz: was du im Chatfenster brauchst, ohne Setup-Wall.
 */
const SHORT_HANDBOOK = [
  {
    id: "what",
    title: "Was Glyph ist",
    body: [
      "**Glyph ist keine KI** — nur eine Browser-Hülle für Agenten (ACP).",
      "Du bringst Grok Build / ^_Code / °_Agent mit; Glyph zeigt Chat, Tools und Status.",
      "Für Leute, die lokal arbeiten und wissen, was sie tun (z. B. Mac Mini).",
    ],
  },
  {
    id: "first",
    title: "Erster Start",
    body: [
      "**Mac & Windows:** Node.js 22+ · `git clone` · `npm install` · `npm run build` · `npm start`.",
      "Browser: **http://127.0.0.1:5174** (Prod). Dev: `npm run dev` → UI :5173, Bridge :5174.",
      "macOS-Extras (LaunchAgent, Dock) sind optional — unter Windows weglassen.",
      "**Graph**: Bind prüfen — Grok Build = `grok login`. Agent/Code = Direct in der Legende.",
      "Profil wählen (Header) → **Kette** verbinden → chatten.",
    ],
  },
  {
    id: "start",
    title: "Schnellstart",
    body: [
      "Oben rechts **Ketten-Icon** (gold) = Agent läuft. Offline (durchgestrichen)? Icon klicken.",
      "Nachricht tippen → Desk **Enter** senden · **Shift+Enter** = Zeile. Handy: Tastatur-Enter = Zeile, Kopf = senden.",
      "Ohne Verbindung ist das Eingabefeld deaktiviert.",
      "Sicherheit: Bridge mit vollen Tool-Rechten — **nur localhost**.",
    ],
  },
  {
    id: "bind",
    title: "Anbindung (Keys / OAuth)",
    body: [
      "**Graph** (Leiste): folgt Theme (Dunkel pechschwarz / Hell Papier). Köpfe um Glyph; Vaults/Roots als Punkte. Klick → Legende.",
      "**Grok Build:** OAuth im Terminal (`grok login`). Glyph speichert keinen OAuth-Token — nur Status.",
      "**^_Code / °_Agent:** Header-Pille oder Graph-Kopf → Host-URL, Direct-Key, OpenRouter-Key, Modell. Ohne Slash = Direct (`deepseek-v4-flash-vision-exp`), mit Slash = OpenRouter (`deepseek/deepseek-v4-flash-0731`).",
      "**Vaults (Kabelsalat):** Obsidian an °_Agent — Pfad / Name / `obsidian://` · r · r+w · 🔒 · Kabel an/ab. SoT: `~/.glyph/vaults.json`.",
      "**Workspaces (Kabelsalat):** Code-Roots an ^_Code — Pfad · r · r+w · 🔒. `r+w` = beschreibbar, nicht Auto-Write. SoT: `~/.glyph/workspaces.json`.",
      "**An/Ab** = Kabel durchtrennen, Eintrag bleibt.",
      "**Voice:** optional `XAI_API_KEY` (console.x.ai).",
      "Gespeichert lokal: `~/.glyph-ui/bindings.json` (nie committen).",
    ],
  },
  {
    id: "layout",
    title: "Oberfläche",
    body: [
      "Links: Kalender, Lupe, **Graph**, Neuer Chat, **Befehle und Skills**, Wiki, Workspace, Theme, UI neu laden, **Buch** (Handbuch · UI-Legende). Kalender & Skills = **Seitenpanel** (Chat bleibt); **Graph** = Vollfläche.",
      "Header links: Glyph #0.9.0 · Term · ACP. cwd nicht in der Zeile (Tooltip / Workspace-Button). Rechts: Profil · Modell-Pille (eingesetztes Modell, nicht Primary→Reserve) · Kette.",
      "glyph-ui.com: Header Stift · Befehle · Theme · Schloss · **UI neu laden**. Keine Kette (Beenden).",
      "Mitte: Chat-Verlauf (Markdown). Rechts: Snack-Scrollbar (Raupe / Apfel).",
      "Unten: **Arbeitsleiste** (Plan · Ordner · Aktiver Task) über der LVL-Leiste · Composer · Chat | Deep Search | Fork | Swarm · **Mic** · **Kopf**. °_Agent: Pixel-Apfel über dem Kopf = Ordner-Suche.",
    ],
  },
  {
    id: "rail",
    title: "Linke Leiste",
    rows: [
      ["Lupe", "Sessions suchen/öffnen; Schließen = Disk-Ordner weg. Wissen: /merken"],
      ["Graph", "Direkt unter der Lupe · Köpfe um Glyph · Punkt → Legende"],
      ["Stift", "Neuer Chat (wie TUI /new — Disk bleibt)"],
      ["Buch", "Handbuch · UI-Legende"],
      ["Kalender", "Seitenpanel Plan/Aktivität (Chat bleibt) · Heatmap (Grok)"],
      ["Wiki", "Wiki-Index (.md) in Obsidian / Standard-App"],
      ["Ordner", "Aktuellen Workspace (cwd) im Finder öffnen"],
      ["Theme", "Hell / Dunkel"],
      ["↻", "UI neu laden (statt ⌘⇧R)"],
    ],
  },
  {
    id: "composer",
    title: "Schreiben & senden",
    rows: [
      ["Chat", "Normale Nachricht an den aktiven Agenten"],
      ["Apfel", "°_Agent: über dem Kopf. Wiki, TinyFish und Exa laufen immer. An = Arbeits-Vault beim Senden, Composer leer, Query in der Leiste. ×/Snack bricht ab. Vault leer → KomNet, sonst DGUV. Aus = allgemeine Suche, Internet, soziale Netze."],
      ["Treffer", "Arbeitsleiste über LVL, nicht im Chat. Start aus; nur angeklickte Arbeits-Vault-Treffer gehen in den Kontext. Web mit Apfel: KomNet/DGUV."],
      ["Deep Search", "Grok: strukturierte Multi-Quellen-Recherche. Andere Köpfe ausgegraut."],
      ["Fork", "Session branchen; Text = optionale Directive"],
      ["Swarm", "°_Agent / ^_Code: Planer, Suche, Synthese. Grok ausgegraut."],
      ["↑", "Leerer Composer: Prompt-History"],
      ["Rewind", "Esc Esc · /rewind · ↺ an der Nutzer-Nachricht. Dateien bleiben."],
      ["Enter", "Desk: senden · Handy: Tastatur = Zeile, Kopf sendet (erster Tap)"],
      ["Shift+Enter", "Neue Zeile ohne Senden (Desk)"],
    ],
  },
  {
    id: "voice",
    title: "Sprache (Mic & Vorlesen)",
    body: [
      "**Mic** im Composer: Diktieren (STT). Klick → sprechen → Stop → Text im Feld.",
      "Dropdown daneben: TTS-Stimme (Eve, Ara, Rex, …).",
      "Lautsprecher an **fertigen** Grok-Antworten: vorlesen / stoppen.",
      "Braucht oft `XAI_API_KEY` (xAI Console). Fallback: Token nach `grok login`.",
    ],
  },
  {
    id: "working",
    title: "Während der Agent arbeitet",
    rows: [
      ["Idle", "Button zeigt den Kopf (Grok Build / °_Agent / ^_Code) → senden"],
      ["Arbeitet", "Runder Snack (Raupe jagt Pixel-Apfel)"],
      ["Überfressen", "Raupe auf dem Rücken, Füße hoch, Apfel auf dem Kopf + Banner — Hänger, manuell neu starten"],
      ["Text + Enter", "Follow-up → Warteschlange (WARTE)"],
      ["Leer / Snack", "Soft-Stop (ACP-Cancel) im Kreis-Button"],
      ["Arbeitsleiste", "Plan, Ordner-Suche, Aktiver Task: Gold-Rand, Label, × — über der LVL-Leiste, nicht Bildmitte. Freigabe bleibt eigenes Modal."],
      ["× / Leeren", "Queue-Eintrag bzw. ganze Queue löschen"],
      ["Neue Ausgabe ↓", "Wieder ans aktuelle Chat-Ende springen"],
    ],
  },
  {
    id: "sessions",
    title: "Sessions & Wiki",
    body: [
      "Sessions liegen unter `~/.grok/sessions`. Lupe → suchen → Öffnen.",
      "Schließen: Session-Ordner auf Disk löschen · Abbrechen. Kein Wiki-Dump.",
      "Aktive Chat-Session ist geschützt (zuerst Stift = `/new`). Speicher freigeben = Ordner löschen.",
      "**Merken:** Slash `/merken` (Befehle / Skills). Wiki-Karte nach Vorlage, erst nach Chat-Ja. Ablehnen ohne Suchwert.",
    ],
  },
  {
    id: "can",
    title: "Was der Agent hier kann",
    rows: [
      ["Code & Dateien", "Lesen, schreiben, refaktorieren im Workspace"],
      ["Terminal", "Shell, Builds, Tests, Git"],
      ["Recherche", "Web/Docs; Deep Search für tiefergehend"],
      ["Medien", "Bilder/Video oft als Freitext; TUI: /imagine"],
      ["Erweiterungen", "Skills, Workflows, Subagents, MCPs"],
      ["Merken", "Slash /merken: Erkenntnis nach Vorlage, Chat-Ja. Kein Zusammenfassen-Button."],
    ],
  },
  {
    id: "flow",
    title: "Typische Abläufe",
    body: [
      "**Schnell:** verbunden → Aufgabe → Enter → optional Queue.",
      "**Fortsetzen:** Lupe → Session öffnen → weiterchatten.",
      "**Aufräumen:** Lupe → Schließen (Disk). Wissen: `/merken`.",
      "**Merken:** `/merken` → Karte zeigen → Ja. Ohne Suchwert ablehnen.",
      "**Aktivität:** Kalender → Tag → Sessions.",
      "**Neues Thema:** Stift (/new, Disk bleibt) oder Fork (Abzweig mit Verlauf).",
      "**Aufgabe übergeben:** Kette an der Antwort → Beleg hängt (Meldung + Antwort). **Was ist zu tun** = Korrektur. **Übernehmen** in den Composer, kein Auto-Kopfwechsel.",
    ],
  },
  {
    id: "grant",
    title: "Freigabe (^_Code)",
    body: [
      "`r+w` heißt Workspace beschreibbar — nicht dauerhaft schreiben ohne Nachfrage.",
      "Dialog: **Einmal** · **Für Auftrag** · **Für Task**. Kein „immer“, kein „Für diese Session“. Elevated Shell nur Einmal/Ablehnen.",
      "**Aktiver Task** in der Arbeitsleiste: Name, Pfade, Restzeit, **Widerrufen**. Preview: `?grant=demo` · `?task=demo` · `?handoff=demo`.",
      "Tool-Karte: *Warum erlaubt?* — einmal, Auftrag oder Task-Name.",
    ],
  },
  {
    id: "aufgaben",
    title: "Aufgaben (Übergabe)",
    body: [
      "Kette an einer Antwort: Arbeitsleiste, Beleg (Meldung + Antwort, aufklappbar) + Titel + **Was ist zu tun**. Ohne das Paar keine Aufgabe. Kein Session-Sprung.",
      "Liegt unter **Plan & Aktivität**. **Übernehmen** → Composer. **Fertig** nur mit Pfad oder Ort.",
      "Aufgabe ≠ Task-Freigabe, ≠ wiederkehrendes To-do.",
    ],
  },
  {
    id: "tips",
    title: "Probleme & Tipps",
    rows: [
      ["offline", "Kette klicken · Graph → Grok Build · `grok login`?"],
      ["Eingabe grau", "Erst verbinden"],
      [
        "hängt",
        "Snack mit X_X = überfressen (2+ Min still) · tippen = Stop · UI neu laden · sonst npm run service:install",
      ],
      ["Disk voll", "Lupe → Schließen (Session-Ordner). Wissen: /merken"],
      ["UI veraltet", "UI neu laden in der Leiste"],
      ["Slash „tut nichts“", "Viele /Befehle sind TUI-only — Freitext oder Tabs"],
      ["Code/Agent rot", "Graph → Agent/Code · Direct-Key · glyph-agent :18899"],
    ],
  },
  {
    id: "check",
    title: "Checkliste",
    body: [
      "✓ Graph: Grok Build OAuth / Agent Direct · Status **verbunden**",
      "✓ Workspace passt (Header-Pfad)",
      "✓ Desk: Enter = senden · Handy: Tastatur-Enter = Zeile, Kopf = senden",
      "✓ Arbeit: Text → Queue, leer → Stop",
      "✓ Lupe · Kalender · Wiki · Mic / Lautsprecher",
    ],
  },
];

function normalizeHelpTab(t) {
  // "commands" / "befehle" = früherer Tab-Name → Legende (UI-Doku, keine Live-Skills)
  if (t === "commands" || t === "befehle" || t === "legend" || t === "legende")
    return "legend";
  if (t === "handbook") return t;
  return "handbook";
}

function CommandLegend({
  open,
  onClose,
  initialTab = "handbook",
  /** @deprecated Live-Katalog nur noch im Seitenpanel „Befehle und Skills“; prop bleibt für Call-Sites. */
  agentCommands = [],
  agentProfileId = "",
  onOpenLage,
  side = "right",
  mode = "overlay",
}) {
  void agentProfileId;
  void onOpenLage;
  void agentCommands;
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState(() => normalizeHelpTab(initialTab));
  const searchRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTab(normalizeHelpTab(initialTab));
    }
  }, [open, initialTab]);

  // Nur UI-Legende + Hinweise. Live Skills/Agent-Commands → Seitenpanel „Befehle und Skills“.
  const commandGroups = useMemo(
    () => [...COMMAND_LEGEND, COMMAND_HINTS],
    [],
  );

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commandGroups;
    return commandGroups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (it) =>
            it.cmd.toLowerCase().includes(q) ||
            it.desc.toLowerCase().includes(q) ||
            it.need.toLowerCase().includes(q) ||
            g.group.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [query, commandGroups]);

  const filteredHandbook = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORT_HANDBOOK;
    return SHORT_HANDBOOK.filter((sec) => {
      const hay = [
        sec.title,
        ...(sec.body || []),
        ...((sec.rows || []).flatMap((r) => r)),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query]);

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      kicker="In der App"
      title="Buch"
      className="app-drawer--book"
      ariaLabel="Hilfe und Kurzhandbuch"
      initialFocusRef={searchRef}
      side={side}
      mode={mode}
    >
        <div className="help-tabs" role="tablist" aria-label="Hilfe-Bereich">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "handbook"}
            className={`help-tab${tab === "handbook" ? " help-tab--active" : ""}`}
            onClick={() => setTab("handbook")}
          >
            Handbuch
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "legend"}
            className={`help-tab${tab === "legend" ? " help-tab--active" : ""}`}
            onClick={() => setTab("legend")}
          >
            Legende
          </button>
        </div>

        {tab === "handbook" ? (
          <p className="overview-hint">
            Kurzanleitung für dieses Chatfenster. Volltext:{" "}
            <code>HANDBUCH.md</code> im Projekt · TUI: <code>/docs</code>.{" "}
            <a href="/docs/glyph-profile-diagrams.html" target="_blank" rel="noreferrer">
              Agent-Profile · Diagramme
            </a>
            .
          </p>
        ) : (
          <p className="overview-hint">
            <strong>UI-Legende</strong> (Doku, nicht ausführen). Skills und Agent-Commands: Leisten-Button{" "}
            <strong>Befehle und Skills</strong> oder ⌘/Ctrl+K
            {agentCommands.length
              ? ` · Agent meldet gerade ${agentCommands.length} Commands`
              : " · Agent-Commands erscheinen nach Verbindung"}
            .
          </p>
        )}

        <input
          ref={searchRef}
          className="overview-search"
          type="search"
          placeholder={
            tab === "handbook"
              ? "Filter: Mic, Queue, Sessions, offline…"
              : "Filter: Lupe, Composer, Deep Search, Queue…"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buch filtern"
        />

        {tab === "handbook" ? (
          <div className="overview-list handbook-list" role="tabpanel">
            {filteredHandbook.length === 0 ? (
              <div className="empty-inline">Kein Treffer.</div>
            ) : (
              filteredHandbook.map((sec) => (
                <section key={sec.id} className="handbook-section">
                  <h3 className="handbook-section-title">{sec.title}</h3>
                  {sec.body?.map((line) => (
                    <p key={line} className="handbook-line">
                      <HandbookText>{line}</HandbookText>
                    </p>
                  ))}
                  {sec.rows?.length > 0 && (
                    <div className="handbook-table" role="list">
                      {sec.rows.map(([k, v]) => (
                        <div key={k} className="handbook-row" role="listitem">
                          <code className="handbook-key">{k}</code>
                          <span className="handbook-val">
                            <HandbookText>{v}</HandbookText>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))
            )}
          </div>
        ) : (
          <div className="overview-list legend-list" role="tabpanel">
            {filteredCommands.length === 0 ? (
              <div className="empty-inline">Kein Treffer.</div>
            ) : (
              filteredCommands.map((g) => (
                <div key={g.group} className="legend-group">
                  <h3 className="legend-group-title">{g.group}</h3>
                  {g.items.map((it) => (
                    <article key={it.cmd} className="legend-row">
                      <div className="legend-cmd">
                        <code>{it.cmd}</code>
                        <span
                          className={`legend-need legend-need--${
                            it.need === "empfohlen" ||
                            it.need === "bei vollem Kontext" ||
                            it.need === "bei Problemen"
                              ? "soft"
                              : it.need === "normal" ||
                                  it.need === "auto" ||
                                  it.need === "agent"
                                ? "ok"
                                : "muted"
                          }`}
                        >
                          {it.need}
                        </span>
                      </div>
                      <p className="legend-desc">{it.desc}</p>
                    </article>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
    </SideDrawer>
  );
}

export { CommandLegend, COMMAND_LEGEND, SHORT_HANDBOOK };
