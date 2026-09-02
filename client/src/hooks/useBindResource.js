/**
 * Shared bind CRUD for Vaults + Workspaces.
 * Snapshot extras (agent_paths, accessible_roots, obsidian_uri, …) are ignored.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useCallback, useEffect, useState } from "react";

async function api(method, path, body) {
  const opts = {
    method,
    headers: { Accept: "application/json" },
  };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

function useBindResource({ apiBase, listKey, autoload = true }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(autoload));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api("GET", apiBase);
      // Only the list; ignore store_path / agent_paths / obsidian_uri / …
      setItems(Array.isArray(data[listKey]) ? data[listKey] : []);
    } catch (e) {
      setError(e.message || String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, listKey]);

  useEffect(() => {
    if (!autoload) return undefined;
    void refresh();
    return undefined;
  }, [refresh, autoload]);

  const attach = useCallback(
    async (input, mode, extra = {}) => {
      const raw = String(input ?? "").trim();
      if (!raw || busy) return false;
      setBusy(true);
      setError("");
      try {
        await api("POST", apiBase, { input: raw, mode, ...extra });
        await refresh();
        return true;
      } catch (err) {
        setError(err.message || String(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [apiBase, busy, refresh],
  );

  const patch = useCallback(
    async (id, body) => {
      if (!id || busy) return false;
      setBusy(true);
      setError("");
      try {
        await api("PATCH", `${apiBase}/${encodeURIComponent(id)}`, body);
        await refresh();
        return true;
      } catch (err) {
        setError(err.message || String(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [apiBase, busy, refresh],
  );

  const detach = useCallback(
    async (id) => {
      if (!id || busy) return false;
      setBusy(true);
      setError("");
      try {
        await api("DELETE", `${apiBase}/${encodeURIComponent(id)}`);
        await refresh();
        return true;
      } catch (err) {
        setError(err.message || String(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [apiBase, busy, refresh],
  );

  return { items, refresh, attach, patch, detach, busy, error, loading };
}

export { useBindResource };
