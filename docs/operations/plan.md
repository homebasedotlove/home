# What Home does next, and the evidence for each step

The decision, in order of execution, with each step tied to something that has
been checked rather than believed. "Validated" below means one of three things:
a claim the audits re-derive from pinned source commits (`pnpm audit:claims`,
34 claims; `pnpm audit:protocol`, 277 claims), a gate that ran in this
repository's sandbox and passed, or a file read at a named commit. "Untested"
means it needs a real network or device and is listed with the test that
settles it. Written 2026-10-14. **The decision in §0 was revised on
2026-11-10**; the steps below it stand except where marked.

The pages behind this one: [the gap analysis](path-to-operational.md), [the
runbook](setup-end-to-end.md), [the protocol facts](plugging-into-snapchain.md),
[the mechanics](../research/protocol-mechanics.md), [the
landscape](../research/client-landscape.md) and, for the revised decision,
[the design page](../research/optimal-design.md).

---

## 0. The decision

**Revised 2026-11-10.** Ship Home as a web client with **one interface over a
registry of data providers that spans both networks**, with Home's own ranking
and reasons as the default feed. The reasoning and the evidence are in
[the design page](../research/optimal-design.md); this is its summary.

- **The protocol path is the product.** Reads from nodes and shaped APIs on
  Farcaster and on Hypersnap, posting keys held on the device and authorised
  by the reader's wallet, sign-in verified against a node, and a thin
  stateless gateway. Build it now, on a free local devnet. This was
  "Source B".
- **Home ranks and explains.** The why-chip shows a reason Home computed and
  the facts behind it. It no longer waits on a field Farcaster controls.
- **The production API is an option, not a step.** This was "Source A", and
  it was to carry the first readers. Since 2026-10-15 it refuses casts from
  accounts that have not accepted Network School's social contract, and no
  one has said a third-party origin may read from it. The adapter stays able
  to show Farcaster's ranking beside Home's for a reader who wants it, off
  until the origin test in §1.3 passes and the owner has an answer on terms.
- **Both networks, visibly.** Hypersnap stops following Farcaster's
  validators at block heights projected for 2026-11-12. Every item and every
  write says which network and node it came from or went to, and the reader
  chooses.
- **Spend money when there are readers, on two read nodes.** Not before, and
  not on being a validator.
- **Mobile and account creation last.** They carry the entire credential list
  and neither is needed to find out whether the legible feed is wanted.

What the version of 2026-10-14 said, and why it changed. It put the
production API first because "the differentiating feature runs on a field
that protocol data does not carry". That is still true of the field and no
longer a reason: seven of the ten reasons can be computed from protocol data,
with their evidence attached (design page §4.2), and the API that carries the
field now enforces a contract on writes. "Source A" and "Source B" below
mean the production API and the protocol path.

---

## 1. This week: four actions that cost nothing and retire the unknowns

### 1.1 Re-pin to the current upstream snapshot

**Do.** Replace every citation of snapshot `b6922e2` with the current upstream
snapshot, which is `73a39bd` (2026-10-30) as of 2026-11-10 and was `0c289ed`
when this step was written. Change the mobile seam line from 311 to 326 and
re-run the gate. The old snapshot survives as `farcasterorg/client-snapshot`,
so each cited line can be matched mechanically.

**How.** The citations are in 8 files (`grep -rn b6922e2`); the seam line in 4.
Then `SNAPSHOT=<checkout> pnpm check:all` and the fork gate from the
[reference patch README](../integration/reference-patch/README.md).

**Evidence.** Against `0c289ed` the patch applies cleanly with only
`apps/farcaster-web/package.json` changed among its 34 files, `verify:compat`
passes, all eleven drift mutations are caught, all 14 fork assertions pass, the
web app typechecks, and 33 of 34 client claims hold with the seam line the only
exception. Validated 2026-10-09 and re-run 2026-10-14. Re-run 2026-11-10
against `73a39bd` with the same results: the patch applies, two `package.json`
files are the only patched files upstream changed, 259 tests, 14 fork
assertions, the web typecheck, 33 of 34 claims. The `check` workflow
clones upstream HEAD, so **CI is red on exactly this line until the re-pin**.

**Done when.** `pnpm audit:claims` reports 34 of 34 against upstream HEAD.

### 1.2 Create Home's own Farcaster account with a custody key you hold

**Do.** Register the app fid Home needs for every signer request, with a
custody key kept outside the Farcaster app, so Home can also exercise gasless
signers against itself.

