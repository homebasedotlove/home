#!/usr/bin/env node
/**
 * Re-verify every checkable claim in docs/operations/plugging-into-snapchain.md
 * and docs/research/protocol-mechanics.md against the sources they were read
 * from.
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

function source(name) {
  const dir = join(SOURCES, name);
  if (!existsSync(dir)) return null;
  return {
    dir,
    read: (rel) => readFileSync(join(dir, rel), 'utf8'),
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
    '[0.14.2] - 2026-08-13',
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
  const dated = ['V5', 'V11', 'V14', 'V16', 'V17', 'V18', 'V19', 'V20'];
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
    },
    Object.fromEntries(dated.map((v) => [v, schedule[v]])),
  );
  check('V21 (channels) is not on the mainnet schedule', false, 'V21' in schedule);

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
      ChannelMessages: '21',
      ChannelFollows: '21',
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
  expectText('10K casts need Pro', cast, /CastType::TenKCast\) if !is_pro_user/);
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
    ['16 GB of RAM', '4 CPU cores', '2 TB of free storage', 'ports 3381 - 3383', 'about 200 GB'],
    ['16 GB of RAM', '4 CPU cores', '2 TB of free storage', 'ports 3381 - 3383', 'about 200 GB'].filter((t) => start.includes(t)),
  );
  expectText('AWS guide budgets ~$100/month', sc.read('site/docs/pages/guides/running-a-node.mdx'), '$100/month');

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
}

// --- network (optional) ------------------------------------------------------------

const info = [];
if (NETWORK) {
  const wanted = {
    '@farcaster/core': '0.20.0',
    '@farcaster/hub-nodejs': '0.17.0',
    '@farcaster/hub-web': '0.13.0',
    '@farcaster/shuttle': '1.0.3',
    '@farcaster/auth-client': '0.7.1',
    '@farcaster/auth-kit': '0.8.2',
    '@farcaster/miniapp-sdk': '0.3.0',
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
  Neynar plan tiers                                    https://dev.neynar.com/pricing
  OP Mainnet announcement, 2023-08-22                  https://x.com/dwr/status/1693986385315963024
  FIP-6 ($5/unit), FIP-7 ($0.1-$1/key), FIP-10 (<$100k spam) https://github.com/farcasterxyz/protocol/discussions/98 /103 /133
`);
console.log(failed ? `${failed} of ${results.length} claims FAILED.` : `All ${results.length} claims hold against these sources.`);
process.exit(failed ? 1 : 0);
