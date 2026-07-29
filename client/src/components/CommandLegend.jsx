/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useEffect, useMemo, useRef, useState } from "react";

const COMMAND_LEGEND = [
  {
    group: "Linke Leiste (diese UI)",
    items: [
      {
        cmd: "Lupe",
        need: "empfohlen",
        desc: "Sessions suchen/öffnen; Schließen: Ja + Wiki oder Löschen (/delete).",
      },
      {
        cmd: "Stift · Neuer Chat",
        need: "optional",
        desc: "Neue ACP-Session, Chat leeren. Entspricht TUI /new (Disk bleibt).",
      },
      {
        cmd: "Befehle",
        need: "optional",
        desc: "Filterbare Befehls-Legende (Slash, Composer, Leiste).",
      },
      {
        cmd: "Buch · Handbuch",
        need: "optional",
        desc: "Kurzhandbuch ganz unten in der Leiste (Tabs: Handbuch / Befehle).",
      },
      {
        cmd: "Kalender",
        need: "optional",
        desc: "Aktivitäts-Heatmap (gelb = aktiv, dunkler = häufiger, Peak mit Auge). Klick → Sessions des Tages.",
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
        cmd: "Refresh",
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
        desc: "Senden (ohne Shift). Shift+Enter = neue Zeile. Während Grok arbeitet → Warteschlange.",
      },
      {
        cmd: "Warteschlange",
        need: "optional",
        desc: "Follow-ups parken während der Antwort (wie TUI). Danach automatisch senden. × / Leeren.",
      },
      {
        cmd: "↵ / Snack · Stopp",
        need: "auto",
        desc: "Runder Button: idle = ↵. Während Arbeit: Text+Enter = Queue; leerer Klick/Snack (runder Stopp-Punkt) = Soft-Abbruch (ACP). Kritische Tools laufen sicher zu Ende mit Hinweis.",
      },
      {
        cmd: "Chat | Deep Search | Fork",
        need: "empfohlen",
        desc: "Chat = normale Nachricht. Deep Search = /deep-research. Fork = Session branchen (/fork).",
      },
      {
        cmd: "verbunden / offline",
        need: "empfohlen",
        desc: "Agent starten/beenden. Gold = verbunden (nicht mehr „grün“).",
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
        desc: "Nachricht in die Zwischenablage (Button neben Vorlesen). Ersetzt TUI /copy.",
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
        cmd: "Esc",
        need: "optional",
        desc: "Panel schließen oder Bestätigung abbrechen.",
      },
    ],
  },
];

/** Built after agentCommands are known (live ACP catalog). */
function agentCommandGroup(agentCommands) {
  if (agentCommands?.length) {
    return {
      group: "Agent-Befehle (live)",
      items: agentCommands.map((c) => {
        const slash = c.name.startsWith("/") ? c.name : `/${c.name}`;
        const cmd = c.inputHint ? `${slash} ${c.inputHint}` : slash;
        return {
          cmd,
          need: "agent",
          desc: c.description || "—",
        };
      }),
    };
  }
  return {
    group: "Agent-Befehle (live)",
    items: [
      {
        cmd: "noch leer",
        need: "auto",
        desc: "Erscheint nach Verbindung, sobald Grok available_commands_update sendet — keine statische Pflege mehr.",
      },
    ],
  };
}

