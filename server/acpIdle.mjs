/**
 * Idle-Timer für einen ACP session/prompt-Turn.
 *
 * Wall-Clock ab Start killt lange ^_Code-Ketten (viele LLM-Runden).
 * Stattdessen: Deadline nach jeder Stream-Aktivität neu; Pause während
 * der Glyph-Freigabe (Nutzer darf denken, ohne den Turn zu sprengen).
 */
export function createIdleTimer({ timeoutMs, onFire } = {}) {
  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error("createIdleTimer: timeoutMs must be a positive number");
  }
  let timer = null;
  let fired = false;

  function pause() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function arm() {
    if (fired) return;
    pause();
    timer = setTimeout(() => {
      timer = null;
      if (fired) return;
      fired = true;
      try {
        onFire?.();
      } catch {
        /* caller handles abort */
      }
    }, ms);
  }

  function stop() {
    pause();
  }

  return {
    arm,
    pause,
    stop,
    get fired() {
      return fired;
    },
  };
}
