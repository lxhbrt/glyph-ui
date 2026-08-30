/**
 * Glyph UI — ACP browser UI (Grok Build, ^_Code, °_Agent)
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AssistantText } from "./components/AssistantText.jsx";
import { AssistantMeta } from "./components/AssistantMeta.jsx";
import { PlanBar } from "./components/PlanBar.jsx";
import { ContextLvlBar } from "./components/ContextLvlBar.jsx";
import { SnackBoard } from "./components/Snack.jsx";
import { SendSnake } from "./components/GraphFaces.jsx";
import { profileHeadId } from "./utils/lageLayout.js";
import { CommandOverview } from "./components/CommandOverview.jsx";
import { ExtensionsModal } from "./components/ExtensionsModal.jsx";
import { SlashPopup } from "./components/SlashPopup.jsx";
import { PromptHistoryPopup } from "./components/PromptHistoryPopup.jsx";
import { RewindPicker } from "./components/RewindPicker.jsx";
import { SlashHighlightedText } from "./components/SlashHighlightedText.jsx";
import { VaultSearchToggle } from "./components/VaultSearchToggle.jsx";
import { VaultSearchHits } from "./components/VaultSearchHits.jsx";
import { TaskHandoffDialog } from "./components/TaskHandoffDialog.jsx";
import {
  findSlashHighlightRanges,
  insertSlashCommand,
  isHiddenAgentCommand,
  isUiReloadItem,
  isUiReloadSlash,
  rankCatalog,
  slashTokenAt,
  withUiReloadCommand,
} from "./utils/slash.js";
import { hardReloadUi } from "./utils/reloadUi.js";
import { applyComposerMirrorMetrics } from "./utils/composerMirror.js";
import {
  canSwarm,
  composerActionLabel,
  resolveComposerAction,
} from "./utils/composerActions.js";
import {
  IconSearch,
  IconCompose,
  IconCommands,
  IconLage,
  IconBook,
  IconCalendar,
  IconWiki,
  IconWorkspace,
  IconTheme,
  IconMic,
  IconPlus,
  IconSpeaker,
  IconSpeakerOff,
  IconCopy,
  IconCheck,
  IconRefresh,
  IconLock,
  IconLink,
  IconLinkOff,
  IconRewind,
} from "./components/icons.jsx";
import { useWorkingSeconds } from "./hooks/useWorkingSeconds.js";
import {
  MAX_ATTACHMENTS_PER_MSG,
  dataTransferHasFiles,
  filesFromDataTransfer,
  formatAttachmentSummary,
  formatBytes,
  isImageMime,
  revokeAttachmentPreviews,
  toWireAttachments,
  uploadAttachmentFiles,
} from "./utils/attachments.js";
import { invalidateWsToken, wsUrl } from "./utils/format.js";
import { resolveSeat, seatFetch } from "./utils/seat.js";
import { surfaceHeaderControls } from "./utils/webSurface.js";
import { modelHudText, shortModelLabel } from "./utils/assistantTrace.js";
import {
  contextFillRatio,
  estimateTokensFromTexts,
  goldFillRatio,
  isModelCompatibleWithProfile,
  PROFILE_DEFAULT_WINDOWS,
  resolveContextWindow,
  scrollMetrics,
} from "./utils/contextMeter.js";
import { ToolCard } from "./components/ToolCard.jsx";
import { PermissionDialog } from "./components/PermissionDialog.jsx";
import { WebGate } from "./components/WebGate.jsx";
import { WebPasswordDialog } from "./components/WebPasswordDialog.jsx";
import { ActiveTaskBar } from "./components/ActiveTaskBar.jsx";
import ProviderSwitch from "./components/ProviderSwitch.jsx";
import { GRANT_DEMO_REQ, TASK_DEMO } from "./utils/codeGrants.js";
import {
  TRANSCRIPT_WINDOW,
  formatToolText,
  priorUserMessage,
  transcriptWindow,
  upsertToolMessage,
} from "./utils/messages.js";
import {
  isCloudModelProfile,
  modelHudFromBindings,
} from "./utils/bindingsModels.js";
import {
  isToolRunning,
  isToolTerminal,
  TOOLCARD_DEMO_MESSAGES,
} from "./utils/toolCard.js";
import { normalizeClientPlanEntries } from "./utils/plan.js";
import { loadPersistedQueue, persistQueue } from "./utils/queue.js";
import {
  loadPromptHistory,
  pushPromptHistory,
  stepPromptHistory,
} from "./utils/promptHistory.js";
import {
  rewindPointsFromMessages,
  sliceMessagesBeforeUser,
} from "./utils/rewind.js";
import {
  loadVaultSearchOn,
  saveVaultSearchOn,
  migrateVaultSearchOn,
  defaultSelectedIds,
  selectedHits,
  normalizePreviewPayload,
  toWireSelected,
  vaultFindHttpError,
  vaultSendIntent,
} from "./utils/vaultSearch.js";
import { LageFallback } from "./components/LageFallback.jsx";
import { pickRecorderMime, textForSpeech, speakWithBrowser } from "./utils/voice.js";
import {
  GLYPH_BUILD,
  GLYPH_BUILD_LABEL,
  GLYPH_VERSION,
  glyphBuildLabel,
} from "./version.js";

const GraphModal = lazy(() =>
  import("./components/CableLage.jsx").then((m) => ({ default: m.GraphModal })),
);
const CommandLegend = lazy(() =>
  import("./components/CommandLegend.jsx").then((m) => ({
    default: m.CommandLegend,
  })),
);
const ActivityCalendar = lazy(() =>
  import("./components/ActivityCalendar.jsx").then((m) => ({
    default: m.ActivityCalendar,
  })),
);

/** Busy + no thought/answer/tool for this long → snack “overate” (X_X). */
const SNACK_STALE_MS = 120_000;
/** Grok context poll while a turn is running (signals.json lag). */
const CONTEXT_POLL_MS = 8_000;