const COMMAND_HINTS = {
  group: "Hinweis",
  items: [
    {
      cmd: "Slash in dieser UI",
      need: "hilfreich",
      desc: "Live-Liste = was der Agent wirklich anbietet. Glyph-eigene Aktionen: Deep Search, Fork, Sessions, Kopieren, Plan-Leiste.",
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
    id: "start",
    title: "Schnellstart",
    body: [
      "Oben rechts **verbunden** (gold) = Agent läuft. Offline? Pill klicken.",
      "Nachricht tippen → **Enter** senden · **Shift+Enter** = neue Zeile.",
      "Ohne Verbindung ist das Eingabefeld deaktiviert.",
      "Sicherheit: Bridge mit vollen Tool-Rechten — **nur localhost**.",
    ],
  },
  {
    id: "layout",
    title: "Oberfläche",
    body: [
      "Links: Sessions, Neuer Chat, Befehle, Kalender, Wiki, Workspace, Theme, Refresh — **Buch** ganz unten.",
      "Mitte: Chat-Verlauf (Markdown). Rechts: Snack-Scrollbar (Schlange / Apfel).",
      "Unten: Composer · Chat | Deep Search | Fork · **Mic** · Stimme · **↵**.",
    ],
  },
  {
    id: "rail",
    title: "Linke Leiste",
    rows: [
      ["Lupe", "Sessions suchen/öffnen; Ja + Wiki · Löschen (/delete)"],
      ["Stift", "Neuer Chat (wie TUI /new — Disk bleibt)"],
      ["Befehle", "Filterbare Legende (Mitte der Leiste)"],
      ["Buch", "Kurzhandbuch — ganz unten in der Leiste"],
      ["Kalender", "Aktivitäts-Heatmap — Klick → Sessions des Tages"],
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
      ["Chat", "Normale Nachricht an Grok"],
      ["Deep Search", "Strukturierte Multi-Quellen-Recherche"],
      ["Fork", "Session branchen; Text = optionale Directive"],
      ["Enter", "Senden · während Arbeit → Warteschlange"],
      ["Shift+Enter", "Neue Zeile ohne Senden"],
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
    title: "Während Grok arbeitet",
    rows: [
      ["Idle", "Button zeigt ↵ → senden"],
      ["Arbeitet", "Runder Snack (Schlange jagt roten Stopp-Punkt)"],
      ["Text + Enter", "Follow-up → Warteschlange (WARTE)"],
      ["Leer / Snack", "Soft-Stop (ACP-Cancel) im Kreis-Button"],
      ["× / Leeren", "Queue-Eintrag bzw. ganze Queue löschen"],
      ["Neue Ausgabe ↓", "Wieder ans aktuelle Chat-Ende springen"],
    ],
  },
  {
    id: "sessions",
    title: "Sessions & Wiki",
    body: [
      "Sessions liegen unter `~/.grok/sessions`. Lupe → suchen → Öffnen.",
      "Schließen: **Ja + Wiki** (Archiv + löschen) · **Löschen** (TUI `/delete`) · Abbrechen.",
      "Aktive Chat-Session ist geschützt (zuerst Stift = `/new`). Speicher freigeben = Ordner löschen.",
      "Wiki-Ziel: `…/OpenClaw memory-wiki/sources/grok-sessions/`.",
    ],
  },
  {
    id: "can",
    title: "Was Grok hier kann",
    rows: [
      ["Code & Dateien", "Lesen, schreiben, refaktorieren im Workspace"],
      ["Terminal", "Shell, Builds, Tests, Git"],
      ["Recherche", "Web/Docs; Deep Search für tiefergehend"],
      ["Medien", "Bilder/Video oft als Freitext; TUI: /imagine"],
      ["Erweiterungen", "Skills, Workflows, Subagents, MCPs"],
    ],
  },
  {
    id: "flow",
    title: "Typische Abläufe",
    body: [
      "**Schnell:** verbunden → Aufgabe → Enter → optional Queue.",
      "**Fortsetzen:** Lupe → Session öffnen → weiterchatten.",
      "**Aufräumen:** Lupe → Schließen → Ja + Wiki, oder **Löschen** (/delete).",
      "**Aktivität:** Kalender → Tag → Sessions.",
      "**Neues Thema:** Stift (/new, Disk bleibt) oder Fork (Abzweig mit Verlauf).",
    ],
  },
  {
    id: "tips",
    title: "Probleme & Tipps",
    rows: [
      ["offline", "Pill klicken · `grok` im PATH? · `grok login`?"],
      ["Eingabe grau", "Erst verbinden"],
      ["hängt", "Leerer Snack-Klick = Stop · sonst Refresh + reconnect"],
      ["Disk voll", "Lupe → Schließen → Ja + Wiki oder Löschen (/delete)"],
      ["UI veraltet", "Refresh in der Leiste"],
      ["Slash „tut nichts“", "Viele /Befehle sind TUI-only — Freitext oder Tabs"],
    ],
  },
  {
    id: "check",
    title: "Checkliste",
    body: [
      "✓ `grok` eingeloggt · Status **verbunden**",
      "✓ Workspace passt (Header-Pfad)",
      "✓ Enter = senden · Shift+Enter = Zeile",
      "✓ Arbeit: Text → Queue, leer → Stop",
      "✓ Lupe · Kalender · Wiki · Mic / Lautsprecher",
    ],
  },
];

function CommandLegend({
  open,
  onClose,
  initialTab = "handbook",
  agentCommands = [],
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState(initialTab); // handbook | commands
  const panelRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTab(initialTab === "commands" ? "commands" : "handbook");
      requestAnimationFrame(() => panelRef.current?.focus());
    }
  }, [open, initialTab]);

  const commandGroups = useMemo(
    () => [
      ...COMMAND_LEGEND,
      agentCommandGroup(agentCommands),
      COMMAND_HINTS,
    ],
    [agentCommands],
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

  if (!open) return null;

  return (
    <div className="overview-scrim" role="presentation" onClick={onClose}>
      <section
        ref={panelRef}
        className="overview-panel legend-panel handbook-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Hilfe und Kurzhandbuch"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <header className="overview-head">
          <div>
            <p className="overview-kicker">In der App</p>
            <h2>Kurzhandbuch</h2>
            <p className="overview-meta">
              Überblick · Bedienung · Sprache · Sessions · Tipps
            </p>
          </div>
          <div className="overview-head-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Schließen
            </button>
          </div>
        </header>

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
            aria-selected={tab === "commands"}
            className={`help-tab${tab === "commands" ? " help-tab--active" : ""}`}
            onClick={() => setTab("commands")}
          >
            Befehle
          </button>
        </div>

        {tab === "handbook" ? (
          <p className="overview-hint">
            Kurzanleitung für dieses Chatfenster. Volltext:{" "}
            <code>HANDBUCH.md</code> im Projekt · TUI: <code>/docs</code>.
          </p>
        ) : (
          <p className="overview-hint">
            <strong>UI:</strong> Leiste &amp; Composer (statisch).{" "}
            <strong>Agent:</strong> live aus der Session (
            {agentCommands.length
              ? `${agentCommands.length} Befehle`
              : "warte auf Katalog"}
            ). <strong>Kopieren:</strong> Button an der Nachricht.
          </p>
        )}

        <input
          className="overview-search"
          type="search"
          placeholder={
            tab === "handbook"
              ? "Filter: Mic, Queue, Sessions, offline…"
              : "Filter: Lupe, /fork, Deep Search, compact…"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
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
      </section>
    </div>
  );
}

export { CommandLegend, COMMAND_LEGEND, SHORT_HANDBOOK };