**How.** The Snapchain writing guide's flow: about $10 of ETH on OP Mainnet,
`IdGateway.register` or the Bundler with one storage unit, then
`fc key-add` for a gasless signer and an fname at
`fnames.farcaster.xyz/transfers`. Put the custody key in the service's secret
store from day one.

**Evidence.** The flow, the budget and the gasless key rules are read from the
Snapchain guide at `8f82bcc` and pinned (audit: "gasless signer facts in the
writing guide", "KeyAddBody carries scopes", "fc CLI facts"). Gasless signers
have been live on mainnet since engine V16, 2026-05-07 (audit: "mainnet
activation dates"). This is the only step this week that costs anything, and it
is needed on every path.

**Done when.** `signersByFid` on any node shows Home's fid with one gasless key.

### 1.3 Run the three network tests from a laptop

None of these can run from this sandbox; all three take minutes.

| # | Test | Command | Settles |
| --- | --- | --- | --- |
| a | Does the production API answer Home's origin? | `curl -si -X OPTIONS https://farcaster.xyz/~api/v2/feed-items -H 'Origin: https://home.example' -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: authorization,idempotency-key'` | whether Source A works as built. The template README says local builds point at this API from `localhost`, which only works cross-origin, so a permissive answer is plausible; the deployed-domain case is **untested** |
| b | Are the public read nodes open? | `curl -s https://snap.farcaster.xyz:3381/v1/info`, then `pop.farcaster.xyz:3381`, `snap.uno.fun:3381`; then `fc cast-add --node https://snap.farcaster.xyz:3381 --network mainnet --fid <home fid> --text "hello"` with Home's new signer | free reads, and whether a public node accepts writes. The hosts are in Snapchain's compiled-in registry (audit: "public node registry"); their policy is **untested** |
| c | Do mainnet accounts work on testnet? | `fc cast-add --node https://iris.farcaster.xyz:3381 --network testnet --fid <home fid> --text "test"`, then `castsByFid` on `iris` | whether the public testnet is a free rehearsal space. The connector is hard-wired to OP Mainnet (audit: "the OP connector is hard-wired to Optimism"); the inference is **untested** |

**Done when.** Each row has a yes or a no written next to it in
[path to operational](path-to-operational.md) §6.

### 1.4 Ask the owner one question, and open the free accounts

**Do.** Ask Neynar, who publish the template and operate the API, whether a
fork may serve users on its own domain against `farcaster.xyz/~api`, and under
what limits. In the same hour, open a Neynar developer account on the free tier
and run `make dev` in a Snapchain checkout.

**How.** The question cites the README's own words: "run locally, pointing to
the current production API by Farcaster" and "fork it and build on it." The
free tier and the devnet need no payment.

**Evidence.** The README statements and the MIT licence held by Neynar are
pinned (audit: "template README statements", "template licence"). The free
tier's figures, 10M credits a month with the hub endpoint included, are
Neynar's own docs read through search excerpts because the pages are blocked
here. The devnet compose, its four nodes and its `dev:dev` admin auth are
pinned (audit: "devnet compose", "devnet image bakes in admin auth").

**Done when.** A written answer from Neynar, an API key in the secret store,
and `curl localhost:3381/v1/info` returning `numShards: 2`.

---

## 2. Next: build Source B, in this order

Each item is a change to the fork that the earlier passes already located. All
of it is developed on the devnet and rehearsed on testnet before it touches a
mainnet account. The table is the version of 2026-10-14. The revision of
2026-11-10 keeps its order and changes two things: item 2 is now the default
feed rather than a fallback label, and every item is built against a list of
providers across both networks rather than one. The revised table, with a
gateway, node settings and three preference facets added, is in
[the design page](../research/optimal-design.md) §6.1.

| # | Build | How | Evidence | Done when |
| --- | --- | --- | --- | --- |
| 1 | **The adapter.** One `HomeDataClient` behind the fork's `WebFarcasterApiClientProvider`, with the source as configuration | implement the fifteen private endpoints the core screens use against the node, the service and Neynar; the feed path stays on `personalizeFeedItems` | the fifteen endpoints and the single constructor are pinned (audit: "core screen endpoints the runbook maps", "the web app constructs one FarcasterApiClient"); the seam helper has 3 passing fork tests | the home feed renders devnet casts through the adapter |
| 2 | **Reason synthesis.** `includeReason` for following, channel, reply, recast and mention; discovery items labelled as Home's | one module beside the seam helper; the kernel's reason groups are unchanged | the kernel's 197 tests include the reason labels; the ten upstream reasons are pinned (audit: "ten include reasons") | the chip, ledger and undo pass their 14 fork assertions on synthesised data |
| 3 | **Sign In With Farcaster.** `@farcaster/auth-kit` on the landing page; the service verifies with `@farcaster/auth-client` over an OP RPC | replaces the magic-link and phone flows | verification reads `idOf` and `keyDataOf` over the configured RPC (audit: "SIWF verification reads idOf and keyDataOf") | a real sign-in yields a session whose fid matches |
| 4 | **Signer onboarding.** Browser-generated key; gasless `KEY_ADD` when the reader can sign with a wallet, the Farcaster-app deeplink with sponsorship otherwise | two service routes; the Client API for the deeplink | scopes, 90-day TTL, 1,000-key cap, one `KEY_ADD` a minute and the deeplink endpoints are pinned (audit: "KeyAddBody carries scopes", "KEY_ADD limited to one per minute", "signed key request flow") | `signersByFid` shows the device key; whether the Farcaster app signs a gasless request is **untested** |
| 5 | **The write path.** `makeCastAdd` and friends, signed on the device, `POST /messages`, "posted" on the merge event | one module replacing `apiClient.createCast` and the other mutations | the builders, the hash-then-sign order and the best-effort semantics are pinned (audit: "the signature is verified over the hash", "submitMessage semantics") | a cast from Home appears on another node within seconds |
| 6 | **Notifications.** Neynar webhooks for reactions, follows and mentions into a per-fid log the client polls | the free tier includes ten webhooks | the event types are pinned (audit: "Neynar webhook event types"); `/v1/events` costs a reported 2,000 credits a call, so polling it on the free tier is not viable | a like from another account reaches the client |
| 7 | **Storage headroom.** `storageLimitsByFid` on sign-in; a warning before the 101st cast on a single 2025 unit | a small settings panel | the 2025 unit limits are pinned (audit: "2025 storage unit limits") | the number matches the node |

Channels stay on the Client API until on-protocol channels reach mainnet;
their message types are gated to V24, which is not on the schedule (audit:
"V24 (channels) is not on the mainnet schedule"). They were gated to V21
until October 2026, when V21 was used for something else.

Items 1, 3 and 5 are where Home becomes a client of both networks at once:
providers and nodes as configuration with a network tag on every item, login
that also accepts protocol tokens verified against a node, and writes posted to
a list of nodes with per-node status. The reasoning and three small additions
(a social-contract chip, "via @app" attribution, a parity probe) are in
[`../research/both-networks.md`](../research/both-networks.md) §4.

---

## 3. When to spend money, and on what

| Signal | Action | Evidence |
| --- | --- | --- |
| Neynar credits approach 10M a month, or Home needs the event stream | run **a read node**, about $100 a month, and point the adapter at it: a Hypersnap node first, because it has the feed and search routes built in, and a Snapchain node second ([design page](../research/optimal-design.md) §4.10) | a session of raw node reads through Neynar costs about 4,100 credits, so the free tier is roughly 80 sessions a day; a read node needs no OP, Base or L1 RPC and gossips writes to validators (audit: "on-chain connector starts only when an RPC URL is configured", "a read node has no local mempool and gossips writes") |
| Home wants Neynar's feeds and search at volume without running anything | Neynar Scale, $249 a month for 60M credits | Neynar's docs via search excerpts; **unverified** here |
| Neynar's terms, prices or shapes change, or Home wants reads with no key and no credits | point the adapter at a **Hypersnap node**: `haatz.quilibrium.com` for development, Home's own later; same `/v2/farcaster/*` shapes | [`../research/hypersnap.md`](../research/hypersnap.md) §6: all but one of the paths in Neynar's spec exist by name on a Hypersnap node; run its checks a–f first, because its validator list is already stale |
| Never | become a validator; depend on the production API for anything. Its ranking is an option a reader can turn on, and only while permitted | validators are a permissioned set of seven keys (audit: "latest validator set has seven keys") |

---

## 4. What Home will not do yet, and why

- **Mobile.** Nothing has run on iOS. The seam is documented and the kernel is
  platform-neutral, but the track carries Apple, Google, Expo and Firebase
  credentials and the identity renames. It starts after Home has web readers.
- **Account creation.** It makes Home a wallet app: on-chain registration,
  storage, custody handling. The download page already sends new readers to the
  Farcaster app, and the official client only signs people up on mobile
  (audit: "only mobile signs up in the official client").
- **Direct casts.** Off-protocol; FIP-226 is a draft from 2025. Messages by
  another route, and a connect-only wallet, are planned in
  [`../research/messages-and-wallet.md`](../research/messages-and-wallet.md).
- **A learned ranking model.** The kernel's scorer plus derivable reasons
  first; a model needs data Home does not have yet.

---

## 5. The evidence ledger

| Claim the plan rests on | How it was validated |
| --- | --- |
| The patch applies to upstream HEAD and the fork gate passes there | `git apply --check`, `pnpm verify:compat`, `pnpm verify:compat:drift`, 14 fork assertions, `tsc`; 2026-10-09, re-run 2026-10-14, and again 2026-11-10 against `73a39bd` |
| Home's own suite is green | `pnpm check:all`: 259 tests, compat, 11 drift scenarios, 34 claims at the pinned snapshot; see [validation](validation.md) |
| The template invites forking and points local builds at the production API | pinned: "template README statements", "template licence" |
| The why-chip's data exists only on that API | pinned: "feed items carry includeReason and score", "v2 spec has no for-you feed"; Snapchain's API is lists only (pinned: "HTTP routes the page relies on") |
| Gasless signers, their limits, and the deeplink flow | pinned: 9 audit rows across the Snapchain and docs sources |
| The device half of the write path works with the published SDK | run 2026-11-10: `pnpm validate:write-path`, 13 checks against `@farcaster/core` 0.21.0 |
| The production API refuses casts without opt-in | web: two independent reports of 2026-10-15 and 10-16 ([design page](../research/optimal-design.md) §1.1); **untested** here |
| Hypersnap's fork is scheduled in code, with a relay, free accounts and no storage rent | pinned: the fork rows of the audit, against `ce9d003` |
| Read nodes need no RPC and can write | pinned: 2 rows read from `src/main.rs` and `src/mempool/mempool.rs` |
| Public read nodes exist | pinned: "public node registry"; their policy **untested** |
| Neynar is the ecosystem default | six client manifests read 2026-10-14 (five depend on Neynar); both node guides recommend it (pinned: "both node guides recommend Neynar") |
| Costs: node ~$100 a month, 2025 unit 100 casts, hub list call 200 credits, free tier 10M credits | first two pinned; the credit figures are Neynar docs via search excerpts |
| The engine moves every few weeks and the spec lags the code | pinned: "mainnet activation dates", "spec repo still omits KEY_ADD" |

Everything in the ledger re-runs with `pnpm audit:claims` and
`pnpm audit:protocol`; the weekly `protocol-audit` workflow re-runs the latter
against upstream HEAD and names any claim that moves.

---

## 6. Risks, each with the test that retires it

| Risk | Retired by |
| --- | --- |
| The production API refuses Home's origin or Neynar declines | §1.3a and §1.4; Source B is already underway, so the answer changes the order, not the plan |
| Public nodes rate-limit or refuse writes | §1.3b; fall back to Neynar's hosted node, then an own read node |
| Neynar's API changes or closes after the 2026-10-15 Network School acquisition | the adapter's provider switch: a Hypersnap node serves the same shapes with no key ([`../research/hypersnap.md`](../research/hypersnap.md) §3, §6) |
| Farcaster's auth server (`auth.farcaster.xyz`, SIWF and Quick Auth) stops answering under Network School, as reported for a day on 2026-10-14 | protocol tokens verified against Home's node (`@farcasterorg/quick-auth`, MIT) beside Home's own SIWF verification ([`../research/both-networks.md`](../research/both-networks.md) §2) |
| The Hypersnap validator fork, projected for 2026-11-12, splits the network | the design assumes it: a network tag on every item, dedupe by message hash, writes posted to a node on each network ([design page](../research/optimal-design.md) §2, §4.5); watch it with the four checks in its §6.2 |
| The fork is postponed again or abandoned | nothing in the design depends on it; the weekly audit names the heights if they move |
| The production API closes to third-party origins, or its ranked feed is gated by the social contract | nothing depends on it since the revision of 2026-11-10; Home's own ranking and reasons are the default |
| Quilibrium does not permit other clients on Quorum's servers, or Quorum loses messages | the two checks in [messages and wallet](../research/messages-and-wallet.md) §3, before any build; XMTP is the fallback |
| Coinbase retires or restricts its wallet SDK | the wallet is one wagmi connector beside every wallet the browser exposes ([messages and wallet](../research/messages-and-wallet.md) §7) |
| A reader's account is owned by a smart wallet | such an account cannot approve a gasless key on either network; Home says so at sign-in and offers the on-chain key path later ([messages and wallet](../research/messages-and-wallet.md) §4) |
| Readers cannot sign a gasless request from the Farcaster app | §2.4 on a device; the deeplink path with sponsorship is the fallback and is documented |
| Testnet does not accept mainnet accounts | §1.3c; the devnet remains the test ground |
| Upstream moves the seams again | the audits fail loudly and the patch re-applies; measured once already: one line moved in one snapshot |
