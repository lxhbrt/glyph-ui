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

export class SeatHub {
  /**
   * @param {(seat: string) => object} createBridge
   */
  constructor(createBridge) {
    this._create = createBridge;
    this._map = new Map();
  }

  get(id) {
    const seat = parseSeat(id);
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
