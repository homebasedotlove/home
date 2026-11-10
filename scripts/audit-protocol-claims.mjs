#!/usr/bin/env node
/**
 * Re-verify every checkable claim in docs/operations/plugging-into-snapchain.md,
 * docs/research/protocol-mechanics.md, docs/operations/setup-end-to-end.md,
 * docs/research/client-landscape.md, docs/research/hypersnap.md,
 * docs/research/both-networks.md, docs/research/optimal-design.md,
 * docs/design/experience-walkthrough.md and docs/research/messages-and-wallet.md
 * against the sources they were read from.
 *
 * That page argues from numbers — engine versions and their dates, per-unit
 * storage limits, rate-limit constants, message-type ids, node requirements,
 * endpoint names — and every one of them was read off a repository at a
 * specific commit. Repositories move. This fails loudly when a number no longer
 * matches, and names the claim.
 *
 *   bash scripts/fetch-protocol-sources.sh      # clones the pinned commits
 *   node scripts/audit-protocol-claims.mjs      # must pass
 *
 *   bash scripts/fetch-protocol-sources.sh --latest
 *   node scripts/audit-protocol-claims.mjs      # a failure here = a claim to re-read
 *
 * Claims that live only on the web (FIP statuses, vendor plans, the
 * acquisition) cannot be checked offline; they are listed at the end with the
 * URL to re-read, and `--network` adds a live check of the npm versions.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = resolve(
  process.env.PROTOCOL_SOURCES ?? join(HOME, '.protocol-sources'),
);
const PINS = JSON.parse(
  readFileSync(join(HOME, 'scripts/protocol-sources.json'), 'utf8'),
);
const NETWORK = process.argv.includes('--network');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'lib', 'build']);

// --- helpers ----------------------------------------------------------------

function findSnapshot() {
  const candidates = [
    process.env.SNAPSHOT,
    join(HOME, 'packages/farcaster-adapter/.snapshot'),
    join(HOME, '../client'),
    join(HOME, '../farcasterxyz/client'),
    join(HOME, '../../client'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(join(c, 'packages/farcaster-client-data/src/types/api.ts'))) {
      return resolve(c);
    }
  }
  return null;
}

function* walk(root, suffixes) {
  const stack = [root].filter((r) => existsSync(r));
  while (stack.length) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name)) stack.push(full);
      } else if (suffixes.some((s) => name.endsWith(s))) {
        yield full;
      }
    }
  }
}

const results = [];
const check = (label, expected, actual) => {
  results.push({
    ok: JSON.stringify(expected) === JSON.stringify(actual),
    label,
    expected,
    actual,
  });
};
const has = (text, needle) =>
  needle instanceof RegExp ? needle.test(text) : text.includes(needle);
const expectText = (label, text, needle) => check(label, true, has(text, needle));
const count = (text, rx) => (text.match(rx) ?? []).length;

// A file that moved upstream must fail the claims that read it, not crash the
// run: the weekly job against upstream HEAD exists to name what moved.
const movedFiles = [];
function source(name) {
  const dir = join(SOURCES, name);
  if (!existsSync(dir)) return null;
  return {
    dir,
    read: (rel) => {
      try {
        return readFileSync(join(dir, rel), 'utf8');
      } catch {
        if (!movedFiles.includes(`${name}/${rel}`)) movedFiles.push(`${name}/${rel}`);
        return '';
      }
    },
    json: (rel) => {
      try {
        return JSON.parse(readFileSync(join(dir, rel), 'utf8'));
      } catch {
        if (!movedFiles.includes(`${name}/${rel}`)) movedFiles.push(`${name}/${rel}`);
        return {};
      }
    },
    exists: (rel) => existsSync(join(dir, rel)),
    head() {
      try {
        return execFileSync('git', ['-C', dir, 'log', '-1', '--format=%H %cs'], {
          encoding: 'utf8',
        }).trim();
      } catch {
        return 'unknown';
      }
    },
  };
}

const missing = [];
const S = {};
for (const name of Object.keys(PINS)) {
  S[name] = source(name);
  if (!S[name]) missing.push(name);
}
if (missing.length) {
  console.error(
    `error: missing source clone(s) under ${SOURCES}: ${missing.join(', ')}\n` +
      '       run: bash scripts/fetch-protocol-sources.sh',
  );
  process.exit(1);
}

// --- snapchain --------------------------------------------------------------

{
  const sc = S.snapchain;

  const changelog = sc.read('CHANGELOG.md');
  check(
    'Snapchain release the page describes',
    '[0.16.0] - 2026-10-28',
    changelog.match(/^## (\[[^\]]+\] - \d{4}-\d{2}-\d{2})/m)?.[1],
  );

  const ver = sc.read('src/version/version.rs');
  const mainnet = ver.slice(
    ver.indexOf('ENGINE_VERSION_SCHEDULE_MAINNET'),
    ver.indexOf('ENGINE_VERSION_SCHEDULE_TESTNET'),
  );
  const schedule = {};
  for (const m of mainnet.matchAll(
    /active_at:\s*(\d+),[^\n]*\n\s*version:\s*EngineVersion::V(\d+)/g,
  )) {
    schedule[`V${m[2]}`] = new Date(Number(m[1]) * 1000)
      .toISOString()
      .slice(0, 10);
  }
  const dated = ['V5', 'V11', 'V14', 'V16', 'V17', 'V18', 'V19', 'V20', 'V21', 'V22', 'V23'];
  check(
    'mainnet activation dates of the engine versions the page dates',
    {
      V5: '2025-06-16',
      V11: '2025-10-08',
      V14: '2025-10-29',
      V16: '2026-05-07',
      V17: '2026-06-04',
      V18: '2026-06-22',
      V19: '2026-07-27',
      V20: '2026-08-13',
      V21: '2026-10-23',
      V22: '2026-10-23',
      V23: '2026-10-29',
    },
    Object.fromEntries(dated.map((v) => [v, schedule[v]])),
  );
  check('V24 (channels) is not on the mainnet schedule', false, 'V24' in schedule);

  // Walk the arms of `is_enabled`. Grouped arms (`A | B | C => V21`) and the
  // comments between them mean a per-feature regex is not enough: collect the
  // features named between consecutive `=> self >= &EngineVersion::Vn` arms,
  // ignoring comment lines.
  const isEnabledAt = ver.indexOf('pub fn is_enabled');
  const body = ver.slice(isEnabledAt, ver.indexOf('\n    }\n', isEnabledAt));
  const gates = {};
  let armStart = 0;
  for (const m of body.matchAll(/=>\s*self >= &EngineVersion::V(\d+)/g)) {
    const arm = body
      .slice(armStart, m.index)
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    for (const f of arm.matchAll(/ProtocolFeature::(\w+)/g)) gates[f[1]] = m[1];
    armStart = m.index + m[0].length;
  }
  const gate = (feature) => gates[feature];
  check(
    'feature gates named on the page',
    {
      PrimaryAddresses: '5',
      StorageLending: '11',
      StopRevokingExistingMessages: '14',
      GaslessSigners: '16',
      LiveAt: '17',
      StorageExpiryExtension2026: '18',
      BlockLinks: '19',
      IncreaseEmbedLimitForAllUsers: '20',
      UngateProMessageVariants: '21',
      ChainedCasts: '22',
      HeaderTransactionsRoot: '23',
      ChannelMessages: '24',
      ChannelFollows: '24',
    },
    Object.fromEntries(
      [
        'PrimaryAddresses',
        'StorageLending',
        'StopRevokingExistingMessages',
        'GaslessSigners',
        'LiveAt',
        'StorageExpiryExtension2026',
        'BlockLinks',
        'IncreaseEmbedLimitForAllUsers',
        'UngateProMessageVariants',
        'ChainedCasts',
        'HeaderTransactionsRoot',
        'ChannelMessages',
        'ChannelFollows',
      ].map((f) => [f, gate(f)]),
    ),
  );
  expectText(
    'channel rollout blocked on the mainnet registrar',
    ver,
    'blocked on the mainnet registrar deployment',
  );

  const stores = sc.read('src/storage/store/stores.rs');
  const limits = (variant) => {
    const i = stores.indexOf(`StorageUnitType::${variant} => Limits {`);
    const blk = stores.slice(i, stores.indexOf('}', i));
    const g = (k) => Number(blk.match(new RegExp(`${k}:\\s*(\\d+)`))?.[1]);
    return {
      casts: g('casts'),
      links: g('links'),
      reactions: g('reactions'),
      user_data: g('user_data'),
      user_name_proofs: g('user_name_proofs'),
      verifications: g('verifications'),
    };
  };
  check(
    'legacy storage unit limits',
    { casts: 5000, links: 2500, reactions: 2500, user_data: 50, user_name_proofs: 5, verifications: 25 },
    limits('UnitTypeLegacy'),
  );
  check(
    '2024 storage unit limits',
    { casts: 2000, links: 1000, reactions: 1000, user_data: 50, user_name_proofs: 5, verifications: 25 },
    limits('UnitType2024'),
  );
  check(
    '2025 storage unit limits',
    { casts: 100, links: 200, reactions: 200, user_data: 25, user_name_proofs: 2, verifications: 5 },
    limits('UnitType2025'),
  );
  expectText('legacy cohort cut-off', stores, 'Aug 24, 2024');
  expectText('2025 cohort cut-off', stores, 'Jul 16, 2025');

  const expiry = sc.read('src/storage/store/account/onchain_event_store.rs');
  expectText(
    'V18 extends legacy units to 4 years and 2024 units to 3',
    expiry,
    'legacy units become valid for 4 years, 2024 units for 3 years',
  );
  expectText('V18 extends the pre-cutoff 2025 cohort to 2 years', expiry, 'for 2 years');

  const mempool = sc.read('src/mempool/mempool.rs');
  expectText(
    'per-FID hourly budget is max(100, allowance / 10)',
    mempool,
    /Quota::per_hour\(\s*NonZeroU32::new\(100\.max\(storage_allowance \/ 10\)\)/,
  );
  expectText(
    'KEY_ADD limited to one per minute per FID',
    mempool,
    /Quota::per_minute\(\s*NonZeroU32::new\(1\)/,
  );
  expectText(
    'LIVE_AT budget is 5000 per storage unit per hour',
    mempool,
    'RATE_LIMIT_PER_STORAGE_UNIT: u32 = 5000',
  );
  expectText(
    'rate limits are an operator switch, off by default',
    mempool,
    /enable_rate_limits:\s*false/,
  );
  expectText(
    'blocks carry at most 1000 messages',
    sc.read('src/consensus/consensus.rs'),
    'max_messages_per_block: 1000',
  );

  const cast = sc.read('src/core/validations/cast.rs');
  expectText('plain cast text limit 320 bytes', cast, 'text_bytes.len() > 320');
  expectText('long cast text limit 1024 bytes', cast, 'text_bytes.len() > 1024');
  expectText(
    '10K casts are open to every fid from V21 (Pro only before it)',
    cast,
    /CastType::TenKCast\)\s+if !is_pro_user && !version\.is_enabled\(ProtocolFeature::UngateProMessageVariants\)/,
  );
  expectText(
    'embed cap lifted for everyone behind IncreaseEmbedLimitForAllUsers',
    cast,
    'ProtocolFeature::IncreaseEmbedLimitForAllUsers',
  );
  const castTests = sc.read('src/core/validations/cast_tests.rs');
  expectText(
    'four embeds pass and five fail for every user after V20',
    castTests,
    /validate_embeds\(4, is_pro_user, EngineVersion::V20\)\.is_ok\(\)[\s\S]*validate_embeds\(5, is_pro_user, EngineVersion::V20\)/,
  );
  expectText(
    'future timestamps rejected beyond 10 minutes',
    sc.read('src/core/validations/message.rs'),
    'ALLOWED_CLOCK_SKEW_SECONDS: u64 = 10 * 60',
  );

  const proto = sc.read('proto/definitions/message.proto');
  const enumValue = (name) =>
    Number(proto.match(new RegExp(`${name}\\s*=\\s*(\\d+);`))?.[1]);
  check(
    'message and user-data type ids named on the page',
    {
      MESSAGE_TYPE_LEND_STORAGE: 15,
      MESSAGE_TYPE_KEY_ADD: 16,
      MESSAGE_TYPE_KEY_REMOVE: 17,
      MESSAGE_TYPE_CHANNEL_UPDATE: 18,
      MESSAGE_TYPE_CHANNEL_MEMBER: 19,
      MESSAGE_TYPE_CHANNEL_PIN: 20,
      MESSAGE_TYPE_CHANNEL_MODERATE: 21,
      USER_DATA_TYPE_LIVE_AT: 14,
    },
    Object.fromEntries(
      [
        'MESSAGE_TYPE_LEND_STORAGE',
        'MESSAGE_TYPE_KEY_ADD',
        'MESSAGE_TYPE_KEY_REMOVE',
        'MESSAGE_TYPE_CHANNEL_UPDATE',
        'MESSAGE_TYPE_CHANNEL_MEMBER',
        'MESSAGE_TYPE_CHANNEL_PIN',
        'MESSAGE_TYPE_CHANNEL_MODERATE',
        'USER_DATA_TYPE_LIVE_AT',
      ].map((n) => [n, enumValue(n)]),
    ),
  );
  expectText('KeyAddBody carries scopes', proto, /repeated int32 scopes = 9;/);
  expectText('KeyAddBody carries a ttl', proto, /uint32 ttl = 10;/);

  const http = sc.read('src/network/http_server.rs');
  expectText('node HTTP server allows any origin by default', http, 'cors_origin: "*".to_string()');
  check(
    'HTTP routes the page relies on',
    ['/v1/channelMetadata', '/v1/events', '/v1/signersByFid', '/v1/storageLimitsByFid', '/v1/submitMessage', '/v1/validateMessage'],
    ['/v1/channelMetadata', '/v1/events', '/v1/signersByFid', '/v1/storageLimitsByFid', '/v1/submitMessage', '/v1/validateMessage'].filter((r) => http.includes(`"${r}"`)),
  );

  const connector = sc.read('src/connectors/onchain_events/mod.rs');
  check(
    'contracts the node watches',
    { storage: true, key: true, id: true, tier: true, channelRegistrar: true },
    {
      storage: /00000000fcce7f938e7ae6d3c335bd6a1a7c593d/i.test(connector),
      key: /00000000Fc1237824fb747aBDE0FF18990E59b7e/i.test(connector),
      id: /00000000Fc6c5F01Fc30151999387Bb99A9f489b/i.test(connector),
      tier: /00000000fc84484d585C3cF48d213424DFDE43FD/i.test(connector),
      channelRegistrar: connector.includes('ChannelRegistrarController'),
    },
  );

  const start = sc.read('site/docs/pages/getting-started.mdx');
  check(
    'node requirements',
    ['16 GB of RAM', '4 CPU cores', '2 TB of free storage', 'ports 3381 - 3383', 'The snapshot is several hundred gigabytes'],
    ['16 GB of RAM', '4 CPU cores', '2 TB of free storage', 'ports 3381 - 3383', 'The snapshot is several hundred gigabytes'].filter((t) => start.includes(t)),
  );
  expectText('AWS guide budgets ~$100/month', sc.read('site/docs/pages/guides/running-a-node.mdx'), '$100/month');
  check(
    'both node guides recommend Neynar over running a node',
    { start: true, aws: true },
    {
      start: sc.read('site/docs/pages/getting-started.mdx').includes('consider a managed service like [Neynar](https://neynar.com/) instead of running your own node'),
      aws: sc.read('site/docs/pages/guides/running-a-node.mdx').includes('consider a managed service like [Neynar](https://neynar.com/) instead of running your own node'),
    },
  );

  const writing = sc.read('site/docs/pages/guides/writing-messages.mdx');
  check(
    'gasless signer facts in the writing guide',
    ['max 90 days', 'up to 1000 active gasless keys', '~10$ USD of ETH', 'live on mainnet as of engine version V16'],
    ['max 90 days', 'up to 1000 active gasless keys', '~10$ USD of ETH', 'live on mainnet as of engine version V16'].filter((t) => writing.includes(t)),
  );
  const migrating = sc.read('site/docs/pages/guides/migrating-to-snapchain.mdx');
  check(
    'submitMessage semantics in the migration guide',
    ['HTTP port is `3381` and gRPC is `3383`', 'dataBytes', 'best-effort', '`hub-web` is not fully supported'],
    ['HTTP port is `3381` and gRPC is `3383`', 'dataBytes', 'best-effort', '`hub-web` is not fully supported'].filter((t) => migrating.includes(t)),
  );

  const validatorsDoc = sc.read('site/docs/pages/validators.mdx');
  check('validator table: five Neynar rows, one Uno row', { neynar: 5, uno: 1 }, {
    neynar: count(validatorsDoc, /\| Neynar\s*\|/g),
    uno: count(validatorsDoc, /\| Uno\s*\|/g),
  });
  const toml = sc.read('validators.toml');
  const lastSet = toml.split('[[consensus.validator_sets]]').pop();
  check('latest validator set has seven keys', 7, count(lastSet, /"[0-9a-f]{64}"/g));
}

// --- protocol spec ------------------------------------------------------------

{
  const spec = S.protocol.read('docs/SPECIFICATION.md');
  check('spec repo still omits KEY_ADD', false, spec.includes('KEY_ADD'));
  check('spec repo still omits channel messages', false, spec.includes('ChannelUpdate'));
  expectText('30-day grace period after storage expires', spec, '30 day grace period');
}

// --- farcaster docs -------------------------------------------------------------

{
  const d = S.docs;
  const page = (p) => d.read(`src/app/(docs)/${p}/page.mdx`);
  const api = page('reference/farcaster/api');
  expectText('Client API host', api, 'The hostname is always `https://api.farcaster.xyz`');
  expectText('Client API auth is a self-signed app-key token', api, "type: 'app_key'");
  const skr = page('reference/farcaster/signer-requests');
  check(
    'signed key request flow',
    ['/v2/signed-key-requests', '/v2/signed-key-request', '0x00000000fc700472606ed4fa22623acf62c60553', 'ponsor'],
    ['/v2/signed-key-requests', '/v2/signed-key-request', '0x00000000fc700472606ed4fa22623acf62c60553', 'ponsor'].filter((t) => skr.includes(t)),
  );
  expectText('only mobile signs up in the official client', page('learn/what-is-farcaster/apps'), 'signing up is only available on mobile');
  const messages = page('learn/what-is-farcaster/messages');
  expectText('docs still quote $7 per unit (stale)', messages, 'costs $7 today');
  expectText('docs still say 15 minutes (code says 10)', messages, '15 minutes into the future');
  expectText('hello-world budgets ~$10 of ETH', page('developers/guides/basics/hello-world'), '~10$ USD of ETH');
  expectText('direct casts are off-protocol', page('reference/farcaster/direct-casts'), 'not part of the protocol');
}

// --- neynar specs -------------------------------------------------------------

{
  const hub = S.OAS.read('src/hub-api/spec.yaml');
  check(
    'hosted Snapchain API',
    ['url: https://snapchain-api.neynar.com', 'name: x-api-key', '/v1/submitMessage:', '/v1/validateMessage:', '/v1/events:'],
    ['url: https://snapchain-api.neynar.com', 'name: x-api-key', '/v1/submitMessage:', '/v1/validateMessage:', '/v1/events:'].filter((t) => hub.includes(t)),
  );
  const api = S.OAS.read('src/api/spec.yaml');
  check('v2 spec has no for-you feed', 0, count(api, /for_you/g));
  check(
    'v2 endpoints the page relies on',
    ['/v2/farcaster/feed/following/:', '/v2/farcaster/signer/signed_key/:', '/v2/farcaster/user/register/:', '/v2/farcaster/user/fid/:', 'name: x-wallet-id'],
    ['/v2/farcaster/feed/following/:', '/v2/farcaster/signer/signed_key/:', '/v2/farcaster/user/register/:', '/v2/farcaster/user/fid/:', 'name: x-wallet-id'].filter((t) => api.includes(t)),
  );
  const i = api.indexOf('    RegisterSignerKeyReqBody:');
  const body = api.slice(i, api.indexOf('\n    RegisterUser', i));
  check(
    'signed_key request body fields',
    ['app_fid:', 'deadline:', 'signature:', 'signer_uuid:', 'sponsor:'],
    ['app_fid:', 'deadline:', 'signature:', 'signer_uuid:', 'sponsor:'].filter((f) => body.includes(f)),
  );
  expectText('Sign In With Neynar deprecated', api, 'Sign In With Neynar is being retired');
}

// --- contracts, auth, mini apps -----------------------------------------------------

{
  check('SnapchainConfigRegistry contract exists', true, S.contracts.exists('src/SnapchainConfigRegistry.sol'));
  expectText('StorageRegistry prices in USD', S.contracts.read('src/StorageRegistry.sol'), 'uint256 public usdUnitPrice;');
  check(
    'SIWF relay host in auth-client',
    true,
    [...walk(join(S['auth-monorepo'].dir, 'packages/auth-client/src'), ['.ts'])].some((f) => readFileSync(f, 'utf8').includes('relay.farcaster.xyz')),
  );
  expectText('Quick Auth server default', S.miniapps.read('packages/miniapp-sdk/src/quickAuth.ts'), 'https://auth.farcaster.xyz');
}

// --- docs/research/protocol-mechanics.md ------------------------------------------

{
  const sc = S.snapchain;

  const connector = sc.read('src/connectors/onchain_events/mod.rs');
  check(
    'chains and start blocks the node follows',
    { op: '10', opFirst: '108864739', base: '8453', baseFirst: '31180908', eth: true },
    {
      op: connector.match(/OP_MAINNET_CHAIN_ID: u32 = (\d+)/)?.[1],
      opFirst: connector.match(/OP_MAINNET_FIRST_BLOCK: u64 = (\d+)/)?.[1],
      base: connector.match(/BASE_MAINNET_CHAIN_ID: u32 = (\d+)/)?.[1],
      baseFirst: connector.match(/BASE_MAINNET_FIRST_BLOCK: u64 = (\d+)/)?.[1],
      eth: /1 => Some\(Chain::EthMainnet\)/.test(connector),
    },
  );

  const onchain = sc.read('proto/definitions/onchain_event.proto');
  const ev = (name) => Number(onchain.match(new RegExp(`${name}\\s*=\\s*(\\d+);`))?.[1]);
  check(
    'on-chain event type ids',
    { SIGNER: 1, SIGNER_MIGRATED: 2, ID_REGISTER: 3, STORAGE_RENT: 4, TIER_PURCHASE: 5, CHANNEL_REGISTER: 6 },
    {
      SIGNER: ev('EVENT_TYPE_SIGNER'),
      SIGNER_MIGRATED: ev('EVENT_TYPE_SIGNER_MIGRATED'),
      ID_REGISTER: ev('EVENT_TYPE_ID_REGISTER'),
      STORAGE_RENT: ev('EVENT_TYPE_STORAGE_RENT'),
      TIER_PURCHASE: ev('EVENT_TYPE_TIER_PURCHASE'),
      CHANNEL_REGISTER: ev('EVENT_TYPE_CHANNEL_REGISTER'),
    },
  );

  const hubEvent = sc.read('proto/definitions/hub_event.proto');
  const he = (name) => Number(hubEvent.match(new RegExp(`${name}\\s*=\\s*(\\d+);`))?.[1]);
  check(
    'hub event type ids',
    { MERGE_MESSAGE: 1, PRUNE_MESSAGE: 2, REVOKE_MESSAGE: 3, MERGE_USERNAME_PROOF: 6, MERGE_ON_CHAIN_EVENT: 9, MERGE_FAILURE: 10, BLOCK_CONFIRMED: 11, CHANNEL_OWNER_CHANGE_HINT: 12 },
    Object.fromEntries(
      ['MERGE_MESSAGE', 'PRUNE_MESSAGE', 'REVOKE_MESSAGE', 'MERGE_USERNAME_PROOF', 'MERGE_ON_CHAIN_EVENT', 'MERGE_FAILURE', 'BLOCK_CONFIRMED', 'CHANNEL_OWNER_CHANGE_HINT'].map((n) => [n, he(`HUB_EVENT_TYPE_${n}`)]),
    ),
  );
  expectText('hub events carry block number and shard', hubEvent, /uint64 block_number = 12;[\s\S]*uint32 shard_index = 14;/);

  const proto = sc.read('proto/definitions/message.proto');
  const en = (name) => Number(proto.match(new RegExp(`${name}\\s*=\\s*(\\d+);`))?.[1]);
  check(
    'hash, signature and network enums',
    { BLAKE3: 1, ED25519: 1, EIP712: 2, MAINNET: 1, TESTNET: 2, DEVNET: 3 },
    {
      BLAKE3: en('HASH_SCHEME_BLAKE3'),
      ED25519: en('SIGNATURE_SCHEME_ED25519'),
      EIP712: en('SIGNATURE_SCHEME_EIP712'),
      MAINNET: en('FARCASTER_NETWORK_MAINNET'),
      TESTNET: en('FARCASTER_NETWORK_TESTNET'),
      DEVNET: en('FARCASTER_NETWORK_DEVNET'),
    },
  );
  check(
    'first eight message type ids',
    [1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14],
    ['CAST_ADD', 'CAST_REMOVE', 'REACTION_ADD', 'REACTION_REMOVE', 'LINK_ADD', 'LINK_REMOVE', 'VERIFICATION_ADD_ETH_ADDRESS', 'VERIFICATION_REMOVE', 'USER_DATA_ADD', 'USERNAME_PROOF', 'FRAME_ACTION', 'LINK_COMPACT_STATE'].map((n) => en(`MESSAGE_TYPE_${n}`)),
  );
  expectText('Message carries optional data_bytes', proto, /optional bytes data_bytes = 7;/);

  const msgv = sc.read('src/core/validations/message.rs');
  check(
    'message size limits',
    { plain: '2048', tenK: '16_384', linkCompact: '65536', usernameProof: '16_384' },
    {
      plain: msgv.match(/const MAX_DATA_BYTES: usize = ([\d_]+);/)?.[1],
      tenK: msgv.match(/const MAX_DATA_BYTES_FOR_10K_CAST: usize = ([\d_]+);/)?.[1],
      linkCompact: msgv.match(/const MAX_DATA_BYTES_FOR_LINK_COMPACT: usize = ([\d_]+);/)?.[1],
      usernameProof: msgv.match(/const MAX_DATA_BYTES_FOR_USERNAME_PROOF: usize = ([\d_]+);/)?.[1],
    },
  );
  expectText('hash is BLAKE3 truncated to 20 bytes', msgv, /let result = blake3_20\(data_bytes\);/);
  expectText('the signature is verified over the hash, not the data bytes', msgv, /validate_signature\(\s*message\.signature_scheme,\s*&message\.hash,/);
  expectText('envelope signatures must be Ed25519', msgv, /signature_scheme != proto::SignatureScheme::Ed25519 as i32/);
  expectText('mainnet nodes accept only mainnet messages', msgv, /if current_network == FarcasterNetwork::Mainnet \{\s*if network != FarcasterNetwork::Mainnet/);
  expectText('at most 10 mentions', sc.read('src/core/validations/cast.rs'), /body\.mentions\.len\(\) > 10/);

  const engine = sc.read('src/storage/store/engine.rs');
  expectText('merge requires an id-register event for the fid', engine, /get_id_register_event_by_fid\(message_data\.fid/);
  expectText('merge requires an active key matching the signer', engine, /get_active_key\([\s\S]{0,200}message_data\.fid,\s*&message\.signer/);
  expectText('gasless keys are scope-checked, on-chain keys grandfathered', engine, /if !active_key\.admits\(msg_type\)/);
  expectText('key messages skip the active-signer check', engine, /if !is_key_message \{/);

  expectText('read nodes gossip submitted messages to validators', sc.read('src/mempool/mempool.rs'), /self\.gossip_message\(message, source\)\.await;\s*self\.statsd_client\s*\.count\("read_mempool\.messages_published"/);
  expectText('fid routes to a shard by SHA-256', sc.read('src/mempool/routing.rs'), /Sha256::digest\(\(fid as FidOnDisk\)\.to_be_bytes\(\)\);[\s\S]*\(hash_u32 % num_shards\) \+ 1/);

  const consensus = sc.read('src/consensus/consensus.rs');
  check(
    'consensus timing in milliseconds',
    { propose: '1000', prevote: '500', precommit: '500', block: '1000' },
    {
      propose: consensus.match(/propose_time: Duration::from_millis\((\d+)\)/)?.[1],
      prevote: consensus.match(/prevote_time: Duration::from_millis\((\d+)\)/)?.[1],
      precommit: consensus.match(/precommit_time: Duration::from_millis\((\d+)\)/)?.[1],
      block: consensus.match(/block_time: Duration::from_millis\((\d+)\)/)?.[1],
    },
  );
  expectText('event ids use 14 sequence bits', sc.read('src/storage/store/account/event.rs'), /pub const SEQUENCE_BITS: u32 = 14;/);
  const cfg = sc.read('src/cfg.rs');
  expectText('events kept for three days by default', cfg, /event_retention: Duration::from_secs\(60 \* 60 \* 24 \* 3\)/);
  expectText('node needs an L1 RPC for ENS proofs', cfg, /pub l1_rpc_url: String,/);
  expectText('read-node mode is a config switch', cfg, /pub read_node: bool,/);
  expectText('RPC auth is a config switch', cfg, /pub rpc_auth: String,/);
  expectText('snapshots come from the public R2 bucket', sc.read('src/storage/db/snapshot.rs'), 'https://pub-d352dd8819104a778e20d08888c5a661.r2.dev');
  expectText('fnames are polled from the fname server', sc.read('src/connectors/fname/mod.rs'), 'https://fnames.farcaster.xyz/transfers');

  const blocks = sc.read('proto/definitions/blocks.proto');
  expectText('block header fields', blocks, /message BlockHeader \{\s*Height height = 1;\s*uint64 timestamp = 2;\s*uint32 version = 3;\s*FarcasterNetwork chain_id = 4;\s*bytes shard_witnesses_hash = 5;\s*bytes parent_hash = 6;\s*bytes state_root = 7;\s*bytes events_hash = 8;/);
  expectText('a transaction is one fid with an account root', blocks, /message Transaction \{\s*uint64 fid = 1;\s*repeated Message user_messages = 2;\s*repeated ValidatorMessage system_messages = 3;\s*bytes account_root = 4;/);
  expectText('subscriptions take event types, from_id and shard', sc.read('proto/definitions/request_response.proto'), /message SubscribeRequest \{\s*repeated HubEventType event_types = 1;\s*optional uint64 from_id = 2;[\s\S]*?optional uint32 shard_index = 4;/);
  expectText('info exposes the next engine version timestamp', sc.read('proto/definitions/request_response.proto'), /uint64 next_engine_version_timestamp = 10;/);
  expectText('events docs: pruned after 3 days', sc.read('site/docs/pages/reference/httpapi/events.md'), 'Hubs prune events older than 3 days');
  expectText('the docs Rust snippet signs the data bytes (the caution in §2.2)', sc.read('site/docs/pages/reference/httpapi/message.md'), 'private_key.sign(&msg_data_bytes)');

  const spec = S.protocol.read('docs/SPECIFICATION.md');
  check(
    'spec: hash width, clock skew, epoch, mentions, chain',
    ['160-bit', 'not more than 600 seconds ahead', 'Jan 1, 2021 00:00:00 UTC', 'up to 10 mentions', 'on Optimism'],
    ['160-bit', 'not more than 600 seconds ahead', 'Jan 1, 2021 00:00:00 UTC', 'up to 10 mentions', 'on Optimism'].filter((t) => spec.includes(t)),
  );
  expectText('spec: ts-proto is the reference serialiser', spec, 'ts-proto@v1.146.0');
  check('spec ships conformance vectors', true, S.protocol.exists('vectors/README.md'));
  expectText('overview: a registry on a Turing-complete blockchain', S.protocol.read('docs/OVERVIEW.md'), 'smart contract registry on a Turing-complete blockchain');

  const cdocs = S.contracts.read('docs/docs.md');
  check(
    'contracts docs: deployment map and OP assumptions',
    ['deployed on OP Mainnet. The Tier Registry contract is deployed on Base Mainnet', 'OP Mainnet will not re-org after 6 confirmations', 'register an fid, rent storage units and register a key in a single transaction', 'requires callers to rent 1'],
    ['deployed on OP Mainnet. The Tier Registry contract is deployed on Base Mainnet', 'OP Mainnet will not re-org after 6 confirmations', 'register an fid, rent storage units and register a key in a single transaction', 'requires callers to rent 1'].filter((t) => cdocs.includes(t)),
  );

  const page = (p) => S.docs.read(`src/app/(docs)/${p}/page.mdx`);
  expectText('docs: onchain kept to a minimum', page('learn/architecture/overview'), 'Use of onchain actions is kept at a minimum to reduce costs and improve performance.');
  expectText('docs: accounts are created by an onchain transaction', page('learn/what-is-farcaster/accounts'), 'Any Ethereum address can register a Farcaster account by making an onchain transaction.');
  expectText('docs FAQ: no testnet deployment', page('reference/contracts/faq'), /Are the Farcaster contracts deployed to a testnet\?\s*No\./);
}

// --- docs/operations/setup-end-to-end.md ------------------------------------------

{
  const sc = S.snapchain;

  const nodes = sc.read('src/network/mesh/nodes.rs');
  check(
    'public node registry: hosts the runbook names',
    ['https://snap.farcaster.xyz:3381', 'https://crackle.farcaster.xyz:3381', 'https://pop.farcaster.xyz:3381', 'https://snap.uno.fun:3381', 'https://iris.farcaster.xyz:3381', 'https://juno.farcaster.xyz:3381', 'https://vega.farcaster.xyz:3381'],
    ['https://snap.farcaster.xyz:3381', 'https://crackle.farcaster.xyz:3381', 'https://pop.farcaster.xyz:3381', 'https://snap.uno.fun:3381', 'https://iris.farcaster.xyz:3381', 'https://juno.farcaster.xyz:3381', 'https://vega.farcaster.xyz:3381'].filter((h) => nodes.includes(h)),
  );
  expectText('pop is a read node', nodes, /name: "pop",[\s\S]{0,120}role: NodeRole::MainnetReader/);
  expectText('iris is a testnet validator', nodes, /name: "iris",[\s\S]{0,120}role: NodeRole::TestnetValidator/);
  expectText('the registry is a public API URL list for the browser UI', nodes, 'public HTTP API base URL the browser UI can hit');

  const mainnetCompose = sc.read('docker-compose.mainnet.yml');
  check(
    'mainnet compose writes a read-node config',
    { readNode: true, mainnet: true, shards: true, noRpc: true, ports: true },
    {
      readNode: /read_node = true/.test(mainnetCompose),
      mainnet: /fc_network="Mainnet"/.test(mainnetCompose),
      shards: /shard_ids = \[1,2\][\s\S]*num_shards = 2/.test(mainnetCompose),
      noRpc: !/rpc_url\s*=/.test(mainnetCompose),
      ports: mainnetCompose.includes('"3381:3381/tcp"') && mainnetCompose.includes('"3382:3382/udp"') && mainnetCompose.includes('"3383:3383/tcp"'),
    },
  );
  expectText('testnet compose exists and is a read node on Testnet', sc.read('docker-compose.testnet.yml'), /fc_network="Testnet"[\s\S]*read_node = true/);

  const main = sc.read('src/main.rs');
  expectText('on-chain connector starts only when an RPC URL is configured', main, /if !app_config\.onchain_events\.rpc_url\.is_empty\(\)/);
  expectText('the OP connector is hard-wired to Optimism with the network tag passed through', main, /node_local_state::Chain::Optimism,\s*app_config\.fc_network,/);

  const readme = sc.read('README.md');
  check(
    'README node facts',
    ['1.5TB of free storage', '< $1,000/month', 'This can take up to 2 hours', 'Ports 3381 - 3383 exposed on both TCP and UDP'],
    ['1.5TB of free storage', '< $1,000/month', 'This can take up to 2 hours', 'Ports 3381 - 3383 exposed on both TCP and UDP'].filter((t) => readme.includes(t)),
  );
  expectText('bootstrap script hands off to snapchain.sh upgrade', sc.read('scripts/snapchain-bootstrap.sh'), /exec \.\/snapchain\.sh "upgrade"/);
  expectText('snapchain.sh installs an auto-upgrade cron', sc.read('scripts/snapchain.sh'), 'snapchain.sh autoupgrade');

  const devCompose = sc.read('docker-compose.yml');
  expectText('devnet compose runs four nodes with node1 on 3381/3383', devCompose, /node1:[\s\S]*"3381:3381\/tcp"[\s\S]*"3383:3383\/tcp"[\s\S]*node4:/);
  expectText('devnet image bakes in admin auth dev:dev', sc.read('Dockerfile'), 'setup_local_testnet --docker --admin-rpc-auth dev:dev');
  expectText('make dev runs the compose with watch', sc.read('Makefile'), /^dev: build\n\tdocker compose up --watch/m);

  const cliReadme = sc.read('cli/README.md');
  check(
    'fc CLI facts',
    ['fc devnet bootstrap --grpc-node http://127.0.0.1:3383 --auth dev:dev', 'Submit a gasless `KEY_ADD`', 'fc subscribe --shard 1 --grpc-node https://iris.farcaster.xyz:3383', 'storage rent, ID-register, and a\nsigner'],
    ['fc devnet bootstrap --grpc-node http://127.0.0.1:3383 --auth dev:dev', 'Submit a gasless `KEY_ADD`', 'fc subscribe --shard 1 --grpc-node https://iris.farcaster.xyz:3383', 'storage rent, ID-register, and a\nsigner'].filter((t) => cliReadme.includes(t)),
  );
  expectText('fc defaults to the iris testnet node', sc.read('cli/src/main.rs'), 'default_value = "https://iris.farcaster.xyz:3381"');
  expectText('devnet bootstrap submits rent, register and signer events', sc.read('cli/src/main.rs'), /"STORAGE_RENT",[\s\S]*"ID_REGISTER",[\s\S]*"SIGNER_ADD",/);
  expectText('admin service accepts synthetic on-chain events', sc.read('proto/definitions/admin_rpc.proto'), 'rpc SubmitOnChainEvent(OnChainEvent) returns (OnChainEvent);');
  expectText('a read node has no local mempool and gossips writes', sc.read('src/mempool/mempool.rs'), "Read nodes don't have a local mempool");

  const api = S.OAS.read('src/api/spec.yaml');
  expectText('Neynar publishes a developer-signed message', api, 'Use the Message.toJSON method on the signed message and pass the JSON in the body of this POST request.');
  check(
    'Neynar webhook event types',
    ['cast.created', 'follow.created', 'reaction.created', 'user.created', 'user.updated'],
    ['cast.created', 'follow.created', 'reaction.created', 'user.created', 'user.updated'].filter((t) => api.includes(`${t}:`)),
  );
  check(
    'Neynar endpoints the runbook relies on',
    ['/v2/farcaster/message/:', '/v2/farcaster/webhook/:', '/v2/farcaster/storage/buy/:', '/v2/farcaster/signer/developer_managed/signed_key/:', '/v2/farcaster/cast/conversation/:', '/v2/farcaster/notifications/:'],
    ['/v2/farcaster/message/:', '/v2/farcaster/webhook/:', '/v2/farcaster/storage/buy/:', '/v2/farcaster/signer/developer_managed/signed_key/:', '/v2/farcaster/cast/conversation/:', '/v2/farcaster/notifications/:'].filter((t) => api.includes(t)),
  );

  const viem = S['auth-monorepo'].read('packages/auth-client/src/clients/ethereum/viemConnector.ts');
  check('SIWF verification reads idOf and keyDataOf over the configured RPC', { idOf: true, keyDataOf: true, rpcUrl: true, warning: true }, {
    idOf: viem.includes('functionName: "idOf"'),
    keyDataOf: viem.includes('functionName: "keyDataOf"'),
    rpcUrl: viem.includes('rpcUrl'),
    warning: viem.includes('using public endpoint. Do not use this in production'),
  });
  expectText('auth-kit config takes rpcUrl, domain and siweUri', S['auth-monorepo'].read('packages/auth-kit/README.md'), /rpcUrl: "https:\/\/mainnet\.optimism\.io",\s*domain: "example\.com",\s*siweUri: "https:\/\/example\.com\/login",/);

  expectText('docs feed guide builds a chronological feed from castsByFid', S.docs.read('src/app/(docs)/developers/guides/apps/feed/page.mdx'), 'client.getCastsByFid({');
}

// --- the reference client -------------------------------------------------------

const SNAPSHOT = findSnapshot();
if (!SNAPSHOT) {
  console.error('error: no client checkout found; set SNAPSHOT=/path/to/client');
  process.exit(1);
}
{
  const r = (rel) => readFileSync(join(SNAPSHOT, rel), 'utf8');
  expectText('web API host', r('apps/farcaster-web/src/constants/api.ts'), "'farcaster.xyz/~api'");
  expectText('web stream host', r('apps/farcaster-web/src/constants/api.ts'), 'wss://ws.farcaster.xyz/stream');
  expectText('mobile API host', r('packages/farcaster-client-data/src/client/AbstractFarcasterApiClient.ts'), "defaultBaseUrl = 'https://client.farcaster.xyz'");
  const client = r('packages/farcaster-client-data/src/client/FarcasterApiClient.ts');
  check(
    'signer endpoints on the private backend',
    ["'/v2/signed-key-requests'", "'/v2/approve-signed-key-requests'", "'/v2/warpcast-signed-key-request'"],
    ["'/v2/signed-key-requests'", "'/v2/approve-signed-key-requests'", "'/v2/warpcast-signed-key-request'"].filter((t) => client.includes(t)),
  );
  check(
    'sign-in endpoints on the private backend',
    ["'/v2/magic-link'", "'/v2/sign-in-with-farcaster'", "'/v2/auth/sessions'"],
    ["'/v2/magic-link'", "'/v2/sign-in-with-farcaster'", "'/v2/auth/sessions'"].filter((t) => client.includes(t)),
  );
  expectText(
    'backend pays the gas for external signers',
    r('packages/farcaster-client-hooks/src/hooks/data/mutations/useCreateExternalUserSigner.ts'),
    'The backend pays the gas',
  );
  expectText('casts are created through the backend', r('packages/farcaster-client-hooks/src/hooks/data/mutations/useCreateCast.ts'), 'apiClient.createCast(');

  const hubLibs = /@farcaster\/(core|hub-nodejs|hub-web)\b/;
  const manifests = [];
  for (const sub of ['apps', 'packages']) {
    for (const f of walk(join(SNAPSHOT, sub), ['package.json'])) {
      if (hubLibs.test(readFileSync(f, 'utf8'))) manifests.push(relative(SNAPSHOT, f));
    }
  }
  check('no hub library in any app or package manifest', [], manifests);

  const api = r('packages/farcaster-client-data/src/types/api.ts');
  const meta = api.slice(api.indexOf('export type ApiCastFeedItemMeta = {'), api.indexOf('};', api.indexOf('export type ApiCastFeedItemMeta = {')));
  check('feed items carry includeReason and score', { includeReason: true, score: true }, {
    includeReason: meta.includes('includeReason?:'),
    score: meta.includes('score?:'),
  });
  const m = api.match(/^export type ApiCastFeedIncludeReason =\n((?:\s+\|.*\n)+)/m);
  check('ten include reasons', 10, m ? m[1].split('\n').filter((l) => l.trim()).length : -1);

  // setup-end-to-end.md: the seams and endpoints the runbook replaces
  const clientSrc = r('packages/farcaster-client-data/src/client/FarcasterApiClient.ts');
  check(
    'media upload endpoints the runbook replaces',
    ["'/v1/generate-image-upload-url'", "'/v1/prepare-video-upload'", "'/v1/upload-video-with-tus'", "'/v1/uploaded-video'"],
    ["'/v1/generate-image-upload-url'", "'/v1/prepare-video-upload'", "'/v1/upload-video-with-tus'", "'/v1/uploaded-video'"].filter((t) => clientSrc.includes(t)),
  );
  check(
    'core screen endpoints the runbook maps',
    ["'/v2/feed-items'", "'/v2/casts'", "'/v2/thread-casts'", "'/v2/user'", "'/v2/user-by-username'", "'/v2/me'", "'/v2/followers'", "'/v2/following'", "'/v2/cast-likes'", "'/v2/cast-recasters'", "'/v2/recasts'", "'/v2/all-channels'", "'/v2/channel'", "'/v2/signed-key-request'", "'/v2/onboarding'"],
    ["'/v2/feed-items'", "'/v2/casts'", "'/v2/thread-casts'", "'/v2/user'", "'/v2/user-by-username'", "'/v2/me'", "'/v2/followers'", "'/v2/following'", "'/v2/cast-likes'", "'/v2/cast-recasters'", "'/v2/recasts'", "'/v2/all-channels'", "'/v2/channel'", "'/v2/signed-key-request'", "'/v2/onboarding'"].filter((t) => clientSrc.includes(t)),
  );
  expectText('the web app constructs one FarcasterApiClient in its provider', r('apps/farcaster-web/src/contexts/WebFarcasterApiClientProvider.tsx'), 'new FarcasterApiClient()');
  expectText('the realtime stream carries unseen counts, not casts', api, /export type ApiWebSocketMessageType =\s*\| 'unseen'\s*\| 'notification-tab-unseen'/);

  // client-landscape.md: what the template repository says about itself
  const templateReadme = r('README.md');
  check(
    'template README statements',
    ['A snapshot of the Farcaster client monorepo codebase without the Farcaster Wallet implementation', 'designed to be a reference for building a social client on top of the Farcaster protocol', 'run locally, pointing to the current production API by Farcaster', 'one-way, automatically generated snapshot', "Fork it and build on it"],
    ['A snapshot of the Farcaster client monorepo codebase without the Farcaster Wallet implementation', 'designed to be a reference for building a social client on top of the Farcaster protocol', 'run locally, pointing to the current production API by Farcaster', 'one-way, automatically generated snapshot', "Fork it and build on it"].filter((t) => templateReadme.includes(t)),
  );
  const licence = r('LICENSE');
  check('template licence', { mit: true, neynar: true }, { mit: licence.includes('MIT License'), neynar: licence.includes('Copyright (c) 2026 Neynar, Inc.') });
  expectText('template points at the community agent guide', r('AGENT_GUIDE.md'), 'https://github.com/danromero/farcaster-client-agent-guide');
  expectText('template syncs API types from a private backend', r('Makefile'), 'BACKEND_PATH ?= ../backend');
}

// --- docs/research/hypersnap.md ---------------------------------------------------

{
  const hs = S.hypersnap;
  const hd = S['hypersnap-docs-web'];
  const hw = S.hypersnapweb;
  const oc = S.opencaster;
  // Upstream as it stood when the page was written; `snapchain` itself has since been re-pinned.
  const sc = S['snapchain-8f82bcc'];
  const lines = (text) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

  // what Hypersnap is
  expectText('Hypersnap is GPL-3.0', hs.read('LICENSE'), /GNU GENERAL PUBLIC LICENSE\s+Version 3/);
  const cargo = hs.read('Cargo.toml');
  check(
    'Hypersnap Cargo package and binary',
    { name: 'snapchain', version: '0.13.5', bin: 'hypersnap' },
    {
      name: cargo.match(/^\[package\]\nname = "([^"]+)"/m)?.[1],
      version: cargo.match(/^version = "([^"]+)"/m)?.[1],
      bin: cargo.match(/^\[\[bin\]\]\nname = "([^"]+)"/m)?.[1],
    },
  );
  check(
    'Hypersnap CHANGELOG stops before its Cargo version',
    '[0.13.2] - 2026-06-24',
    hs.read('CHANGELOG.md').match(/^## (\[[^\]]+\] - \d{4}-\d{2}-\d{2})/m)?.[1],
  );

  // the network it joins
  const compose = hs.read('docker-compose.mainnet.yml');
  check(
    'Hypersnap mainnet compose: a read node of Farcaster mainnet with the API on',
    { network: true, readNode: true, shards: true, hyper: true, api: true, image: true },
    {
      network: compose.includes('fc_network="Mainnet"'),
      readNode: compose.includes('read_node = true'),
      shards: compose.includes('shard_ids = [1,2]'),
      hyper: /\[hyper\]\s+enabled = true/.test(compose),
      api: /\[api\]\s+enabled = true/.test(compose),
      image: compose.includes('image: farcasterorg/hypersnap:latest'),
    },
  );
  const peers = (text) =>
    new Set(
      (text.match(/bootstrap_peers = "([^"]+)"/)?.[1] ?? '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
    );
  const hsPeers = peers(compose);
  const scPeers = peers(sc.read('docker-compose.mainnet.yml'));
  check(
    'bootstrap peers shared with upstream',
    { hypersnap: 9, upstream: 9, shared: 8 },
    { hypersnap: hsPeers.size, upstream: scPeers.size, shared: [...hsPeers].filter((p) => scPeers.has(p)).length },
  );
  check(
    'upstream ships and runs the onchain validator-config pull; Hypersnap does not',
    { upstreamScript: true, upstreamCompose: true, hypersnapScript: false, hypersnapCompose: false },
    {
      upstreamScript: sc.exists('scripts/apply-onchain-config.sh'),
      upstreamCompose: sc.read('docker-compose.mainnet.yml').includes('apply-onchain-config.sh'),
      hypersnapScript: hs.exists('scripts/apply-onchain-config.sh'),
      hypersnapCompose: compose.includes('apply-onchain-config'),
    },
  );
  const hsVal = hs.read('validators.toml');
  const scVal = sc.read('validators.toml');
  check(
    'validators.toml is upstream 8f82bcc with only the title changed',
    { title: '# Hypersnap Mainnet Validator Sets', restIdentical: true },
    { title: hsVal.split('\n')[0], restIdentical: hsVal.split('\n').slice(1).join('\n') === scVal.split('\n').slice(1).join('\n') },
  );
  check(
    'Hypersnap validators.toml lacks the v18 sets (moria key absent)',
    false,
    hsVal.includes('bd465c947fe1acfac219fec2fb2ae1e8a13e2acd0498c413f2e54c946ea95095'),
  );
  check(
    'a read node verifies commit signatures and drops blocks from unexpected signers',
    { verify: true, drop: true, dropLog: true },
    {
      verify: hs.read('src/consensus/read_validator.rs').includes('verify_signatures(&commits, &self.validator_sets)'),
      drop: hs.read('src/core/util.rs').includes('Block contained signatures from unexpected signers'),
      dropLog: hs.read('src/consensus/read_validator.rs').includes('Dropping decided block because its signatures are invalid'),
    },
  );

  // engine parity
  const ver = hs.read('src/version/version.rs');
  const mainnet = ver.slice(ver.indexOf('ENGINE_VERSION_SCHEDULE_MAINNET'), ver.indexOf('ENGINE_VERSION_SCHEDULE_TESTNET'));
  const schedule = {};
  for (const m of mainnet.matchAll(/active_at:\s*(\d+),[^\n]*\n\s*version:\s*EngineVersion::V(\d+)/g)) {
    schedule[`V${m[2]}`] = new Date(Number(m[1]) * 1000).toISOString().slice(0, 10);
  }
  check(
    'Hypersnap mainnet engine schedule matches upstream for V16-V20',
    { V16: '2026-05-07', V17: '2026-06-04', V18: '2026-06-22', V19: '2026-07-27', V20: '2026-08-13' },
    Object.fromEntries(['V16', 'V17', 'V18', 'V19', 'V20'].map((v) => [v, schedule[v]])),
  );
  check(
    'Hypersnap gates V20 embeds and has no V21 channel gates',
    { v20: true, channelGates: false, upstreamHasChannelGates: true },
    {
      v20: /IncreaseEmbedLimitForAllUsers => self >= &EngineVersion::V20/.test(ver),
      channelGates: ver.includes('ChannelMessages'),
      upstreamHasChannelGates: sc.read('src/version/version.rs').includes('ChannelMessages'),
    },
  );
  const keyBody = (src) => {
    const proto = src.read('proto/definitions/message.proto');
    const body = proto.slice(proto.indexOf('message KeyAddBody {'), proto.indexOf('}', proto.indexOf('message KeyAddBody {')));
    return {
      scopes: body.includes('repeated int32 scopes = 9;'),
      ttl: body.includes('uint32 ttl = 10;'),
      maxTtl: src.read('src/core/validations/key.rs').match(/pub const MAX_KEY_TTL_SECONDS: u32 = ([^;]+);/)?.[1],
    };
  };
  check(
    'gasless keys carry scopes and a sliding ttl capped at 90 days, in Hypersnap as upstream',
    { hypersnap: { scopes: true, ttl: true, maxTtl: '90 * 24 * 60 * 60' }, upstream: { scopes: true, ttl: true, maxTtl: '90 * 24 * 60 * 60' } },
    { hypersnap: keyBody(hs), upstream: keyBody(sc) },
  );

  // the API layer
  let apiLines = 0;
  const apiRoutes = new Set();
  for (const f of walk(join(hs.dir, 'src/api'), ['.rs'])) {
    const text = readFileSync(f, 'utf8');
    apiLines += lines(text);
    for (const m of text.matchAll(/"(\/v2\/farcaster\/[^" ]*)"/g)) {
      const p = m[1].replace(/\/$/, '');
      if (!/cool-app|nonsense/.test(p)) apiRoutes.add(p);
    }
  }
  const oas = S.OAS.read('src/api/spec.yaml');
  const oasPaths = new Set([...oas.matchAll(/^ {2}(\/v2\/farcaster\/[^:\n]+):/gm)].map((m) => m[1].replace(/\/$/, '')));
  // Written as "all but one" so it holds as Neynar adds and removes paths: the
  // page counted 103 of 104 on 2026-10-23, and the spec has since dropped one.
  check(
    'Hypersnap route literals cover all but one path in Neynar OpenAPI',
    { hypersnap: 140, missing: 1, neynarOnly: ['/v2/farcaster/fungible/owner/relevant/bulk'] },
    {
      hypersnap: apiRoutes.size,
      missing: oasPaths.size - [...apiRoutes].filter((p) => oasPaths.has(p)).length,
      neynarOnly: [...oasPaths].filter((p) => !apiRoutes.has(p)).sort(),
    },
  );
  const http = hs.read('src/api/http.rs');
  check('size of the API layer', { httpRs: 5723, srcApi: 30845 }, { httpRs: lines(http), srcApi: apiLines });
  const writeArm = http.slice(http.indexOf("// Write action stubs — these require managed signer infrastructure"), http.indexOf("Write operations require submitting signed Farcaster messages via the gRPC SubmitMessage endpoint"));
  check(
    'mutating routes answer 501 and point at SubmitMessage',
    { text: true, routes: ['/v2/farcaster/message', '/v2/farcaster/signer', '/v2/farcaster/signer/signed_key', '/v2/farcaster/login/nonce', '/v2/farcaster/login/authorize', '/v2/farcaster/user/register', '/v2/farcaster/storage/buy', '/v2/farcaster/reaction', '/v2/farcaster/follow'] },
    {
      text: http.includes('StatusCode::NOT_IMPLEMENTED,\n                    "Write operations require submitting signed Farcaster messages via the gRPC SubmitMessage endpoint"'),
      routes: ['/v2/farcaster/message', '/v2/farcaster/signer', '/v2/farcaster/signer/signed_key', '/v2/farcaster/login/nonce', '/v2/farcaster/login/authorize', '/v2/farcaster/user/register', '/v2/farcaster/storage/buy', '/v2/farcaster/reaction', '/v2/farcaster/follow'].filter((r) => writeArm.includes(`"${r}")`)),
    },
  );
  expectText('managed Neynar endpoints answer 501 on a self-hosted node', http, 'This endpoint requires managed infrastructure not available on a self-hosted node');
  expectText('"for you" is an alias of the trending feed', http, '// "For you" feed — alias to trending as personalization');
  expectText('feeds are following and trending, computed on demand', hs.read('src/api/feeds.rs'), /Feeds are computed on-demand[\s\S]*Following Feed[\s\S]*Trending Feed\*\*: Top casts by engagement score/);
  check('trending keeps the top 1000 and defaults to a 24-hour window', { size: '1000', hours: '24' }, {
    size: hs.read('src/api/feeds.rs').match(/const TRENDING_RANKING_SIZE: usize = (\d+);/)?.[1],
    hours: hs.read('src/api/config.rs').match(/fn default_trending_window_hours\(\) -> u32 \{\s*(\d+)/)?.[1],
  });
  check('search engines', ['Tantivy', 'Meilisearch'], [...(hs.read('src/api/config.rs').match(/pub enum SearchEngine \{([\s\S]*?)\n\}/)?.[1] ?? '').matchAll(/^\s{4}(\w+),/gm)].map((m) => m[1]));
  const server = hs.read('src/network/http_server.rs');
  check(
    'v2 routes share the node HTTP port and the protocol write path is retained',
    { v2: true, submit: true, grpc: true },
    {
      v2: server.includes('if handler.can_handle(req.method(), path)'),
      submit: server.includes('(&Method::POST, "/v1/submitMessage")'),
      grpc: hs.read('src/network/server.rs').includes('async fn submit_message_to_mempool('),
    },
  );
  check(
    'hyper mode: config flag, gossip capability, design doc, stub CLI',
    { config: true, gossip: true, design: '# Hyper Mode Architecture', stub: true, proto: true },
    {
      config: /pub struct HyperConfig \{\s*pub enabled: bool,/.test(hs.read('src/hyper/mod.rs')),
      gossip: hs.read('src/network/gossip.rs').includes('cap == CAPABILITY_HYPER'),
      design: hs.read('docs/hyper.md').split('\n')[0],
      stub: hs.read('src/bin/hyper.rs').includes('let report = HyperDiffReport {'),
      proto: hs.exists('proto/definitions/hyper.proto'),
    },
  );
  expectText('the smoke test defaults to the public node', hs.read('scripts/test-v2-api.sh'), 'BASE="${1:-https://haatz.quilibrium.com}"');
  expectText('the launcher warns there is no token', hs.read('scripts/hypersnap.sh'), 'The network has not yet released a token. Running a node at this time will not earn tokens.');
  const reqs = ['- 16 GB of RAM', '- 4 CPU cores or vCPUs', '- 1.5TB of free storage'];
  check('node requirements are Snapchain\'s', { hypersnap: reqs, upstream: reqs }, {
    hypersnap: reqs.filter((r) => hs.read('README.md').includes(r)),
    upstream: reqs.filter((r) => sc.read('README.md').includes(r)),
  });
  expectText('the build pins a forked signature library', hs.read('README.md'), 'CassOnMars/eth-signature-verifier');

  // what the docs say
  const introLines = [
    'Hypersnap is a Rust implementation of a Farcaster node. Alongside the core consensus + gossip layer, it exposes an HTTP API at `/v2/farcaster/*` that mirrors the shape of the broader Farcaster v2 API ecosystem so existing client SDKs and patterns work unchanged.',
    'It is **not** an identity system. Hypersnap reads identity state from the on-chain `IdRegistry` contract.',
    'It is **not** a walled garden. Every public read endpoint is unauthenticated',
  ];
  check('docs introduction statements', introLines, introLines.filter((t) => hd.read('src/introduction.md').includes(t)));
  const limitLines = [
    'Hypersnap is designed to be run by node operators for their own apps, not as a centralized API vendor',
    'There is **no built-in per-IP rate limit** on the public read endpoints.',
    '- Default: **1000 events per 60 seconds**, per webhook.',
    '- **Webhooks:** `max_webhooks_per_owner` (default **25**).',
  ];
  check('docs rate-limit statements', limitLines, limitLines.filter((t) => hd.read('src/concepts/rate-limits.md').includes(t)));
  expectText('webhook management signs EIP-712 with the Hypersnap domain on chain 10', hd.read('src/concepts/authentication.md'), 'const domain  = { name: "Hypersnap", version: "1", chainId: 10 };');
  const guideLines = ['Every one of these is a single unauthenticated GET against a Hypersnap node.', "- **You don't submit casts through this API.**"];
  check('build-a-client guide statements', guideLines, guideLines.filter((t) => hd.read('src/guides/build-a-client.md').includes(t)));
  expectText('the docs name the public node', hd.read('src/playground.md'), 'haatz.quilibrium.com');

  // what hypersnap.org is generated from
  const site = hw.json('src/data/farcasterorg-sources.json');
  check(
    'hypersnap.org curated facts',
    { org: '2026-02-15', node: 'https://haatz.quilibrium.com', prefix: '/v2/farcaster', requirements: ['16 GB RAM', '4 CPU cores or vCPUs', '1.5 TB free storage', 'Public IP address', 'Ports 3381-3383 exposed on TCP and UDP'], notice: 'The network has not yet released a token. Running a node at this time will not earn tokens.' },
    { org: site.organization?.createdAt?.slice(0, 10), node: site.publicNode?.baseUrl, prefix: site.publicNode?.apiPrefix, requirements: site.node?.requirements, notice: site.node?.noRewardsNotice },
  );
  expectText('the site is built by Arca Computer', hw.read('README.md'), 'built and maintained by [Arca Computer](https://arca.computer)');

  // Opencaster
  expectText('Opencaster is AGPL-3.0', oc.read('LICENSE'), /GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3/);
  const ocLines = ['**An open source client for everyone. Powered by Arca Computer. Runs on Hypersnap.**', 'forked from [Quorum Desktop](https://github.com/QuilibriumNetwork/quorum-desktop)', 'This is an independent client, not an official Quorum or Farcaster release.'];
  check('Opencaster README statements', ocLines, ocLines.filter((t) => oc.read('README.md').includes(t)));
  const worker = oc.read('hypersnap/worker/index.ts');
  check(
    'Opencaster worker: one upstream, the protocol write path, a 64 KiB cap',
    { upstream: true, write: true, cap: true },
    {
      upstream: worker.includes("const UPSTREAM = 'https://haatz.quilibrium.com';"),
      write: worker.includes("const isWrite = path === '/v1/submitMessage';"),
      cap: worker.includes('Signed message exceeds 64 KiB.'),
    },
  );
  const clientLines = [
    'It generates a random Ed25519 posting key in the browser and asks a compatible wallet app to approve it using `eth_signTypedData_v4`.',
    'No Farcaster-operated login service is involved.',
    'gasless KEY_ADD',
    'Default device keys request `[1, 3, 4]`: casts/replies and adding/removing reactions.',
    'require a separate, explicit approval for a new key with `[1, 3, 4, 5, 6, 11]`.',
    'All permission sets use a **seven-day sliding inactivity window**',
    'this version has no failover or independent indexer',
    'Excluded: creating Farcaster accounts, paid storage/on-chain registration, seed recovery, wallet transfers, DM transport, push notifications, video uploads, end-user media deletion, and mini-app execution.',
    'This is a beta, and no independent security audit is claimed.',
    'no Farcaster-hosted API client, account service, websocket, or source dependency was imported',
  ];
  check('Opencaster signing model, gateway dependency, exclusions and status', clientLines, clientLines.filter((t) => oc.read('hypersnap/README.md').includes(t)));
}

// --- docs/research/both-networks.md -------------------------------------------------

{
  const sl = S.snapchain;
  const ma = S['farcasterorg-miniapps'];
  const fl = S.fatline;
  const ce = S['farcaster-census'];

  // Farcaster side after 2026-10-15: the protocol work continued
  expectText('Snapchain release on the day of the deal', sl.read('CHANGELOG.md'), /^## \[0\.14\.3\] - 2026-10-15$/m);
  const val = sl.read('validators.toml');
  check(
    'the v18 validator swap: heights and names',
    { shard0: '48_632_000', shard2: '49_147_000', shard1: '49_311_000', comment: true },
    {
      shard0: val.match(/# v18 \(registry configVersion 18\)[^\n]*\n[^\n]*on block shard 0\n\[\[consensus\.validator_sets\]\]\neffective_at = ([\d_]+)/)?.[1],
      shard2: val.match(/# v18: same swap on message shard 2\n\[\[consensus\.validator_sets\]\]\neffective_at = ([\d_]+)/)?.[1],
      shard1: val.match(/# v18: same swap on message shard 1\n\[\[consensus\.validator_sets\]\]\neffective_at = ([\d_]+)/)?.[1],
      comment: val.includes('# v18 (registry configVersion 18): moria (bd465c...) and isengard (be846f...)'),
    },
  );
  expectText('upstream pulls validator config from the chain at boot', sl.read('docker-compose.mainnet.yml'), '/app/apply-onchain-config.sh config.toml || exit 1');
  const vdoc = sl.read('site/docs/pages/validators.mdx');
  check(
    'validator docs: seven keys, five of them Neynar, five signatures commit',
    { neynar: 5, uno: 1, degen: 1, rule: true },
    {
      neynar: count(vdoc, /\| Neynar \|/g),
      uno: count(vdoc, /\| Uno \|/g),
      degen: count(vdoc, /\| Degen \|/g),
      rule: vdoc.includes('All seven validators carry equal weight. A block commits once more than two thirds of them have signed it, which is five of seven'),
    },
  );
  expectText('fc cast-add gained format_version (chained casts work continues)', sl.read('cli/src/main.rs'), 'format_version: u32,');

  // Cassie Heart's packages: login without Farcaster's server
  expectText('the miniapps fork keeps the Merkle copyright', ma.read('LICENSE'), 'Copyright (c) 2024-present Merkle Manufactory Inc.');
  check(
    'the farcasterorg packages and versions',
    { sdk: ['@farcasterorg/miniapp-sdk', '0.4.0'], auth: ['@farcasterorg/quick-auth', '0.2.0'] },
    {
      sdk: [ma.json('packages/miniapp-sdk/package.json').name, ma.json('packages/miniapp-sdk/package.json').version],
      auth: [ma.json('packages/quick-auth/package.json').name, ma.json('packages/quick-auth/package.json').version],
    },
  );
  const qa = ma.read('packages/quick-auth/README.md');
  const qaLines = [
    'Quick Auth without an auth server.',
    'This library verifies one against\nFarcaster protocol state read from a hub.',
    'drop-in replacement for [`@farcaster/quick-auth`]',
    'const client = createClient() // hubUrl defaults to https://haatz.quilibrium.com',
    '- Starts with `hqa1.`, followed by the base64url message and signature.',
    'Uses `/v1/fidAddressType`, `/v1/verificationsByFid`, `/v1/signer` and\n`/v1/onChainEventsByFid`.',
  ];
  check('quick-auth README statements', qaLines, qaLines.filter((t) => qa.includes(t)));
  expectText('the SDK side: protocol auth with no auth server', ma.read('packages/miniapp-sdk/src/protocolAuth.ts'), 'Protocol Quick Auth: like `sdk.quickAuth`, but with no auth server.');
  check(
    'both node kinds serve the four hub endpoints quick-auth calls',
    { snapchain: 4, hypersnap: 4 },
    {
      snapchain: ['fidAddressType', 'verificationsByFid', 'signer', 'onChainEventsByFid'].filter((e) => S.snapchain.read('src/network/http_server.rs').includes(`"/v1/${e}"`)).length,
      hypersnap: ['fidAddressType', 'verificationsByFid', 'signer', 'onChainEventsByFid'].filter((e) => S.hypersnap.read('src/network/http_server.rs').includes(`"/v1/${e}"`)).length,
    },
  );

  // fatline: the stall as witnessed, and the two-network client design
  expectText('fatline is MIT', fl.read('LICENSE'), 'MIT License');
  const fr = fl.read('README.md');
  const frLines = [
    "Hypersnap: stood still 13:00–18:37 UTC because the validator list in Hypersnap's repository misses Farcaster's 2026-10-22 validator change ([issue #41](https://github.com/farcasterorg/hypersnap/issues/41)); our setup now takes the list from Snapchain, and it is catching up.",
    'Farcaster and Hypersnap side by side need two servers.',
    'Both reported ~914 million messages on 2026-10-21.',
    "Neynar's hosted node API now charges per request over x402 (0.01 USDC) instead of an API key.",
    '| Public keyless node in the config | `crackle.farcaster.xyz:3381` | `haatz.quilibrium.com` |',
    'Choose one and every read and post goes only through it; if it is down, you get an error naming it, never a quiet switch.',
    'a message on both networks becomes one item with two statuses',
    'Checked on 2026-10-22 for FID 18350: haatz and our own Hypersnap node each gave the same 4,824 messages',
  ];
  check('fatline README statements', frLines, frLines.filter((t) => fr.includes(t)));
  const note = fl.read('research/STATE-OF-FARCASTER-2026-10-18.md');
  const noteLines = [
    'was posted **October 17, 2026, 14:47:30 UTC**',
    '| Read nodes do not accept writes | They accept message submissions and relay them to validators |',
    '| An app key needs a small Optimism transaction | Gasless app keys are available |',
    'lists seven equally weighted validator keys: five Neynar, one Uno, and one Degen',
  ];
  check("fatline's note on the prize and its clarification", noteLines, noteLines.filter((t) => note.includes(t)));

  // the vote, counted from public data
  expectText('the census is MIT', ce.read('LICENSE'), 'MIT License');
  const census = ce.json('data/final-numbers.json');
  check(
    'the ballot contract and the counts the page quotes',
    { contract: '0x4ecfed276c566aeb49da1f3a888e8dbb7263028d (Base)', holders: 24578, asOf: 'Base block 52,840,567 = 2026-10-20T04:28:01Z', announcement: '2026-10-15T17:47Z' },
    { contract: census.chain?.contract, holders: census.chain?.holders_signed, asOf: census.chain?.as_of, announcement: census.frames?.announcement },
  );
  check(
    'opt-outs, restrictions and the status endpoint',
    { optOutsMin: true, restricted: true, endpoint: true, tokenIdIsFid: true },
    {
      optOutsMin: JSON.stringify(census).includes('481'),
      restricted: JSON.stringify(census).includes('263'),
      endpoint: ce.read('README.md').includes('`GET client.farcaster.xyz/v2/user?fid=N` → `viewerContext.optInStatus`, no login'),
      tokenIdIsFid: ce.read('README.md').includes('tokenId = fid'),
    },
  );
}

// --- docs/research/optimal-design.md ------------------------------------------------

{
  const hf = S['hypersnap-fork'];
  const sc = S.snapchain;
  const sm = S.smashcast;
  const qc = S.quilcast;
  const on = S['opencaster-now'];
  const hwn = S['hypersnapweb-now'];

  // --- Farcaster's side, as it stands ---
  check(
    'Snapchain and Hypersnap are both GPL-3.0',
    { snapchain: true, snapchainAtOldPin: true, hypersnap: true },
    {
      snapchain: /GNU GENERAL PUBLIC LICENSE\s+Version 3/.test(sc.read('LICENSE')),
      snapchainAtOldPin: /GNU GENERAL PUBLIC LICENSE\s+Version 3/.test(S['snapchain-8f82bcc'].read('LICENSE')),
      hypersnap: /GNU GENERAL PUBLIC LICENSE\s+Version 3/.test(hf.read('LICENSE')),
    },
  );
  const scLog = sc.read('CHANGELOG.md');
  const logLines = [
    '## [0.15.0] - 2026-10-23',
    '- *(cast)* Allow 10k casts and banners for all users, not just Pro (#1054)',
    '- *(version)* Schedule V21 and V22 on mainnet for 2026-10-23 12:00 UTC (#1083)',
    '## [0.16.0] - 2026-10-28',
    '- *(consensus)* Tighten validation of decided values and peer messages (#1089)',
  ];
  check('Snapchain changelog: two releases in the week after the deal', logLines, logLines.filter((t) => scLog.includes(t)));
  let scMentionsHypersnap = 0;
  for (const dir of ['src', 'site/docs']) {
    for (const f of walk(join(sc.dir, dir), ['.rs', '.mdx', '.md'])) {
      if (/hypersnap/i.test(readFileSync(f, 'utf8'))) scMentionsHypersnap += 1;
    }
  }
  check('Snapchain source and docs do not mention Hypersnap', 0, scMentionsHypersnap);

  // --- the fork, as scheduled in code ---
  check('Hypersnap version at the fork commit', '0.17.4', hf.read('Cargo.toml').match(/^version = "([^"]+)"/m)?.[1]);
  const fv = hf.read('validators.toml');
  const forkLines = [
    '# Initial Hypersnap fork: eight validators collected in issue #51.',
    '# Height snapshot: 2026-11-06 09:25:20 UTC; projected activation: 2026-11-12 09:25:20 UTC.',
    '# Postponed by three days so peers can prepare after consensus was lost.',
    '# Activation time is an estimate; consensus activates at the exact heights below.',
  ];
  check('the fork schedule as written in validators.toml', forkLines, forkLines.filter((t) => fv.includes(t)));
  const sets = [...fv.matchAll(/\[\[consensus\.validator_sets\]\]\neffective_at = ([\d_]+)\nshard_ids = \[ (\d) \]\nvalidator_public_keys = \[\n([\s\S]*?)\n\]/g)].map((m) => ({
    at: Number(m[1].replaceAll('_', '')),
    shard: Number(m[2]),
    keys: [...m[3].matchAll(/"([0-9a-f]{64})"/g)].map((k) => k[1]),
  }));
  const forkSets = sets.filter((s) => s.at >= 50_000_000);
  const farcasterKeys = new Set(sets.filter((s) => s.at < 50_000_000).flatMap((s) => s.keys));
  check(
    'fork heights, eight validators per shard, none of them a Farcaster validator',
    { heights: { 0: 50433538, 1: 51119199, 2: 50954121 }, keysPerShard: [8, 8, 8], distinctKeys: 8, sharedWithFarcaster: 0 },
    {
      heights: Object.fromEntries(forkSets.map((s) => [s.shard, s.at]).sort()),
      keysPerShard: forkSets.map((s) => s.keys.length),
      distinctKeys: new Set(forkSets.flatMap((s) => s.keys)).size,
      sharedWithFarcaster: [...new Set(forkSets.flatMap((s) => s.keys))].filter((k) => farcasterKeys.has(k)).length,
    },
  );
  const table = (name) => {
    const body = fv.slice(fv.indexOf(`[${name}]`)).split('\n\n')[0];
    return Object.fromEntries([...body.matchAll(/^"(\d)" = ([\d_]+)$/gm)].map((m) => [m[1], Number(m[2].replaceAll('_', ''))]));
  };
  check(
    'gossip topics and native registration switch at the same heights',
    { gossip: { 0: 50433538, 1: 51119199, 2: 50954121 }, native: { 0: 50433538, 1: 51119199, 2: 50954121 } },
    { gossip: table('gossip.topic_cutovers'), native: table('consensus.native_registration.activation_heights') },
  );
  check('Hypersnap now carries the v18 sets it lacked on 2026-10-22', true, fv.includes('bd465c947fe1acfac219fec2fb2ae1e8a13e2acd0498c413f2e54c946ea95095'));
  const fver = hf.read('src/version/version.rs');
  const fmain = fver.slice(fver.indexOf('ENGINE_VERSION_SCHEDULE_MAINNET'), fver.indexOf('ENGINE_VERSION_SCHEDULE_TESTNET'));
  const fsched = {};
  for (const m of fmain.matchAll(/active_at:\s*(\d+),[^\n]*\n\s*version:\s*EngineVersion::V(\d+)/g)) {
    fsched[`V${m[2]}`] = new Date(Number(m[1]) * 1000).toISOString().slice(0, 10);
  }
  check(
    'Hypersnap follows the engine schedule through V23; channels are V24 and unscheduled on both',
    { V21: '2026-10-23', V22: '2026-10-23', V23: '2026-10-29', V24: false, channelsAtV24: true },
    { V21: fsched.V21, V22: fsched.V22, V23: fsched.V23, V24: 'V24' in fsched, channelsAtV24: /ProtocolFeature::ChannelMessages\s*\|\s*ProtocolFeature::VerificationsOnShardZero => self >= &EngineVersion::V24/.test(fver) },
  );

  // --- the relay ---
  const shuttle = hf.read('docs/shuttle.md');
  const shuttleLines = [
    "network's mempool. It does not relay consensus, block certificates, on-chain\nevents, Fname system transfers, or Hyper envelopes.",
    'Existing Snapchain validators will not relay the new topics',
    'signers and storage. The shuttle cannot transfer those prerequisites between\nnetworks; RPC validation failures are logged and skipped.',
    'A successful publish means gossipsub queued the message to subscribed peers, not\nthat consensus included it.',
    'Both sides use the same Farcaster network ID.',
  ];
  check('relay documentation statements', shuttleLines, shuttleLines.filter((t) => shuttle.includes(t)));
  const relay = hf.read('src/shuttle/relay.rs');
  check(
    'the relay carries message types 1-8 and 11-21 and never a native account',
    { types: true, nativeSkipped: true, keyAdd: true, bytesVerbatim: true },
    {
      types: hf.read('src/shuttle/config.rs').includes('(1..=8).chain(11..=21).collect()'),
      nativeSkipped: /if crate::native_registration::is_native_fid\(data\.fid\)\s*\|\| data\.r#type == proto::MessageType::NativeOnboard as i32\s*\{\s*return None;/.test(relay),
      keyAdd: relay.includes('| (16, Some(Body::KeyAddBody(_)))') && relay.includes('| (17, Some(Body::KeyRemoveBody(_)))'),
      bytesVerbatim: relay.includes('// Preserve signed bytes verbatim.'),
    },
  );
  expectText('README: what the relay is', hf.read('README.md'), "The standalone `shuttle` binary relays compatible signed user messages from each\nnetwork's committed blocks to the opposite mempool");

  // --- native accounts and storage ---
  const native = hf.read('docs/native-registration.md');
  const nativeLines = [
    'work, validator-assigned FIDs beginning at `4294967296` (`2^32`), and a',
    'The port includes no token, staking, reward, fee-market, Falcon, or validator-election\nchanges.',
    'native FIDs as decimal strings; use `BigInt` or strings in clients.',
    'The release uses a 22-bit minimum difficulty',
    'Storage slots stop affecting admission, storage-derived message rate limits,\nverification quotas, and quota pruning at each shard\'s configured fork height.',
    'Neither native registrations nor messages authored by native FIDs are\nrelayed to Snapchain by the shuttle',
  ];
  check('native registration documentation statements', nativeLines, nativeLines.filter((t) => native.includes(t)));
  check(
    'native fids start at 2^32 and storage limits switch off with the fork',
    { first: '1 << 32', gate: true, unlimited: true },
    {
      first: hf.read('src/native_registration.rs').match(/pub const FIRST_NATIVE_FID: u64 = ([^;]+);/)?.[1],
      gate: /pub fn storage_limits_disabled\(&self\) -> bool \{[\s\S]{0,400}crate::native_registration::fork_active\(/.test(hf.read('src/storage/store/stores.rs')),
      unlimited: /if self\.storage_limits_disabled\(\) \{[\s\S]{0,900}limit: u64::MAX,/.test(hf.read('src/storage/store/stores.rs')),
    },
  );

  // --- telling the networks apart, and the node role ---
  const fhttp = hf.read('src/network/http_server.rs');
  const shttp = sc.read('src/network/http_server.rs');
  check(
    'only a Hypersnap node answers the native-registration routes',
    { hypersnap: ['"/v1/nativeAccount"', '"/v1/nativeRegistration"'], snapchain: [] },
    {
      hypersnap: ['"/v1/nativeAccount"', '"/v1/nativeRegistration"'].filter((r) => fhttp.includes(r)),
      snapchain: ['"/v1/nativeAccount"', '"/v1/nativeRegistration"'].filter((r) => shttp.includes(r)),
    },
  );
  const infoMsg = hf.read('proto/definitions/request_response.proto');
  check(
    '/v1/info names no network',
    ['version', 'db_stats', 'peerId', 'num_shards', 'shard_infos', 'next_engine_version_timestamp'],
    [...infoMsg.slice(infoMsg.indexOf('message GetInfoResponse {'), infoMsg.indexOf('}', infoMsg.indexOf('message GetInfoResponse {'))).matchAll(/^\s+(?:repeated )?\w+ (\w+) = \d+;/gm)].map((m) => m[1]),
  );
  expectText('a node infers its role; old read_node settings are ignored', hf.read('site/docs/pages/node-types.mdx'), 'Legacy `read_node` and `SNAPCHAIN_READ_NODE` settings are ignored');

  // --- the API a client would read ---
  const fapiRoutes = new Set();
  for (const f of walk(join(hf.dir, 'src/api'), ['.rs'])) {
    for (const m of readFileSync(f, 'utf8').matchAll(/"(\/v2\/farcaster\/[^" ]*)"/g)) {
      const p = m[1].replace(/\/$/, '');
      if (!/cool-app|nonsense/.test(p)) fapiRoutes.add(p);
    }
  }
  const oasSpec = S.OAS.read('src/api/spec.yaml');
  const oasSet = new Set([...oasSpec.matchAll(/^ {2}(\/v2\/farcaster\/[^:\n]+):/gm)].map((m) => m[1].replace(/\/$/, '')));
  check(
    'route coverage of the pinned Neynar spec at the fork commit',
    { hypersnap: 140, neynar: 103, shared: 102 },
    { hypersnap: fapiRoutes.size, neynar: oasSet.size, shared: [...fapiRoutes].filter((p) => oasSet.has(p)).length },
  );
  const fapi = hf.read('src/api/http.rs');
  const needed = ['feed/following', 'feed/trending', 'feed/channels', 'feed/user/replies_and_recasts', 'following/suggested', 'followers/relevant', 'cast/metrics', 'cast/conversation', 'notifications', 'user/bulk', 'reactions/cast', 'channel'];
  check(
    'the reads Home needs to rank and explain have handlers, not stubs',
    needed,
    needed.filter((r) => new RegExp(`"/v2/farcaster/${r}"[^\\n]*=> \\{`).test(fapi)),
  );
  check(
    '"for you" is still trending; trending filters by the app that registered the signing key',
    { alias: true, include: true, exclude: true, viewer: true },
    {
      alias: fapi.includes('// "For you" feed — alias to trending as personalization'),
      include: hf.read('docs/trending-feed.md').includes('| `include_signer_fids` | Return casts signed by keys registered by any of these app FIDs. |'),
      exclude: hf.read('docs/trending-feed.md').includes('| `exclude_signer_fids` | Skip casts signed by keys registered by any of these app FIDs. |'),
      viewer: fapi.includes('params.get("viewer_fid")'),
    },
  );
  expectText('writes still answer 501 on the v2 API', fapi, 'Write operations require submitting signed Farcaster messages via the gRPC SubmitMessage endpoint');

  // --- a fork of the reference client that went protocol-direct ---
  expectText('SmashCast keeps the reference client licence', sm.read('LICENSE'), 'Copyright (c) 2026 Neynar, Inc.');
  const smr = sm.read('packages/farcaster-protocol/README.md');
  const smLines = [
    '## What was checked against mainnet (16 Oct 2026)',
    '| `https://haatz.quilibrium.com` | Default. Snapchain 0.13.5, `Access-Control-Allow-Origin: *`, `OPTIONS /v1/submitMessage` returns 204, so the browser can submit without a proxy. |',
    '| `https://snap.farcaster.xyz:3381` | Read replica, version 0.14.2. `OPTIONS /v1/submitMessage` is 404, so a browser preflight fails. Server-side validate/submit still parse 0.18.11 messages. |',
    'This costs no gas. It is not proven with a real custody signature in this repo',
    '`0.18.11` ships the `KEY_ADD` protobuf and `makeMessage`, but not `makeKeyAdd` / `getGaslessSignedKeyRequestMetadata`',
    "is the user's own casts plus `castsByFid` for the first page of follows (`linksByFid`, 24 accounts, 4 casts each), merged newest-first.",
  ];
  check('SmashCast protocol package statements', smLines, smLines.filter((t) => smr.includes(t)));
  check(
    'the gasless key signing domain, in a client and in Snapchain',
    { client: true, snapchain: 'Farcaster KeyAdd' },
    {
      client: /export const GASLESS_KEY_DOMAIN = \{\s*name: 'Farcaster KeyAdd',\s*version: '1',\s*chainId: 1,/.test(sm.read('packages/farcaster-protocol/src/constants.ts')),
      snapchain: sc.read('src/core/validations/key.rs').match(/pub const KEY_DOMAIN_NAME: &str = "([^"]+)";/)?.[1],
    },
  );

  // --- clients that already read a node directly ---
  expectText('Quilcast is MIT', qc.read('LICENSE'), 'MIT License');
  const qcLines = [
    'It talks straight to [Hypersnap](https://hypersnap.org), the Farcaster network that Quilibrium runs, rather than through a hosted API, and your signing keys stay in your own browser.',
    'writes are protobuf messages signed in the browser and posted to `/v1/submitMessage`',
    'it depends on the Hypersnap node it reads from (`haatz.quilibrium.com` by default, changeable in Settings)',
  ];
  check('Quilcast README statements', qcLines, qcLines.filter((t) => qc.read('README.md').includes(t)));
  const onLines = [
    'Production configuration currently uses the public Haatz node as its primary during the private-node reinstall',
    'Eligible reads make at most one backup attempt after transport failure, timeout or HTTP 5xx, within one 20-second deadline.',
    'Signed submissions are never replayed automatically',
  ];
  check("Opencaster's gateway policy today", onLines, onLines.filter((t) => on.read('apps/web-client/README.md').includes(t)));
  const snapTs = hwn.read('src/lib/snap.ts');
  check(
    'hypersnap.org on the token and on client developers',
    { contract: true, disclaimer: true, clients: true },
    {
      contract: snapTs.includes('contract: "0x49B5a631F54927c0007232844f06FE18cbf69786"') && snapTs.includes('chain: "Ethereum"'),
      disclaimer: snapTs.includes('// A listing is not evidence of issuer authority or adopted protocol economics.'),
      clients: snapTs.includes("A maintainer intends app-FID-usage-attributed coverage for full-client developers and acknowledges the proposal's omission; not a payable entitlement."),
    },
  );

  // --- running nodes, and small facts the design leans on ---
  const fatlineReadme = S.fatline.read('README.md');
  const costLines = ['~$2.50/day', '(~400 GB compressed, ~600 GB unpacked)', 'Farcaster: in sync at 12:25 UTC (5 h 43 min after it answered)'];
  check("one operator's measured cost, snapshot size and sync time for a read node", costLines, costLines.filter((t) => fatlineReadme.includes(t)));
  check(
    'the following feed can include recasts; a relayed duplicate is dropped by hash',
    { withRecasts: true, dedupe: true },
    {
      withRecasts: hf.read('src/api/http.rs').includes('params.get("with_recasts")'),
      dedupe: hf.read('docs/shuttle.md').includes('publish may be delivered again, which mempool message hashes deduplicate.'),
    },
  );
  check(
    'why browser-posting clients default to the Hypersnap node',
    { writable: true, preflightFails: true },
    {
      writable: sm.read('packages/farcaster-protocol/src/constants.ts').includes("/** Writable public Snapchain node. CORS allows browser submitMessage. */\nexport const DEFAULT_HUB_URL = 'https://haatz.quilibrium.com';"),
      preflightFails: sm.read('packages/farcaster-protocol/src/constants.ts').includes("/** Official read replica. Browser submit preflight fails (OPTIONS 404). */\nexport const SNAP_READ_HUB_URL = 'https://snap.farcaster.xyz:3381';"),
    },
  );

  // --- one node: what a Hypersnap node follows, and what decides it ---
  const forkHeights = ['50_433_538', '50433538', '51_119_199', '51119199', '50_954_121', '50954121'];
  let rustFilesNamingForkHeights = 0;
  for (const f of walk(join(hf.dir, 'src'), ['.rs'])) {
    const text = readFileSync(f, 'utf8');
    if (forkHeights.some((h) => text.includes(h))) rustFilesNamingForkHeights += 1;
  }
  check('the fork is configuration: no Rust source names its heights', 0, rustFilesNamingForkHeights);
  check(
    'without a schedule, mainnet keeps Farcaster gossip topics and storage limits',
    { legacyTopics: true, storageLimitsStay: true },
    {
      legacyTopics: /if self\.cutovers\.is_empty\(\) \{\s*return vec!\[self\.network != proto::FarcasterNetwork::Mainnet\];/.test(hf.read('src/network/topic_schedule.rs')),
      storageLimitsStay: /pub fn storage_limits_disabled\(&self\) -> bool \{\s*if self\.native_registration\.activation_heights\.is_empty\(\) \{\s*return false;/.test(hf.read('src/storage/store/stores.rs')),
    },
  );
  const forkCompose = hf.read('docker-compose.mainnet.yml');
  const peerSet = (text) => new Set((text.match(/bootstrap_peers = "([^"]+)"/)?.[1] ?? '').split(',').map((p) => p.trim()).filter(Boolean));
  const forkPeers = peerSet(forkCompose);
  const upstreamPeers = peerSet(sc.read('docker-compose.mainnet.yml'));
  check(
    "the stock install takes the fork from a mounted validators.toml and lists only Farcaster's bootstrap peers",
    { mounted: true, fetched: true, peers: 9, sameAsUpstream: 9, peersInValidatorsToml: false },
    {
      mounted: forkCompose.includes('- ./validators.toml:/app/validators.toml:ro') && forkCompose.includes('cat /app/validators.toml >> config.toml'),
      fetched: hf.read('scripts/hypersnap.sh').includes('fetch_file_from_repo "$VALIDATORS_FILE_PATH" "validators.toml"'),
      peers: forkPeers.size,
      sameAsUpstream: [...forkPeers].filter((p) => upstreamPeers.has(p)).length,
      peersInValidatorsToml: /bootstrap_peers|direct_peers|\/ip4\//.test(fv),
    },
  );
  check(
    'a read node re-executes blocks and stops on a root mismatch; the relay needs a node on each side',
    { rootCheck: true, relayNeedsBoth: true },
    {
      rootCheck: hf.read('src/storage/store/engine.rs').includes('"Shard root mismatch"') && sc.read('src/storage/store/engine.rs').includes('"Shard root mismatch"'),
      relayNeedsBoth: shuttle.includes("replace the two RPC endpoints and gossip peer lists with your\nnodes' addresses. RPC must be the gRPC endpoint. Both nodes must retain blocks"),
    },
  );
  expectText("one operator's Hypersnap node outgrew its disk", fatlineReadme, 'Our Hypersnap node also keeps 1 day of blocks: every block since genesis outgrew its 685 GB disk.');

  // --- Home's own code, where the design says it already fits ---
  const reasons = readFileSync(join(HOME, 'packages/home-personalization/src/reasons/index.ts'), 'utf8');
  const sourcesTs = readFileSync(join(HOME, 'packages/home-client-core/src/sources.ts'), 'utf8');
  check(
    'the kernel already has the reason taxonomy and the fetcher seam the design uses',
    { types: 10, groups: ['direct', 'network', 'discovery', 'promoted'], leafFetcher: true, sourceError: true, allFailed: true },
    {
      types: [...(reasons.match(/export const REASON_TYPES = \[([\s\S]*?)\] as const;/)?.[1] ?? '').matchAll(/'([a-z-]+)'/g)].length,
      groups: [...(reasons.match(/export const REASON_GROUPS = \[([\s\S]*?)\] as const;/)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]),
      leafFetcher: sourcesTs.includes('export type LeafFetcher = ('),
      sourceError: sourcesTs.includes('export type SourceError = { source: LeafSource; error: unknown };'),
      allFailed: sourcesTs.includes('export class AllSourcesFailedError extends Error'),
    },
  );
}

// --- docs/design/experience-walkthrough.md ------------------------------------------

{
  const hf = S['hypersnap-fork'];
  const sc = S.snapchain;
  const qc = S.quilcast;
  const on = S['opencaster-now'];
  const docs = S.docs;
  const kernel = (rel) => readFileSync(join(HOME, 'packages/home-personalization/src', rel), 'utf8');

  // --- what is on screen today: Home's own copy ---
  const reasonsTs = kernel('reasons/index.ts');
  check(
    'the ten chip labels, in the order of the reason types',
    ['Following', 'Following · older', 'Friend of a friend', 'Recasted', 'Replied to', 'Pinned', 'Popular in channel', 'Popular', 'Suggested', 'Promoted'],
    [...reasonsTs.matchAll(/^\s+chip: '([^']+)',$/gm)].map((m) => m[1]),
  );
  check(
    'the four group labels and the two sheet sentences',
    { groups: ['People you follow', 'Through your network', 'Discovery', 'Promoted'], because: true, unknown: true },
    {
      groups: [...(reasonsTs.match(/export const GROUP_LABELS[^{]*\{([\s\S]*?)\};/)?.[1] ?? '').matchAll(/: '([^']+)'/g)].map((m) => m[1]),
      because: reasonsTs.includes("return `You're seeing this because ${d.because}.`;"),
      unknown: reasonsTs.includes("return `We don't have a description for this yet (${type}).`;"),
    },
  );
  const patch = readFileSync(join(HOME, 'docs/integration/reference-patch/seam-and-chip.patch'), 'utf8');
  const sheetButtons = ['Less of this', 'None of this', 'More of this'];
  check(
    'the patched client ships the sheet buttons, the score line and the hidden row',
    { buttons: sheetButtons, score: true, noBoostForPromoted: true, hiddenRow: true },
    {
      buttons: sheetButtons.filter((b) => new RegExp(`^\\+\\s+${b}$`, 'm').test(patch)),
      score: patch.includes('meta.score {score.toFixed(2)}'),
      noBoostForPromoted: patch.includes('{descriptor?.boostable !== false && ('),
      hiddenRow: patch.includes('data-testid="home-hidden-row"') && patch.includes('{UNDO_LABEL[row.cause]}'),
    },
  );
  const receiptsTs = kernel('pipeline/receipts.ts');
  const actionsTs = kernel('prefs/actions.ts');
  check(
    'receipts copy and mute durations as the page quotes them',
    { summary: true, groupUndo: 'Turn back on', keywordUndo: 'Unmute', durations: ['24 hours', '7 days', '30 days', 'Forever'] },
    {
      summary: receiptsTs.includes("return `${n} cast${n === 1 ? '' : 's'} hidden on this page.`;"),
      groupUndo: receiptsTs.match(/'muted-group': '([^']+)'/)?.[1],
      keywordUndo: receiptsTs.match(/'muted-keyword': '([^']+)'/)?.[1],
      durations: [...(actionsTs.match(/export const MUTE_DURATIONS = \[([\s\S]*?)\] as const;/)?.[1] ?? '').matchAll(/label: '([^']+)'/g)].map((m) => m[1]),
    },
  );
  const specTypes = kernel('feedspec/types.ts');
  check(
    'a feed can be sourced from home, following, a channel, a list, a search or a blend',
    ['home', 'following', 'channel', 'list', 'search', 'blend'],
    [...specTypes.matchAll(/^\s*(?:export type Source\w+ = \{ )?kind: '([a-z]+)'/gm)].map((m) => m[1]),
  );

  // --- what a node gives a client ---
  const http = hf.read('src/api/http.rs');
  const stubsAt = http.indexOf('// Write action stubs');
  const stubs = http.slice(stubsAt, http.indexOf('StatusCode::NOT_FOUND', stubsAt));
  const stubbed = [
    '(Method::POST, "/v2/farcaster/cast")',
    '(Method::POST, "/v2/farcaster/reaction")',
    '(Method::POST, "/v2/farcaster/follow")',
    '(Method::POST, "/v2/farcaster/block")',
    '(Method::POST, "/v2/farcaster/mute")',
    '(Method::POST, "/v2/farcaster/channel/follow")',
    '(Method::DELETE, "/v2/farcaster/channel/member")',
    '(Method::POST, "/v2/farcaster/notifications/mark_seen")',
    '(Method::POST, "/v2/farcaster/storage/buy")',
    '(Method::POST, "/v2/farcaster/user/register")',
  ];
  check(
    'a Hypersnap node answers 501 to channel follows, mutes, blocks, mark-seen and storage purchases',
    { stubbed, notImplemented: true },
    { stubbed: stubbed.filter((t) => stubs.includes(t)), notImplemented: stubs.includes('StatusCode::NOT_IMPLEMENTED') },
  );
  const handled = [
    '"/v2/farcaster/feed/following" =>',
    '"/v2/farcaster/feed/trending" =>',
    '"/v2/farcaster/feed/channels" =>',
    '"/v2/farcaster/channel/search" =>',
    '"/v2/farcaster/channel/trending" =>',
    '"/v2/farcaster/notifications" =>',
    '"/v2/farcaster/cast/search" =>',
    '"/v2/farcaster/user/search" =>',
  ];
  check('the reads each surface needs have handlers on a Hypersnap node', handled, handled.filter((t) => http.includes(t)));
  const channelsRs = hf.read('src/api/channels.rs');
  check(
    'a node derives channels from casts, and a member is an account that posted',
    { indexer: true, members: true, parent: true },
    {
      indexer: channelsRs.startsWith('//! Channels Indexer for tracking Farcaster channel activity.'),
      members: channelsRs.includes('/// Number of unique users who have cast in this channel.\n    pub member_count: u64,'),
      parent: channelsRs.includes('use crate::proto::cast_add_body::Parent;'),
    },
  );

  const fs = on.read('apps/web-client/FEATURE_SUPPORT.md');
  const opencasterSays = [
    "Discover is trending; Hypersnap's `for_you` handler aliases trending, so we do not label it personalized.",
    'Hypersnap leaves `viewer_context` empty.',
    'The node omits reaction subtype and does not provide a complete historical inbox.',
    'Saved channels are browser shortcuts, not network subscriptions. Participant counts represent accounts that posted. Subscription/member writes are upstream stubs and are not shown as supported actions.',
    'Network block/mute writes are stubs.',
    'Unsupported hosted features are not presented as working controls: Farcaster DMs, managed account registration, push delivery, miniapp execution/catalogs, trading, video processing, paid storage, protocol pins, channel subscription management or a personalized recommendation model.',
  ];
  check("another client's feature matrix on a Hypersnap node", opencasterSays, opencasterSays.filter((t) => fs.includes(t)));

  // --- posting and follows ---
  const castRs = sc.read('src/core/validations/cast.rs');
  check(
    'a cast may carry four embeds for every account since V20, and 10,000 bytes',
    { four: true, gate: 'V20', bytes: true },
    {
      four: /if is_pro_user \|\| version\.is_enabled\(ProtocolFeature::IncreaseEmbedLimitForAllUsers\) \{\s+4\s+\} else \{\s+2\s+\}/.test(castRs),
      gate: sc.read('src/version/version.rs').match(/ProtocolFeature::IncreaseEmbedLimitForAllUsers => self >= &EngineVersion::(V\d+)/)?.[1],
      bytes: castRs.includes('Ok(CastType::TenKCast) if text_bytes.len() > 10_000 =>'),
    },
  );
  check(
    'a block is a link type, and follow compaction cannot delete it',
    { accepted: true, durable: true },
    {
      accepted: sc.read('src/core/validations/link_tests.rs').includes('assert!(validations::link::validate_link_type("block").is_ok());'),
      durable: sc.read('src/storage/store/account/link_store.rs').includes('own type (so a "follow" compaction can\'t delete "block" links)'),
    },
  );

  // --- channels, messages: what only Farcaster's servers do ---
  const apiMd = docs.read('docs/reference/farcaster/api.md');
  const apiLines = [
    'The hostname is always `https://api.farcaster.xyz`.',
    'Authenticated endpoints use a self-signed token, signed as an App Key for FID:',
    'List all channels. No parameters. Not paginated. Not authenticated.',
    '- `POST /fc/channel-follows`',
    '- `DELETE /fc/channel-follows`',
  ];
  check("following a channel is a call to Farcaster's API; listing channels is public", apiLines, apiLines.filter((t) => apiMd.includes(t)));
  const dcMd = docs.read('docs/reference/farcaster/direct-casts.md');
  let mentionDirect = 0;
  for (const repo of [sc, hf]) {
    for (const dir of ['src', 'proto']) {
      for (const f of walk(join(repo.dir, dir), ['.rs', '.proto'])) {
        if (/direct.?cast|direct.?message/i.test(readFileSync(f, 'utf8'))) mentionDirect += 1;
      }
    }
  }
  check(
    "direct casts: outside the protocol by Farcaster's own page, and in neither node's source",
    { stated: true, intent: true, filesMentioning: 0 },
    {
      stated: dcMd.includes('Direct casts are currently not part of the protocol.'),
      intent: dcMd.includes('https://farcaster.xyz/~/inbox/create/[fid]?text=[message]'),
      filesMentioning: mentionDirect,
    },
  );

  // --- the reference client: what lives on Farcaster's servers ---
  const clientApi = readFileSync(join(SNAPSHOT, 'packages/farcaster-client-data/src/client/FarcasterApiClient.ts'), 'utf8');
  const endpoints = [...new Set([...clientApi.matchAll(/['`](\/v\d\/[A-Za-z0-9/_-]+)/g)].map((m) => m[1]))];
  const withWord = (w) => endpoints.filter((e) => e.includes(w)).length;
  check(
    "the reference client's calls to Farcaster's servers, by surface",
    { directCast: 33, wallet: 17, upload: 4, bookmark: 1, mutedUsers: true },
    {
      directCast: withWord('direct-cast'),
      wallet: withWord('wallet'),
      upload: withWord('upload'),
      bookmark: withWord('bookmark'),
      mutedUsers: endpoints.includes('/v2/get-muted-users'),
    },
  );
  expectText(
    "the reference web client's wallet page is one sentence",
    readFileSync(join(SNAPSHOT, 'apps/farcaster-web/src/pages/wallet/WalletPage.tsx'), 'utf8'),
    'Farcaster Wallet is available on Farcaster mobile.',
  );

  // --- how one live client handles what the networks do not ---
  const qr = qc.read('README.md');
  const quilcastSays = [
    "Direct casts aren't part of the Farcaster protocol, so the custody key signs farcaster.xyz's authorization once and Quilcast keeps a token that opens direct casts and nothing else",
    'Farcaster only gives upload URLs to accounts that have a Warpcast signer',
    "Farcaster has neither, so they're Quilcast's own",
    'you send about $0.20 of ETH on Optimism',
  ];
  check('Quilcast on its inbox, uploads, mutes and the price of an account', quilcastSays, quilcastSays.filter((t) => qr.includes(t)));
}

// --- docs/research/messages-and-wallet.md -------------------------------------------

{
  const sc = S.snapchain;
  const hf = S['hypersnap-fork'];
  const qc = S.quilcast;
  const qs = S['quorum-shared'];
  const qd = S['quorum-desktop'];
  const qm = S['quorum-mobile'];
  const xd = S['xmtp-docs'];
  const lx = S.libxmtp;
  const sdk = S['base-account-sdk'];
  const sw = S['coinbase-smart-wallet'];
  const wg = S.wagmi;
  const flat = (t) => t.replace(/\s+/g, ' ');

  // --- messages: nothing on either network ---
  const types = (src) =>
    Object.fromEntries(
      [...(src.read('proto/definitions/message.proto').match(/enum MessageType \{([\s\S]*?)\n\}/)?.[1] ?? '').matchAll(/^\s*MESSAGE_TYPE_([A-Z_0-9]+) = (\d+);/gm)]
        .filter((m) => m[1] !== 'NONE')
        .map((m) => [m[1], Number(m[2])]),
    );
  const scTypes = types(sc);
  const hfTypes = types(hf);
  check(
    'Hypersnap carries the message types Snapchain does, plus account registration',
    { snapchain: 19, onlyOnHypersnap: { NATIVE_ONBOARD: 160 }, onlyOnSnapchain: [] },
    {
      snapchain: Object.keys(scTypes).length,
      onlyOnHypersnap: Object.fromEntries(Object.entries(hfTypes).filter(([k]) => !(k in scTypes))),
      onlyOnSnapchain: Object.keys(scTypes).filter((k) => !(k in hfTypes)),
    },
  );

  // --- messages: how two clients reach Farcaster's inbox ---
  const dmRelay = qc.read('server/dm.mjs');
  const upload = qc.read('server/upload.mjs');
  check(
    "Quilcast reaches Farcaster's inbox through a relay that presents as farcaster.xyz",
    { inbox: true, token: true, sig65: true, origin: true, ownSiteOnly: true, signedText: true },
    {
      inbox: dmRelay.includes("inbox: ['GET', '/v2/direct-cast-inbox', ['category', 'filter', 'cursor', 'limit']],"),
      token: dmRelay.includes('`/v2/get-dc-auth-token?${new URLSearchParams({ message, signature })}`'),
      sig65: dmRelay.includes('!/^0x[0-9a-f]{130}$/i.test(signature)'),
      origin: upload.includes("export const FC_HEADERS = { origin: 'https://farcaster.xyz', referer: 'https://farcaster.xyz/', accept: 'application/json' }"),
      ownSiteOnly: upload.includes("// farcaster.xyz's API answers its own site only"),
      signedText: qc.read('src/write.ts').includes('URI: https://client.farcaster.xyz/v2/get-dc-auth-token'),
    },
  );
  const dcAuth = qm.read('services/farcaster/directCastAuth.ts');
  check(
    "Quorum's mobile app reaches Farcaster's inbox the same way",
    { origin: true, ownSiteOnly: true, sameAsQuilcast: true },
    {
      origin: dcAuth.includes("export const FARCASTER_SITE_HEADERS = {\n  origin: 'https://farcaster.xyz',"),
      ownSiteOnly: dcAuth.includes("/** farcaster.xyz's API answers its own site only. */"),
      sameAsQuilcast: flat(dcAuth).includes('`/v2/get-dc-auth-token` exchanges it for the token. Quilcast opens messages * the same way.'),
    },
  );

  // --- messages: Quorum ---
  const qsPkg = qs.json('package.json');
  const cryptoTypes = qs.read('src/crypto/types.ts');
  check(
    'Quorum: an MIT library with X3DH, Double Ratchet and Triple Ratchet on Curve448',
    { name: '@quilibrium/quorum-shared', version: '2.1.0-45', license: 'MIT', sections: ['X3DH Key Agreement', 'Double Ratchet', 'Triple Ratchet'], curve448: true, wasm: true, readme: true },
    {
      name: qsPkg.name,
      version: qsPkg.version,
      license: qsPkg.license,
      sections: [...cryptoTypes.matchAll(/^\/\/ ============ (X3DH Key Agreement|Double Ratchet|Triple Ratchet) ============$/gm)].map((m) => m[1]),
      curve448: cryptoTypes.includes("type: 'ed448';") && cryptoTypes.includes("type: 'x448';"),
      wasm: qs.read('src/crypto/wasm-provider.ts').includes('js_triple_ratchet_encrypt(params: string): string;'),
      readme: qs.read('README.md').includes('End-to-end encryption (Wasm-based) and Ed448 message signing.'),
    },
  );
  const qdReadme = qd.read('README.md');
  const qdCfg = qd.read('src/config/config.quorum.ts');
  check(
    "Quorum's applications are copyleft, in beta on the web, and speak to one company's servers",
    { desktop: true, mobile: true, beta: true, api: true, ws: true, wasmSdk: '^2.1.0-2' },
    {
      desktop: /GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3/.test(qd.read('LICENSE')),
      mobile: /GNU GENERAL PUBLIC LICENSE\s+Version 3/.test(qm.read('LICENSE')),
      beta: qdReadme.includes('- **Web Browser** - [Live app (beta)](https://app.quorummessenger.com/)'),
      api: qdCfg.includes("const PROD_API_URL = 'https://api.quorummessenger.com';"),
      ws: qdCfg.includes("const PROD_WS_URL = 'wss://api.quorummessenger.com/ws';"),
      wasmSdk: qd.json('package.json').dependencies?.['@quilibrium/quilibrium-js-sdk-channels'],
    },
  );
  const cryptoDoc = qd.read('.agents/docs/cryptographic-architecture.md');
  check(
    'Quorum uses Double Ratchet for one-to-one and Triple Ratchet for groups',
    { dm: true, groups: true },
    {
      dm: cryptoDoc.includes('| **Double Ratchet** | DMs (1:1 conversations) | Optimal for two-party communication |'),
      groups: cryptoDoc.includes('| **Triple Ratchet** | Spaces (group conversations) | Efficient for multi-party groups |'),
    },
  );
  expectText(
    "Quorum's own team built a rig to investigate lost and undecryptable messages",
    flat(qdReadme),
    'for the DM transport investigation: reproducing decrypt failures, measuring send-vs-arrive loss, and testing session recovery unattended.',
  );
  const fcLink = qm.read('services/calling/farcaster-link.ts');
  const quorumClient = qm.read('services/api/quorumClient.ts');
  check(
    'a Farcaster account and a Quorum inbox are linked by two signatures and found by fid',
    { custodySigns: true, quorumSigns: true, bidirectional: true, byFid: true, indexTrustsQuorumSide: true },
    {
      custodySigns: fcLink.includes('const fcMessage = `quorum:link:${quorumAddress}`;'),
      quorumSigns: fcLink.includes('const quorumMessage = `farcaster:link:${custodyAddress}`;'),
      bidirectional: fcLink.includes(' * Generate a bidirectional Farcaster ↔ Quorum identity link.'),
      byFid: quorumClient.includes('return await this.fetch(`/users/by-fid/${fid}`, {'),
      indexTrustsQuorumSide: flat(quorumClient).includes('written whenever a user posts a public profile with a * Farcaster link whose Quorum-side signature verifies.'),
    },
  );

  // --- messages: XMTP ---
  const xFaq = xd.read('docs/pages/chat-apps/intro/faq.mdx');
  const xStart = xd.read('docs/pages/fund-agents-apps/get-started.md');
  const xIdentity = xd.read('docs/pages/protocol/identity.mdx');
  const xLines = [
    'Currently supported identity types include Ethereum EOAs, Ethereum smart contract wallets, and passkeys.',
    '- Multiple installations can access the same inbox (up to 10)',
  ];
  check('XMTP identities: ordinary wallets, smart contract wallets and passkeys; ten installations', xLines, xLines.filter((t) => xIdentity.includes(t)));
  check(
    'XMTP: audited MLS, about $5 per 100,000 messages, a gateway for chat apps, nodes run by one company as of April 2026',
    { audit: true, fee: true, usdc: true, gateway: true, operator: true, mainnetExpected: true },
    {
      audit: xFaq.includes('its use of Messaging Layer Security (MLS) was completed by [NCC Group](https://www.nccgroup.com/) in Dec 2024.'),
      fee: xd.read('docs/pages/fund-agents-apps/calculate-fees.mdx').includes('Network fees are estimated to cost $5 per 100,000 chat messages, inclusive of all fee types.'),
      usdc: xd.read('docs/pages/fund-agents-apps/calculate-fees.mdx').includes('**All XMTP network fees are paid in USDC**'),
      gateway: xStart.includes('[Deploy your gateway service](/fund-agents-apps/run-gateway) (required for chat apps only)'),
      operator: xFaq.includes('with all nodes currently hosted by XMTP Labs. XMTP Labs currently absorbs all message storage and retrieval costs.'),
      mainnetExpected: xStart.includes('Mainnet of the decentralized XMTP Network is expected to launch in early 2026.'),
    },
  );
  const scwChains = Object.keys(lx.json('crates/xmtp_id/src/scw_verifier/chain_urls_default.json'));
  const browserPkg = lx.json('sdks/browser/package.json');
  check(
    'XMTP verifies smart wallets on eleven chains including Ethereum, Optimism and Base; its browser storage has one owner',
    { chains: 11, wanted: ['eip155:1', 'eip155:10', 'eip155:8453'], pkg: '@xmtp/browser-sdk', license: 'MIT', oneOwner: true, repoLicense: true },
    {
      chains: scwChains.length,
      wanted: ['eip155:1', 'eip155:10', 'eip155:8453'].filter((c) => scwChains.includes(c)),
      pkg: browserPkg.name,
      license: browserPkg.license,
      oneOwner: lx.read('sdks/browser/README.md').includes('OPFS has one owner per origin. A second tab that opens persistent storage gets'),
      repoLicense: lx.read('LICENSE').startsWith('MIT License'),
    },
  );

  // --- wallet: what a smart wallet can sign for a Farcaster account ---
  const recoverFn = (src) => {
    const t = src.read('src/core/validations/key.rs');
    const at = t.indexOf('fn recover_from_typed_data(');
    return t.slice(at, t.indexOf('\n}\n', at));
  };
  const scKey = sc.read('src/core/validations/key.rs');
  check(
    'a gasless key is approved by recovering an ordinary key from 65 bytes, identically on both nodes',
    { length: true, recover: true, mustEqualCustody: true, sameOnHypersnap: true, noContractPath: true },
    {
      length: recoverFn(sc).includes('if signature.len() != 65 {\n        return Err(ValidationError::InvalidSignature);'),
      recover: recoverFn(sc).includes('sig.recover_address_from_prehash(&prehash)'),
      mustEqualCustody: scKey.includes("/// EIP-712 custody signature; recovered signer must equal the FID's custody address."),
      sameOnHypersnap: recoverFn(sc).length > 100 && recoverFn(sc) === recoverFn(hf),
      noContractPath: !/1271|isValidSignature|contract_signature/.test(scKey),
    },
  );
  const nativeReg = hf.read('src/native_registration.rs');
  check(
    'a Hypersnap-only account is registered by an ordinary key',
    { length: true, recover: true },
    {
      length: nativeReg.includes('if b.custody_signature.len() != 65 || !matches!(b.custody_signature[64], 0 | 1 | 27 | 28) {'),
      recover: /\.recover_address_from_prehash\(&digest\)\s+\.map_err\(\|_\| invalid\("invalid custody signature"\)\)\?\s+!= Address::from\(custody\)/.test(nativeReg),
    },
  );
  const chainsFn = sc.read('src/connectors/onchain_events/mod.rs');
  check(
    'an address on a profile may be a contract wallet, checked on a chain, with the claim on Ethereum or Optimism',
    { verifier: true, claimChains: '[0, 1, 5, 10, 420]', outOfConsensus: true, rpcChains: ['1', '10', '8453'] },
    {
      verifier: sc.read('src/core/validations/contract_signature.rs').startsWith('//! On-chain signature verification for EOA, ERC-1271, and ERC-6492 signatures.'),
      claimChains: sc.read('src/core/validations/verification.rs').match(/const EIP_712_FARCASTER_VERIFICATION_CLAIM_CHAIN_IDS: \[u16; 5\] = (\[[^\]]+\]);/)?.[1],
      outOfConsensus: sc.read('src/core/validations/verification.rs').includes('// Verification of contract signatures must happen out of consensus loop.\n        1 => Ok(()),'),
      rpcChains: [...(chainsFn.match(/pub fn from_chain_id\(chain_id: u32\) -> Option<Self> \{([\s\S]*?)_ => None/)?.[1] ?? '').matchAll(/(\d+) => Some\(Chain::/g)].map((m) => m[1]),
    },
  );
  check(
    "Farcaster's contracts and its sign-in verifier accept contract signatures",
    { idRegistry: true, gateways: true, signIn: true, jfs: true },
    {
      idRegistry: S.contracts.read('src/IdRegistry.sol').includes('isValid = idOf[custodyAddress] == fid && SignatureChecker.isValidSignatureNow(custodyAddress, digest, sig);'),
      gateways: S.contracts.read('src/abstract/Signatures.sol').includes('if (!SignatureChecker.isValidSignatureNow(signer, digest, sig)) {'),
      signIn: S['auth-monorepo'].read('packages/auth-client/README.md').includes('An Ethereum connector, used to query the Farcaster contracts and verify smart contract wallet signatures.'),
      jfs: S['auth-monorepo'].read('packages/jfs/src/index.ts').includes('* When provided, supports ERC-1271, ERC-6492, and ERC-8010 signatures.'),
    },
  );

  // --- wallet: Coinbase Smart Wallet as it stands ---
  const swReadme = sw.read('README.md');
  const swBullets = ['- Multiple owners', '- Passkey owners and Ethereum address owners', '- Cross-chain replayability for owner updates and other actions: sign once, update everywhere. '];
  check(
    'the smart wallet contract: MIT, many owners, passkeys or addresses, signatures bound to chain and address',
    { bullets: swBullets, mit: true, bound: true, addOwner: true, erc4337: true },
    {
      bullets: swBullets.filter((t) => swReadme.includes(t)),
      mit: sw.read('LICENSE.md').startsWith('MIT License'),
      bound: flat(sw.read('src/ERC1271.sol')).includes('The domain separator of this outer hash contains the chain id and address of this contract'),
      addOwner: sw.read('src/MultiOwnable.sol').includes('function addOwnerAddress(address owner) external virtual onlyOwner {'),
      erc4337: swReadme.includes('[ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) compliant smart contract wallet from Coinbase.'),
    },
  );
  const sdkPkg = sdk.json('packages/account-sdk/package.json');
  check(
    "Coinbase's SDK: name, version, licence, its third product name, and the window it opens",
    { name: '@base-org/account', version: '2.6.0', license: 'Apache-2.0', released: true, rebrand: true, window: true },
    {
      name: sdkPkg.name,
      version: sdkPkg.version,
      license: sdkPkg.license,
      released: sdk.read('packages/account-sdk/CHANGELOG.md').includes('## [2.6.0](https://github.com/base/account-sdk/compare/account-v2.5.13...account-v2.6.0) (2026-10-29)'),
      rebrand: sdk.read('README.md').includes('> **Rebrand:** Base Account is now Coinbase Wallet. The npm package remains `@base-org/account` — it has not been renamed or merged. `@base-org/account` is still the current recommended SDK for connecting to Coinbase Wallet until the next-generation Coinbase Wallet SDK is ready.'),
      window: sdk.read('packages/account-sdk/src/core/constants.ts').includes("export const CB_KEYS_URL = 'https://keys.coinbase.com/connect';"),
    },
  );
  const baseConnector = wg.read('packages/connectors/src/baseAccount.ts');
  check(
    'wagmi ships a connector for it',
    { version: '8.2.4', connector: true, wraps: true },
    {
      version: wg.json('packages/connectors/package.json').version,
      connector: baseConnector.includes('export function baseAccount(parameters: BaseAccountParameters = {}) {'),
      wraps: baseConnector.includes("import type { createBaseAccountSDK, ProviderInterface } from '@base-org/account'"),
    },
  );
  const webPkg = JSON.parse(readFileSync(join(SNAPSHOT, 'apps/farcaster-web/package.json'), 'utf8'));
  check(
    'the reference web client already uses wagmi, with no connectors listed and a vendor for its embedded wallet',
    { wagmi: true, connectorsPkg: true, vendor: true, empty: true, embedded: true },
    {
      wagmi: 'wagmi' in webPkg.dependencies,
      connectorsPkg: '@wagmi/connectors' in webPkg.dependencies,
      vendor: '@privy-io/react-auth' in webPkg.dependencies,
      empty: readFileSync(join(SNAPSHOT, 'apps/farcaster-web/src/utils/wagmi.ts'), 'utf8').includes('  transports,\n  connectors: [],\n});'),
      embedded: readFileSync(join(SNAPSHOT, 'apps/farcaster-web/src/contexts/WalletProvider.tsx'), 'utf8').includes('// Get Warpcast embedded wallet'),
    },
  );
  expectText('Home is MIT, so only MIT and Apache libraries can be used', readFileSync(join(HOME, 'LICENSE'), 'utf8'), 'MIT License');
}

// --- network (optional) ------------------------------------------------------------

const info = [];
if (NETWORK) {
  const wanted = {
    '@farcaster/core': '0.21.0',
    '@farcaster/hub-nodejs': '0.18.0',
    '@farcaster/hub-web': '0.14.0',
    '@farcaster/shuttle': '1.0.5',
    '@farcaster/auth-client': '0.7.1',
    '@farcaster/auth-kit': '0.8.2',
    '@farcaster/miniapp-sdk': '0.4.0',
    '@farcasterorg/quick-auth': '0.2.0',
    '@farcasterorg/miniapp-sdk': '0.4.0',
    '@base-org/account': '2.6.0',
    '@wagmi/connectors': '8.2.4',
    '@xmtp/browser-sdk': '7.1.0',
    '@quilibrium/quorum-shared': '2.1.0-45',
    '@quilibrium/quilibrium-js-sdk-channels': '2.1.0-2',
  };
  for (const [pkg, v] of Object.entries(wanted)) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(`https://registry.npmjs.org/${pkg}`, { signal: ctl.signal });
      clearTimeout(t);
      const j = await res.json();
      const latest = j['dist-tags']?.latest;
      info.push(`${latest === v ? 'same ' : 'moved'} ${pkg}: page says ${v}, npm latest ${latest} (${(j.time?.[latest] ?? '').slice(0, 10)})`);
    } catch (e) {
      info.push(`unreachable ${pkg}: ${String(e).slice(0, 60)}`);
    }
  }
}

// --- report ---------------------------------------------------------------------------

console.log(`sources: ${SOURCES}`);
for (const [name, pin] of Object.entries(PINS)) {
  const head = S[name].head();
  const pinned = head.startsWith(pin.sha);
  console.log(`  ${pinned ? 'pinned' : 'MOVED '} ${name.padEnd(14)} ${head.slice(0, 7)} ${head.slice(41)}${pinned ? '' : `  (page read ${pin.sha.slice(0, 7)} ${pin.date})`}`);
}
console.log(`client:  ${SNAPSHOT}\n`);

let failed = 0;
for (const r of results) {
  const tag = r.ok ? '  ok  ' : ' FAIL ';
  console.log(`${tag}  ${r.label.padEnd(66)} ${r.ok ? JSON.stringify(r.actual).slice(0, 60) : ''}`);
  if (!r.ok) {
    failed += 1;
    console.log(`          expected: ${JSON.stringify(r.expected)}`);
    console.log(`          actual:   ${JSON.stringify(r.actual)}`);
  }
}
if (info.length) {
  console.log('\nnpm (informational):');
  for (const line of info) console.log(`  ${line}`);
}
console.log(`
Not checkable offline; re-read when the page is revised:
  FIP #266 Snapchain Signers, finalized 2026-05-12   https://github.com/farcasterxyz/protocol/discussions/266
  FIP #229 Storage Redenomination, $0.20/unit          https://github.com/farcasterxyz/protocol/discussions/229
  FIP #276 Channels on Snapchain, draft, Base default  https://github.com/farcasterxyz/protocol/discussions/276
  FIP #277 Onchain Config Registry, review, L1 address https://github.com/farcasterxyz/protocol/discussions/277
  FIP #225 Auth Addresses, finalized, key type 2       https://github.com/farcasterxyz/protocol/discussions/225
  FIP #238 Signer revokes only impact future messages  https://github.com/farcasterxyz/protocol/discussions/238
  Neynar acquired Farcaster, 2026-01-21                https://neynar.com/blog/neynar-is-acquiring-farcaster
  Neynar plan tiers and credit costs                   https://dev.neynar.com/pricing  https://docs.neynar.com/reference/compute-units
  Sampled client manifests (herocast, nounspace, litecast, tofui, opencast) read 2026-10-14 on GitHub
  OP Mainnet announcement, 2023-08-22                  https://x.com/dwr/status/1693986385315963024
  FIP-6 ($5/unit), FIP-7 ($0.1-$1/key), FIP-10 (<$100k spam) https://github.com/farcasterxyz/protocol/discussions/98 /103 /133
  The production API refuses casts without opt-in (400)     https://github.com/farcasterxyz/client/issues/6  https://github.com/SmashThunderStone/client/pull/3
  Cassie Heart to app developers on the fork, 2026-11-04    https://github.com/farcasterorg/hypersnap/issues/51
  Whether the fork activated at its heights                 docs/research/optimal-design.md section 6.2 (needs a reachable node)
  Whether Farcaster's app approves third-party keys, channel follows or the inbox without opt-in   docs/design/experience-walkthrough.md section 12 (needs an account)
  Farcaster direct-cast drafts (FIP 226 draft, FIP 99 idea, issue 5 closed)   https://github.com/farcasterxyz/protocol/discussions/226 /99 and issues/5
  No messaging proposal in the Hypersnap organisation        https://github.com/farcasterorg/hypersnap/issues and https://github.com/orgs/farcasterorg/discussions
  Base App renamed back to Coinbase Wallet, 2026-09-10       https://github.com/coinbase/coinbase-wallet-sdk/pull/1911 and news summaries (sites blocked here)
  Quorum Mobile "full Farcaster support"                     https://x.com/QuilibriumInc/status/2006480591034995194 (search summary)
  XMTP mainnet and fee status after April 2026               https://docs.xmtp.org/fund-agents-apps/get-started (blocked from this sandbox)
  Whether Quilibrium permits other clients on Quorum's servers   no published terms found; ask before building
  Hypersnap fork meeting, open consensus, tokenization   https://github.com/farcasterorg/protocol/discussions/4 /13 /5 /19
  Network School acquired Farcaster from Neynar, 2026-10-15  press excerpts read 2026-10-22; farcasterxyz/client and snapchain unchanged
  State of the public Hypersnap node                   curl -s https://haatz.quilibrium.com/v1/info (blocked from this sandbox)
  Hypersnap read nodes stalled on the v18 swap, 2026-10-22   https://github.com/farcasterorg/hypersnap/issues/41
  Casts quoted in both-networks.md (Rish, Balaji, Cassie)  read from haatz by bettercallzaal/ZAOOS docs 2666/2680 and jpfraneto/fatline; hashes in the page
  FIP #19 sections 16-17 and Appendix A, edited 2026-10-12  https://github.com/orgs/farcasterorg/discussions/19
`);
if (movedFiles.length) {
  console.log(`Files the claims read that are no longer at their path (${movedFiles.length}):`);
  for (const f of movedFiles) console.log(`  ${f}`);
  console.log('');
}
console.log(failed ? `${failed} of ${results.length} claims FAILED.` : `All ${results.length} claims hold against these sources.`);
process.exit(failed ? 1 : 0);
