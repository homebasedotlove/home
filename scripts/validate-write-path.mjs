#!/usr/bin/env node
/**
 * Validate, by execution, the part of Home's write path that needs no network:
 * that the published, MIT-licensed @farcaster/core can build the messages the
 * design in docs/research/optimal-design.md depends on.
 *
 *   npm i --prefix .write-path-deps --no-audit --no-fund @farcaster/core@0.21.0
 *   node scripts/validate-write-path.mjs
 *
 * What it proves: a browser-held Ed25519 key can be authorised by a custody
 * wallet with a scoped, expiring, gasless KEY_ADD that names a requesting app
 * fid; that key can sign a cast, a reaction and a follow; every message
 * validates with the SDK's own validator; the encoded bytes are one artefact
 * that can be posted unchanged to any node on either network; and the SDK
 * refuses scopes and lifetimes the protocol refuses.
 *
 * What it does not prove: that a node accepts the messages. That needs a
 * custody key for a registered fid and a reachable node (plan.md §1.3).
 */

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEPS = resolve(process.env.WRITE_PATH_DEPS ?? join(HOME, '.write-path-deps'));
if (!existsSync(join(DEPS, 'node_modules/@farcaster/core/package.json'))) {
  console.error(
    `error: @farcaster/core not found under ${DEPS}\n` +
      '       run: npm i --prefix .write-path-deps --no-audit --no-fund @farcaster/core@0.21.0',
  );
  process.exit(1);
}
const require = createRequire(join(DEPS, 'package.json'));
const core = require('@farcaster/core');
const { privateKeyToAccount, generatePrivateKey } = require('viem/accounts');
const coreVersion = JSON.parse(
  readFileSync(join(DEPS, 'node_modules/@farcaster/core/package.json'), 'utf8'),
).version;

const results = [];
const check = (label, expected, actual) =>
  results.push({ ok: JSON.stringify(expected) === JSON.stringify(actual), label, expected, actual });
const unwrap = (label, r) => {
  if (r.isErr()) {
    results.push({ ok: false, label, expected: 'ok', actual: String(r.error?.message ?? r.error) });
    return null;
  }
  return r.value;
};

const NETWORK = core.FarcasterNetwork.MAINNET;
const T = core.MessageType;
const USER_FID = 1234567n; // any registered fid; nothing here touches a node
const APP_FID = 7654321n; // Home's app fid, the requester named in the key's metadata
const now = core.getFarcasterTime()._unsafeUnwrap();

const userCustody = new core.ViemLocalEip712Signer(privateKeyToAccount(generatePrivateKey()));
const appCustody = new core.ViemLocalEip712Signer(privateKeyToAccount(generatePrivateKey()));
const deviceKey = new core.NobleEd25519Signer(randomBytes(32));
const devicePub = (await deviceKey.getSignerKey())._unsafeUnwrap();

// 1. A scoped, expiring, gasless key requested by an app fid -------------------

const SCOPES = [T.CAST_ADD, T.REACTION_ADD, T.REACTION_REMOVE]; // the minimum: casts and reactions
const TTL = 7 * 24 * 60 * 60;
const keyBody = unwrap(
  'KEY_ADD body: custody authorises the key, the app fid signs the request',
  await core.makeKeyAddBody(
    { fid: USER_FID, key: devicePub, scopes: SCOPES, ttl: TTL, nonce: 1, deadline: now + 600, requestFid: APP_FID },
    userCustody,
    appCustody,
  ),
);
let keyAdd = null;
if (keyBody) {
  check(
    'KEY_ADD body carries the scopes, the sliding ttl and both signatures',
    { scopes: SCOPES, ttl: TTL, keyType: 1, custodySignature: 65, metadata: true, metadataType: 1 },
    {
      scopes: keyBody.scopes,
      ttl: keyBody.ttl,
      keyType: keyBody.keyType,
      custodySignature: keyBody.custodySignature.length,
      metadata: keyBody.metadata.length > 0,
      metadataType: keyBody.metadataType,
    },
  );
  keyAdd = unwrap(
    'KEY_ADD message: signed by the key being added (proof of possession)',
    await core.makeKeyAdd(keyBody, { fid: Number(USER_FID), network: NETWORK }, deviceKey),
  );
}
if (keyAdd) {
  check('KEY_ADD message type and signer', { type: T.KEY_ADD, signerIsDeviceKey: true }, {
    type: keyAdd.data.type,
    signerIsDeviceKey: Buffer.from(keyAdd.signer).equals(Buffer.from(devicePub)),
  });
  const v = await core.validations.validateMessage(keyAdd);
  check('KEY_ADD validates with the SDK validator', true, v.isOk() ? true : String(v.error?.message));
}

// 2. The key signs what a reader does: a cast, a like, a follow -----------------

