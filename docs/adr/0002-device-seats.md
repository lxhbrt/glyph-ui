# 0002 · Zwei Sitze (desk / phone)

Handy und PC teilen dasselbe Profil, nicht dieselbe ACP-Session.

## Decision

Zwei Sitze: `desk` und `phone`. Jeder Sitz = eigener `GrokBridge` (ACP-stdio + `sessionId`). Clients senden `?seat=` am WebSocket und `X-Glyph-Seat` an mutierende APIs. Eine Live-Session-ID gehört höchstens einem Sitz (409 beim Öffnen auf dem anderen).

## Considered

- Nur UI-Modus, ein ACP-Prozess — Handy stiehlt weiter den PC-Chat.
- Beliebig viele Sitze — unnötig, zwei Geräte sind der Fall.
- Grok-Bot-Schwarm (Worker tauschen Entwürfe) — andere Verdrahtung, abgelehnt.

## Consequences

- Mac-Bridge bleibt Host (Stufe 3 = eigener Host, nicht diese ADR).
- Zwei `grok agent`-Prozesse gleichzeitig möglich.
- SoT unverändert: Vaults, Workspaces, `AGENTS.md`.
