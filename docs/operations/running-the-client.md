# Getting Home running

Every environment variable, credential, and operational task needed to take a
fork of [`farcasterxyz/client`](https://github.com/farcasterxyz/client) from a
clone to a running client with Home's packages in it.

Researched against snapshot `b6922e2`. Claims marked **verified** were executed
in this repo's CI sandbox on Linux; the rest are read off the source and are
noted where they need confirming on a real machine.

---

## 0. What you are actually running

Three facts shape everything below.

**There is no backend in the snapshot.** The `Makefile` has a `sync-api` target
that copies types from `../backend`, and that repository is not public. A fork
is a *client* of Farcaster's production API:

| App | API host | Source |
| --- | --- | --- |
| mobile | `client.farcaster.xyz` | `apps/farcaster-mobile/src/constants/Api.ts` — `forceProdApi = true`, hardcoded |
| web | `farcaster.xyz/~api` | `apps/farcaster-web/src/constants/api.ts` |

Both fall back to `localhost:8080` only if you have that backend. The web app
flips via a `farcasterApi.local` localStorage key, in dev builds only.

**There is no app-level API key.** Authentication is a per-user bearer token
obtained by the user signing in with their own Farcaster account — recovery
phrase, passkey, magic link, or "sign in from another device". The only header
the client adds is `Authorization: Bearer <token>` plus an `Idempotency-Key` on
mutations (`AbstractFarcasterApiClient.ts:558,563`). You do not need to register
an application to read the API as a signed-in user.

**Only the mobile app attests.** `MobileClientIntegrityService.ts` attaches
`X-Firebase-AppCheck` via Firebase App Check. The web app has no equivalent —
four files mention Firebase and all are mini-app/wallet features. This is why
the web path needs no credentials and the mobile path does.

> The unverified assumption in all of this is whether the production API accepts
> requests from a fork at all — rate limits, App Check enforcement on mobile
> endpoints, and terms of use are the operator's call, not a technical one this
> repository can answer. Confirm before building on it.

---

## 1. Three milestones, kept separate

The agent guide's framing, and it is the right one:

1. **Build** — native and JavaScript compilation succeed.
2. **Credential-free launch** — the app renders, with expected integration
   warnings. Warnings are not failures.
3. **Fully functional** — sign-in, protected APIs, wallets, notifications,
   telemetry and deployment all configured.

Most of the credential work below belongs to milestone 3. Milestones 1 and 2 are
reachable today with nothing.

---

## 2. Path A — the web client (fastest, zero credentials)

**Verified end to end on Linux in this sandbox.** No Apple hardware, no Firebase,
no Privy, no accounts of any kind.

```bash
git clone https://github.com/farcasterxyz/client.git
cd client
corepack enable
corepack pnpm install --frozen-lockfile        # ~35s
corepack pnpm --filter './packages/**' build   # shared packages
cd apps/farcaster-web
corepack pnpm dev                              # or `pnpm build` for a bundle
```

What I observed: `pnpm build` succeeded in **1m 18s**, and the built bundle,
served statically and loaded in headless Chromium, rendered the real landing
page — *"Build. Share. Grow."*, with **Sign up**, **Log in with email** and
**Log in with phone**. The only failed requests were `farcaster.xyz` (the API)
and `ph.neynar.com` (PostHog), both blocked by this sandbox's egress proxy
rather than by missing configuration.

Two operational notes from doing it:

- **Do not use `--ignore-scripts`.** The root `postinstall` runs
  `pnpm-sync prepare`, and without it every package's `postbuild` fails with
  *"The .pnpm-sync.json file was not found"*. I hit this; it costs a full
  reinstall.
- **Build the shared packages before the app.** The apps import workspace
  `dist` output. Skipping it produces a native build that succeeds and a Metro
  bundle that fails on stale files.

`pnpm start` serves over HTTPS (`HTTPS=true vite`), which you will want for
anything touching wallet or passkey APIs.

**This is where Home should ship first.** Every one of Home's packages is
platform-neutral TypeScript; the web app needs no simulator, no signing, and no
credentials to prove the why-chip works against the real API.

## 3. Path B — iOS Simulator (macOS, credential-free)

Follow [`danromero/farcaster-client-agent-guide`](https://github.com/danromero/farcaster-client-agent-guide).
It is genuinely good and covers the failure modes. Condensed:

**Host requirements** (its `preflight.sh` checks all of these):

| Requirement | Notes |
| --- | --- |
| macOS | The verified path; no Linux/Windows equivalent |
| Xcode + iOS runtime | Open once to accept the licence; `xcode-select -p` correct; ≥1 runtime in `xcrun simctl list runtimes` |
| ~20 GB free | Simulator runtimes and DerivedData are large |
| Node **20.19.5** | Exactly `.node-version`. Corepack pins pnpm, not Node |
| pnpm 10.8.1 | Via `corepack`, not a global install |
| Watchman + vips | `brew bundle` from the repo `Brewfile` |
| CocoaPods | `brew install cocoapods` if absent |
| Port 8081 free | Preflight fails if another checkout's Metro holds it |
| Path without spaces, not iCloud/Dropbox-backed | Two classes of nondeterministic failure |

```bash
./scripts/preflight.sh ../client
./scripts/bootstrap-ios.sh ../client --apply-placeholder-guard
./scripts/start-ios.sh ../client --build     # terminal A, keep in foreground
./scripts/verify-ios.sh ../client            # terminal B, exits 2 by design
./scripts/verify-ios.sh ../client --visual-status onboarding
```

The **placeholder guard** is the load-bearing piece: the committed
`GoogleService-Info.plist` is all `REPLACE_ME`, and unguarded Firebase native
init can terminate the process at launch. The guard is a reviewable source patch
that skips Firebase and App Check when the plist is a placeholder.

Expected warnings in this mode, none of which are failures:

```text
No Firebase App '[DEFAULT]' has been created
Secondary Privy client init failed
Invalid Privy app ID
```

No Apple Developer team is required for the Simulator.

## 4. Path C — real devices, TestFlight, production

This is where the whole credential list comes due. Sections 5–7.

---

## 5. Environment variables — complete

Nothing here is required for Path A. Nothing except the App Check token is
required for Path B.

### Mobile — `apps/farcaster-mobile/.env` (gitignored; confirm before writing)

| Variable | Required for | Notes |
| --- | --- | --- |
| `EXPO_ACCESS_TOKEN` | EAS builds, updates, project access | expo.dev → Account → Access tokens |
| `EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN` | Protected API calls from a simulator/debug build | **Must be registered in the Firebase App Check console.** An arbitrary value does nothing |
| `EXPO_PUBLIC_DISABLE_APPSTORE_PROMPT` | Suppressing the store prompt | Set to `1` in the `internal` EAS profile |
| `EXPO_PUBLIC_DISABLE_NOTIFICATION_PROMPT` | Suppressing the notification prompt | Set to `1` in the `internal` EAS profile |

`src/bin/validate-build-env.cjs` runs as `eas-build-pre-install` and **fails the
build** if the App Check debug token is set on a profile that is not
`development`, `preview`, `internal` or `simulator`. That is a deliberate guard
against leaking a debug attestation token into a production binary — keep it.

### Web

| Variable | Required for |
| --- | --- |
| `VITE_RELEASE_ID` | Release tagging in the bundle |
| `HTTPS` | `pnpm start` serves over TLS |
| `BUNDLE_ANALYZER` | `pnpm profile:bundle` |
| `MODE` | Vite built-in |

### CI, tooling and source-map upload

| Variable | Required for |
| --- | --- |
| `POSTHOG_CLI_API_KEY`, `POSTHOG_CLI_HOST`, `POSTHOG_CLI_PROJECT_ID` | PostHog source-map upload |
| `DATADOG_API_KEY` / `DD_API_KEY`, `DATADOG_SITE` | Datadog source-map upload |
| `CLANKER_API_KEY` | Clanker integration |
| `EAS_BUILD_PROFILE` | Set by EAS; read by the pre-install guard |
| `NODE_ENV`, `FORCE_COLOR`, `HUSKY` | Standard tooling; `HUSKY=0` disables hooks |

### Guide and this repo

| Variable | Purpose |
| --- | --- |
| `FARCASTER_CLIENT_DIR` | Agent guide's target-client override |
| `SNAPSHOT` | Home's `verify:compat` — path to a client checkout |

---

## 6. Hardcoded placeholders — 47 across 17 files

`grep -rn REPLACE_ME` in the snapshot. These are **not** environment variables;
they are committed placeholder values you must edit in place or replace with
downloaded files. Grouped by the account you need first.

| # | Group | Files | What it is |
| --- | --- | --- | --- |
| 15 | **Firebase** | `ios/Farcaster/GoogleService-Info.plist` (5), `google-services.json` (5), `android/app/google-services.json` (5) | Download real files per platform for **your** bundle/package id. Never hand-edit |
| 7 | **Apple signing** | `ios/Farcaster.xcodeproj/project.pbxproj` (5 × `DEVELOPMENT_TEAM`), `Farcaster.entitlements`, `FarcasterNotifications.entitlements` | Your Apple team ID, and the `TEAMID.bundleid` app-group prefix |
| 10 | **Universal links** | `apps/farcaster-web/public/.well-known/apple-app-site-association` (5), `apps/farcaster-ssr/...` (5) | `TEAMID.com.yourorg.yourapp` |
| 4 | **Expo Updates** | `app.json` (`extra.eas.projectId`, `updates.url`), `ios/.../Expo.plist`, `android/.../AndroidManifest.xml` | Your EAS project id and `https://u.expo.dev/<id>` |
| 4 | **Privy** | `src/constants/Privy.ts` | Primary + secondary app id and client id — embedded wallets |
| 2 | **Datadog** | `src/contexts/DatadogProvider.tsx` | Client token + application id |
| 2 | **PostHog** | `packages/farcaster-analytics/src/config/analyticsConfig.ts` | Dev and prod project API keys |
| 1 | **Alchemy** | `src/contexts/PayUserProvider.tsx` | `https://base-mainnet.g.alchemy.com/v2/<key>` |
| 2 | **Snap builder** | `packages/farcaster-client-hooks/src/utils/snapHandlerAnalytics.ts` | `snap-builder-api.<subdomain>.workers.dev` |

Verify the count after any snapshot update:

```bash
grep -rn REPLACE_ME . | grep -v node_modules | wc -l   # 47 at b6922e2
```

---

## 7. Third-party accounts

| Service | Needed for | Milestone |
| --- | --- | --- |
| **Expo / EAS** | Cloud builds, OTA updates, project id | 3 |
| **Firebase** (Google) | Push, App Check attestation | 3 (mobile) |
| **Apple Developer** ($99/yr) | Team id, bundle id, capabilities, TestFlight | 3 (device) |
| **Google Play** ($25 once) | Android distribution | 3 (Android) |
| **Privy** | Embedded wallets | Optional |
| **Alchemy** | Base mainnet RPC | Optional |
| **PostHog** | Product analytics | Optional |
| **Datadog** | Telemetry, RUM | Optional |

None are required for Path A. Only Firebase App Check is required for Path B to
talk to protected APIs, and the guard lets you skip even that for UI work.

---

## 8. Fork-specific renames

The snapshot is Farcaster's own app, so a fork must change identity before it
can be built for a device or submitted anywhere. This is easy to miss and fails
late.

| Thing | Current value | Where |
| --- | --- | --- |
| iOS bundle id | `com.farcaster.mobile-client` | `app.json` → `ios.bundleIdentifier`, entitlements, AASA |
| Android package | matches | `app.json`, `google-services.json`, `AndroidManifest.xml` |
| URL scheme | `farcaster` | `app.json` → `scheme` |
| Expo owner / slug | `farcaster` / `farcaster` | `app.json` |
| Associated domains | `applinks:warpcast.com`, `applinks:farcaster.xyz` and `webcredentials:` for both | `app.json` → `ios.associatedDomains` |
| App name | `Farcaster` | `app.json` |

Universal links and passkey `webcredentials` only work for domains **you**
control and serve a matching `apple-app-site-association` from. Leaving
Farcaster's domains in place means those features silently do not work for your
build.

---

## 9. Gotchas worth knowing before you hit them

- **`--ignore-scripts` breaks the build.** Root `postinstall` runs `pnpm-sync
  prepare`; without it, package `postbuild` fails. Verified.
- **Node version differs between local and EAS.** `.node-version` is 20.19.5;
  `eas.json` builds on Node 24.3.0. Match the local one locally.
- **Build shared packages before the app**, or Metro fails on stale `dist`.
- **Open `.xcworkspace`, never `.xcodeproj`.** CocoaPods owns the integration.
- **`forceProdApi = true` is hardcoded** in the mobile client — there is no env
  var for the API host. Editing that constant is the only switch.
- **A native rebuild is required** after changes to Swift, pods, native deps,
  Expo SDK, app config, plists or entitlements. JS-only changes hot-reload.
- **PostHog analytics call `ph.neynar.com`.** The client is operated by Neynar
  ("Copyright © 2026 Neynar" in the web footer). Expect that host in your
  network logs, and decide whether a fork should keep it.
- **`pnpm watch` only after the first successful build**, and only when editing
  shared packages.

---

## 10. Home-specific tasks

Once a fork runs, wiring Home is separate from all of the above and needs none
of it. See [`../integration/wiring-into-a-fork.md`](../integration/wiring-into-a-fork.md)
for the six call sites. In order:

1. Copy `packages/home-personalization`, `packages/farcaster-adapter` and
   `packages/home-client-core` into the fork's `packages/`. They have no runtime
   dependencies and the workspace already globs `packages/*`.
2. `SNAPSHOT=. pnpm verify:compat` from the Home repo, against the fork, before
   writing any UI. It fails loudly if the snapshot has drifted from what the
   adapter reads.
3. Add `"home-client-core": "workspace:*"` to the app manifests.
4. Replace the `flatItems` memo at `useMixedFeedItems.ts:311` with
   `personalizeMixedFeed`.
5. Ship the why-chip. One render change, no new state, no credentials.

**Recommended order overall:** Path A to a running web client, Home wired in and
the why-chip visible, *then* Path B, and only then the credential work in
sections 6–7. The credentials buy push notifications, wallets and telemetry —
none of which the differentiating features need.
