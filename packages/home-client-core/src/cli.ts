/**
 * A runnable demonstration of the whole mechanism.
 *
 *   pnpm --filter home-client-core demo
 *
 * Drives the client core through the journey the design describes — cold
 * start, tapping a why-chip, muting with an expiry, a session budget running
 * out, catch-up, and a config moving to a new device — and prints the feed at
 * each step. The point is that every claim in docs/design is observable here
 * without a simulator, an API key, or a phone.
 */

import { homeFeedPage, NOW } from 'farcaster-adapter';
import {
  encodeShare,
  exportPreferences,
  memoryStore,
  muteKeyword,
  muteReasonGroup,
  nudgeReason,
  reasonGroup,
  PREFERENCES_KEY,
} from 'home-personalization';
import type { KVStore } from 'home-personalization';

import { HomeClient, type RenderedFeed } from './client';

const HOUR = 3_600_000;
const MIN = 60_000;

const ESC = '[';
const DIM = `${ESC}2m`;
const BOLD = `${ESC}1m`;
const RESET = `${ESC}0m`;
const GROUP_COLOR: Record<string, string> = {
  direct: `${ESC}36m`,
  network: `${ESC}34m`,
  discovery: `${ESC}35m`,
  promoted: `${ESC}90m`,
};

const clock = { ms: NOW };

function store(): KVStore {
  return memoryStore();
}

function makeClient(kv: KVStore) {
  return new HomeClient({
    store: kv,
    fetchFeed: async () => homeFeedPage(),
    now: () => clock.ms,
  });
}

function heading(n: number, title: string) {
  console.log(`\n${BOLD}${n}. ${title}${RESET}`);
  console.log(DIM + '-'.repeat(70) + RESET);
}

function printFeed(feed: RenderedFeed, limit = 6) {
  for (const item of feed.items.slice(0, limit)) {
    const reason = item.meta?.includeReason?.type ?? 'unattributed';
    const color = GROUP_COLOR[reasonGroup(reason) ?? ''] ?? '';
    const score = item.meta?.score;
    const text = item.cast.text.slice(0, 42).padEnd(42);
    console.log(
      `  ${text} ${color}${reason.padEnd(24)}${RESET}` +
        `${DIM}${score === undefined ? '' : score.toFixed(2)}${RESET}`,
    );
  }
  if (feed.items.length > limit) {
    console.log(`  ${DIM}... ${feed.items.length - limit} more${RESET}`);
  }
  if (feed.items.length === 0) console.log(`  ${DIM}(nothing)${RESET}`);

  const bar = Object.entries(feed.mix.byGroup)
    .map(
      ([g, n]) =>
        `${GROUP_COLOR[g] ?? ''}${g} ${Math.round((n / feed.mix.total) * 100)}%${RESET}`,
    )
    .join('  ');
  console.log(`\n  mix: ${bar || `${DIM}empty${RESET}`}`);
  if (feed.hiddenSummary) {
    console.log(`  ${feed.hiddenSummary}`);
    for (const g of feed.receiptGroups) {
      console.log(
        `    ${DIM}${g.rule ?? g.cause}: ${g.count} - ${g.detail}${RESET}`,
      );
    }
  }
}

async function main() {
  const kv = store();
  const home = makeClient(kv);

  heading(1, 'Cold start - the feed as the server ranked it');
  printFeed(await home.renderFeed());

  heading(2, 'The reader taps the Discovery chip and picks "Less"');
  home.update((p) => nudgeReason(p, 'home', 'discovery', 'down'));
  home.update((p) => nudgeReason(p, 'home', 'direct', 'up'));
  console.log(
    `  ${DIM}weights: ${JSON.stringify(home.activeFeed.sort.weights)}${RESET}\n`,
  );
  printFeed(await home.renderFeed());

  heading(3, 'They tap Promoted and pick "None"');
  home.update((p) => muteReasonGroup(p, 'home', 'promoted'));
  printFeed(await home.renderFeed());

  heading(4, 'They mute a word for a week');
  home.update((p) =>
    muteKeyword(p, 'home', 'brooklyn', { forMs: 7 * 24 * HOUR, now: clock.ms }),
  );
  printFeed(await home.renderFeed());

  heading(5, 'A week later the mute lapses and is offered back');
  clock.ms = NOW + 7 * 24 * HOUR + MIN;
  const later = makeClient(kv);
  const lapsed = later.lapsedRules();
  console.log(
    `  ${lapsed.keywords.length} mute(s) ended: ` +
      lapsed.keywords.map((k) => `"${k.pattern}"`).join(', '),
  );
  console.log(
    `  ${DIM}surfaced for review, not silently reactivated${RESET}\n`,
  );
  printFeed(await later.renderFeed());

  heading(6, 'A session budget winds down');
  clock.ms = NOW;
  const budgeted = makeClient(store());
  budgeted.update((p) => ({
    ...p,
    boundaries: { ...p.boundaries, sessionBudgetMinutes: 20, windDown: true },
  }));
  budgeted.foreground();
  for (const minutes of [5, 16, 21]) {
    clock.ms = NOW + minutes * MIN;
    const b = (await budgeted.renderFeed()).boundary;
    console.log(
      `  ${String(minutes).padStart(2)} min  ${b.status.padEnd(14)}` +
        `${DIM}colour drained ${Math.round(b.desaturation * 100)}%${RESET}` +
        (b.message ? `  "${b.message}"` : ''),
    );
  }

  heading(7, 'Catch-up gives the feed a bottom');
  clock.ms = NOW;
  const finite = makeClient(store());
  finite.update((p) => ({
    ...p,
    boundaries: { ...p.boundaries, catchUp: true },
  }));
  finite.markRead(NOW - 3 * HOUR);
  const caught = await finite.renderFeed();
  console.log(
    `  ${caught.items.length} new since last visit; ` +
      (caught.moreAvailable
        ? 'older casts withheld, and it says so'
        : 'nothing withheld'),
  );
  finite.markRead(NOW + 1);
  console.log(
    `  after reading to the top: caughtUp=${(await finite.renderFeed()).caughtUp}`,
  );

  heading(8, 'The configuration moves to a new device');
  const backup = exportPreferences(home.preferences);
  const newPhone = store();
  newPhone.setString(PREFERENCES_KEY, backup);
  clock.ms = NOW;
  const restored = makeClient(newPhone);
  const a = (await makeClient(kv).renderFeed()).items.map((i) => i.id).join();
  const b = (await restored.renderFeed()).items.map((i) => i.id).join();
  console.log(`  export is ${backup.length} bytes of JSON`);
  console.log(`  same feed on the new device: ${a === b ? 'yes' : 'NO'}`);

  heading(9, 'And a single feed fits in a link');
  const link = encodeShare(home.activeFeed);
  console.log(`  ${DIM}home.example/f/${link.slice(0, 48)}...${RESET}`);
  console.log(`  ${link.length + 16} characters, carrying every rule above.`);
  console.log();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
