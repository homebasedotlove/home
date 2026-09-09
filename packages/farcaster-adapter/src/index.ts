/**
 * The compatibility layer between Home's personalization kernel and the
 * Farcaster client API.
 *
 * Forty-odd lines of real work — everything else here is the type boundary and
 * the seam that replaces the reference client's `flatMap`.
 *
 * See docs/integration/wiring-into-a-fork.md for where each export goes.
 */

export * from './apiShapes';
export * from './embeds';
export * from './feedItem';
export * from './seam';
