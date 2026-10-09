#!/usr/bin/env node
/**
 * Re-verify every checkable claim in docs/operations/plugging-into-snapchain.md
 * against the sources it was read from.
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
`);
console.log(failed ? `${failed} of ${results.length} claims FAILED.` : `All ${results.length} claims hold against these sources.`);
process.exit(failed ? 1 : 0);