export default function App() {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Follow-up messages parked while Grok is working (TUI-style queue). */
  const [queue, setQueue] = useState(() => loadPersistedQueue());
  const queueRef = useRef(null);
  if (queueRef.current === null) {
    queueRef.current = queue;
  }
  /** Mirror busy/streaming so drain logic does not rely on stale closures. */
  const busyRef = useRef(false);
  const streamingRef = useRef(false);
  const drainTimerRef = useRef(null);
  /** Effektiver Server-Trace für die letzte Antwort (Provider/Modell/Tool-Status). */
  const traceRef = useRef(null);
  const drainingRef = useRef(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [seat, setSeat] = useState(() => resolveSeat());
  const webSurface = seat === "web";
  const headerControls = surfaceHeaderControls(seat);
  const [webUnlocked, setWebUnlocked] = useState(() => seat !== "web");
  const [webGateHint, setWebGateHint] = useState("");
  const [webPasswordOpen, setWebPasswordOpen] = useState(false);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("web-surface", webSurface);
    return () => root.classList.remove("web-surface");
  }, [webSurface]);
  useEffect(() => {
    if (seat !== "web") {
      setWebUnlocked(true);
      return undefined;
    }
    let cancelled = false;
    fetch("/api/web-gate", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setWebUnlocked(Boolean(j?.ok) || j?.required === false);
      })
      .catch(() => {
        if (!cancelled) setWebUnlocked(false);
      });
    return () => {
      cancelled = true;
    };
  }, [seat]);
  /** Ausgewählter Beleg für eine gemeinsame Kopf-zu-Kopf-Aufgabe. `?handoff=demo`. */
  const [taskHandoff, setTaskHandoff] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      return new URLSearchParams(window.location.search).get("handoff") === "demo"
        ? {
            message: { text: "Apfel sitzt über dem Kopf." },
            userMessage: { text: "Bitte den Apfel-Button verschieben" },
          }
        : null;
    } catch {
      return null;
    }
  });
  const [cwd, setCwd] = useState("");
  /**
   * Active ACP agent + the catalog to switch between. Capabilities decide
   * which grok-only controls stay usable (Deep Search, sessions, calendar).
   */
  const [agent, setAgent] = useState(null);
  const [agents, setAgents] = useState([]);
  const [agentSwitching, setAgentSwitching] = useState(false);
  /** Model badge (Code/Agent): profile primary, overridden by this session's last trace. */
  const [modelHud, setModelHud] = useState(null);
  /** ^_Code: Write/Shell-Freigabe aus dem Bridge-Server (`?grant=demo`). */
  const [permissionReq, setPermissionReq] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      return new URLSearchParams(window.location.search).get("grant") === "demo"
        ? GRANT_DEMO_REQ
        : null;
    } catch {
      return null;
    }
  });
  /** ^_Code: aktiver Task-Grant (Arbeitsleiste). `?task=demo`. */
  const [activeTask, setActiveTask] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      return new URLSearchParams(window.location.search).get("task") === "demo"
        ? TASK_DEMO
        : null;
    } catch {
      return null;
    }
  });
  const refreshActiveTaskRef = useRef(() => {});
  const [messages, setMessages] = useState([]);
  /** Extra older transcript rows mounted beyond TRANSCRIPT_WINDOW. */
  const [transcriptRevealed, setTranscriptRevealed] = useState(0);
  useEffect(() => {
    setTranscriptRevealed(0);
  }, [sessionId]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  /** Ready attachments for the next send (after POST /api/attachments). */
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [attachBusy, setAttachBusy] = useState(false);
  /** Visual drop target on the message list (drag counter avoids flicker). */
  const [dropActive, setDropActive] = useState(false);
  const dropDepthRef = useRef(0);
  /** ACP execution plan (agent todo list) — slim bar above composer. */
  const [planEntries, setPlanEntries] = useState([]);
  const [planCollapsed, setPlanCollapsed] = useState(false);
  /** × an der Plan-Leiste: Leiste aus, Einträge bleiben unter Kalender → Tab Plan. */
  const [planBarHidden, setPlanBarHidden] = useState(false);
  const [rewindOpen, setRewindOpen] = useState(false);
  const [rewindBusy, setRewindBusy] = useState(false);
  const rewindEscAtRef = useRef(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(null);
  const historyDraftRef = useRef("");
  /** Live slash catalog from available_commands_update. */
  const [agentCommands, setAgentCommands] = useState([]);
  /** Flash "copied" on message action button. */
  const [copiedId, setCopiedId] = useState(null);
  const copiedTimerRef = useRef(null);
  /** Message id whose copy/speak actions are revealed (tap-to-show). */
  const [actionsMsgId, setActionsMsgId] = useState(null);
  /** Composer action: chat | deep-search | fork | swarm. */
  const [sendAction, setSendAction] = useState(() => {
    try {
      const v = localStorage.getItem("gbt-action");
      if (
        v === "deep-search" ||
        v === "fork" ||
        v === "chat" ||
        v === "swarm"
      ) {
        return v;
      }
    } catch {
      /* ignore */
    }
    return "chat";
  });
  /** Compact mode dropdown (Chat | Deep Search | Fork | Swarm). */
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeMenuRef = useRef(null);
  const fileInputRef = useRef(null);
  /** °_Agent: manuelle Ordner-Suche. Default aus; Zustand pro Session. */
  const [vaultSearchOn, setVaultSearchOn] = useState(false);
  const [vaultHits, setVaultHits] = useState(null);
  const [vaultHitOn, setVaultHitOn] = useState(() => new Set());
  const [vaultSearchBusy, setVaultSearchBusy] = useState(false);
  const [vaultSearchError, setVaultSearchError] = useState("");
  const runVaultSearchRef = useRef(null);
  const vaultSearchAbortRef = useRef(null);
  const vaultLastPickedRef = useRef([]);
  const isAgentProfile =
    agent?.id === "glyph-agent" || agent?.id === "agent";
  const isGrokProfile = agent?.id === "grok" || !agent?.id;
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("gbt-theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [wikiRoot, setWikiRoot] = useState("");
  /** Bridge meta from /api/health (version, build, host, port, root). */
  const [bridgeMeta, setBridgeMeta] = useState(null);
  const [showOverview, setShowOverview] = useState(false);
  const [showLage, setShowLage] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const q = new URLSearchParams(window.location.search);
      return (
        q.has("graph") ||
        q.has("lage") ||
        q.get("buch") === "graph" ||
        q.get("buch") === "lage"
      );
    } catch {
      return false;
    }
  });
  const [lageFocus, setLageFocus] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const q = new URLSearchParams(window.location.search);
      return q.get("graph") || q.get("lage") || "";
    } catch {
      return "";
    }
  });
  const [showLegend, setShowLegend] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const b = new URLSearchParams(window.location.search).get("buch");
      return Boolean(b) && b !== "lage" && b !== "graph";
    } catch {
      return false;
    }
  });
  const [legendTab, setLegendTab] = useState(() => {
    if (typeof window === "undefined") return "handbook";
    try {
      const t = new URLSearchParams(window.location.search).get("buch") || "";
      if (
        t === "vaults" ||
        t === "workspaces" ||
        t === "bindings" ||
        t === "handbook" ||
        t === "legend"
      ) {
        return t;
      }
    } catch {
      /* ignore */
    }
    return "handbook";
  });
  const [showExtensions, setShowExtensions] = useState(false);
  const [skills, setSkills] = useState([]);
  const [skillsHint, setSkillsHint] = useState(null);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState("");
  /** Slash-Popup state (Composer `/` token). */
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const composerRef = useRef(null);
  const [showCalendar, setShowCalendar] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const q = new URLSearchParams(window.location.search);
      return q.has("plan") || q.has("cal");
    } catch {
      return false;
    }
  });
  const [cancelling, setCancelling] = useState(false);
  /**
   * Hang signal: busy but no thought/answer/tool chunks for a while.
   * Snack goes "stuffed" (X eyes) — user restarts; we don't auto-kill.
   */
  const lastActivityRef = useRef(Date.now());
  const [snackStuffed, setSnackStuffed] = useState(false);

  /**
   * LVL-UP context meter (sticky above messages).
   * Server: grok signals ground truth; else window map + client estimate.
   */
  const [contextInfo, setContextInfo] = useState(() => {
    const r = resolveContextWindow("", "grok");
    return {
      used: null,
      window: r.window,
      model: "",
      softCapPercent: 80,
      estimated: true,
      source: r.source,
    };
  });
  const [scrollHud, setScrollHud] = useState({
    scrollRatio: 1,
    hasOverflow: false,
  });

  // —— Voice (xAI primary · OpenRouter fallback) ——
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voiceHint, setVoiceHint] = useState("");
  const [voiceId, setVoiceId] = useState(() => {
    try {
      return localStorage.getItem("gbt-voice-id") || "de-DE-ConradNeural";
    } catch {
      return "de-DE-ConradNeural";
    }
  });
  const [sttLanguage] = useState(() => {
    try {
      return localStorage.getItem("gbt-stt-lang") || "de";
    } catch {
      return "de";
    }
  });
  const [ttsLanguage] = useState(() => {
    try {
      return localStorage.getItem("gbt-tts-lang") || "de";
    } catch {
      return "de";
    }
  });
  const [recording, setRecording] = useState(false);
  const [sttBusy, setSttBusy] = useState(false);
  const [speakingId, setSpeakingId] = useState(null);
  const [ttsBusyId, setTtsBusyId] = useState(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const ttsAudioRef = useRef(null);
  const ttsUrlRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("gbt-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("gbt-action", sendAction);
    } catch {
      /* ignore */
    }
  }, [sendAction]);

  // Survive window refresh: keep Warteschlange in localStorage
  useEffect(() => {
    persistQueue(queue);
  }, [queue]);

  useEffect(() => {
    const loadHealth = () => {
      seatFetch("/api/health")
        .then((r) => r.json())
        .then((j) => {
          if (j.wikiRoot) setWikiRoot(j.wikiRoot);
          if (j.cwd) setCwd(j.cwd);
          if (j.agent) setAgent(j.agent);
          if (Array.isArray(j.agents)) setAgents(j.agents);
          setBridgeMeta({
            version: j.version != null ? String(j.version) : "?",
            build: Number(j.build) || 0,
            host: j.host || "127.0.0.1",
            port: Number(j.port) || 5174,
            root: j.root ? String(j.root) : "",
          });
        })
        .catch(() => {});
    };
    loadHealth();
    // Re-check when returning to the tab (e.g. after service:install).
    const onVis = () => {
      if (document.visibilityState === "visible") loadHealth();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/voice/status");
        const j = await res.json();
        if (cancelled) return;
        setVoiceAvailable(Boolean(j.available));
        const providerHint =
          j.provider === "openrouter"
            ? "OpenRouter Voice"
            : j.provider === "xai"
              ? "xAI Voice"
              : "";
        setVoiceHint(
          j.hint ||
            (providerHint
              ? `${providerHint}${j.source ? ` · ${j.source}` : ""}`
              : ""),
        );
        if (j.available) {
          try {
            // Migration (2026-08-30): alte Defaults (eve/Katja) → Conrad.
            try {
              const cur = localStorage.getItem("gbt-voice-id");
              if (cur === "eve" || cur === "de-DE-KatjaNeural") {
                localStorage.setItem("gbt-voice-id", "de-DE-ConradNeural");
              }
            } catch {
              /* ignore */
            }
            const vr = await fetch("/api/tts/voices");
            const vj = await vr.json();
            if (!cancelled && Array.isArray(vj.voices) && vj.voices.length) {
              const ids = new Set(vj.voices.map((v) => v.voice_id));
              setVoiceId((cur) => {
                if (ids.has(cur)) return cur;
                const def = j.defaults?.voiceId;
                if (def && ids.has(def)) return def;
                return vj.voices[0].voice_id;
              });
            } else if (j.defaults?.voiceId && !localStorage.getItem("gbt-voice-id")) {
              setVoiceId(j.defaults.voiceId);
            }
          } catch {
            if (j.defaults?.voiceId && !localStorage.getItem("gbt-voice-id")) {
              setVoiceId(j.defaults.voiceId);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setVoiceAvailable(false);
          setVoiceHint("Voice-Status nicht erreichbar.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("gbt-voice-id", voiceId);
    } catch {
      /* ignore */
    }
  }, [voiceId]);

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      mediaStreamRef.current?.getTracks?.().forEach((t) => t.stop());
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }
      if (ttsUrlRef.current) {
        URL.revokeObjectURL(ttsUrlRef.current);
        ttsUrlRef.current = null;
      }
    };
  }, []);

  const stopTts = useCallback(() => {
    if (ttsAudioRef.current) {
      try {
        ttsAudioRef.current.pause();
      } catch {
        /* ignore */
      }
      ttsAudioRef.current = null;
    }
    if (ttsUrlRef.current) {
      URL.revokeObjectURL(ttsUrlRef.current);
      ttsUrlRef.current = null;
    }
    // Browser-Speech-Fallback stoppen
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    setSpeakingId(null);
    setTtsBusyId(null);
  }, []);

  const copyMessage = useCallback(async (id, rawText) => {
    const text = String(rawText || "").trim();
    if (!text) {
      setError("Nichts zum Kopieren.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      setCopiedId(id);
      copiedTimerRef.current = setTimeout(() => {
        setCopiedId((cur) => (cur === id ? null : cur));
        copiedTimerRef.current = null;
      }, 1600);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Kopieren fehlgeschlagen",
      );
    }
  }, []);

  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  /** Close message action bar when tapping outside that message. */
  useEffect(() => {
    if (!actionsMsgId) return undefined;
    const onPointerDown = (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest(`[data-msg-id="${CSS.escape(String(actionsMsgId))}"]`)) {
        return;
      }
      setActionsMsgId(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [actionsMsgId]);

  const revealMessageActions = useCallback((id, e) => {
    // Keep open when using action buttons / links inside the message
    if (e?.target instanceof Element) {
      if (e.target.closest("button, a, input, textarea, select, label")) {
        return;
      }
    }
    // 2nd click of a double-click = text selection, not action toggle
    if (e?.detail != null && e.detail > 1) return;
    // Don't steal a text selection gesture
    try {
      const sel = window.getSelection?.();
      if (sel && !sel.isCollapsed && String(sel).trim()) return;
    } catch {
      /* ignore */
    }
    // Open only — never toggle closed on re-click (that hopped the layout
    // and made double-click copy impossible). Close = click outside.
    setActionsMsgId(id);
  }, []);

  const speakText = useCallback(
    async (id, rawText) => {
      if (speakingId === id) {
        stopTts();
        return;
      }
      stopTts();
      const spoken = textForSpeech(rawText);
      if (!spoken) {
        setError("Nichts zum Vorlesen.");
        return;
      }
      setTtsBusyId(id);
      setError("");
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: spoken,
            voice_id: voiceId,
            language: ttsLanguage,
          }),
        });
        if (!res.ok) {
          let msg = `TTS ${res.status}`;
          try {
            const j = await res.json();
            if (j.error) msg = j.error;
          } catch {
            /* binary error body unlikely */
          }
          throw new Error(msg);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        ttsUrlRef.current = url;
        const audio = new Audio(url);
        ttsAudioRef.current = audio;
        audio.onended = () => {
          stopTts();
        };
        audio.onerror = () => {
          setError("Audio-Wiedergabe fehlgeschlagen.");
          stopTts();
        };
        setSpeakingId(id);
        setTtsBusyId(null);
        await audio.play();
      } catch (err) {
        // Browser-Speech-Fallback: Wenn der Server kein Audio liefern kann
        // (kein Key, macOS nicht erreichbar — z. B. Handy), liest der Browser
        // selbst vor (Web Speech API). Offline, kostenlos, sofort.
        if (speakWithBrowser(spoken, () => stopTts())) {
          setSpeakingId(id);
          setTtsBusyId(null);
          return;
        }
        setTtsBusyId(null);
        setSpeakingId(null);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [speakingId, stopTts, voiceId, ttsLanguage],
  );

  const blobToBase64 = useCallback((blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        const i = dataUrl.indexOf(",");
        resolve(i >= 0 ? dataUrl.slice(i + 1) : dataUrl);
      };
      reader.onerror = () => reject(new Error("Audio lesen fehlgeschlagen"));
      reader.readAsDataURL(blob);
    });
  }, []);

  const finishRecording = useCallback(
    async (blob, mimeType) => {
      setSttBusy(true);
      setError("");
      try {
        const audioBase64 = await blobToBase64(blob);
        const res = await fetch("/api/stt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioBase64,
            mimeType: mimeType || blob.type || "audio/webm",
            language: sttLanguage,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(j.error || `STT ${res.status}`);
        }
        const text = String(j.text || "").trim();
        if (!text) {
          setError("Keine Sprache erkannt.");
          return;
        }
        setInput((prev) => {
          const base = prev.trimEnd();
          if (!base) return text;
          const needSpace = !/[\s\n]$/.test(base);
          return `${base}${needSpace ? " " : ""}${text}`;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSttBusy(false);
      }
    },
    [blobToBase64, sttLanguage],
  );

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    setRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (sttBusy || recording) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Mikrofon wird von diesem Browser nicht unterstützt.");
      return;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const mime = pickRecorderMime();
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      rec.onerror = () => {
        setError("Aufnahme-Fehler.");
        setRecording(false);
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        const type = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type });
        audioChunksRef.current = [];
        if (blob.size < 200) {
          setError("Aufnahme zu kurz — bitte länger sprechen.");
          return;
        }
        void finishRecording(blob, type);
      };
      rec.start(200);
      setRecording(true);
    } catch (err) {
      const name = err && typeof err === "object" ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError(
          "Mikrofon-Zugriff verweigert. In den Browser-/Systemeinstellungen erlauben.",
        );
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      setRecording(false);
    }
  }, [finishRecording, recording, sttBusy]);

  const toggleRecording = useCallback(() => {
    if (recording) stopRecording();
    else void startRecording();
  }, [recording, startRecording, stopRecording]);

  const wsRef = useRef(null);
  const listRef = useRef(null);
  const pendingOlderScrollRef = useRef(null);
  /** Inner content wrapper — ResizeObserver keeps stick-to-bottom while streaming grows. */
  const messagesContentRef = useRef(null);
  const assistantBuf = useRef("");
  const thoughtBuf = useRef("");
  // Live-Tool-/Denk-Stufen der laufenden Antwort: Array von {id, start, result}.
  const stepsRef = useRef([]);
  /** Zwischen-LLM-Entwürfe (Protokoll · Entwürfe), nie Primärspur. */
  const draftsRef = useRef([]);
  const draftBuf = useRef("");
  /**
   * Sticky bottom:
   * 1) While pinned → every update/size change scrolls to latest output.
   * 2) Scroll up (wheel / snack / keys) → unpin, stay put, show "Neue Ausgabe".
   * 3) Click "Neue Ausgabe" (or scroll back to end) → re-pin and follow again.
   */
  const stickToBottomRef = useRef(true);
  /** Ignore programmatic scrollTop writes so they don't flip pin state. */
  const programmaticScrollRef = useRef(false);
  const SCROLL_PIN_PX = 64;
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [hasNewBelow, setHasNewBelow] = useState(false);

  /** Last answer sits on the composer edge — overlay buttons need a scroll nudge. */
  useLayoutEffect(() => {
    if (!actionsMsgId) return;
    const list = listRef.current;
    if (!list) return;
    const msg = list.querySelector(
      `[data-msg-id="${CSS.escape(String(actionsMsgId))}"]`,
    );
    const bar = msg?.querySelector(".msg-bottom-actions");
    if (!bar) return;
    const listBox = list.getBoundingClientRect();
    const barBox = bar.getBoundingClientRect();
    const pad = 8;
    let delta = 0;
    if (barBox.bottom > listBox.bottom - pad) {
      delta = barBox.bottom - listBox.bottom + pad;
    } else if (barBox.top < listBox.top + pad) {
      delta = barBox.top - listBox.top - pad;
    }
    if (!delta) return;
    programmaticScrollRef.current = true;
    list.scrollTop += delta;
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
  }, [actionsMsgId]);

  const isNearBottom = useCallback((el) => {
    if (!el) return true;
    // No overflow → treat as bottom (nothing to fight over)
    if (el.scrollHeight <= el.clientHeight + 4) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_PIN_PX;
  }, []);

  const setPinned = useCallback((pinned) => {
    stickToBottomRef.current = pinned;
    setPinnedToBottom(pinned);
    if (pinned) setHasNewBelow(false);
  }, []);

  /** Jump viewport to end (used when pinned or force). */
  const jumpToEnd = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    // Clear flag after scroll events from this write have flushed
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
  }, []);

  /**
   * @param {boolean | { force?: boolean }} [opts]
   * force=true: re-pin + follow (send / session open / "Neue Ausgabe").
   * otherwise: only scroll if currently pinned; else flag "Neue Ausgabe".
   */
  const scrollToBottom = useCallback(
    (opts = false) => {
      const force = opts === true || opts?.force === true;
      const run = () => {
        const el = listRef.current;
        if (!el) return;
        if (force) {
          setPinned(true);
          jumpToEnd();
          return;
        }
        if (!stickToBottomRef.current) {
          // Reading older content — leave viewport, offer jump
          if (!isNearBottom(el)) setHasNewBelow(true);
          return;
        }
        jumpToEnd();
      };
      // Double rAF: after React paint so scrollHeight includes new nodes
      requestAnimationFrame(() => {
        run();
        requestAnimationFrame(run);
      });
    },
    [isNearBottom, setPinned, jumpToEnd],
  );

  // Track pin from user scroll + feed LVL bar (gold shrinks when scrolling up)
  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;

    const onScroll = () => {
      setScrollHud(scrollMetrics(el));
      // Don't treat our own stick-scroll as "user left the bottom"
      if (programmaticScrollRef.current) return;
      const near = isNearBottom(el);
      if (near) {
        setPinned(true);
      } else {
        setPinned(false);
      }
    };

    // Wheel / touch / keys: unpin immediately on upward intent
    const onWheel = (e) => {
      if (e.deltaY < 0) setPinned(false);
    };
    const onKeyDown = (e) => {
      if (
        e.key === "PageUp" ||
        e.key === "Home" ||
        (e.key === "ArrowUp" && !e.altKey)
      ) {
        setPinned(false);
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("keydown", onKeyDown);
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("keydown", onKeyDown);
    };
  }, [isNearBottom, setPinned]);

  // While pinned: keep glued when content height grows (streaming markdown, tools)
  useEffect(() => {
    const el = listRef.current;
    const content = messagesContentRef.current;
    if (!el || !content) return undefined;

    const onGrow = () => {
      if (stickToBottomRef.current) {
        jumpToEnd();
      } else if (!isNearBottom(el)) {
        setHasNewBelow(true);
      }
    };

    const ro = new ResizeObserver(onGrow);
    ro.observe(content);
    return () => ro.disconnect();
  }, [isNearBottom, jumpToEnd]);

  const upsertStreaming = useCallback(
    (role, text, { replaceLast = false } = {}) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (replaceLast && last && last.role === role && last.streaming) {
          next[next.length - 1] = {
            ...last,
            text,
            // Primär-Update: Steps/Drafts der laufenden Runde mitnehmen
            ...(role === "assistant"
              ? {
                  steps: [...stepsRef.current],
                  drafts: [...draftsRef.current],
                }
              : {}),
          };
          return next;
        }
        next.push({
          id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role,
          text,
          streaming: true,
          ...(role === "assistant"
            ? {
                steps: [...stepsRef.current],
                drafts: [...draftsRef.current],
                protocolCollapsed: false,
              }
            : {}),
        });
        return next;
      });
      // Soft: only if still pinned to bottom
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const finalizeStreaming = useCallback(() => {
    streamingRef.current = false;
    setMessages((prev) =>
      prev.map((m) =>
        m.streaming
          ? {
              ...m,
              streaming: false,
              // Q8: Protokoll nach Fertig zugeklappt
              protocolCollapsed: true,
              ...(traceRef.current ? { trace: traceRef.current } : {}),
            }
          : m,
      ),
    );
    assistantBuf.current = "";
    thoughtBuf.current = "";
    draftBuf.current = "";
    draftsRef.current = [];
    stepsRef.current = []; // Live-Stufen gehören zur abgeschlossenen Antwort-Runde
    traceRef.current = null; // Trace nur an die letzte Message anhängen
  }, []);

  // Aktualisiert die laufende (letzte) Assistant-Message mit den Live-Stufen.
  const upsertStreamingSteps = useCallback(() => {
    const steps = [...stepsRef.current];
    const drafts = [...draftsRef.current];
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.role === "assistant" && last.streaming) {
        next[next.length - 1] = { ...last, steps, drafts };
        return next;
      }
      // Keine laufende Assistant-Message (z.B. Stufen vor erstem Text): neue anlegen.
      next.push({
        id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: "assistant",
        text: assistantBuf.current || "",
        steps,
        drafts,
        streaming: true,
        protocolCollapsed: false,
      });
      return next;
    });
    scrollToBottom();
  }, [scrollToBottom]);

  /** Hängt Zwischen-LLM-Entwürfe an die laufende Assistant-Message (Protokoll). */
  const upsertStreamingDrafts = useCallback(() => {
    const drafts = [...draftsRef.current];
    const steps = [...stepsRef.current];
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.role === "assistant" && last.streaming) {
        next[next.length - 1] = { ...last, drafts, steps };
        return next;
      }
      next.push({
        id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: "assistant",
        text: assistantBuf.current || "",
        steps,
        drafts,
        streaming: true,
        protocolCollapsed: false,
      });
      return next;
    });
    scrollToBottom();
  }, [scrollToBottom]);

  /**
   * Pop the next parked follow-up and send it once the agent is idle.
   * Safe to call multiple times; no-ops while a turn is still in flight.
   */
  const tryDrainQueue = useCallback(() => {
    if (drainingRef.current) return;
    if (busyRef.current || streamingRef.current) return;
    const next = queueRef.current[0];
    if (!next) return;
    if (!wsRef.current || wsRef.current.readyState !== 1) return;

    drainingRef.current = true;
    const queuedPicked =
      Array.isArray(next.vaultSelected) && next.vaultSelected.length > 0;
    if (
      next.vaultSearch &&
      !queuedPicked &&
      next.action !== "fork" &&
      next.action !== "deep-search"
    ) {
      queueRef.current = queueRef.current.slice(1);
      setQueue([...queueRef.current]);
      void runVaultSearchRef.current?.(next.text || "");
      window.setTimeout(() => {
        drainingRef.current = false;
      }, 100);
      return;
    }
    // Mark busy immediately so a second drain cannot double-send
    busyRef.current = true;
    queueRef.current = queueRef.current.slice(1);
    setQueue([...queueRef.current]);
    try {
      dispatchQueuedRef.current?.(next);
    } catch (err) {
      // Put the item back if dispatch exploded before send
      queueRef.current = [next, ...queueRef.current];
      setQueue([...queueRef.current]);
      busyRef.current = false;
      setBusy(false);
      console.error("[queue drain]", err);
    } finally {
      // Allow the next drain after this turn ends
      window.setTimeout(() => {
        drainingRef.current = false;
      }, 100);
    }
  }, []);

  const scheduleDrainQueue = useCallback(() => {
    if (drainTimerRef.current) {
      window.clearTimeout(drainTimerRef.current);
    }
    // Short delay so status/turn_done state settles and server busy clears
    drainTimerRef.current = window.setTimeout(() => {
      drainTimerRef.current = null;
      tryDrainQueue();
    }, 80);
  }, [tryDrainQueue]);

  useEffect(() => {
    if (webSurface && !webUnlocked) return undefined;
    let closed = false;
    let retryTimer;
    let ws;

    const connect = async () => {
      if (closed) return;
      let url;
      try {
        url = await wsUrl();
      } catch (err) {
        setConnected(false);
        if (err && err.gate) {
          setWebGateHint(
            "Die Sitzung war weg. Passwort nochmal, dann geht's weiter.",
          );
          setWebUnlocked(false);
          return;
        }
        setError(
          err instanceof Error
            ? err.message
            : "WebSocket-Token konnte nicht geladen werden",
        );
        if (!closed) {
          retryTimer = setTimeout(() => {
            void connect();
          }, 1500);
        }
        return;
      }
      if (closed) return;

      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setError("");
      };
      ws.onclose = () => {
        setConnected(false);
        busyRef.current = false;
        setBusy(false);
        setReconnecting(false);
        // Token rotates every server process start; drop the injected/cached
        // value so the next connect reloads /api/ws-token instead of looping 401s.
        invalidateWsToken();
        if (!closed) {
          retryTimer = setTimeout(() => {
            void connect();
          }, 1500);
        }
      };
      ws.onerror = () => setError("WebSocket-Verbindung fehlgeschlagen");

      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }

        if (msg.type === "status") {
          setConnected(Boolean(msg.connected));
          const nextBusy = Boolean(msg.busy);
          const wasBusy = busyRef.current;
          busyRef.current = nextBusy;
          // Keep working UI sticky while a turn is in flight:
          // only clear busy when server says false (or on turn_done / error).
          setBusy(nextBusy);
          if (typeof msg.cancelling === "boolean") {
            setCancelling(msg.cancelling);
          }
          setReconnecting(Boolean(msg.reconnecting));
          setSessionId(msg.sessionId || null);
          if (msg.seat === "desk" || msg.seat === "phone" || msg.seat === "web") {
            setSeat(msg.seat);
          }
          if (msg.agent) setAgent(msg.agent);
          if (msg.cwd) setCwd(msg.cwd);
          if (msg.connected) setError("");
          // "opened" reset is handled by onOpenSession with transcript;
          // only clear on plain Neue-Session reset.
          if (msg.reset) {
            if (!msg.opened) {
              setMessages([]);
              assistantBuf.current = "";
              thoughtBuf.current = "";
              draftBuf.current = "";
              draftsRef.current = [];
              stepsRef.current = [];
              busyRef.current = false;
              setBusy(false);
              setCancelling(false);
              queueRef.current = [];
              setQueue([]);
            }
            // New session or opened history: plan is turn-scoped
            setPlanEntries([]);
            setPlanBarHidden(false);
            setPlanCollapsed(false);
            if (!msg.opened) {
              setAgentCommands([]);
              return;
            }
          }
          // Server became idle without turn_done (or after it) → drain queue
          // Never drain while cancelling is still true (busy should stay true).
          if (wasBusy && !nextBusy && !msg.cancelling) {
            setCancelling(false);
            scheduleDrainQueue();
          }
          return;
        }

        if (msg.type === "assistant_meta") {
          // Effektiver Server-Trace (Provider/Modell/Tool-Status) für die letzte Antwort.
          if (msg.trace && typeof msg.trace === "object") {
            traceRef.current = msg.trace;
          }
          return;
        }

        if (msg.type === "assistant_chunk") {
          busyRef.current = true;
          streamingRef.current = true;
          setBusy(true);
          lastActivityRef.current = Date.now();
          setSnackStuffed(false);
          assistantBuf.current += msg.text || "";
          upsertStreaming("assistant", assistantBuf.current, {
            replaceLast: true,
          });
          return;
        }

        if (msg.type === "thought_chunk") {
          busyRef.current = true;
          streamingRef.current = true;
          setBusy(true);
          lastActivityRef.current = Date.now();
          setSnackStuffed(false);
          thoughtBuf.current += msg.text || "";
          upsertStreaming("thought", thoughtBuf.current, { replaceLast: true });
          return;
        }

        if (msg.type === "step_chunk") {
          // Live-Tool-/Denk-Stufe: „start“ öffnet Block, „end“ hängt Ergebnis an.
          busyRef.current = true;
          streamingRef.current = true;
          setBusy(true);
          lastActivityRef.current = Date.now();
          setSnackStuffed(false);
          const text = msg.text || "";
          if (msg.phase === "start") {
            stepsRef.current.push({ id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, start: text, result: "" });
          } else {
            // Ergebnis an letzte offene Stufe anhängen (sonst als eigene Zeile).
            const steps = [...stepsRef.current];
            if (steps.length && !steps[steps.length - 1].result) {
              steps[steps.length - 1] = { ...steps[steps.length - 1], result: text };
            } else {
              steps.push({ id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, start: "", result: text });
            }
            stepsRef.current = steps;
          }
          upsertStreamingSteps();
          return;
        }

        if (msg.type === "draft_chunk") {
          // Zwischen-LLM → Protokoll · Entwürfe (nie Primärspur).
          busyRef.current = true;
          streamingRef.current = true;
          setBusy(true);
          lastActivityRef.current = Date.now();
          setSnackStuffed(false);
          const piece = msg.text || "";
          if (msg.cont && draftsRef.current.length) {
            const last = draftsRef.current[draftsRef.current.length - 1];
            draftsRef.current = [
              ...draftsRef.current.slice(0, -1),
              {
                ...last,
                text: (last.text || "") + piece,
              },
            ];
          } else {
            draftsRef.current = [
              ...draftsRef.current,
              {
                id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                text: piece,
              },
            ];
          }
          draftBuf.current = draftsRef.current.map((d) => d.text).join("\n\n");
          upsertStreamingDrafts();
          return;
        }

        if (msg.type === "system") {
          lastActivityRef.current = Date.now();
          setSnackStuffed(false);
          setMessages((prev) => [
            ...prev,
            {
              id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              role: "system",
              text: msg.text || "",
              streaming: false,
            },
          ]);
          scrollToBottom();
          return;
        }

        if (msg.type === "tool") {
          // tool_call + tool_call_update share toolCallId — upsert one row
          // (same pattern as upsertStreaming) instead of appending duplicates.
          busyRef.current = true;
          setBusy(true);
          lastActivityRef.current = Date.now();
          setSnackStuffed(false);
          setMessages((prev) => upsertToolMessage(prev, msg));
          scrollToBottom();
          return;
        }

        if (msg.type === "plan") {
          // Full-replace ACP plan (classic plan + plan_update items)
          lastActivityRef.current = Date.now();
          setSnackStuffed(false);
          setPlanEntries(normalizeClientPlanEntries(msg.entries));
          setPlanBarHidden(false);
          return;
        }

        if (msg.type === "rewind_result") {
          setRewindBusy(false);
          setRewindOpen(false);
          if (msg.ok) {
            const drop = Number(msg.dropUserIndex);
            setMessages((prev) => sliceMessagesBeforeUser(prev, drop));
            setPlanEntries([]);
          }
          return;
        }

        if (msg.type === "available_commands") {
          const list = Array.isArray(msg.commands) ? msg.commands : [];
          setAgentCommands(
            list
              .filter((c) => c && c.name && !isHiddenAgentCommand(c.name))
              .map((c) => ({
                name: String(c.name),
                description: String(c.description || ""),
                inputHint: String(c.inputHint || ""),
              })),
          );
          return;
        }

        if (msg.type === "fork_result" && msg.sessionId) {
          setSessionId(msg.sessionId);
        }

        if (msg.type === "turn_done") {
          finalizeStreaming();
          busyRef.current = false;
          setBusy(false);
          setCancelling(false);
          lastActivityRef.current = Date.now();
          setSnackStuffed(false);
          void refreshActiveTaskRef.current();
          // Auto-send next parked follow-up only after the turn truly ended
          scheduleDrainQueue();
          return;
        }

        if (msg.type === "permission_request") {
          setPermissionReq({
            id: msg.id,
            title: msg.title || "Aktion freigeben",
            kind: msg.kind || "other",
            preview: msg.preview || "",
            options: Array.isArray(msg.options) ? msg.options : [],
            grant: msg.grant || null,
          });
          return;
        }
        if (msg.type === "permission_dismiss") {
          setPermissionReq((prev) =>
            prev && prev.id === msg.id ? null : prev,
          );
          return;
        }
        if (msg.type === "error") {
          setError(msg.message || "Unbekannter Fehler");
          finalizeStreaming();
          busyRef.current = false;
          setBusy(false);
          setRewindBusy(false);
          setCancelling(false);
          lastActivityRef.current = Date.now();
          setSnackStuffed(false);
          // Still drain so the queue does not stall after a failed turn
          scheduleDrainQueue();
        }
      };
    };

    void connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      if (drainTimerRef.current) {
        window.clearTimeout(drainTimerRef.current);
        drainTimerRef.current = null;
      }
      ws?.close();
    };
  }, [
    finalizeStreaming,
    scheduleDrainQueue,
    scrollToBottom,
    upsertStreaming,
    upsertStreamingDrafts,
    upsertStreamingSteps,
    webSurface,
    webUnlocked,
  ]);

  const clearPendingAttachments = useCallback(() => {
    setPendingAttachments((prev) => {
      revokeAttachmentPreviews(prev);
      return [];
    });
  }, []);

  const removePendingAttachment = useCallback((id) => {
    setPendingAttachments((prev) => {
      const victim = prev.find((a) => a.id === id);
      if (victim) revokeAttachmentPreviews([victim]);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  /** Paste / drop → POST /api/attachments → pending chips. */
  const addFiles = useCallback(async (fileList) => {
    const files = Array.isArray(fileList)
      ? fileList
      : Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    if (attachBusy) return;

    setAttachBusy(true);
    setError("");
    try {
      const result = await uploadAttachmentFiles(files, {
        alreadyCount: pendingAttachments.length,
        maxCount: MAX_ATTACHMENTS_PER_MSG,
      });
      setPendingAttachments((prev) =>
        [...prev, ...result.attachments].slice(0, MAX_ATTACHMENTS_PER_MSG),
      );
      if (result.truncated) {
        setError(
          `Maximal ${MAX_ATTACHMENTS_PER_MSG} Anhänge — restliche Dateien ignoriert`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttachBusy(false);
    }
  }, [attachBusy, pendingAttachments.length]);

  const onMessagesDragEnter = useCallback((e) => {
    if (!dataTransferHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dropDepthRef.current += 1;
    setDropActive(true);
  }, []);

  const onMessagesDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dropDepthRef.current = Math.max(0, dropDepthRef.current - 1);
    if (dropDepthRef.current === 0) setDropActive(false);
  }, []);

  const onMessagesDragOver = useCallback((e) => {
    if (!dataTransferHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onMessagesDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropDepthRef.current = 0;
      setDropActive(false);
      const files = filesFromDataTransfer(e.dataTransfer);
      if (files.length) void addFiles(files);
    },
    [addFiles],
  );

  /** Composer is the intuitive drop zone — same accept path as the transcript. */
  const onComposerDragOver = useCallback((e) => {
    if (!dataTransferHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onComposerDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropDepthRef.current = 0;
      setDropActive(false);
      const files = filesFromDataTransfer(e.dataTransfer);
      if (files.length) void addFiles(files);
    },
    [addFiles],
  );

  // Keep previews revocable on unmount without re-binding every change
  const pendingAttachmentsRef = useRef(pendingAttachments);
  pendingAttachmentsRef.current = pendingAttachments;
  useEffect(
    () => () => {
      revokeAttachmentPreviews(pendingAttachmentsRef.current);
    },
    [],
  );

  /**
   * Window guard: prevent the browser from navigating to a dropped file
   * (Safari Web App has no URL bar — a miss outside .messages is fatal).
   * Real drop targets stopPropagation so they stay the only handlers.
   */
  useEffect(() => {
    const blockNav = (e) => {
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
    };
    window.addEventListener("dragover", blockNav);
    window.addEventListener("drop", blockNav);
    return () => {
      window.removeEventListener("dragover", blockNav);
      window.removeEventListener("drop", blockNav);
    };
  }, []);

  /**
   * Document paste: Screenshot → switch to app → ⌘V works even when focus
   * is on the transcript (not only the composer textarea). Skip other inputs.
   */
  useEffect(() => {
    const onDocPaste = (e) => {
      const files = filesFromDataTransfer(e.clipboardData);
      if (!files.length) return;

      const el = e.target;
      if (el instanceof HTMLElement) {
        const tag = el.tagName;
        // Session search, selects, etc. keep native paste
        if (tag === "INPUT" || tag === "SELECT") return;
        // Foreign textareas (modals) — only our composer accepts file paste
        if (tag === "TEXTAREA" && !el.closest(".composer-box")) return;
        if (el.isContentEditable && !el.closest(".composer-box")) return;
      }

      e.preventDefault();
      void addFiles(files);
    };
    document.addEventListener("paste", onDocPaste);
    return () => document.removeEventListener("paste", onDocPaste);
  }, [addFiles]);

  /** Send a prepared payload to the agent (live turn). */
  const dispatchPayload = useCallback(
    ({ text, action, displayText, attachments, vaultSearch, vaultSelected }) => {
      if (!wsRef.current || wsRef.current.readyState !== 1) return;

      const wire =
        action === "fork" ? [] : toWireAttachments(attachments || []);

      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: "user",
          text: displayText,
          streaming: false,
          ...(wire.length ? { attachments: wire } : {}),
        },
      ]);
      assistantBuf.current = "";
      thoughtBuf.current = "";
      draftBuf.current = "";
      draftsRef.current = [];
      stepsRef.current = [];
      setError("");
      lastActivityRef.current = Date.now();
      setSnackStuffed(false);
      busyRef.current = true;
      streamingRef.current = false;
      setBusy(true);
      setCancelling(false);
      if (action === "chat" && text) {
        const nextHist = pushPromptHistory(agent?.id || "grok", text);
        setHistoryItems(nextHist);
        setHistoryOpen(false);
        setHistoryIndex(null);
      }
      // User just sent — pin and follow the new turn
      scrollToBottom({ force: true });

      if (action === "deep-search") {
        wsRef.current.send(
          JSON.stringify({
            type: "deep_search",
            text,
            ...(wire.length ? { attachments: wire } : {}),
          }),
        );
      } else if (action === "swarm") {
        wsRef.current.send(
          JSON.stringify({
            type: "swarm",
            text,
            ...(wire.length ? { attachments: wire } : {}),
          }),
        );
      } else if (action === "fork") {
        wsRef.current.send(JSON.stringify({ type: "fork", text }));
      } else {
        const vault =
          typeof vaultSearch === "boolean"
            ? {
                vaultSearch,
                ...(Array.isArray(vaultSelected)
                  ? { vaultSelected }
                  : {}),
              }
            : {};
        wsRef.current.send(
          JSON.stringify({
            type: "chat",
            text,
            ...(wire.length ? { attachments: wire } : {}),
            ...vault,
          }),
        );
      }
    },
    [scrollToBottom, agent?.id],
  );

  const dispatchQueuedRef = useRef(dispatchPayload);
  dispatchQueuedRef.current = dispatchPayload;

  const buildDisplayText = useCallback((action, text, attachments = []) => {
    const att = formatAttachmentSummary(attachments);
    if (action === "deep-search") {
      const body = text || att || "…";
      return att && text ? `🔍 Deep Search: ${text}\n${att}` : `🔍 Deep Search: ${body}`;
    }
    if (action === "swarm") {
      const body = text || att || "…";
      return att && text ? `Swarm: ${text}\n${att}` : `Swarm: ${body}`;
    }
    if (action === "fork") {
      return text ? `⑂ Fork: ${text}` : "⑂ Fork (Session branchen)";
    }
    if (text && att) return `${text}\n${att}`;
    return text || att || "";
  }, []);

  const refreshActiveTask = useCallback(async () => {
    if (typeof window !== "undefined") {
      try {
        if (new URLSearchParams(window.location.search).get("task") === "demo") {
          setActiveTask(TASK_DEMO);
          return;
        }
      } catch {
        /* ignore */
      }
    }
    const id = agent?.id;
    if (id !== "_code" && id !== "code") {
      setActiveTask(null);
      return;
    }
    try {
      const r = await fetch("/api/code/grants");
      const json = await r.json().catch(() => ({}));
      setActiveTask(json?.active_task || null);
    } catch {
      /* Grant-Leiste ist Best effort */
    }
  }, [agent?.id]);
  refreshActiveTaskRef.current = refreshActiveTask;

  useEffect(() => {
    void refreshActiveTask();
  }, [refreshActiveTask]);

  const revokeActiveTask = useCallback(async () => {
    const gid = activeTask?.grant_id;
    if (gid === "demo") {
      setActiveTask(null);
      return;
    }
    try {
      if (gid) {
        await fetch(`/api/code/grants/${encodeURIComponent(gid)}/revoke`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      } else {
        await fetch("/api/code/grants/close-task", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      }
    } catch {
      /* ignore */
    }
    setActiveTask(null);
    void refreshActiveTask();
  }, [activeTask?.grant_id, refreshActiveTask]);

  const respondPermission = useCallback((optionId) => {
    const req = permissionReq;
    if (!req) return;
    if (req.id === "grant-demo") {
      setPermissionReq(null);
      return;
    }
    const ws = wsRef.current;
    if (ws?.readyState === 1) {
      ws.send(
        JSON.stringify({
          type: "permission_response",
          id: req.id,
          optionId,
        }),
      );
    }
    setPermissionReq(null);
  }, [permissionReq]);

  const abortVaultSearch = useCallback(() => {
    vaultSearchAbortRef.current?.abort();
    vaultSearchAbortRef.current = null;
    setVaultSearchBusy(false);
    setVaultHits(null);
    setVaultHitOn(new Set());
    setVaultSearchError("");
    vaultLastPickedRef.current = [];
  }, []);

  const runVaultSearch = useCallback(async (query) => {
    const q = String(query || "").trim();
    if (!q) return;
    vaultSearchAbortRef.current?.abort();
    const ac = new AbortController();
    vaultSearchAbortRef.current = ac;
    setVaultSearchBusy(true);
    setVaultSearchError("");
    setVaultHits({ query: q, hits: [], status: "pending" });
    setVaultHitOn(new Set());
    try {
      const res = await seatFetch("/api/vault/find", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query: q }),
        signal: ac.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (ac.signal.aborted) return;
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || vaultFindHttpError(res.status));
      }
      const preview = normalizePreviewPayload(json, q);
      setVaultHits(preview);
      setVaultHitOn(defaultSelectedIds(preview.hits));
    } catch (err) {
      if (ac.signal.aborted || err?.name === "AbortError") return;
      setVaultSearchError(err instanceof Error ? err.message : String(err));
      setVaultHits({ query: q, hits: [], status: "error" });
      setVaultHitOn(new Set());
    } finally {
      if (vaultSearchAbortRef.current === ac) {
        setVaultSearchBusy(false);
        vaultSearchAbortRef.current = null;
      }
    }
  }, []);
  runVaultSearchRef.current = runVaultSearch;

  const send = useCallback(() => {
    const text = input.trim();
    if (attachBusy) return;
    if (text && isUiReloadSlash(text)) {
      hardReloadUi();
      return;
    }
    if (!text && vaultSearchBusy && sendAction !== "fork") {
      abortVaultSearch();
      return;
    }

    if (sendAction === "chat" && text) {
      if (/^\/(?:rewind|undo)(?:\s|$)/i.test(text)) {
        setInput("");
        setRewindOpen(true);
        return;
      }
      const renameMatch = text.match(/^\/(?:rename|title)\s+(.+)$/i);
      if (renameMatch) {
        const sid = String(sessionId || "");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid)) {
          setError("Umbenennen nur für Grok-Sessions auf Disk.");
          return;
        }
        setInput("");
        void seatFetch(`/api/sessions/${sid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: renameMatch[1].trim() }),
        })
          .then(async (res) => {
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || "Umbenennen fehlgeschlagen");
            setMessages((prev) => [
              ...prev,
              {
                id: `sys-rename-${Date.now()}`,
                role: "system",
                text: `Titel: ${json.title || renameMatch[1].trim()}`,
                streaming: false,
              },
            ]);
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : String(err));
          });
        return;
      }
    }

    if (!connected || !wsRef.current) return;

    const resolved = resolveComposerAction(sendAction, text);
    const action = resolved.action;
    const body = resolved.text;

    // Fork may run without a directive; chat & deep-search need text and/or files.
    const atts =
      action === "fork" ? [] : toWireAttachments(pendingAttachments);
    if (action !== "fork" && !body && !atts.length) return;

    if (action === "deep-search" && agent?.id && agent.id !== "grok") {
      setError(
        `Deep Search ist nur im grok-Profil verfügbar (aktiv: ${agent.label || "Agent"})`,
      );
      return;
    }
    if (action === "swarm" && agent?.id && !canSwarm(agent.id)) {
      setError(
        `Swarm läuft über °_Agent und ^_Code (aktiv: ${agent.label || "Agent"})`,
      );
      return;
    }

    const wantsVault =
      isAgentProfile && action === "chat" && vaultSearchOn && Boolean(body);

    if (wantsVault) {
      const intent = vaultSendIntent({
        appleOn: true,
        searchBusy: vaultSearchBusy,
        query: text,
        hitsQuery: vaultHits?.query,
        hitsStatus: vaultHits?.status,
        error: vaultSearchError,
        lastPickedCount: vaultLastPickedRef.current.length,
      });
      if (intent === "abort") {
        abortVaultSearch();
        return;
      }
      if (intent === "abort-then-search") {
        abortVaultSearch();
        setInput("");
        void runVaultSearch(text);
        return;
      }
      if (intent === "search") {
        setInput("");
        void runVaultSearch(text);
        return;
      }
    }

    const displayText = buildDisplayText(action, body, atts);
    const livePicked = wantsVault
      ? toWireSelected(selectedHits(vaultHits?.hits || [], vaultHitOn))
      : [];
    if (livePicked.length > 0) {
      vaultLastPickedRef.current = livePicked;
    }
    const picked =
      livePicked.length > 0 ? livePicked : wantsVault ? vaultLastPickedRef.current : [];
    const useVaultContext = picked.length > 0;
    const payload = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: body,
      action,
      displayText,
      ...(atts.length ? { attachments: atts } : {}),
      ...(isAgentProfile && action === "chat"
        ? {
            vaultSearch: useVaultContext,
            ...(useVaultContext ? { vaultSelected: picked } : {}),
          }
        : {}),
    };

    // While Grok is working: park in queue (TUI-style wait area)
    if (busy || messages.some((m) => m.streaming)) {
      queueRef.current = [...queueRef.current, payload];
      setQueue([...queueRef.current]);
      setInput("");
      clearPendingAttachments();
      requestAnimationFrame(() => scrollToBottom());
      return;
    }

    setInput("");
    clearPendingAttachments();
    if (wantsVault) {
      setVaultHits(null);
      setVaultHitOn(new Set());
    }
    if (action === "fork") setSendAction("chat");
    dispatchPayload(payload);
  }, [
    attachBusy,
    agent,
    busy,
    clearPendingAttachments,
    connected,
    input,
    isAgentProfile,
    sessionId,
    messages,
    pendingAttachments,
    scrollToBottom,
    sendAction,
    buildDisplayText,
    dispatchPayload,
    vaultSearchOn,
    vaultSearchBusy,
    vaultSearchError,
    vaultHits,
    vaultHitOn,
    runVaultSearch,
    abortVaultSearch,
  ]);

  const rewindPoints = useMemo(
    () => rewindPointsFromMessages(messages),
    [messages],
  );

  const requestRewind = useCallback(
    (dropUserIndex, restoreText = "") => {
      if (!connected || !wsRef.current || wsRef.current.readyState !== 1) return;
      if (busy || rewindBusy) return;
      const drop = Number(dropUserIndex);
      if (!Number.isInteger(drop) || drop < 0) return;
      setRewindBusy(true);
      setRewindOpen(false);
      if (restoreText) setInput(restoreText);
      wsRef.current.send(
        JSON.stringify({ type: "rewind", dropUserIndex: drop }),
      );
    },
    [busy, connected, rewindBusy],
  );

  const sendCompact = useCallback(() => {
    if (!connected || busy) return;
    dispatchPayload({
      text: "/compact",
      action: "chat",
      displayText: "/compact",
    });
  }, [busy, connected, dispatchPayload]);

  const approvePlan = useCallback(() => {
    if (!connected || busy) return;
    dispatchPayload({
      text: "Setze den Plan um.",
      action: "chat",
      displayText: "Setze den Plan um.",
    });
  }, [busy, connected, dispatchPayload]);

  /** „Mit Auswahl senden": markierte Treffer sofort als Agent-Kontext senden. */
  const sendVaultSelection = useCallback(() => {
    const picked = toWireSelected(
      selectedHits(vaultHits?.hits || [], vaultHitOn),
    );
    if (picked.length === 0) return;
    vaultLastPickedRef.current = picked;
    const text = String(vaultHits?.query || input.trim());
    const payload = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      action: "chat",
      displayText: text,
      vaultSearch: true,
      vaultSelected: picked,
    };
    setVaultHits(null);
    setVaultHitOn(new Set());
    if (input.trim() === String(vaultHits?.query || "").trim()) setInput("");
    if (busy || messages.some((m) => m.streaming)) {
      queueRef.current = [...queueRef.current, payload];
      setQueue([...queueRef.current]);
      return;
    }
    dispatchPayload(payload);
  }, [
    busy,
    messages,
    input,
    vaultHits,
    vaultHitOn,
    dispatchPayload,
  ]);

  const removeQueued = useCallback((id) => {
    queueRef.current = queueRef.current.filter((q) => q.id !== id);
    setQueue([...queueRef.current]);
  }, []);

  const clearQueue = useCallback(() => {
    queueRef.current = [];
    setQueue([]);
  }, []);

  /**
   * Soft-cancel the live turn via ACP session/cancel.
   * UI stays in "cancelling" until the server emits turn_done — never fake idle
   * while the agent is still working in the background.
   */
  const cancelTurn = useCallback(async () => {
    if (vaultSearchBusy || vaultSearchAbortRef.current) {
      abortVaultSearch();
      if (!busy && !streamingRef.current && !busyRef.current) return;
    }
    if (cancelling) return;
    // Allow stop while streaming even if busy flag lagged
    if (!busy && !streamingRef.current && !busyRef.current) return;

    setCancelling(true);
    setError("");
    // Keep working chrome until server confirms turn end
    busyRef.current = true;
    setBusy(true);
    // ACP: client SHOULD mark non-finished tools as cancelled when stopping
    setMessages((prev) =>
      prev.map((m) => {
        if (m.role !== "tool" || m.streaming) return m;
        if (isToolTerminal(m.status)) return m;
        const t = m.text || "";
        if (/·\s*(completed|failed|cancelled)\s*$/i.test(t)) return m;
        if (
          isToolRunning(m.status) ||
          /·\s*(pending|in_progress|running)\s*$/i.test(t)
        ) {
          return {
            ...m,
            status: "cancelled",
            text: formatToolText(
              { title: m.title, status: "cancelled", kind: m.kind },
              t,
            ),
          };
        }
        return m;
      }),
    );

    try {
      // Prefer HTTP so cancel is reliable even if WS message handler is blocked
      // on an in-flight chat await (server still accepts cancel in parallel).
      const res = await seatFetch("/api/bridge/cancel", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Abbruch fehlgeschlagen");
      }
      if (json.cancelled === false && json.reason === "not_busy") {
        // Server already idle — clean local stream state
        busyRef.current = false;
        setBusy(false);
        setCancelling(false);
        finalizeStreaming();
        scheduleDrainQueue();
        return;
      }
      // Stay in cancelling/busy until turn_done / status.busy=false.
      // Server sends system messages for deferred (critical tool) cancels.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // Cancel request failed — do NOT pretend work stopped; leave busy if server still works
      setCancelling(false);
      // Fall back: try WS cancel once more without clearing busy
      try {
        if (wsRef.current?.readyState === 1) {
          wsRef.current.send(JSON.stringify({ type: "cancel" }));
          setCancelling(true);
        }
      } catch {
        /* ignore */
      }
    }
  }, [
    abortVaultSearch,
    busy,
    cancelling,
    finalizeStreaming,
    scheduleDrainQueue,
    vaultSearchBusy,
  ]);

  const openWiki = useCallback(async () => {
    setError("");
    try {
      // Relative URL — works for localhost:5173 and :5174 Safari Web App
      const res = await fetch("/api/wiki/open", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        throw new Error(
          json.error ||
            `Wiki konnte nicht geöffnet werden (HTTP ${res.status})`,
        );
      }
      // Soft confirmation in sub line via temporary banner only on note
      if (json.note) {
        setError(""); // success with reveal fallback — no red error
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const openWorkspace = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/workspace/open", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        throw new Error(
          json.error ||
            `Workspace konnte nicht geöffnet werden (HTTP ${res.status})`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const reset = useCallback(() => {
    if (!wsRef.current || busy) return;
    wsRef.current.send(JSON.stringify({ type: "reset" }));
    setMessages([]);
    setError("");
    setBusy(false);
    queueRef.current = [];
    setQueue([]);
  }, [busy]);

  /**
   * Start local `grok agent` via bridge (HTTP — works even if agent is dead).
   * No terminal command needed. Status updates also arrive over WebSocket.
   *
   * Invariant: the on-screen transcript must belong to the live sessionId.
   * Reconnect after /quit or offline archive browse returns a new id — clear
   * the stale view so the next send is not framed by a conversation the agent
   * no longer has.
   */
  const reconnectGrok = useCallback(async () => {
    if (reconnecting) return;
    setReconnecting(true);
    setError("");
    try {
      const res = await seatFetch("/api/bridge/reconnect", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Grok konnte nicht gestartet werden");
      }
      if (json.connected) {
        const nextId = json.sessionId || null;
        setConnected(true);
        setSessionId(nextId);
        setError("");
        if (nextId !== sessionId) {
          setMessages([]);
          assistantBuf.current = "";
          thoughtBuf.current = "";
          draftBuf.current = "";
          draftsRef.current = [];
          stepsRef.current = [];
        }
      } else {
        throw new Error(json.error || "Grok ist nach dem Start noch offline");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConnected(false);
    } finally {
      setReconnecting(false);
    }
  }, [reconnecting, sessionId]);

  /**
   * Quit local `grok agent` (like TUI /quit). Bridge stays up; status → offline.
   */
  const disconnectGrok = useCallback(async () => {
    if (reconnecting || !connected) return;
    setReconnecting(true);
    setError("");
    try {
      const res = await seatFetch("/api/bridge/disconnect", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Grok konnte nicht beendet werden");
      }
      setConnected(false);
      setBusy(false);
      setSessionId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReconnecting(false);
    }
  }, [connected, reconnecting]);

  /**
   * Switch the ACP agent (Grok ↔ Claude ↔ glyph-agent). The bridge restarts
   * into the other binary, so this always yields a fresh session — the
   * transcript is dropped for the same reason reconnect drops it.
   */
  const switchAgent = useCallback(
    async (id) => {
      if (!id || agentSwitching || id === agent?.id) return;
      setAgentSwitching(true);
      setError("");
      try {
        const res = await seatFetch("/api/bridge/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.ok === false) {
          throw new Error(json.error || "Agentwechsel fehlgeschlagen");
        }
        if (json.agent) setAgent(json.agent);
        if (!json.already) {
          setMessages([]);
          assistantBuf.current = "";
          thoughtBuf.current = "";
          draftBuf.current = "";
          draftsRef.current = [];
          stepsRef.current = [];
          queueRef.current = [];
          setQueue([]);
          // Fresh bridge session after agent switch — drop previous id so
          // /api/context cannot re-read a leftover grok signals.json (500k).
          setSessionId(null);
          // Drop sticky model from previous profile so LVL window follows the
          // new profile default (e.g. glyph-agent → 1M, not leftover grok 500k).
          traceRef.current = null;
          const r = resolveContextWindow("", id);
          setContextInfo({
            used: null,
            window: r.window,
            model: "",
            softCapPercent: 80,
            estimated: true,
            source: r.source,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setAgentSwitching(false);
      }
    },
    [agent, agentSwitching],
  );

  /** Offline → connect; verbunden → /quit (offline). */
  const toggleGrokConnection = useCallback(() => {
    if (connected) return disconnectGrok();
    return reconnectGrok();
  }, [connected, disconnectGrok, reconnectGrok]);

  /**
   * After Overview confirm (Enter / double-click / Öffnen):
   * show disk transcript; adopt sessionId only when live resume worked.
   *
   * Wrong-session trap: if session/load fails while we are still connected,
   * the agent stays on the old live sessionId. Replacing the transcript with
   * another session’s history would make the next send hit the wrong chat —
   * so on liveError while connected we only surface the banner.
   * Offline browse still shows disk history (read-only until reconnect).
   */
  const handleOpenSession = useCallback(
    (payload) => {
      if (payload?.liveError) {
        setError(payload.liveError);
      } else {
        setError("");
      }

      const liveOk = Boolean(payload?.live);
      if (!liveOk && connected) {
        // Keep current transcript + live sessionId; do not pretend we switched.
        return;
      }

      const list = Array.isArray(payload?.messages) ? payload.messages : [];
      setMessages(
        list.map((m, i) => ({
          id: m.id || `hist-${i}`,
          role: m.role === "user" ? "user" : "assistant",
          text: m.text || "",
          streaming: false,
        })),
      );
      assistantBuf.current = "";
      thoughtBuf.current = "";
      draftBuf.current = "";
      draftsRef.current = [];
      stepsRef.current = [];
      // Pin live id only after a successful session/load (or already-active open).
      if (liveOk && payload?.sessionId) {
        setSessionId(payload.sessionId);
      } else if (!liveOk && payload?.session?.id) {
        // Offline archive view — show which disk session is on screen.
        // Reconnect will clear this transcript when a new live id appears.
        setSessionId(payload.session.id);
      }
      if (payload?.session?.cwd) setCwd(payload.session.cwd);
      scrollToBottom({ force: true });
    },
    [scrollToBottom, connected],
  );

  const snackDemo = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      const v = new URLSearchParams(window.location.search).get("snack");
      return v === "stuffed" || v === "ko" || v === "1";
    } catch {
      return false;
    }
  }, []);

  const toolCardDemo = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return new URLSearchParams(window.location.search).get("toolcard") === "demo";
    } catch {
      return false;
    }
  }, []);

  const visibleMessages = toolCardDemo ? TOOLCARD_DEMO_MESSAGES : messages;
  const transcript = useMemo(
    () => transcriptWindow(visibleMessages, transcriptRevealed),
    [visibleMessages, transcriptRevealed],
  );

  const revealOlderMessages = useCallback(() => {
    const el = listRef.current;
    pendingOlderScrollRef.current = el ? el.scrollHeight : null;
    setTranscriptRevealed((n) => n + TRANSCRIPT_WINDOW);
  }, []);

  useLayoutEffect(() => {
    const prev = pendingOlderScrollRef.current;
    if (prev == null) return;
    pendingOlderScrollRef.current = null;
    const el = listRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTop += el.scrollHeight - prev;
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
  }, [transcriptRevealed]);

  /**
   * Grok-only: Deep Search, Sessions, calendar. Other heads keep the control
   * visible but disabled — a greyed button with a reason beats silent no-op.
   * Swarm is the inverse: °_Agent / ^_Code, greyed on Grok.
   */
  const caps = agent?.capabilities;
  const canDeepSearch = caps ? Boolean(caps.deepSearch) : true;
  const canSwarmAction = caps ? Boolean(caps.swarm) : true;
  // Session-Lupe (persistent) nur bei sessionList:true (Grok); Aktivität nur bei activity:true.
  const canBrowseSessions = caps ? Boolean(caps.sessionList) : true;
  const canSeeActivity = caps ? Boolean(caps.activity) : true;
  const agentLabel = agent?.label || "Agent";
  /**
   * Product line by profile (roles in server/agents.js):
   *   Grok Build → Build Term
   *   ^_Code     → Code Term
   *   °_Agent    → Chat Term
   */
  const productTerm = useMemo(() => {
    const id = agent?.id || "";
    if (id === "_code" || id === "code" || id === "claude") {
      return `Code Term for ${agentLabel}`;
    }
    if (id === "glyph-agent" || id === "agent") {
      // User-facing short name; picker keeps °_Agent.
      return webSurface ? "°_Agent" : "Chat Term for Agent";
    }
    return "Build Term for Grok";
  }, [agent?.id, agentLabel, webSurface]);
  const unavailableFor = useCallback(
    (what) => `${what} ist nur im grok-Profil verfügbar (aktiv: ${agentLabel})`,
    [agentLabel],
  );
  const swarmBlockedReason = `Swarm läuft über °_Agent und ^_Code (aktiv: ${agentLabel})`;

  /** Tooltip for the agent picker: command + why some controls are greyed. */
  const agentPickTitle = useMemo(() => {
    if (!agent) return "Agent wählen";
    const lines = [`Agent: ${agent.label}`];
    if (agent.command) lines.push(agent.command);
    if (agent.hint) lines.push(agent.hint);
    if (agentSwitching) lines.push("Wechsel läuft…");
    return lines.join("\n");
  }, [agent, agentSwitching]);

  // A persisted "deep-search" choice must not survive a switch to an agent
  // that cannot run it — fall back to plain chat.
  useEffect(() => {
    if (!canDeepSearch && sendAction === "deep-search") {
      setSendAction("chat");
    }
    if (!canSwarmAction && sendAction === "swarm") {
      setSendAction("chat");
    }
  }, [canDeepSearch, canSwarmAction, sendAction]);

  // Same for panels that are open when the agent changes under them.
  // Kalender-Panel bleibt offen (Tab Plan gilt für alle Profile; Aktivität ggf. deaktiviert).
  useEffect(() => {
    if (!canBrowseSessions) setShowOverview(false);
  }, [canBrowseSessions]);

  // Working UI: server busy OR any in-flight stream (thought / answer / tools)
  const isWorking = useMemo(
    () => busy || vaultSearchBusy || messages.some((m) => m.streaming),
    [busy, messages, vaultSearchBusy],
  );
  const sendPointerArmedRef = useRef(false);
  const onSendButton = useCallback(() => {
    const canQueue =
      input.trim() ||
      sendAction === "fork" ||
      (pendingAttachments.length > 0 && sendAction !== "fork");
    if (isWorking) {
      if (canQueue) {
        send();
        return;
      }
      if (!cancelling) void cancelTurn();
      return;
    }
    if (snackDemo) return;
    send();
  }, [
    cancelling,
    cancelTurn,
    input,
    isWorking,
    pendingAttachments.length,
    send,
    sendAction,
    snackDemo,
  ]);
  /** Demo forces the working send face so the stuffed board is visible. */
  const showWorking = isWorking || snackDemo;
  const showStuffed = snackStuffed || snackDemo;
  const sendHeadFace = profileHeadId(agent?.id) || "grok";

  // Last assistant-trace model (this session). Not the configured primary→reserve pair.
  const lastTraceModel = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]?.trace?.model;
      if (m) return String(m);
    }
    if (traceRef.current?.model) return String(traceRef.current.model);
    return "";
  }, [messages]);

  // Effective model for window map (last assistant trace beats session signals)
  const effectiveModel = lastTraceModel || contextInfo.model || "";
  const grokHudText = useMemo(() => {
    const short = shortModelLabel(effectiveModel);
    return short === "—" ? "CLI" : short;
  }, [effectiveModel]);

  // Client-side used estimate when server has no signals (claude / glyph-agent / new chat)
  const estimatedUsed = useMemo(() => {
    return estimateTokensFromTexts(
      messages.map((m) => m.text).filter(Boolean),
    );
  }, [messages]);

  const contextFill = useMemo(() => {
    const used =
      contextInfo.estimated || contextInfo.used == null
        ? estimatedUsed
        : contextInfo.used;
    return contextFillRatio(used, contextInfo.window);
  }, [contextInfo, estimatedUsed]);

  const goldFill = useMemo(
    () =>
      goldFillRatio(contextFill, scrollHud.scrollRatio, scrollHud.hasOverflow),
    [contextFill, scrollHud],
  );

  const displayUsed = useMemo(() => {
    if (contextInfo.estimated || contextInfo.used == null) return estimatedUsed;
    return contextInfo.used;
  }, [contextInfo, estimatedUsed]);

  // ~ when used is client-estimated (no signals) — window may still be exact
  const displayEstimated =
    Boolean(contextInfo.estimated) || contextInfo.used == null;

  // Fetch context used/window (grok signals or map defaults)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const params = new URLSearchParams();
        if (sessionId) params.set("sessionId", sessionId);
        if (agent?.id) params.set("profile", agent.id);
        // Prefer live trace; never send a foreign sticky model from a prior
        // profile (e.g. grok-4.5 while on glyph-agent).
        const profileId = agent?.id || "grok";
        let modelHint =
          (traceRef.current && traceRef.current.model) || contextInfo.model || "";
        if (
          modelHint &&
          !isModelCompatibleWithProfile(modelHint, profileId)
        ) {
          modelHint = "";
        }
        if (modelHint) params.set("model", String(modelHint));
        const res = await seatFetch(`/api/context?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const j = await res.json();
        if (cancelled || !j?.ok) return;
        const fallbackWin =
          PROFILE_DEFAULT_WINDOWS[profileId] ??
          resolveContextWindow("", profileId).window;
        const serverModel = String(j.model || "");
        const nextModel =
          serverModel && isModelCompatibleWithProfile(serverModel, profileId)
            ? serverModel
            : modelHint || profileId;
        setContextInfo({
          used: j.used != null ? Number(j.used) : null,
          window: Number(j.window) || fallbackWin,
          model: nextModel,
          softCapPercent: Number(j.softCapPercent) || 80,
          estimated: Boolean(j.estimated),
          source: String(j.source || "default"),
        });
      } catch {
        /* ignore — keep last known */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- contextInfo.model intentionally not a dep (write target)
  }, [sessionId, agent?.id, isWorking, messages.length]);

  // Poll grok signals while tools run (context grows without turn_done)
  useEffect(() => {
    if (!isWorking || agent?.id !== "grok") return undefined;
    const id = window.setInterval(() => {
      const params = new URLSearchParams();
      if (sessionId) params.set("sessionId", sessionId);
      params.set("profile", "grok");
      void fetch(`/api/context?${params.toString()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (!j?.ok) return;
          const fallbackWin =
            PROFILE_DEFAULT_WINDOWS.grok ??
            resolveContextWindow("", "grok").window;
          setContextInfo({
            used: j.used != null ? Number(j.used) : null,
            window: Number(j.window) || fallbackWin,
            model: String(j.model || ""),
            softCapPercent: Number(j.softCapPercent) || 80,
            estimated: Boolean(j.estimated),
            source: String(j.source || "default"),
          });
        })
        .catch(() => {});
    }, CONTEXT_POLL_MS);
    return () => window.clearInterval(id);
  }, [isWorking, agent?.id, sessionId]);

  // Re-measure scroll HUD when transcript size changes
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    requestAnimationFrame(() => setScrollHud(scrollMetrics(el)));
  }, [messages.length, isWorking]);

  // Wiederkehrende To-dos: Systemzeile im Chat wenn UI offen (Q20=B)
  const recurringEventsAfterRef = useRef("");
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const after = recurringEventsAfterRef.current;
        const q = after ? `?after=${encodeURIComponent(after)}` : "";
        const res = await fetch(`/api/recurring/events${q}`);
        const j = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const events = Array.isArray(j.events) ? j.events : [];
        if (!events.length) return;
        // Erster Poll: nur Cursor setzen, keine Flut alter Events
        if (!recurringEventsAfterRef.current) {
          const last = events[events.length - 1];
          recurringEventsAfterRef.current = String(last.ts || "");
          return;
        }
        for (const ev of events) {
          if (ev.ts) recurringEventsAfterRef.current = String(ev.ts);
          if (ev.type !== "run") continue;
          const title = String(ev.title || ev.id || "To-do");
          const ok = Boolean(ev.ok);
          const preview = String(ev.preview || "").trim();
          const line = ok
            ? `To-do fertig: ${title}${preview ? ` — ${preview.slice(0, 160)}` : ""}`
            : `To-do Fehler: ${title}${preview ? ` — ${preview.slice(0, 160)}` : ""}`;
          setMessages((prev) => [
            ...prev,
            {
              id: `recurring-${ev.ts || Date.now()}-${ev.id || ""}`,
              role: "system",
              text: line,
            },
          ]);
        }
      } catch {
        /* offline ok */
      }
    };
    void poll();
    const id = window.setInterval(poll, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Keep streaming mirror in sync (e.g. after history load / finalize)
  useEffect(() => {
    streamingRef.current = messages.some((m) => m.streaming);
  }, [messages]);

  // Reset activity clock when a turn starts so we don't flash stuffed immediately
  useEffect(() => {
    if (snackDemo) return undefined;
    if (isWorking) {
      lastActivityRef.current = Date.now();
      setSnackStuffed(false);
    } else {
      setSnackStuffed(false);
    }
    return undefined;
  }, [isWorking, snackDemo]);

  // Poll: busy + silent too long → stuffed snack (X_X overate)
  useEffect(() => {
    if (snackDemo || !isWorking) return undefined;
    const id = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= SNACK_STALE_MS) {
        setSnackStuffed(true);
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [isWorking, snackDemo]);

  // Safety net: if idle with parked items, drain (covers missed turn_done)
  useEffect(() => {
    if (!isWorking && queue.length > 0 && connected) {
      scheduleDrainQueue();
    }
  }, [isWorking, queue.length, connected, scheduleDrainQueue]);

  const prevSessionRef = useRef(sessionId);
  useEffect(() => {
    if (!isAgentProfile) {
      setVaultSearchOn(false);
      setVaultHits(null);
      setVaultHitOn(new Set());
      setVaultSearchError("");
      vaultLastPickedRef.current = [];
      return;
    }
    const prev = prevSessionRef.current;
    prevSessionRef.current = sessionId;
    const on =
      sessionId && !prev
        ? migrateVaultSearchOn("new", sessionId)
        : loadVaultSearchOn(sessionId);
    setVaultSearchOn(on);
    // Follow-up after first send: sessionId appears — keep last pick.
    // Switching chats: new picker.
    if (prev && sessionId && prev !== sessionId) {
      vaultLastPickedRef.current = [];
    }
    if (!on) {
      setVaultHits(null);
      setVaultHitOn(new Set());
      setVaultSearchError("");
    }
  }, [sessionId, isAgentProfile]);

  const toggleVaultSearch = useCallback(() => {
    setVaultSearchOn((v) => {
      const next = !v;
      saveVaultSearchOn(sessionId, next);
      return next;
    });
    setVaultHits(null);
    setVaultHitOn(new Set());
    setVaultSearchError("");
    vaultLastPickedRef.current = [];
  }, [sessionId]);
  const workingSeconds = useWorkingSeconds(showWorking);

  /** Session, paths, and build — only in the subtitle tooltip (quiet by default). */
  const headerTooltip = useMemo(() => {
    const lines = [];
    lines.push(
      seat === "phone" ? "Sitz: Handy" : seat === "web" ? "Sitz: Web" : "Sitz: Schreibtisch",
    );
    if (sessionId) lines.push(`Session ${sessionId}`);
    if (cwd) lines.push(cwd);
    lines.push(
      GLYPH_BUILD_LABEL
        ? `UI ${GLYPH_BUILD_LABEL} · v${GLYPH_VERSION}`
        : `UI v${GLYPH_VERSION}`,
    );
    if (bridgeMeta) {
      const bridgeMark = glyphBuildLabel(bridgeMeta.build);
      lines.push(
        bridgeMark
          ? `Bridge ${bridgeMark} · v${bridgeMeta.version}`
          : `Bridge v${bridgeMeta.version}`,
      );
      lines.push(`${bridgeMeta.host}:${bridgeMeta.port}`);
      if (bridgeMeta.root) lines.push(bridgeMeta.root);
    }
    if (modelHud?.label) lines.push(`Model: ${modelHud.label}`);
    return lines.length ? lines.join("\n") : undefined;
  }, [seat, sessionId, cwd, bridgeMeta, modelHud]);

  const refreshModelHud = useCallback(async () => {
    const profileId = agent?.id || "";
    if (!isCloudModelProfile(profileId)) {
      setModelHud({
        kind: "grok",
        label: "Grok Build (CLI)",
        mismatch: false,
      });
      return;
    }
    try {
      const res = await fetch("/api/bindings", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setModelHud(modelHudFromBindings(data, profileId));
    } catch {
      /* ignore */
    }
  }, [agent?.id]);

  /** Read-only poll for the model pill. Writes: connect, Graph-save, mismatch-Klick. */
  useEffect(() => {
    if (!isCloudModelProfile(agent?.id || "")) {
      setModelHud({
        kind: "grok",
        label: "Grok Build (CLI)",
        mismatch: false,
      });
      return undefined;
    }
    void refreshModelHud();
    const id = window.setInterval(() => void refreshModelHud(), 15000);
    return () => window.clearInterval(id);
  }, [agent?.id, refreshModelHud]);

  /** Apply saved models when the agent connects — not every poll. */
  useEffect(() => {
    if (!connected || !isCloudModelProfile(agent?.id || "")) return undefined;
    let cancelled = false;
    (async () => {
      await fetch("/api/models/apply", { method: "POST" }).catch(() => {});
      if (!cancelled) void refreshModelHud();
    })();
    return () => {
      cancelled = true;
    };
  }, [agent?.id, connected, refreshModelHud]);

  /**
   * Provider-Wechsel im Header.
   * Setzt NUR den Modus — die Modell-Paare bleiben unangetastet. Der Nutzer
   * entscheidet selbst, welches Modell Primary/Reserve ist (Anbindung/Graph).
   * Ein automatischer Tausch war der Fehler: „Fallback" hat glm zum Primary
   * gemacht, obwohl DeepSeek Flash gewollt war.
   */
  const handleProviderChange = useCallback(
    async (mode) => {
      const kind = agent?.id === "_code" ? "code" : "agent";
      const body = { provider: mode, kind };
      try {
        await fetch("/api/bindings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        /* ignore */
      }
      void refreshModelHud();
    },
    [agent?.id, refreshModelHud],
  );

  /** Stale UI vs running bridge — only then surface a banner. */
  const buildMismatch = Boolean(
    bridgeMeta &&
      GLYPH_BUILD > 0 &&
      bridgeMeta.build > 0 &&
      GLYPH_BUILD !== bridgeMeta.build,
  );

  const composerPlaceholder = useMemo(() => {
    if (!connected) {
      return `Offline — tippen ok · / für Skills · senden nach ${agentLabel}-Verbindung`;
    }
    if (cancelling) {
      return `Abbruch… ${workingSeconds}s — warte auf sicheres Turn-Ende`;
    }
    if (showStuffed) {
      return snackDemo
        ? `DEMO: Glyph got lost… in space — ?snack=stuffed · weg: URL ohne param`
        : `Glyph got lost… in space · ${workingSeconds}s still — tippen = Stopp · dann neu`;
    }
    if (isWorking) {
      // Short on purpose: stop/queue is the round button + empty Enter — no reminder spam
      return `${agentLabel} work… ${workingSeconds}s`;
    }
    if (isAgentProfile && vaultSearchBusy) {
      return "Suche im Vault…";
    }
    if (isAgentProfile && vaultSearchOn && vaultHits) {
      return "Treffer in der Leiste anwählen · Mit Auswahl senden";
    }
    if (sendAction === "deep-search") {
      return "Deep Search Query… z. B. Compare Postgres 17 vs MySQL 9";
    }
    if (sendAction === "swarm") {
      return "Swarm-Thema… °_Agent / ^_Code zerlegen, suchen, belegen";
    }
    if (sendAction === "fork") {
      return "Optional: Directive für den Fork… (leer = nur Session branchen)";
    }
    // Keep short: attach hints live in the empty state; long copy wraps badly on phones
    return `Nachricht an ${agentLabel}…  ·  / für Befehle`;
  }, [
    connected,
    isWorking,
    showStuffed,
    snackDemo,
    cancelling,
    sendAction,
    workingSeconds,
    agentLabel,
    isAgentProfile,
    vaultSearchBusy,
    vaultSearchOn,
    vaultHits,
  ]);

  // Profile-dependent skills (offline-capable disk scan on the bridge)
  const loadSkills = useCallback(async (profileId) => {
    const id = profileId || "grok";
    setSkillsLoading(true);
    setSkillsError("");
    try {
      const res = await fetch(`/api/skills?profile=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Skills laden fehlgeschlagen");
      setSkills(Array.isArray(json.skills) ? json.skills : []);
      setSkillsHint(json.hint || null);
    } catch (err) {
      setSkills([]);
      setSkillsHint(null);
      setSkillsError(err instanceof Error ? err.message : String(err));
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSkills(agent?.id || "grok");
  }, [agent?.id, loadSkills]);

  const skillCatalog = useMemo(
    () =>
      (skills || []).map((s) => ({
        ...s,
        kind: "skill",
        name: String(s.name || "").replace(/^\//, ""),
      })),
    [skills],
  );

  const commandCatalog = useMemo(
    () =>
      withUiReloadCommand(
        (agentCommands || []).map((c) => ({
          ...c,
          kind: c.kind === "ui" ? "ui" : "command",
          name: String(c.name || "").replace(/^\//, ""),
        })),
      ),
    [agentCommands],
  );

  const slashItems = useMemo(
    () => rankCatalog(skillCatalog, commandCatalog, slashQuery),
    [skillCatalog, commandCatalog, slashQuery],
  );

  const composerSlashHl = useMemo(
    () => findSlashHighlightRanges(input, skillCatalog, commandCatalog).length > 0,
    [input, skillCatalog, commandCatalog],
  );

  useEffect(() => {
    if (!slashOpen) return;
    if (slashItems.length === 0) {
      setSlashIndex(0);
      return;
    }
    setSlashIndex((i) => Math.min(Math.max(0, i), slashItems.length - 1));
  }, [slashOpen, slashItems.length, slashQuery]);

  /** 1-line default; grow *up* (toolbar stays put) to CSS --composer-max-h.
   *  Overlay metrics copy from the textarea (applyComposerMirrorMetrics).
   *  Empty value: force min-height — iOS Safari scrollHeight grows with a
   *  wrapped placeholder and balloons the empty composer (narrow phones). */
  const resizeComposer = useCallback(() => {
    const ta = composerRef.current;
    if (!ta) return;
    const mirror = ta.previousElementSibling?.classList?.contains(
      "composer-highlight",
    )
      ? ta.previousElementSibling
      : null;

    const wrap = ta.closest(".composer-input-wrap");
    const minVar = wrap
      ? getComputedStyle(wrap).getPropertyValue("--composer-min-h").trim()
      : "";
    const rootFs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const minH = minVar.endsWith("rem")
      ? parseFloat(minVar) * rootFs
      : parseFloat(minVar) || rootFs * 2.25;
    const maxCss = parseFloat(getComputedStyle(ta).maxHeight);
    const maxH = Number.isFinite(maxCss) && maxCss > 0 ? maxCss : 448;

    ta.style.height = "auto";
    ta.style.minHeight = "";

    const empty = ta.value.length === 0;
    const h = empty
      ? minH
      : Math.min(Math.max(ta.scrollHeight, minH), maxH);
    ta.style.height = `${h}px`;
    ta.style.minHeight = `${h}px`;

    if (mirror) applyComposerMirrorMetrics(ta, mirror);
  }, []);

  useLayoutEffect(() => {
    resizeComposer();
  }, [input, resizeComposer]);

  /* Keep mirror width in sync when the composer pane is resized. */
  useEffect(() => {
    const ta = composerRef.current;
    if (!ta || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      resizeComposer();
    });
    ro.observe(ta);
    return () => ro.disconnect();
  }, [resizeComposer]);

  /* Close mode menu on outside click / Escape. */
  useEffect(() => {
    if (!modeMenuOpen) return;
    const onDown = (e) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target)) {
        setModeMenuOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setModeMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [modeMenuOpen]);

  const applySlashInsert = useCallback(
    (itemOrName) => {
      const item =
        itemOrName && typeof itemOrName === "object"
          ? itemOrName
          : { name: itemOrName };
      const name = String(item.name || "").replace(/^\//, "");
      if (isUiReloadItem(item) || isUiReloadSlash("/" + name)) {
        hardReloadUi();
        return;
      }
      const el = composerRef.current;
      const cursor =
        el && typeof el.selectionStart === "number"
          ? el.selectionStart
          : input.length;
      const result = insertSlashCommand(input, cursor, name);
      if (!result) return;
      setInput(result.text);
      setSlashOpen(false);
      setSlashQuery("");
      requestAnimationFrame(() => {
        const ta = composerRef.current;
        if (!ta) return;
        ta.focus();
        try {
          ta.setSelectionRange(result.cursor, result.cursor);
        } catch {
          /* ignore */
        }
        resizeComposer();
      });
    },
    [input, resizeComposer],
  );

  const syncSlashFromComposer = useCallback((text, cursor) => {
    const token = slashTokenAt(text, cursor);
    if (!token) {
      setSlashOpen(false);
      setSlashQuery("");
      return;
    }
    setSlashOpen(true);
    setSlashQuery(token.query);
  }, []);

  // Cmd/Ctrl+K → Extensions-Modal
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        // Don't steal when typing in non-composer fields with explicit handling
        e.preventDefault();
        setShowExtensions(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep Snack mounted briefly after work ends so Kopf←Snack morph can play
  const [snackAlive, setSnackAlive] = useState(false);
  useEffect(() => {
    if (showWorking) {
      setSnackAlive(true);
      return undefined;
    }
    if (!snackAlive) return undefined;
    const t = setTimeout(() => setSnackAlive(false), 520);
    return () => clearTimeout(t);
  }, [showWorking, snackAlive]);

  if (webSurface && !webUnlocked) {
    return (
      <WebGate
        hint={webGateHint}
        onUnlocked={() => {
          setWebGateHint("");
          setWebUnlocked(true);
        }}
      />
    );
  }

  return (
    <div className={`app${webSurface ? " app--web" : ""}`}>
      {webSurface ? null : (
      <aside
        className="side-rail"
        aria-label="Hauptaktionen"
        inert={showLage ? true : undefined}
        aria-hidden={showLage || undefined}
      >
        <button
          type="button"
          className="side-rail-btn"
          onClick={() => setShowCalendar(true)}
          title="Plan & Aktivität — wiederkehrende To-dos + Heatmap"
          aria-label="Plan und Aktivität"
        >
          <IconCalendar />
        </button>
        <button
          type="button"
          className="side-rail-btn"
          onClick={() => setShowOverview(true)}
          disabled={!canBrowseSessions}
          title={
            canBrowseSessions
              ? "Suche & Sessions"
              : unavailableFor("Die Sessions-Übersicht")
          }
          aria-label="Suche und Sessions"
        >
          <IconSearch />
        </button>
        <button
          type="button"
          className={`side-rail-btn${showLage ? " side-rail-btn--plan-open" : ""}`}
          onClick={() => {
            setShowLage((v) => !v);
            setLageFocus("");
          }}
          title="Graph — Glyph, Grok, Agent, Code"
          aria-label="Graph öffnen"
          aria-pressed={showLage}
          onMouseEnter={() => {
            void import("./components/CableLage.jsx");
          }}
        >
          <IconLage />
        </button>
        <button
          type="button"
          className="side-rail-btn"
          onClick={reset}
          disabled={!connected || busy}
          title="Neuer Chat"
          aria-label="Neuer Chat"
        >
          <IconCompose />
        </button>
        <button
          type="button"
          className="side-rail-btn"
          onClick={() => setShowExtensions(true)}
          title="Befehle & Skills (⌘/Ctrl+K)"
          aria-label="Befehle und Skills"
        >
          <IconCommands />
        </button>
        <span className="side-rail-sep" aria-hidden="true" />
        <button
          type="button"
          className="side-rail-btn"
          onClick={() => void openWiki()}
          title={
            wikiRoot
              ? `Wiki · Index (.md)\n${wikiRoot}`
              : "Wiki · Index (.md) öffnen"
          }
          aria-label="Wiki Index öffnen"
        >
          <IconWiki />
        </button>
        <button
          type="button"
          className="side-rail-btn"
          onClick={() => void openWorkspace()}
          title={cwd ? `Workspace\n${cwd}` : "Workspace"}
          aria-label="Workspace"
        >
          <IconWorkspace />
        </button>
        <button
          type="button"
          className="side-rail-btn"
          onClick={toggleTheme}
          title={theme === "dark" ? "Theme: Hell" : "Theme: Dunkel"}
          aria-label="Theme umschalten"
        >
          <IconTheme />
        </button>
        <button
          type="button"
          className="side-rail-btn"
          onClick={() => hardReloadUi()}
          title="UI neu laden (statt ⌘⇧R)"
          aria-label="UI neu laden"
        >
          <IconRefresh />
        </button>
        <span className="side-rail-spacer" aria-hidden="true" />
        <button
          type="button"
          className="side-rail-btn side-rail-btn--book"
          onClick={() => {
            setLegendTab("handbook");
            setShowLegend(true);
          }}
          title="Kurzhandbuch · UI-Legende"
          aria-label="Kurzhandbuch öffnen"
        >
          <IconBook />
        </button>
      </aside>
      )}

      <div
        className="app-main"
        inert={showLage ? true : undefined}
        aria-hidden={showLage || undefined}
      >
        <header className="top">
          <div>
            <h1>
              Glyph
              {webSurface || GLYPH_BUILD <= 0 ? null : (
                <span
                  className={`app-build${buildMismatch ? " app-build--drift" : ""}`}
                  title={headerTooltip}
                >
                  {GLYPH_BUILD_LABEL}
                </span>
              )}
              <span className="sub sub--inline" title={headerTooltip}>
                {webSurface ? productTerm : `${productTerm} · ACP`}
                {seat === "phone" ? " · Handy" : ""}
              </span>
            </h1>
          </div>
          <div className="top-actions">
            {webSurface ? (
              <>
                <button
                  type="button"
                  className="pill pill-btn pill-btn--icon"
                  onClick={reset}
                  disabled={!connected || busy}
                  title="Neuer Chat"
                  aria-label="Neuer Chat"
                >
                  <IconCompose size={18} />
                </button>
                <button
                  type="button"
                  className="pill pill-btn pill-btn--icon"
                  onClick={() => setShowExtensions(true)}
                  title="Befehle & Skills (⌘/Ctrl+K)"
                  aria-label="Befehle und Skills"
                >
                  <IconCommands size={18} />
                </button>
                <button
                  type="button"
                  className="pill pill-btn pill-btn--icon"
                  onClick={toggleTheme}
                  title={theme === "dark" ? "Theme: Hell" : "Theme: Dunkel"}
                  aria-label="Theme umschalten"
                >
                  <IconTheme size={18} />
                </button>
                <button
                  type="button"
                  className="pill pill-btn pill-btn--icon"
                  onClick={() => setWebPasswordOpen(true)}
                  title="Passwort ändern"
                  aria-label="Passwort ändern"
                >
                  <IconLock size={18} />
                </button>
                {headerControls.reload ? (
                  <button
                    type="button"
                    className="pill pill-btn pill-btn--icon"
                    onClick={() => hardReloadUi()}
                    title="UI neu laden (statt ⌘⇧R)"
                    aria-label="UI neu laden"
                  >
                    <IconRefresh size={18} />
                  </button>
                ) : null}
              </>
            ) : null}
            {!webSurface && agents.length > 1 ? (
              <label className="agent-pick" title={agentPickTitle}>
                <span className="sr-only">Agent</span>
                <select
                  className="agent-pick-select"
                  value={agent?.id || ""}
                  disabled={agentSwitching || reconnecting || isWorking}
                  onChange={(e) => void switchAgent(e.target.value)}
                  aria-label="Agent wählen"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {!webSurface && modelHud?.label ? (
              <button
                type="button"
                className={`model-hud${modelHud.mismatch ? " model-hud--mismatch" : ""}${
                  modelHud.kind === "grok" ? " model-hud--muted" : ""
                }`}
                title={
                  modelHud.kind === "grok"
                    ? "Graph — Grok Build / Anbindung"
                    : modelHud.mismatch
                      ? `Gespeichert ≠ aktiv: ${modelHud.label} — Graph`
                      : `${modelHud.label} — Graph`
                }
                onClick={() => {
                  if (
                    modelHud.mismatch &&
                    isCloudModelProfile(agent?.id || "")
                  ) {
                    void fetch("/api/models/apply", { method: "POST" })
                      .then(() => refreshModelHud())
                      .catch(() => {});
                  }
                  setLageFocus(
                    modelHud.kind === "grok"
                      ? "grok"
                      : agent?.id === "_code"
                        ? "code"
                        : "agent",
                  );
                  setShowLage(true);
                }}
              >
                <span className="model-hud-text">
                  {modelHud.kind === "grok"
                    ? grokHudText
                    : modelHud.primary
                      ? modelHudText(
                          modelHud.primary,
                          modelHud.fallback,
                          lastTraceModel,
                          modelHud.liveLabel,
                        )
                      : "Model"}
                  {modelHud.mismatch ? " ⚠" : ""}
                </span>
              </button>
            ) : null}
            {!webSurface &&
            isCloudModelProfile(agent?.id || "") &&
            modelHud?.kind !== "grok" ? (
              <ProviderSwitch
                provider={modelHud?.provider || "hybrid"}
                isPeak={Boolean(modelHud?.isPeak)}
                mismatch={Boolean(modelHud?.mismatch)}
                disabled={isWorking || agentSwitching}
                onChange={(mode) =>
                  void handleProviderChange(mode)
                }
              />
            ) : null}
            {headerControls.quit ? (
              <button
                type="button"
                className={`pill pill-btn pill-btn--icon ${
                  reconnecting ? "pending" : connected ? "ok" : "bad"
                }`}
                disabled={reconnecting}
                title={
                  reconnecting
                    ? connected
                      ? `${agentLabel}-Agent wird beendet…`
                      : `${agentLabel}-Agent wird gestartet…`
                    : connected
                      ? `${agentLabel} läuft — klicken zum Beenden`
                      : `${agentLabel} offline — klicken zum Verbinden`
                }
                aria-label={
                  reconnecting
                    ? connected
                      ? "Verbindung wird getrennt"
                      : "Verbindung wird hergestellt"
                    : connected
                      ? "Verbunden — klicken zum Beenden"
                      : "Offline — klicken zum Verbinden"
                }
                onClick={() => void toggleGrokConnection()}
              >
                {reconnecting ? (
                  <IconRefresh size={18} />
                ) : connected ? (
                  <IconLink size={18} />
                ) : (
                  <IconLinkOff size={18} />
                )}
              </button>
            ) : null}
          </div>
        </header>

        {buildMismatch ? (
          <div className="banner banner--warn" role="status">
            ⚠ UI <code>{GLYPH_BUILD_LABEL}</code>
            {" · "}
            Bridge <code>{glyphBuildLabel(bridgeMeta.build)}</code>
            {" — "}
            <code>npm run service:install</code>
          </div>
        ) : null}
        {showStuffed ? (
          <div className="banner banner--stuffed" role="status">
            <strong>
              {snackDemo ? "DEMO — " : ""}
              Glyph got lost… in space.
            </strong>
            {snackDemo ? (
              <>
                {" "}
                Vorschau ohne echten Hänger. Weg: URL ohne{" "}
                <code>?snack=stuffed</code>.
              </>
            ) : null}
            <br />
            <span className="banner-stuffed-steps">
              {snackDemo ? (
                <>
                  Runder Button: X-Augen, Zunge, Apfel auf den Kopf. Schließen:{" "}
                  <a href="/">ohne Demo-Param</a>
                </>
              ) : (
                <>
                  1. Snack tippen = Stopp · 2. Nachricht nochmal senden · 3. Wenn
                  weiter tot: <code>npm run service:install</code>
                </>
              )}
            </span>
            {!snackDemo ? (
              <button
                type="button"
                className="banner-stuffed-reload"
                onClick={() => window.location.reload()}
              >
                UI neu laden
              </button>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <div className="banner banner--dismissible" role="alert">
            <span className="banner-text">{error}</span>
            <button
              type="button"
              className="banner-dismiss"
              onClick={() => setError("")}
              title="Fehler schließen"
              aria-label="Fehler schließen"
            >
              ×
            </button>
          </div>
        ) : null}

        <div className="messages-shell messages-shell--col">
          <main
            className={`messages messages--borderless${
              dropActive ? " is-drop-target" : ""
            }`}
            ref={listRef}
            tabIndex={-1}
            onDragEnter={onMessagesDragEnter}
            onDragLeave={onMessagesDragLeave}
            onDragOver={onMessagesDragOver}
            onDrop={onMessagesDrop}
          >
            <div className="messages-content" ref={messagesContentRef}>
              {visibleMessages.length === 0 ? (
                <div className="empty">
                  {webSurface
                    ? `Nachricht an ${agentLabel}. Eigener Chat — nicht der Mac.`
                    : `Schreib eine Nachricht — Glyph verbindet lokal per ACP mit ${agentLabel}.`}
                  <br />
                  <span className="empty-soft">
                    {webSurface ? (
                      <>
                        Screenshot <strong>einfügen</strong> · Datei{" "}
                        <strong>ziehen</strong> · Stift = neuer Chat
                      </>
                    ) : (
                      <>
                        Screenshot <strong>einfügen</strong> · Datei hierher{" "}
                        <strong>ziehen</strong> · Sessions: <strong>Lupe</strong>
                      </>
                    )}
                  </span>
                </div>
              ) : (
                <>
                  {transcript.hiddenCount > 0 ? (
                    <button
                      type="button"
                      className="transcript-older"
                      onClick={revealOlderMessages}
                      aria-label={`${transcript.hiddenCount} ältere Nachrichten laden`}
                    >
                      {transcript.hiddenCount} ältere Nachrichten
                    </button>
                  ) : null}
                  {transcript.visible.map((m, messageIndex) => {
                  if (m.role === "tool") {
                    return (
                      <article
                        key={m.id}
                        data-msg-id={m.id}
                        className="msg msg-tool"
                      >
                        <ToolCard msg={m} />
                      </article>
                    );
                  }
                  const priorUser = priorUserMessage(
                    visibleMessages,
                    transcript.start + messageIndex,
                  );
                  const roleLabel =
                    m.role === "user"
                      ? "Du"
                      : m.role === "assistant"
                        ? agentLabel
                        : m.role === "thought"
                          ? "Thinking"
                          : "System";
                  const showCopy =
                    (m.role === "user" || m.role === "assistant") &&
                    !m.streaming &&
                    Boolean(m.text?.trim());
                  const copyActions = showCopy ? (
                    <div
                      className="msg-bottom-actions"
                      role="group"
                      aria-label={
                        m.role === "user"
                          ? "Nachrichtaktionen"
                          : "Antwortaktionen"
                      }
                    >
                      <button
                        type="button"
                        className={`msg-action-btn msg-bottom-btn${
                          copiedId === m.id ? " is-copied" : ""
                        }`}
                        title={
                          copiedId === m.id
                            ? "Kopiert"
                            : m.role === "user"
                              ? "Nachricht kopieren"
                              : "Antwort kopieren"
                        }
                        aria-label={
                          copiedId === m.id
                            ? "Kopiert"
                            : m.role === "user"
                              ? "Nachricht kopieren"
                              : "Antwort kopieren"
                        }
                        onClick={() => void copyMessage(m.id, m.text)}
                      >
                        {copiedId === m.id ? (
                          <IconCheck size={18} />
                        ) : (
                          <IconCopy size={18} />
                        )}
                      </button>
                      {m.role === "user" && !busy ? (
                        <button
                          type="button"
                          className="msg-action-btn msg-bottom-btn"
                          title="Rewind: ab dieser Nachricht zurück"
                          aria-label="Rewind ab dieser Nachricht"
                          disabled={rewindBusy}
                          onClick={() => {
                            const pts = rewindPointsFromMessages(messages);
                            const hit = pts.find((p) => p.id === m.id);
                            const idx =
                              hit?.index ??
                              pts.findIndex((p) => p.text === m.text);
                            if (idx < 0) return;
                            requestRewind(idx, m.text);
                          }}
                        >
                          <IconRewind size={18} />
                        </button>
                      ) : null}
                      {m.role === "assistant" && priorUser ? (
                        <button
                          type="button"
                          className="msg-action-btn msg-bottom-btn"
                          title="Antwort als Aufgabe übergeben"
                          aria-label="Als Aufgabe übergeben"
                          onClick={() => {
                            setTaskHandoff({
                              message: m,
                              userMessage: priorUser,
                            });
                          }}
                        >
                          <IconLink size={18} />
                        </button>
                      ) : null}
                      {m.role === "assistant" ? (
                        <button
                          type="button"
                          className={`msg-action-btn msg-bottom-btn msg-speak-btn${
                            speakingId === m.id ? " is-speaking" : ""
                          }${ttsBusyId === m.id ? " is-busy" : ""}`}
                          title={
                            speakingId === m.id
                              ? "Vorlesen stoppen"
                              : ttsBusyId === m.id
                                ? "Erzeuge Sprache…"
                                : voiceAvailable
                                  ? "Antwort vorlesen (TTS)"
                                  : voiceHint || "TTS: XAI- oder OpenRouter-Key"
                          }
                          aria-label={
                            speakingId === m.id
                              ? "Vorlesen stoppen"
                              : "Antwort vorlesen"
                          }
                          disabled={Boolean(ttsBusyId && ttsBusyId !== m.id)}
                          onClick={() => void speakText(m.id, m.text)}
                        >
                          {speakingId === m.id ? (
                            <IconSpeakerOff size={18} />
                          ) : (
                            <IconSpeaker size={18} />
                          )}
                        </button>
                      ) : null}
                    </div>
                  ) : null;

                  const actionsOpen =
                    actionsMsgId === m.id ||
                    speakingId === m.id ||
                    ttsBusyId === m.id ||
                    copiedId === m.id;

                  return (
                    <article
                      key={m.id}
                      data-msg-id={m.id}
                      className={`msg msg-${m.role}${
                        actionsOpen ? " is-actions-open" : ""
                      }`}
                      onClick={(e) => {
                        if (!showCopy) return;
                        revealMessageActions(m.id, e);
                      }}
                    >
                      {m.role === "user" ? (
                        <>
                          {/* Bubble shell only around text — copy stays outside the rim */}
                          <div className="msg-user-bubble">
                            <div className="role role-row">
                              <span>{roleLabel}</span>
                            </div>
                            {m.attachments?.length ? (
                              <ul
                                className="msg-attachments"
                                aria-label="Anhänge"
                              >
                                {m.attachments.map((a) => (
                                  <li
                                    key={a.id || a.path || a.name}
                                    className="msg-attach-chip"
                                    title={a.name}
                                  >
                                    <span
                                      className="msg-attach-icon"
                                      aria-hidden="true"
                                    >
                                      {isImageMime(a.mimeType) ? "🖼" : "📄"}
                                    </span>
                                    <span className="msg-attach-name">
                                      {a.name}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {m.text ? (
                              <SlashHighlightedText
                                text={m.text}
                                skills={skillCatalog}
                                commands={commandCatalog}
                                className="md-body user-text-with-slash"
                                markdownFallback
                              />
                            ) : null}
                          </div>
                          {copyActions}
                        </>
                      ) : (
                        <>
                          <div className="role role-row">
                            <span>
                              {roleLabel}
                              {m.streaming ? " …" : ""}
                            </span>
                          </div>
                          {m.text || m.steps?.length || m.drafts?.length ? (
                            <AssistantText
                              text={m.text}
                              steps={m.steps}
                              drafts={m.drafts}
                              streaming={Boolean(m.streaming)}
                              protocolCollapsed={Boolean(m.protocolCollapsed)}
                            />
                          ) : null}
                          {copyActions}
                          {m.trace ? <AssistantMeta trace={m.trace} /> : null}
                        </>
                      )}
                    </article>
                  );
                  })}
                </>
              )}
            </div>
            {dropActive ? (
              <div className="messages-drop-hint" aria-hidden="true">
                Datei hier ablegen
              </div>
            ) : null}
          </main>
          {/* Unpinned + new chunks below → jump re-enables sticky follow */}
          {!pinnedToBottom && hasNewBelow ? (
            <button
              type="button"
              className="jump-latest"
              onClick={() => scrollToBottom({ force: true })}
              title="Zum aktuellen Stand — Chat klebt wieder an neuen Ausgaben"
            >
              Neue Ausgabe ↓
            </button>
          ) : null}
        </div>

        <footer className="composer composer--grok">
          {activeTask &&
          (agent?.id === "_code" || agent?.id === "code" || activeTask.grant_id === "demo") ? (
            <ActiveTaskBar
              task={activeTask}
              busy={busy}
              onRevoke={revokeActiveTask}
            />
          ) : null}
          {!planBarHidden ? (
            <PlanBar
              entries={planEntries}
              collapsed={planCollapsed}
              onToggle={() => setPlanCollapsed((c) => !c)}
              onDismiss={() => {
                // Leiste aus — Plan bleibt unter Kalender-Icon → Tab Plan
                setPlanBarHidden(true);
                setPlanCollapsed(false);
              }}
              approveDisabled={!connected || busy}
              onApprove={approvePlan}
              onRevise={() => {
                setPlanCollapsed(false);
                composerRef.current?.focus();
              }}
            />
          ) : null}
          {taskHandoff ? (
            <TaskHandoffDialog
              source={agent?.id || "glyph-agent"}
              message={taskHandoff.message}
              userMessage={taskHandoff.userMessage}
              onClose={() => setTaskHandoff(null)}
              onUsePrompt={(prompt) => {
                setInput(prompt);
                setTaskHandoff(null);
                composerRef.current?.focus();
              }}
            />
          ) : null}
          {isAgentProfile && (vaultSearchBusy || vaultHits || vaultSearchError) ? (
            <VaultSearchHits
              query={vaultHits?.query || input.trim()}
              hits={vaultHits?.hits || []}
              selectedIds={vaultHitOn}
              busy={vaultSearchBusy}
              error={vaultSearchError}
              fallback={vaultHits?.fallback || ""}
              onToggle={(id) => {
                setVaultHitOn((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }}
              onDismiss={abortVaultSearch}
              onSend={sendVaultSelection}
            />
          ) : null}
          {queue.length > 0 ? (
            <div className="msg-queue" role="list" aria-label="Warteschlange">
              <div className="msg-queue-head">
                <span className="msg-queue-title">
                  WARTE
                  <span className="msg-queue-pixels" aria-hidden="true">
                    <span className="msg-queue-pixel" />
                    <span className="msg-queue-pixel" />
                    <span className="msg-queue-pixel" />
                  </span>
                  <span className="msg-queue-count" aria-label={`${queue.length} in Warteschlange`}>
                    {queue.length}
                  </span>
                </span>
                <button
                  type="button"
                  className="msg-queue-clear"
                  onClick={clearQueue}
                  title="Warteschlange leeren"
                >
                  Leeren
                </button>
              </div>
              <ol className="msg-queue-list">
                {queue.map((q, i) => (
                  <li key={q.id} className="msg-queue-item" role="listitem">
                    <span className="msg-queue-idx">{i + 1}</span>
                    <span className="msg-queue-text" title={q.displayText}>
                      {q.displayText}
                    </span>
                    <button
                      type="button"
                      className="msg-queue-remove"
                      onClick={() => removeQueued(q.id)}
                      title="Aus Warteschlange entfernen"
                      aria-label="Entfernen"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <div className="context-lvl-row">
            <ContextLvlBar
              contextFill={contextFill}
              goldFill={goldFill}
              softCapRatio={(contextInfo.softCapPercent || 80) / 100}
              used={displayUsed}
              windowTokens={contextInfo.window}
              model={effectiveModel || contextInfo.model}
              estimated={displayEstimated}
              animateKey={sessionId || agent?.id || "new"}
              compactEnabled={
                isGrokProfile &&
                connected &&
                !busy &&
                contextFill >= (contextInfo.softCapPercent || 80) / 100
              }
              onCompact={sendCompact}
            />
            {isAgentProfile ? (
              <VaultSearchToggle
                on={vaultSearchOn}
                disabled={!connected}
                onToggle={toggleVaultSearch}
              />
            ) : null}
          </div>
          <div className="composer-box-anchor">
          <div
            className={`composer-box${attachBusy ? " composer-box--attach-busy" : ""}${
              dropActive ? " is-drop-target" : ""
            }`}
            onDragEnter={onMessagesDragEnter}
            onDragLeave={onMessagesDragLeave}
            onDragOver={onComposerDragOver}
            onDrop={onComposerDrop}
          >
            {pendingAttachments.length > 0 || attachBusy ? (
              <div className="attach-strip" aria-label="Anhänge für nächste Nachricht">
                {pendingAttachments.map((a) => (
                  <div
                    key={a.id || a.path}
                    className="attach-chip"
                    title={`${a.name} (${formatBytes(a.size)})`}
                  >
                    {a.previewUrl ? (
                      <img
                        className="attach-chip-thumb"
                        src={a.previewUrl}
                        alt=""
                      />
                    ) : (
                      <span className="attach-chip-icon" aria-hidden="true">
                        {isImageMime(a.mimeType) ? "🖼" : "📄"}
                      </span>
                    )}
                    <span className="attach-chip-name">{a.name}</span>
                    <button
                      type="button"
                      className="attach-chip-remove"
                      onClick={() => removePendingAttachment(a.id)}
                      title="Anhang entfernen"
                      aria-label={`${a.name} entfernen`}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {attachBusy ? (
                  <span className="attach-chip attach-chip--busy">lädt…</span>
                ) : null}
              </div>
            ) : null}
            {/* Composer card: textarea on top (grows up), toolbar stays on the bottom. */}
            <div className="composer-row">
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                multiple
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = "";
                  if (files.length) void addFiles(files);
                }}
              />
              <button
                type="button"
                className="composer-plus-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachBusy}
                title="Datei anhängen"
                aria-label="Datei anhängen"
              >
                <IconPlus size={18} />
              </button>
              <div
                className={`composer-input-wrap${
                  composerSlashHl ? " composer-input-wrap--slash-hl" : ""
                }`}
              >
                <SlashPopup
                  open={slashOpen}
                  items={slashItems}
                  selectedIndex={slashIndex}
                  query={slashQuery}
                  onSelectIndex={setSlashIndex}
                  onClose={() => setSlashOpen(false)}
                  onPick={(item) => applySlashInsert(item)}
                />
                <PromptHistoryPopup
                  open={historyOpen && !slashOpen}
                  items={historyItems}
                  selectedIndex={historyIndex ?? 0}
                  onSelectIndex={(i) => {
                    setHistoryIndex(i);
                    const t = historyItems[i];
                    if (t) setInput(t);
                  }}
                  onPick={(text) => {
                    setInput(text);
                    setHistoryOpen(false);
                    setHistoryIndex(null);
                  }}
                  onClose={() => {
                    setHistoryOpen(false);
                    setHistoryIndex(null);
                    setInput(historyDraftRef.current);
                  }}
                />
                <SlashHighlightedText
                  text={input}
                  skills={skillCatalog}
                  commands={commandCatalog}
                  className="composer-highlight"
                />
                <textarea
                  ref={composerRef}
                  className="composer-textarea--overlay"
                  value={input}
                  rows={1}
                  onChange={(e) => {
                    const v = e.target.value;
                    setInput(v);
                    syncSlashFromComposer(v, e.target.selectionStart ?? v.length);
                    requestAnimationFrame(resizeComposer);
                  }}
                  onScroll={(e) => {
                    const mirror = e.currentTarget.previousElementSibling;
                    if (
                      mirror &&
                      mirror.classList.contains("composer-highlight")
                    ) {
                      mirror.scrollTop = e.currentTarget.scrollTop;
                      mirror.scrollLeft = e.currentTarget.scrollLeft;
                    }
                  }}
                  onClick={(e) => {
                    syncSlashFromComposer(
                      e.currentTarget.value,
                      e.currentTarget.selectionStart ?? 0,
                    );
                  }}
                  onSelect={(e) => {
                    syncSlashFromComposer(
                      e.currentTarget.value,
                      e.currentTarget.selectionStart ?? 0,
                    );
                  }}
                  placeholder={composerPlaceholder}
                  enterKeyHint={seat === "phone" ? "enter" : "send"}
                  onKeyDown={(e) => {
                    if (slashOpen) {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setSlashOpen(false);
                        return;
                      }
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setSlashIndex((i) =>
                          Math.min(i + 1, Math.max(0, slashItems.length - 1)),
                        );
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setSlashIndex((i) => Math.max(i - 1, 0));
                        return;
                      }
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        const raw = e.currentTarget.value.trim();
                        if (
                          /^\/(?:rewind|undo)(?:\s|$)/i.test(raw) ||
                          /^\/(?:rename|title)\s+\S/.test(raw)
                        ) {
                          setSlashOpen(false);
                          send();
                          return;
                        }
                        const item = slashItems[slashIndex];
                        if (
                          item &&
                          /^(?:rewind|undo)$/i.test(String(item.name || ""))
                        ) {
                          setSlashOpen(false);
                          setInput("");
                          setRewindOpen(true);
                          return;
                        }
                        if (item) applySlashInsert(item.name);
                        return;
                      }
                      if (e.key === "Tab" && slashItems[slashIndex]) {
                        e.preventDefault();
                        applySlashInsert(slashItems[slashIndex].name);
                        return;
                      }
                    }
                    if (e.key === "Escape") {
                      if (historyOpen) {
                        e.preventDefault();
                        setHistoryOpen(false);
                        setHistoryIndex(null);
                        setInput(historyDraftRef.current);
                        return;
                      }
                      if (input.trim()) {
                        e.preventDefault();
                        setInput("");
                        rewindEscAtRef.current = 0;
                        return;
                      }
                      if (!busy && rewindPoints.length) {
                        const now = Date.now();
                        if (now - rewindEscAtRef.current < 800) {
                          e.preventDefault();
                          rewindEscAtRef.current = 0;
                          setRewindOpen(true);
                        } else {
                          rewindEscAtRef.current = now;
                        }
                      }
                      return;
                    }
                    if (
                      (e.key === "ArrowUp" || e.key === "ArrowDown") &&
                      !e.altKey &&
                      (historyOpen ||
                        (e.key === "ArrowUp" &&
                          !input.trim() &&
                          (e.currentTarget.selectionStart ?? 0) === 0))
                    ) {
                      const list =
                        historyItems.length
                          ? historyItems
                          : loadPromptHistory(agent?.id || "grok");
                      if (!list.length) return;
                      if (!historyOpen) {
                        historyDraftRef.current = input;
                        setHistoryItems(list);
                      }
                      e.preventDefault();
                      const step = stepPromptHistory(
                        list,
                        historyOpen ? historyIndex : null,
                        e.key === "ArrowDown" ? "down" : "up",
                      );
                      if (step.closed) {
                        setHistoryOpen(false);
                        setHistoryIndex(null);
                        setInput(historyDraftRef.current);
                        return;
                      }
                      setHistoryOpen(true);
                      setHistoryItems(list);
                      setHistoryIndex(step.index);
                      setInput(step.text || "");
                      return;
                    }
                    if (e.key !== "Enter" || e.shiftKey) return;
                    // Phone: keyboard Return = newline. Send is the head button
                    // (or ⌘/Ctrl+Enter on a hardware keyboard).
                    if (seat === "phone" && !e.metaKey && !e.ctrlKey) return;
                    e.preventDefault();
                    send();
                  }}
                />
              </div>
              <div className="composer-mode-wrap" ref={modeMenuRef}>
                <button
                  type="button"
                  className={`composer-mode-btn${modeMenuOpen ? " is-open" : ""}`}
                  aria-haspopup="listbox"
                  aria-expanded={modeMenuOpen}
                  aria-label={`Modus: ${composerActionLabel(sendAction)}`}
                  title="Sendemodus"
                  disabled={!connected}
                  onClick={() => setModeMenuOpen((o) => !o)}
                >
                  <span className="composer-mode-label">
                    {composerActionLabel(sendAction)}
                  </span>
                  <span className="composer-mode-chevron" aria-hidden="true">
                    ▾
                  </span>
                </button>
                {modeMenuOpen ? (
                  <div
                    className="composer-mode-menu"
                    role="listbox"
                    aria-label="Sendemodus"
                  >
                    {[
                      {
                        id: "chat",
                        label: "Chat",
                        title: `Normale Nachricht an ${agentLabel}`,
                      },
                      {
                        id: "deep-search",
                        label: "Deep Search",
                        title:
                          "TUI /deep-research — Hintergrund-Recherche mit Quellen",
                      },
                      {
                        id: "fork",
                        label: "Fork",
                        title:
                          "Session branchen (TUI /fork). Text = optionale Directive",
                      },
                      {
                        id: "swarm",
                        label: "Swarm",
                        title:
                          "°_Agent und ^_Code: Planer, Suche, Synthese mit Quellen",
                      },
                    ].map((opt) => {
                      const blocked =
                        (opt.id === "deep-search" && !canDeepSearch) ||
                        (opt.id === "swarm" && !canSwarmAction);
                      const active = sendAction === opt.id;
                      const blockedTitle =
                        opt.id === "swarm"
                          ? swarmBlockedReason
                          : unavailableFor("Deep Search");
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={`composer-mode-option${
                            active ? " is-active" : ""
                          }${blocked ? " is-blocked" : ""}`}
                          title={blocked ? blockedTitle : opt.title}
                          disabled={!connected || blocked}
                          onClick={() => {
                            if (blocked) return;
                            setSendAction(opt.id);
                            setModeMenuOpen(false);
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className={`voice-mic-btn${recording ? " is-recording" : ""}${
                  sttBusy ? " is-busy" : ""
                }`}
                title={
                  recording
                    ? "Aufnahme stoppen (STT)"
                    : sttBusy
                      ? "Transkript wird erstellt…"
                      : voiceAvailable
                        ? "Diktieren (STT)"
                        : voiceHint || "STT: XAI- oder OpenRouter-Key"
                }
                aria-label={recording ? "Aufnahme stoppen" : "Diktieren"}
                aria-pressed={recording}
                disabled={sttBusy}
                onClick={toggleRecording}
              >
                <IconMic size={18} />
              </button>
              <div className="composer-send-stack">
              <button
                type="button"
                className={`send${showWorking ? " send--working" : " send--idle"}${
                  snackAlive && !showWorking ? " send--morph-out" : ""
                }${showStuffed ? " send--stuffed" : ""}`}
                onPointerDown={(e) => {
                  if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
                  // Keep composer focused so iOS doesn't drop the tap; click may not follow.
                  e.preventDefault();
                  sendPointerArmedRef.current = true;
                  onSendButton();
                }}
                onClick={() => {
                  if (sendPointerArmedRef.current) {
                    sendPointerArmedRef.current = false;
                    return;
                  }
                  onSendButton();
                }}
                disabled={
                  snackDemo
                    ? false
                    : !connected ||
                      cancelling ||
                      attachBusy ||
                      (sendAction !== "fork" &&
                        !input.trim() &&
                        pendingAttachments.length === 0 &&
                        !isWorking)
                }
                title={
                  showStuffed
                    ? snackDemo
                      ? "DEMO: Glyph got lost… in space"
                      : "Glyph got lost… in space — tippen = Stopp · dann neu"
                    : isWorking
                      ? input.trim() || pendingAttachments.length
                        ? seat === "phone"
                          ? "In Warteschlange"
                          : "In Warteschlange (Enter)"
                        : cancelling
                          ? "Bricht ab…"
                          : "Stopp: Snack / leerer Klick — Abbrechen"
                      : sendAction === "deep-search"
                        ? seat === "phone"
                          ? "Deep Search starten"
                          : "Deep Search starten (Enter)"
                        : sendAction === "swarm"
                          ? seat === "phone"
                            ? "Swarm starten"
                            : "Swarm starten (Enter)"
                          : sendAction === "fork"
                            ? seat === "phone"
                              ? "Session forken"
                              : "Session forken (Enter)"
                            : seat === "phone"
                              ? "Senden"
                              : "Senden (Enter)"
                }
                aria-label={
                  showStuffed
                    ? "Glyph got lost… in space — Antwort stoppen"
                    : isWorking
                      ? input.trim() || pendingAttachments.length
                        ? "In Warteschlange"
                        : "Antwort stoppen"
                      : sendAction === "deep-search"
                        ? "Deep Search starten"
                        : sendAction === "swarm"
                          ? "Swarm starten"
                          : sendAction === "fork"
                            ? "Fork starten"
                            : "Senden"
                }
                aria-live={showWorking ? "polite" : undefined}
              >
                <span className="send-face send-face--head" aria-hidden="true">
                  <span className="send-icon">
                    <SendSnake face={sendHeadFace} />
                  </span>
                </span>
                <span className="send-face send-face--snack" aria-hidden="true">
                  {(showWorking || snackAlive) && (
                    <span className="send-snack">
                      <SnackBoard
                        running={showWorking || snackAlive}
                        stuffed={showStuffed}
                        onStopClick={() => {
                          if (snackDemo) return;
                          if (!cancelling) void cancelTurn();
                        }}
                      />
                    </span>
                  )}
                </span>
              </button>
              </div>
            </div>
          </div>
          </div>
        </footer>
      </div>

      {webSurface && webPasswordOpen ? (
        <WebPasswordDialog onClose={() => setWebPasswordOpen(false)} />
      ) : null}

      {permissionReq ? (
        <PermissionDialog req={permissionReq} onRespond={respondPermission} />
      ) : null}

      <RewindPicker
        open={rewindOpen}
        points={rewindPoints}
        busy={rewindBusy}
        onClose={() => setRewindOpen(false)}
        onPick={(p) => requestRewind(p.index, p.text)}
      />

      {showLage && !webSurface ? (
        <Suspense
          fallback={<LageFallback onClose={() => setShowLage(false)} />}
        >
          <GraphModal
            open={showLage}
            onClose={() => setShowLage(false)}
            focus={lageFocus}
            activeProfile={agent?.id || ""}
            working={isWorking}
          />
        </Suspense>
      ) : null}
      {showLegend ? (
        <Suspense fallback={<div className="overview-scrim" aria-busy="true" />}>
          <CommandLegend
            open={showLegend}
            onClose={() => setShowLegend(false)}
            initialTab={legendTab}
            agentCommands={agentCommands}
            agentProfileId={agent?.id || ""}
            onOpenLage={(which) => {
              setShowLegend(false);
              setLageFocus(which || "");
              setShowLage(true);
            }}
          />
        </Suspense>
      ) : null}
      <ExtensionsModal
        open={showExtensions}
        onClose={() => setShowExtensions(false)}
        skills={skills}
        agentCommands={agentCommands}
        profileLabel={agentLabel}
        skillsHint={skillsHint}
        loading={skillsLoading}
        error={skillsError}
        onPick={(item) => {
          if (isUiReloadItem(item)) {
            hardReloadUi();
            return;
          }
          const el = composerRef.current;
          const cursor =
            el && typeof el.selectionStart === "number"
              ? el.selectionStart
              : input.length;
          const token = slashTokenAt(input, cursor);
          if (token) {
            applySlashInsert(item.name);
            return;
          }
          const name = String(item.name || "").replace(/^\//, "");
          const inserted = `/${name} `;
          const next =
            input.slice(0, cursor) + inserted + input.slice(cursor);
          setInput(next);
          requestAnimationFrame(() => {
            const ta = composerRef.current;
            if (!ta) return;
            ta.focus();
            const pos = cursor + inserted.length;
            try {
              ta.setSelectionRange(pos, pos);
            } catch {
              /* ignore */
            }
          });
        }}
      />
      <CommandOverview
        open={showOverview}
        onClose={() => setShowOverview(false)}
        onOpenSession={handleOpenSession}
      />
      {showCalendar ? (
        <Suspense fallback={<div className="overview-scrim" aria-busy="true" />}>
          <ActivityCalendar
            open={showCalendar}
            onClose={() => setShowCalendar(false)}
            onOpenSession={handleOpenSession}
            onUseTask={(prompt) => {
              setInput(prompt);
              composerRef.current?.focus();
            }}
            canSeeActivity={canSeeActivity}
          />
        </Suspense>
      ) : null}


    </div>
  );
}
