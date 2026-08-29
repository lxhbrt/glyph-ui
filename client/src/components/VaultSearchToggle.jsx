/**
 * Composer-Toggle: Pixel-Apfel über dem Senden-Button.
 * Rot + brauner Stiel + grünes Blatt. Gold nur als Outline, wenn an.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { appleToggleLabel } from "../utils/vaultSearch.js";

/** Minecraft-Apfel, 16×16: roter Körper, brauner Stiel, kleines Blatt. */
function PixelApple({ size = 16 }) {
  const s = 16;
  return (
    <svg
      className="composer-vault-apple"
      width={size}
      height={size}
      viewBox={`0 0 ${s} ${s}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect className="composer-vault-apple-leaf" x={9} y={0} width={3} height={1} />
      <rect className="composer-vault-apple-leaf" x={10} y={1} width={3} height={1} />
      <rect className="composer-vault-apple-leaf" x={11} y={2} width={2} height={1} />
      <rect className="composer-vault-apple-stem" x={7} y={1} width={1} height={2} />
      <rect className="composer-vault-apple-stem" x={8} y={2} width={1} height={1} />
      <rect className="composer-vault-apple-body" x={4} y={3} width={8} height={1} />
      <rect className="composer-vault-apple-body" x={3} y={4} width={10} height={8} />
      <rect className="composer-vault-apple-body" x={4} y={12} width={8} height={1} />
      <rect className="composer-vault-apple-body" x={5} y={13} width={6} height={1} />
      <rect className="composer-vault-apple-shade" x={11} y={5} width={2} height={7} />
      <rect className="composer-vault-apple-shade" x={10} y={12} width={2} height={1} />
      <rect className="composer-vault-apple-shade" x={6} y={13} width={4} height={1} />
      <rect className="composer-vault-apple-shine" x={5} y={5} width={2} height={2} />
      <rect className="composer-vault-apple-shine" x={5} y={7} width={1} height={1} />
    </svg>
  );
}

export function VaultSearchToggle({ on, disabled, onToggle, className = "" }) {
  return (
    <button
      type="button"
      className={`composer-vault-btn${on ? " is-on" : ""}${
        className ? ` ${className}` : ""
      }`}
      aria-pressed={on}
      aria-label={appleToggleLabel(on)}
      title={appleToggleLabel(on)}
      disabled={disabled}
      onClick={onToggle}
    >
      <PixelApple size={18} />
    </button>
  );
}
