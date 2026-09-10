import { ApiCastFeedIncludeReason } from 'farcaster-client-data';
import { describeReason, explainReason, reasonGroup } from 'home-personalization';
import React, { FC, memo, useCallback, useState } from 'react';

/**
 * Home's why-chip.
 *
 * The reference client already surfaces ranking reasons, in two places: an
 * `IncludeReasonTopHat` on the feed row for two of the ten reasons, and a
 * `SourceLabel` inside the kebab menu for eight of them. Neither has a press
 * handler. So a reader can sometimes learn why a cast is there, and can never
 * do anything about it.
 *
 * This renders in the same slot as the top hat, for every reason, and is a
 * button. Tapping it is the whole product: the explanation and the control are
 * the same object.
 */

const GROUP_CLASS: Record<string, string> = {
  direct: 'text-success',
  network: 'text-action-blue',
  discovery: 'text-action-purple',
  promoted: 'text-faint',
};

type HomeWhyChipProps = {
  includeReason: ApiCastFeedIncludeReason;
  score?: number;
  onAdjust?: (group: string, direction: 'up' | 'down' | 'off') => void;
};

const HomeWhyChip: FC<HomeWhyChipProps> = memo(
  ({ includeReason, score, onAdjust }) => {
    const [open, setOpen] = useState(false);
    const descriptor = describeReason(includeReason.type);
    const group = reasonGroup(includeReason.type);

    const adjust = useCallback(
      (direction: 'up' | 'down' | 'off') => {
        if (group) onAdjust?.(group, direction);
        setOpen(false);
      },
      [group, onAdjust],
    );

    // An unknown reason still gets a chip rather than silence: upstream can add
    // one at any time, and an unlabelled cast is the bug this exists to fix.
    const label = descriptor?.chip ?? includeReason.type;

    return (
      <div className="relative" data-testid="home-why-chip">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`mb-1 inline-flex items-center gap-1.5 rounded border border-current px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
            GROUP_CLASS[group ?? ''] ?? 'text-faint'
          }`}
          aria-expanded={open}
          aria-label={`Why am I seeing this: ${label}`}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {label}
        </button>

        {open && (
          <div
            role="dialog"
            data-testid="home-why-sheet"
            className="absolute left-0 top-full z-50 w-72 rounded-lg border border-default bg-app p-3 shadow-lg"
          >
            <p className="mb-1 text-sm text-default">
              {explainReason(includeReason.type)}
            </p>
            {score !== undefined && (
              <p className="mb-2 font-mono text-xs text-faint">
                meta.score {score.toFixed(2)}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => adjust('down')}
                className="rounded border border-default px-2 py-1 text-xs"
              >
                Less of this
              </button>
              <button
                type="button"
                onClick={() => adjust('off')}
                className="rounded border border-default px-2 py-1 text-xs"
              >
                None of this
              </button>
              {/* Promoted can be reduced or removed, never amplified. */}
              {descriptor?.boostable !== false && (
                <button
                  type="button"
                  onClick={() => adjust('up')}
                  className="rounded border border-default px-2 py-1 text-xs"
                >
                  More of this
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  },
);

HomeWhyChip.displayName = 'HomeWhyChip';

export { HomeWhyChip };