const opts = { fid: Number(USER_FID), network: NETWORK };
const cast = unwrap(
  'CAST_ADD built and signed on the device',
  await core.makeCastAdd(
    { text: 'posted from a key that never left this device', embeds: [], embedsDeprecated: [], mentions: [], mentionsPositions: [], type: core.CastType.CAST },
    opts,
    deviceKey,
  ),
);
const like = cast
  ? unwrap(
      'REACTION_ADD built and signed on the device',
      await core.makeReactionAdd({ type: core.ReactionType.LIKE, targetCastId: { fid: 3, hash: cast.hash } }, opts, deviceKey),
    )
  : null;
const follow = unwrap(
  'LINK_ADD built and signed on the device',
  await core.makeLinkAdd({ type: 'follow', targetFid: 3 }, opts, deviceKey),
);
for (const [name, m] of [['CAST_ADD', cast], ['REACTION_ADD', like], ['LINK_ADD', follow]]) {
  if (!m) continue;
  const v = await core.validations.validateMessage(m);
  check(`${name} validates with the SDK validator`, true, v.isOk() ? true : String(v.error?.message));
}

// 3. One artefact for every node on either network ------------------------------

if (cast) {
  const bytes = core.Message.encode(cast).finish();
  const again = core.Message.encode(core.Message.decode(bytes)).finish();
  check(
    'encoded cast: stable bytes, 20-byte BLAKE3 hash, Ed25519 signature, under the 64 KiB relay cap',
    { roundTrip: true, hashBytes: 20, hashScheme: core.HashScheme.BLAKE3, signatureBytes: 64, signatureScheme: core.SignatureScheme.ED25519, underCap: true, hasDataBytes: true },
    {
      roundTrip: Buffer.from(bytes).equals(Buffer.from(again)),
      hashBytes: cast.hash.length,
      hashScheme: cast.hashScheme,
      signatureBytes: cast.signature.length,
      signatureScheme: cast.signatureScheme,
      underCap: bytes.length < 64 * 1024,
      hasDataBytes: (cast.dataBytes?.length ?? 0) > 0,
    },
  );
  console.log(`cast: ${bytes.length} bytes, sha256 ${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}… (the same bytes go to every node)`);
}

// The validator is not vacuous: one changed byte of text must fail it.
if (cast) {
  const tampered = core.Message.decode(core.Message.encode(cast).finish());
  tampered.data.castAddBody.text += "!";
  tampered.dataBytes = undefined;
  const v = await core.validations.validateMessage(tampered);
  check("a cast altered after signing fails the validator", true, v.isErr());
}

// 4. The SDK refuses what the protocol refuses ------------------------------------

const badScope = await core.makeKeyAddBody(
  { fid: USER_FID, key: devicePub, scopes: [T.KEY_ADD], ttl: TTL, nonce: 2, deadline: now + 600 },
  userCustody,
);
check('a key cannot be scoped to add further keys', true, badScope.isErr());
const badTtl = await core.makeKeyAddBody(
  { fid: USER_FID, key: devicePub, scopes: SCOPES, ttl: core.MAX_KEY_TTL_SECONDS + 1, nonce: 2, deadline: now + 600 },
  userCustody,
);
check('a key cannot outlive 90 days of inactivity', { max: 90 * 24 * 60 * 60, refused: true }, { max: core.MAX_KEY_TTL_SECONDS, refused: badTtl.isErr() });
check(
  'scopes a key may hold',
  [1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15],
  [...core.ADMISSIBLE_KEY_ADD_SCOPES].sort((a, b) => a - b),
);

// 5. Hypersnap-native fids (2^32 and above) ----------------------------------------

const nativeFid = 2 ** 32 + 5;
const nativeCast = await core.makeCastAdd(
  { text: 'native', embeds: [], embedsDeprecated: [], mentions: [], mentionsPositions: [], type: core.CastType.CAST },
  { fid: nativeFid, network: NETWORK },
  deviceKey,
);
check('the SDK builds a cast for a fid above 2^32', true, nativeCast.isOk() ? true : String(nativeCast.error?.message));
if (nativeCast.isOk()) {
  const decoded = core.Message.decode(core.Message.encode(nativeCast.value).finish());
  check('a fid above 2^32 survives encoding', nativeFid, decoded.data.fid);
}

// --- report -------------------------------------------------------------------------

console.log(`@farcaster/core ${coreVersion} from ${DEPS}\n`);
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? '  ok  ' : ' FAIL '}  ${r.label}`);
  if (!r.ok) {
    failed += 1;
    console.log(`          expected: ${JSON.stringify(r.expected)}`);
    console.log(`          actual:   ${JSON.stringify(r.actual)}`);
  }
}
console.log(failed ? `\n${failed} of ${results.length} checks FAILED.` : `\nAll ${results.length} checks hold.`);
process.exit(failed ? 1 : 0);
