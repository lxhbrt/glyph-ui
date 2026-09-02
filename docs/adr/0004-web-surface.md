# 0004 · Web-Fläche auf glyph-ui.com

glyph-ui.com ist die öffentliche Fläche für den Arbeits-PC: Sitz `web`, nur °_Agent, maximierter Chat, eigenes Passwort. Grok Build und ^_Code bleiben auf dem Mac (Loopback). Die Domain teilt nicht die Live-Session des Schreibtischs. Glyph-Serve über Tailscale ist abgezogen.

## Considered

- Tailscale-only, kein öffentlicher Hostname — aufgehoben: Arbeits-PC ohne Tailscale ist der Grund für die Domain. Später auch das Handy-Serve (:8443) entfernt.
- Dieselbe Desk-Session hinter Cloudflare — abgelehnt: Mac-Chat würde mitlaufen; Grok/Code wären öffentlich.
- Agent-only ohne Passwort — abgelehnt: °_Agent liest Vaults.
- Dritter Sitz vs. `phone` wiederverwenden — `phone` bleibt eigener Sitz (schmales Fenster / lokales Handy); `web` ist die abgespeckte Domain.

## Consequences

- Host `glyph-ui.com` erzwingt Sitz `web` und Profil °_Agent. Query `?seat=desk` eskaliert nicht.
- Web-Tor: Passwort (`~/.glyph-ui/web-password`). Wer auf glyph-ui.com eingeloggt ist, ändert es dort. `GLYPH_WEB_PASSWORD` (Env) blockiert die UI-Änderung, weil ein Restart sie überschriebe. WS-Token erst nach Login. Andere Sessions fallen beim Ändern.
- Origin-Allowlist exakt, kein Substring (`glyph-ui.com.evil…`).
- Cloudflare Access kann zusätzlich vor dem Tunnel sitzen.
- Kein Tailscale Serve für Glyph. Admin-Fläche nur Loopback.
- Vault-Wachstum (Themen/Wiki) gilt auch hinter der Domain; Löschen bleibt tot (glyph-agent ADR 0002).
- Begrenztes Chrome: **UI neu laden** statt **Beenden**. Kette (Agent aus) bleibt Mac.
