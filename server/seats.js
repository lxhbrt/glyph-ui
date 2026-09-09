/**
 * Device seats: same agent profile, separate ACP process + session.
 * desk = Schreibtisch, phone = Handy. Not a crew — two chairs.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

export const SEAT_IDS = ["desk", "phone", "web"];

export function parseSeat(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  return SEAT_IDS.includes(s) ? s : "desk";
}

/**
 * Seat-Key für Web-Clients: pro Session-Token ein eigener Chat.
 * desk/phone bleiben fest; web wird zu web:<token>, damit jedes Gerät
 * (Cookie) seine eigene Session hat statt alle denselben web-Chat.
 */
export function webSeatKey(token) {
  const t = String(token || "").trim();
  if (!t) return "web";
  // Token kürzen, damit Logs/Keys handlich bleiben (Voll-Token im Cookie).
  return `web:${t.slice(0, 12)}`;
}

export function isWebSeatKey(key) {
  const k = String(key || "");
  return k === "web" || k.startsWith("web:");
}

export class SeatHub {
  /**
   * @param {(seat: string) => object} createBridge
   */
  constructor(createBridge) {
    this._create = createBridge;
    this._map = new Map();
  }

  get(id) {
    // web:<token>-Seats akzeptieren; desk/phone/web normalisieren.
    const raw = String(id || "").trim().toLowerCase();
    const seat = raw.startsWith("web:") ? raw : parseSeat(raw);
    let b = this._map.get(seat);
    if (!b) {
      b = this._create(seat);
      this._map.set(seat, b);
    }
    return b;
  }

  all() {
    return [...this._map.values()];
  }

  findBySession(sessionId) {
    const id = String(sessionId || "").trim();
    if (!id) return null;
    for (const b of this._map.values()) {
      if (b.sessionId === id) return b;
    }
    return null;
  }
}
