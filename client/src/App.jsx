/**
 * Glyph UI — Build Term for Grok (ACP browser UI)
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarkdownBody } from "./components/MarkdownBody.jsx";
import { SnackBoard, SnackScrollbar } from "./components/Snack.jsx";
import { CommandLegend } from "./components/CommandLegend.jsx";
import { CommandOverview } from "./components/CommandOverview.jsx";
import { ActivityCalendar } from "./components/ActivityCalendar.jsx";
import {
  IconSearch,
  IconCompose,
  IconCommands,
  IconBook,
  IconCalendar,
  IconWiki,
  IconWorkspace,
  IconTheme,
  IconMic,
  IconSpeaker,
  IconSpeakerOff,
  IconRefresh,
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
import { upsertToolMessage } from "./utils/messages.js";
import { loadPersistedQueue, persistQueue } from "./utils/queue.js";
import { pickRecorderMime, textForSpeech } from "./utils/voice.js";

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
  const drainingRef = useRef(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [cwd, setCwd] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  /** Ready attachments for the next send (after POST /api/attachments). */
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [attachBusy, setAttachBusy] = useState(false);
  /** Visual drop target on the message list (drag counter avoids flicker). */
  const [dropActive, setDropActive] = useState(false);
  const dropDepthRef = useRef(0);
  /** Composer action: chat | deep-search | fork (TUI-aligned, not thinking toggle). */
  const [sendAction, setSendAction] = useState(() => {
    try {
      const v = localStorage.getItem("gbt-action");
      if (v === "deep-search" || v === "fork" || v === "chat") return v;
    } catch {
      /* ignore */
    }
    return "chat";
  });
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("gbt-theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [wikiRoot, setWikiRoot] = useState("");
  const [showOverview, setShowOverview] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [legendTab, setLegendTab] = useState("handbook");
  const [showCalendar, setShowCalendar] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // —— Grok Voice (xAI STT / TTS) ——
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voiceHint, setVoiceHint] = useState("");
  const [voiceId, setVoiceId] = useState(() => {
    try {
      return localStorage.getItem("gbt-voice-id") || "eve";
    } catch {
      return "eve";
    }
  });
  const [voiceList, setVoiceList] = useState([
    { voice_id: "eve", name: "Eve" },
    { voice_id: "ara", name: "Ara" },
    { voice_id: "rex", name: "Rex" },
    { voice_id: "sal", name: "Sal" },
    { voice_id: "leo", name: "Leo" },
  ]);
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
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => {
        if (j.wikiRoot) setWikiRoot(j.wikiRoot);
        if (j.cwd) setCwd(j.cwd);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/voice/status");
        const j = await res.json();
        if (cancelled) return;
        setVoiceAvailable(Boolean(j.available));
        setVoiceHint(j.hint || "");
        if (j.defaults?.voiceId && !localStorage.getItem("gbt-voice-id")) {
          setVoiceId(j.defaults.voiceId);
        }
        if (j.available) {
          try {
            const vr = await fetch("/api/tts/voices");
            const vj = await vr.json();
            if (!cancelled && Array.isArray(vj.voices) && vj.voices.length) {
              setVoiceList(vj.voices);
            }
          } catch {
            /* keep defaults */
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
    setSpeakingId(null);
    setTtsBusyId(null);
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
  /** Inner content wrapper — ResizeObserver keeps stick-to-bottom while streaming grows. */
  const messagesContentRef = useRef(null);
  const assistantBuf = useRef("");
  const thoughtBuf = useRef("");
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

  // Track pin from user scroll (SnackScrollbar also drives scrollTop)
  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;

    const onScroll = () => {
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
          next[next.length - 1] = { ...last, text };
          return next;
        }
        next.push({
          id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role,
          text,
          streaming: true,
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
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
    assistantBuf.current = "";
    thoughtBuf.current = "";
  }, []);

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
    let closed = false;
    let retryTimer;
    let ws;

    const connect = async () => {
      if (closed) return;
      let url;
      try {
        url = await wsUrl();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "WebSocket-Token konnte nicht geladen werden",
        );
        setConnected(false);
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
          if (msg.cwd) setCwd(msg.cwd);
          if (msg.connected) setError("");
          // "opened" reset is handled by onOpenSession with transcript;
          // only clear on plain Neue-Session reset.
          if (msg.reset && !msg.opened) {
            setMessages([]);
            assistantBuf.current = "";
            thoughtBuf.current = "";
            busyRef.current = false;
            setBusy(false);
            setCancelling(false);
            queueRef.current = [];
            setQueue([]);
            return;
          }
          // Server became idle without turn_done (or after it) → drain queue
          // Never drain while cancelling is still true (busy should stay true).
          if (wasBusy && !nextBusy && !msg.cancelling) {
            setCancelling(false);
            scheduleDrainQueue();
          }
          return;
        }

        if (msg.type === "assistant_chunk") {
          busyRef.current = true;
          streamingRef.current = true;
          setBusy(true);
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
          thoughtBuf.current += msg.text || "";
          upsertStreaming("thought", thoughtBuf.current, { replaceLast: true });
          return;
        }

        if (msg.type === "system") {
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
          setMessages((prev) => upsertToolMessage(prev, msg));
          scrollToBottom();
          return;
        }



        if (msg.type === "turn_done") {
          finalizeStreaming();
          busyRef.current = false;
          setBusy(false);
          setCancelling(false);
          // Auto-send next parked follow-up only after the turn truly ended
          scheduleDrainQueue();
          return;
        }

        if (msg.type === "error") {
          setError(msg.message || "Unbekannter Fehler");
          finalizeStreaming();
          busyRef.current = false;
          setBusy(false);
          setCancelling(false);
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
  }, [finalizeStreaming, scheduleDrainQueue, scrollToBottom, upsertStreaming]);

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
    ({ text, action, displayText, attachments }) => {
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
      setError("");
      busyRef.current = true;
      streamingRef.current = false;
      setBusy(true);
      setCancelling(false);
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
      } else if (action === "fork") {
        wsRef.current.send(JSON.stringify({ type: "fork", text }));
      } else {
        wsRef.current.send(
          JSON.stringify({
            type: "chat",
            text,
            ...(wire.length ? { attachments: wire } : {}),
          }),
        );
      }
    },
    [scrollToBottom],
  );

  const dispatchQueuedRef = useRef(dispatchPayload);
  dispatchQueuedRef.current = dispatchPayload;

  const buildDisplayText = useCallback((action, text, attachments = []) => {
    const att = formatAttachmentSummary(attachments);
    if (action === "deep-search") {
      const body = text || att || "…";
      return att && text ? `🔍 Deep Search: ${text}\n${att}` : `🔍 Deep Search: ${body}`;
    }
    if (action === "fork") {
      return text ? `⑂ Fork: ${text}` : "⑂ Fork (Session branchen)";
    }
    if (text && att) return `${text}\n${att}`;
    return text || att || "";
  }, []);

  const send = useCallback(() => {
    const text = input.trim();
    if (!connected || !wsRef.current) return;
    if (attachBusy) return;

    // Fork may run without a directive; chat & deep-search need text and/or files.
    const atts =
      sendAction === "fork" ? [] : toWireAttachments(pendingAttachments);
    if (sendAction !== "fork" && !text && !atts.length) return;

    const displayText = buildDisplayText(sendAction, text, atts);
    const payload = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      action: sendAction,
      displayText,
      ...(atts.length ? { attachments: atts } : {}),
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
    dispatchPayload(payload);
  }, [
    attachBusy,
    busy,
    clearPendingAttachments,
    connected,
    input,
    messages,
    pendingAttachments,
    scrollToBottom,
    sendAction,
    buildDisplayText,
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
        const t = m.text || "";
        if (/·\s*(completed|failed|cancelled)\s*$/i.test(t)) return m;
        if (/·\s*(pending|in_progress|running)\s*$/i.test(t)) {
          return {
            ...m,
            text: t.replace(
              /·\s*(pending|in_progress|running)\s*$/i,
              "· cancelled",
            ),
          };
        }
        return m;
      }),
    );

    try {
      // Prefer HTTP so cancel is reliable even if WS message handler is blocked
      // on an in-flight chat await (server still accepts cancel in parallel).
      const res = await fetch("/api/bridge/cancel", { method: "POST" });
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
  }, [busy, cancelling, finalizeStreaming, scheduleDrainQueue]);

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
      const res = await fetch("/api/bridge/reconnect", { method: "POST" });
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
      const res = await fetch("/api/bridge/disconnect", { method: "POST" });
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

  const visibleMessages = messages;

  // Working UI: server busy OR any in-flight stream (thought / answer / tools)
  const isWorking = useMemo(
    () => busy || messages.some((m) => m.streaming),
    [busy, messages],
  );

  // Keep streaming mirror in sync (e.g. after history load / finalize)
  useEffect(() => {
    streamingRef.current = messages.some((m) => m.streaming);
  }, [messages]);

  // Safety net: if idle with parked items, drain (covers missed turn_done)
  useEffect(() => {
    if (!isWorking && queue.length > 0 && connected) {
      scheduleDrainQueue();
    }
  }, [isWorking, queue.length, connected, scheduleDrainQueue]);
  const workingSeconds = useWorkingSeconds(isWorking);

  /** Short path for the header (home → ~). Full path stays in title tooltip. */
  const cwdLabel = useMemo(() => {
    if (!cwd) return "";
    // /Users/name or /home/name → ~/…
    const tilde = cwd.replace(/^\/(?:Users|home)\/[^/]+/, "~");
    if (tilde.length <= 36) return tilde;
    const parts = tilde.split("/").filter(Boolean);
    if (parts.length <= 2) return tilde;
    return `…/${parts.slice(-2).join("/")}`;
  }, [cwd]);

  const composerPlaceholder = useMemo(() => {
    if (!connected) return "Warte auf Grok-Verbindung…";
    if (cancelling) {
      return `Abbruch… ${workingSeconds}s — warte auf sicheres Turn-Ende`;
    }
    if (isWorking) {
      return `Grok arbeitet… ${workingSeconds}s — Enter → Warteschlange · Snack = Stopp`;
    }
    if (sendAction === "deep-search") {
      return "Deep Search Query… z. B. Compare Postgres 17 vs MySQL 9";
    }
    if (sendAction === "fork") {
      return "Optional: Directive für den Fork… (leer = nur Session branchen)";
    }
    return "Nachricht an Grok… Screenshot paste · Datei droppen";
  }, [connected, isWorking, cancelling, sendAction, workingSeconds]);

  // Keep Snack mounted briefly after work ends so ↵←Snack morph can play
  const [snackAlive, setSnackAlive] = useState(false);
  useEffect(() => {
    if (isWorking) {
      setSnackAlive(true);
      return undefined;
    }
    if (!snackAlive) return undefined;
    const t = setTimeout(() => setSnackAlive(false), 520);
    return () => clearTimeout(t);
  }, [isWorking, snackAlive]);

  return (
    <div className="app">
      <aside className="side-rail" aria-label="Hauptaktionen">
        <button
          type="button"
          className="side-rail-btn"
          onClick={() => setShowOverview(true)}
          title="Suche & Sessions"
          aria-label="Suche und Sessions"
        >
          <IconSearch />
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
          onClick={() => {
            setLegendTab("commands");
            setShowLegend(true);
          }}
          title="Befehle"
          aria-label="Befehle"
        >
          <IconCommands />
        </button>
        <button
          type="button"
          className="side-rail-btn"
          onClick={() => setShowCalendar(true)}
          title="Aktivitäts-Kalender"
          aria-label="Kalender"
        >
          <IconCalendar />
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
          onClick={() => {
            // Cache-bust reload (ersetzt ⌘⇧R im Alltag)
            const url = new URL(window.location.href);
            url.searchParams.set("_r", String(Date.now()));
            window.location.replace(url.toString());
          }}
          title="UI neu laden (statt ⌘⇧R)"
          aria-label="Refresh"
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
          title="Kurzhandbuch"
          aria-label="Kurzhandbuch öffnen"
        >
          <IconBook />
        </button>
      </aside>

      <div className="app-main">
        <header className="top">
          <div>
            <h1>Glyph</h1>
            <p
              className="sub"
              title={[sessionId, cwd].filter(Boolean).join("\n") || undefined}
            >
              Build Term for Grok · ACP
              {sessionId ? ` · ${sessionId.slice(0, 8)}` : ""}
              {cwdLabel ? ` · ${cwdLabel}` : ""}
            </p>
          </div>
          <div className="top-actions">
            <button
              type="button"
              className={`pill pill-btn ${
                reconnecting ? "pending" : connected ? "ok" : "bad"
              }`}
              disabled={reconnecting}
              title={
                reconnecting
                  ? connected
                    ? "Grok-Agent wird beendet…"
                    : "Grok-Agent wird gestartet…"
                  : connected
                    ? "Grok läuft — klicken zum Beenden (/quit)"
                    : "Grok offline — klicken zum Verbinden"
              }
              onClick={() => void toggleGrokConnection()}
            >
              {reconnecting
                ? connected
                  ? "trennt…"
                  : "verbindet…"
                : connected
                  ? "verbunden"
                  : "offline"}
            </button>
          </div>
        </header>

        {error ? <div className="banner">{error}</div> : null}

        <div className="messages-shell">
          <main
            className={`messages messages--borderless messages--snack-scroll${
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
                  Schreib eine Nachricht — Glyph verbindet lokal per ACP mit Grok Build.
                  <br />
                  <span className="empty-soft">
                    Screenshot <strong>einfügen</strong> · Datei hierher{" "}
                    <strong>ziehen</strong> · Sessions: <strong>Lupe</strong>
                  </span>
                </div>
              ) : (
                visibleMessages.map((m) => (
                  <article key={m.id} className={`msg msg-${m.role}`}>
                    <div className="role role-row">
                      <span>
                        {m.role === "user"
                          ? "Du"
                          : m.role === "assistant"
                            ? "Grok"
                            : m.role === "thought"
                              ? "Thinking"
                              : m.role === "system"
                                ? "System"
                                : "Tool"}
                        {m.streaming ? " …" : ""}
                      </span>
                      {m.role === "assistant" && !m.streaming && m.text?.trim() ? (
                        <button
                          type="button"
                          className={`msg-speak-btn${
                            speakingId === m.id ? " is-speaking" : ""
                          }${ttsBusyId === m.id ? " is-busy" : ""}`}
                          title={
                            speakingId === m.id
                              ? "Vorlesen stoppen"
                              : ttsBusyId === m.id
                                ? "Erzeuge Sprache…"
                                : voiceAvailable
                                  ? "Mit Grok TTS vorlesen"
                                  : voiceHint || "TTS: XAI_API_KEY setzen"
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
                            <IconSpeakerOff size={14} />
                          ) : (
                            <IconSpeaker size={14} />
                          )}
                        </button>
                      ) : null}
                    </div>
                    {m.role === "user" && m.attachments?.length ? (
                      <ul className="msg-attachments" aria-label="Anhänge">
                        {m.attachments.map((a) => (
                          <li
                            key={a.id || a.path || a.name}
                            className="msg-attach-chip"
                            title={a.name}
                          >
                            <span className="msg-attach-icon" aria-hidden="true">
                              {isImageMime(a.mimeType) ? "🖼" : "📄"}
                            </span>
                            <span className="msg-attach-name">{a.name}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {m.text ? <MarkdownBody text={m.text} /> : null}
                  </article>
                ))
              )}
            </div>
            {dropActive ? (
              <div className="messages-drop-hint" aria-hidden="true">
                Datei hier ablegen
              </div>
            ) : null}
          </main>
          <SnackScrollbar
            scrollRef={listRef}
            deps={[visibleMessages.length, isWorking]}
          />
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
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={composerPlaceholder}
              rows={3}
              disabled={!connected}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div className="composer-toolbar">
              <div className="composer-tools">
                <div
                  className="action-picker"
                  role="radiogroup"
                  aria-label="Aktion"
                >
                  {[
                    {
                      id: "chat",
                      label: "Chat",
                      title: "Normale Nachricht an Grok",
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
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={sendAction === opt.id}
                      className={`action-picker-btn${
                        sendAction === opt.id ? " action-picker-btn--active" : ""
                      }`}
                      title={opt.title}
                      disabled={!connected}
                      onClick={() => setSendAction(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="voice-controls" aria-label="Sprache">
                  <button
                    type="button"
                    className={`voice-mic-btn${recording ? " is-recording" : ""}${
                      sttBusy ? " is-busy" : ""
                    }`}
                    title={
                      recording
                        ? "Aufnahme stoppen (Grok STT)"
                        : sttBusy
                          ? "Transkript wird erstellt…"
                          : voiceAvailable
                            ? "Diktieren mit Grok STT"
                            : voiceHint || "STT: XAI_API_KEY setzen"
                    }
                    aria-label={recording ? "Aufnahme stoppen" : "Diktieren"}
                    aria-pressed={recording}
                    disabled={sttBusy}
                    onClick={toggleRecording}
                  >
                    <IconMic size={18} />
                    <span className="voice-mic-label">
                      {recording ? "Stop" : sttBusy ? "…" : "Mic"}
                    </span>
                  </button>
                  <label className="voice-select-wrap" title="TTS-Stimme">
                    <span className="sr-only">Stimme</span>
                    <select
                      className="voice-select"
                      value={voiceId}
                      onChange={(e) => setVoiceId(e.target.value)}
                      disabled={Boolean(ttsBusyId) || Boolean(speakingId)}
                      aria-label="TTS-Stimme"
                    >
                      {voiceList.map((v) => {
                        const id = v.voice_id || v.id || v.name;
                        const label = v.name || id;
                        return (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>
              </div>
              <button
                type="button"
                className={`send${isWorking ? " send--working" : " send--idle"}${
                  snackAlive && !isWorking ? " send--morph-out" : ""
                }`}
                onClick={() => {
                  // While working: text/attachments → queue; empty → stop (Snack)
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
                  send();
                }}
                disabled={
                  !connected ||
                  cancelling ||
                  attachBusy ||
                  (sendAction !== "fork" &&
                    !input.trim() &&
                    pendingAttachments.length === 0 &&
                    !isWorking)
                }
                title={
                  isWorking
                    ? input.trim() || pendingAttachments.length
                      ? "In Warteschlange (Enter)"
                      : cancelling
                        ? "Bricht ab…"
                        : "Stopp: Snack / leerer Klick — Abbrechen"
                    : sendAction === "deep-search"
                      ? "Deep Search starten (Enter)"
                      : sendAction === "fork"
                        ? "Session forken (Enter)"
                        : "Senden (Enter)"
                }
                aria-label={
                  isWorking
                    ? input.trim() || pendingAttachments.length
                      ? "In Warteschlange"
                      : "Antwort stoppen"
                    : sendAction === "deep-search"
                      ? "Deep Search starten"
                      : sendAction === "fork"
                        ? "Fork starten"
                        : "Senden"
                }
                aria-live={isWorking ? "polite" : undefined}
              >
                <span className="send-face send-face--enter" aria-hidden="true">
                  <span className="send-icon">↵</span>
                </span>
                <span className="send-face send-face--snack" aria-hidden="true">
                  {(isWorking || snackAlive) && (
                    <span className="send-snack">
                      <SnackBoard
                        running={isWorking || snackAlive}
                        onStopClick={() => {
                          if (!cancelling) void cancelTurn();
                        }}
                      />
                    </span>
                  )}
                </span>
              </button>
            </div>
          </div>
        </footer>
      </div>

      <CommandLegend
        open={showLegend}
        onClose={() => setShowLegend(false)}
        initialTab={legendTab}
      />
      <CommandOverview
        open={showOverview}
        onClose={() => setShowOverview(false)}
        onOpenSession={handleOpenSession}
      />
      <ActivityCalendar
        open={showCalendar}
        onClose={() => setShowCalendar(false)}
        onOpenSession={handleOpenSession}
      />
    </div>
  );
}
