/**
 * ^_Code Freigabe-Dialog: Einmal / Auftrag / Task.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { handleDialogTab } from "../utils/focusTrap.js";
import {
  GRANT_CLASSES,
  classesFromSuggested,
  encodeGrantOptionId,
  prefixesFromSuggested,
} from "../utils/codeGrants.js";

/**
 * @param {{
 *   req: {
 *     id: string,
 *     title?: string,
 *     kind?: string,
 *     preview?: string,
 *     options?: Array<{ optionId: string, name?: string, kind?: string }>,
 *     grant?: object,
 *   },
 *   onRespond: (optionId: string) => void,
 * }} props
 */
export function PermissionDialog({ req, onRespond }) {
  const dialogRef = useRef(null);
  const grant = req.grant && typeof req.grant === "object" ? req.grant : {};
  const suggested = grant.suggested || {};
  const requiresGrant = Boolean(grant.requires_grant) || grant.grant_scopes;
  const elevated = req.kind === "execute" && String(req.title || "").includes("·");
  const outside = Boolean(grant.outside_task);
  const hint = String(grant.hint || "").trim();

  const [label, setLabel] = useState(() => String(suggested.label || ""));
  const [prefixesText, setPrefixesText] = useState(() =>
    prefixesFromSuggested(suggested).join("\n"),
  );
  const [classes, setClasses] = useState(() =>
    new Set(classesFromSuggested(suggested)),
  );

  useEffect(() => {
    setLabel(String(suggested.label || ""));
    setPrefixesText(prefixesFromSuggested(suggested).join("\n"));
    setClasses(new Set(classesFromSuggested(suggested)));
    // New request only — not while the user edits the scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- req.id is the request identity
  }, [req.id]);

  useEffect(() => {
    const root = dialogRef.current;
    const first =
      root?.querySelector(".permission-scope-field input") ||
      root?.querySelector(".permission-btn--allow") ||
      root?.querySelector("button");
    first?.focus?.();
    function onKey(e) {
      if (handleDialogTab(root, e)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onRespond("reject-once");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req.id, onRespond]);

  const spec = useMemo(() => {
    const path_prefixes = prefixesText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      label: label.trim(),
      path_prefixes: path_prefixes.length ? path_prefixes : ["."],
      action_classes: GRANT_CLASSES.map((g) => g.id).filter((id) =>
        classes.has(id),
      ),
      workspace_root: suggested.workspace_root || "",
    };
  }, [label, prefixesText, classes, suggested.workspace_root]);

  const kindLine = elevated
    ? "Elevated Shell — nur diese Aktion"
    : requiresGrant
      ? outside
        ? "Außerhalb des aktiven Tasks"
        : req.kind === "execute"
          ? "Shell-Befehl"
          : "Änderungssatz"
      : req.kind === "execute"
        ? "Shell-Befehl"
        : req.kind === "edit"
          ? "Datei schreiben"
          : "Aktion";

  function send(scope) {
    if (scope === "reject") {
      onRespond("reject-once");
      return;
    }
    if (scope === "task") {
      onRespond(encodeGrantOptionId("task", spec));
      return;
    }
    onRespond(encodeGrantOptionId(scope));
  }

  const showGrantButtons = requiresGrant && !elevated;
  const taskReady =
    Boolean(spec.label) && Array.isArray(spec.action_classes) && spec.action_classes.length > 0;

  return (
    <div
      className="permission-modal-backdrop"
      role="presentation"
    >
      <div
        className="permission-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-modal-title"
      >
        <h2 id="permission-modal-title">Freigabe · {req.title}</h2>
        <p className="permission-modal-kind">
          {kindLine}
          {" · "}Profil ^_Code
        </p>
        {hint ? <p className="permission-modal-hint">{hint}</p> : null}
        {req.preview ? (
          <pre className="permission-modal-preview">{req.preview}</pre>
        ) : null}

        {showGrantButtons ? (
          <fieldset className="permission-scope">
            <legend>Task-Scope</legend>
            <label className="permission-scope-field">
              Name
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
                placeholder="z. B. Dark Mode"
              />
            </label>
            <label className="permission-scope-field">
              Pfade
              <textarea
                value={prefixesText}
                onChange={(e) => setPrefixesText(e.target.value)}
                rows={2}
                spellCheck={false}
              />
            </label>
            <div className="permission-scope-classes">
              {GRANT_CLASSES.map((g) => (
                <label key={g.id} className="permission-scope-check">
                  <input
                    type="checkbox"
                    checked={classes.has(g.id)}
                    onChange={() => {
                      setClasses((prev) => {
                        const next = new Set(prev);
                        if (next.has(g.id)) next.delete(g.id);
                        else next.add(g.id);
                        return next;
                      });
                    }}
                  />
                  {g.label}
                </label>
              ))}
              <p className="permission-scope-note">
                Kein Netzwerk, kein Install, kein Commit — immer einzeln.
              </p>
            </div>
          </fieldset>
        ) : null}

        <div className="permission-modal-actions">
          {showGrantButtons ? (
            <>
              <button
                type="button"
                className="permission-btn permission-btn--allow"
                onClick={() => send("once")}
              >
                Einmal
              </button>
              <button
                type="button"
                className="permission-btn permission-btn--quiet"
                onClick={() => send("auftrag")}
              >
                Für Auftrag
              </button>
              <button
                type="button"
                className="permission-btn permission-btn--quiet"
                disabled={!taskReady}
                title={
                  taskReady
                    ? "Task-Freigabe mit dem Scope oben"
                    : "Name und mindestens eine Aktionsklasse"
                }
                onClick={() => send("task")}
              >
                Für Task
              </button>
              <button
                type="button"
                className="permission-btn permission-btn--reject"
                onClick={() => send("reject")}
              >
                Ablehnen
              </button>
            </>
          ) : (
            (req.options?.length
              ? req.options
              : [
                  { optionId: "allow-once", name: "Einmal erlauben" },
                  { optionId: "reject-once", name: "Ablehnen" },
                ]
            ).map((opt) => {
              const isAllow = String(opt.kind || opt.optionId || "").includes(
                "allow",
              );
              return (
                <button
                  key={opt.optionId}
                  type="button"
                  className={
                    isAllow
                      ? "permission-btn permission-btn--allow"
                      : "permission-btn permission-btn--reject"
                  }
                  onClick={() => onRespond(opt.optionId)}
                >
                  {opt.name || opt.optionId}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
