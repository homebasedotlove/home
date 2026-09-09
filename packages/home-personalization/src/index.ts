/**
 * The personalization kernel for Home.
 *
 * Everything a reader can change about their client — which feeds exist, what
 * is in them, what order they are in, how they look, and how long they last —
 * is defined, validated, and evaluated here. Nothing in this package imports
 * React, React Native, the Farcaster API client, or any storage engine, so it
 * runs identically on iOS, on the web, and in a test.
 *
 * See docs/integration/wiring-into-a-fork.md for the six call sites that
 * connect it to a fork of farcasterxyz/client.
 */

export * from './reasons/index';
export * from './feedspec/index';
export * from './pipeline/index';
export * from './theme/index';
export * from './boundaries/index';
export * from './prefs/index';
