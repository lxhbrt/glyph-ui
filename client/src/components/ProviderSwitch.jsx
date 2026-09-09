/**
 * ProviderSwitch — kompakter Header-Umschalter (Direkt/Hybrid/Fallback)
 * für °_Agent & ^_Code. Schreibt direkt via PUT /api/bindings.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useEffect, useRef, useState } from "react";
import { normalizeProvider } from "../utils/bindingsModels.js";

const OPTIONS = [
  { mode: "direct", label: "Direkt" },
  { mode: "hybrid", label: "Hybrid" },
  { mode: "openrouter", label: "Fallback" },
];

function optionLabel(mode, isPeak) {
  if (mode === "hybrid") return isPeak ? "Hybrid · OR" : "Hybrid";
  if (mode === "openrouter") return "Fallback";
  return "Direkt";
}

export default function ProviderSwitch({
  provider = "hybrid",
  isPeak = false,
  mismatch = false,
  disabled = false,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = normalizeProvider(provider);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="provider-switch" ref={ref}>
      <button
        type="button"
        className={`provider-switch-btn${mismatch ? " is-mismatch" : ""}`}
        disabled={disabled}
        title={
          mismatch
            ? "Provider weicht vom aktiven Agent ab — klicken zum Umschalten"
            : "Provider: Direkt / Hybrid / Fallback"
        }
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="provider-switch-dot" aria-hidden="true" />
        {optionLabel(current, isPeak)}
        <span className="provider-switch-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <ul className="provider-switch-menu" role="listbox">
          {OPTIONS.map((o) => {
            const active = current === o.mode;
            return (
              <li key={o.mode} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={`provider-switch-opt${active ? " is-on" : ""}`}
                  onClick={() => {
                    setOpen(false);
                    if (!active) onChange?.(o.mode);
                  }}
                >
                  <span className="provider-switch-dot" aria-hidden="true" />
                  {o.label}
                  {o.mode === "hybrid" && isPeak ? (
                    <span className="provider-switch-peak">Peak → OR</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
