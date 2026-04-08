# Plan: migrate this package to the proof-of-existing-escrow model

## Goal

Adopt the **functional model** of `mpp-stake-demo/packages/mppx-stake` — the
credential is an off-chain typed-data signature attesting that an escrow with
a given scope is active for a given beneficiary, and the server verifies it
by recovering the signer and reading chain state. **No transaction building,
no submission, no fee-payer machinery on the credential path.**

Keep:
- Our `client/`, `server/`, `shared/` file split (no `internal/` wrapper).
- Our `chains.ts` (chainId-based, `supportedChains`, `getChain`, `isTempo`)
  in place of the demo's `NetworkPreset`. Consumers pass a `chainId`, not a
  preset.
- Our split ABI (`abi/erc20.ts`, `abi/escrow.ts`, `abi/index.ts`) and the
  way it's exported from the package root.
- Our test rigor and review standards. **Do not** copy the demo's tests
  verbatim — port them through the lens of "what is this actually
  asserting" and rewrite them against our shapes.

Discard:
- The "credential is the tx" assumption that the entire client/submit/cosign
  pipeline is built around. That whole flow goes away.

## Guiding principles

1. **Functional parity, not API parity.** The package should be able to do
   everything the demo can do, but the surface can — and should — diverge
   wherever we have something better. Don't reintroduce `NetworkPreset`,
   don't reintroduce a single 668-line ABI file, don't reintroduce the
   `internal/` wrapper.
2. **No regression in review quality.** Every file we add gets the same
   scrutiny our restructure got. If something in the demo looks
   underconsidered (e.g. duplicated request-matching logic, loose typing,
   tests that hit real RPCs), we fix it on the way in instead of porting
   the smell.
3. **Wire compatibility with the demo's typed-data and DID format is
   probably worth keeping.** See open question #2.
4. **One thematic commit per phase below.** The phases are independent
   enough to land and review separately.

---

## Decisions (resolved)

These were open questions in an earlier draft. Recording the answers
inline so the rest of the plan can read as a flat instruction list.

1. **Contract**: target the demo's MPPEscrow contract. Replace our
   `abi/escrow.ts` contents with the demo's ABI (keeping our split-file
   layout under `abi/`). The verification path uses
   `isEscrowActive(scope, beneficiary)` and
   `getActiveEscrow(scope, beneficiary)`. Our current `getEscrow(key)` /
   `isEscrowActive(key, payer)` shape is gone.
2. **Wire compatibility**: match the demo bit-for-bit on the typed-data
   hash and the DID source format. That means:
   - Schema field: `stakeKey` → `scope` (`bytes32`).
   - EIP-712 domain: `{ name: 'MPP Scope Active Stake', version: '1',
     chainId, verifyingContract }`.
   - Primary type `ScopeActiveStake { challengeId, expires, scope, beneficiary }`.
   - DID source: `did:pkh:eip155:{chainId}:{beneficiaryAddress}` where the
     address is the **beneficiary**, not the payer.
3. **Payer field**: drop entirely from the schema, from
   `assertRequestMatches`, and from the verification cross-checks. The
   on-chain `getActiveEscrow` tuple still surfaces a `payer` but we don't
   constrain it. Consumers that care can layer their own check on top.
4. **Fee-payer support**: removed from this package entirely. The
   credential round-trip is gas-free. Anything that touches gas (escrow
   creation, fee-payer cosigning, Tempo batch txs) is a consumer concern.
   Implication: delete `isTempo` from `chains.ts`, all `withFeePayer` /
   `submitRawSyncAction` plumbing from `evmClient.ts`, the `feePayer` field
   from `methodDetails`, and `withStakeFeePayer` from `challenge.ts`.
5. **`request()` echo hook**: adopt it. Echo `beneficiary`, `externalId`,
   and `scope` from a present credential into the follow-up request before
   verification.

A guiding heuristic that falls out of #2 and #4: **anything we have locally
that isn't compatible with the demo's model gets removed, not adapted.**
We're not maintaining a parallel feature set. Our improvements survive
where they're orthogonal (file layout, split ABI, `chains.ts`,
`assertRequestMatches` shape, test rigor); they get cut where they assume
the credential creates the escrow.

---

## What stays vs. what goes

### Stays (untouched)
- `chains.ts` minus `isTempo` — `supportedChains`, `getChain`,
  `isChainSupported` keep their current shape and chain list. No
  `NetworkPreset`. Consumers pass a `chainId`.
- `abi/erc20.ts` and the split-file layout under `abi/`.
- `abi/index.ts` re-export pattern.
- `client/`, `server/`, `shared/` directory split. No `internal/` wrapper.
- The package `exports` map.

### Stays (modified)
- `shared/evmClient.ts` — strip `feePayerUrl`, `withFeePayer`,
  `submitRawSyncAction`, the `Call` type, and `getClientChainId` if
  nothing in the new code path consumes it. The package only needs a
  read-only viem client now. Target: roughly the demo's `internal/client.ts`
  shape (~15 lines) but parameterised by `chainId` via our `getChain`
  rather than by a `NetworkPreset`.
- `shared/request.ts` — `baseUnitAmount` stays. `toTypedRequest` and
  `TypedStakeRequest` were created to bridge our flat-vs-nested schema
  duality; with the new schema there is no duality, so they probably go.
  Re-evaluate during Phase 1; if `Methods.test.ts` and the new
  `server/stake.ts` don't need them, delete.
- `stakeSchema.ts` — drop `feePayer` from `methodDetails`, drop the
  `transaction` credential variant, switch the credential payload to
  `{ signature, type: 'scope-active' }`, rename `stakeKey` → `scope`,
  drop `payer`. Re-evaluate whether the input/output transform pair
  (`StakeMethodInput` + `toStakeMethodInput`) earns its keep — without
  the `feePayer` flag the only thing the transform was doing was nesting
  `chainId` under `methodDetails`, which a plain `z.object` can express
  directly. Probably delete.
- `Methods.ts` — drop `transactionCredentialSchema`, drop `feePayer`
  field, drop `payer` if present, rename `stakeKey` → `scope`. Credential
  payload becomes the scope-active variant. If the schema collapses to a
  plain `z.object` (per the `stakeSchema.ts` note above), drop the
  `z.pipe(...).z.transform(...)` wrapper.
- `challenge.ts` — keep `parseStakeChallenge`. Delete `withStakeFeePayer`.
- `index.ts` — drop `isTempo` and `withStakeFeePayer` re-exports. Drop
  `StakeMethodInput`/`toStakeMethodInput` if Phase 1 deletes them. Add
  re-exports for the new DID source helpers.
- `abi/escrow.ts` — **replace contents** with the demo's MPPEscrow ABI.
  Keep the `as const` viem-style export. Confirm during the swap that
  every function the new server-side code calls (`isEscrowActive`,
  `getActiveEscrow`, anything else) is present.
- `server/index.test.ts` and friends — rewrite the verify path tests
  against the new model. Don't try to preserve the existing assertions.

### Deleted outright
- `client/buildCalls.ts` and `client/buildCalls.test.ts`
- `client/permit.ts`
- `client/submit.ts`
- `server/cosign.ts`
- `server/payer.ts` — replaced by `shared/source.ts` (see "added")
- `server/verify.ts` — its receipt-matching half (`getSerializedTransaction`,
  `isTempoTransaction`, `matchStakeCalls`, `assertEscrowCreatedReceipt`,
  `toReceipt` taking a tx receipt) all go. The `assertEscrowState` /
  `assertEscrowOnChain` half survives in spirit but moves and gets
  rewritten against the new ABI.
- `server/verify.test.ts` — rewrite alongside the new verify.

### Added
- `shared/scopeActiveProof.ts` — typed-data sign and recover helpers
  (`signScopeActiveProof`, `recoverScopeActiveProofSigner`). Lives in
  `shared/` because both the client (sign) and server (recover) use it.
  Verbatim port of the demo's `scopeActiveProof.ts` is fine *if* we keep
  the typed-data hash compatible (open question #2). Add a small unit
  test (round-trip sign → recover).
- `shared/source.ts` — DID parsing. Replaces `server/payer.ts`. Exposes
  `resolveDid`, `resolveBeneficiary`, `assertSourceDidMatches`. The demo's
  versions of these are fine; reuse the shape, write our own tests.
- `server/escrowState.ts` — `assertEscrowState` and `assertEscrowOnChain`
  rewritten against whatever contract open question #1 settles on. Probably
  uses `getActiveEscrow(scope, beneficiary)` and
  `isEscrowActive(scope, beneficiary)`. This is a server-only file because
  only the server reads chain state for verification.
- `server/echoCredential.ts` (or fold into `server/stake.ts`) — the
  `request()` echo hook from open question #5. Echoes
  `beneficiary`/`externalId`/`scope` from a present credential into the
  follow-up request before verification.

### Moved
- The receipt-shape helper (the one returning
  `{ method, reference, status, timestamp }`) moves out of `server/verify.ts`
  into `server/stake.ts` or its own `server/receipt.ts`. The demo embeds
  it in `tx.ts`; we shouldn't follow that.

---

## Sequenced work

Each phase is one focused commit. Phases 1 and 2 will leave the package
in a temporarily broken intermediate state on the branch and should
either be bundled into a single commit or landed back-to-back without
running CI between them.

### Phase 1 — Schema & types

- Rewrite `stakeSchema.ts`:
  - Rename `stakeKey` → `scope`.
  - Drop `feePayer` from `methodDetails`.
  - Drop `payer` if present.
  - Drop the `transaction` credential variant; the only payload is
    `{ signature, type: 'scope-active' }`.
  - Re-evaluate `StakeMethodInput`/`toStakeMethodInput` — almost certainly
    delete.
- Rewrite `Methods.ts`: drop `transactionCredentialSchema`, drop
  `feePayer`, drop `payer`, rename `stakeKey` → `scope`. Collapse the
  `z.pipe(...).z.transform(...)` to a plain `z.object` if nothing else
  needs the transform.
- Update `Methods.test.ts` to match.
- Update `index.ts` re-exports.

This is a no-runtime-behavior commit at the schema layer, but the rest
of the package won't compile against the new types until Phase 2 lands.

### Phase 2 — Strip the tx-creation pipeline

- Delete `client/buildCalls.ts`, `client/buildCalls.test.ts`,
  `client/permit.ts`, `client/submit.ts`.
- Delete `server/cosign.ts`.
- Delete `server/verify.ts` and `server/verify.test.ts` (the new
  read-only verifier comes in Phase 4).
- Delete `server/payer.ts` (replaced in Phase 3).
- Rewrite `client/stake.ts` and `server/stake.ts` to the bare scaffolds —
  they'll get filled in by Phases 3 and 4. Keep them compiling.
- Strip `evmClient.ts` to its read-only essentials.
- Strip `chains.ts` of `isTempo`.
- Strip `challenge.ts` of `withStakeFeePayer`.
- Update `index.ts`.

After this phase the package compiles, tests for the deleted files are
gone, and `pnpm test` runs only the surviving tests
(`Methods.test.ts`, `challenge.test.ts`, and whatever was in
`server/index.test.ts`). The package is now a no-op stake method — it can
issue challenges but can't verify or create credentials.

### Phase 3 — Client createCredential (proof signing)
Depends on: Phase 2.

- Add `shared/scopeActiveProof.ts` and a unit test (round-trip). The
  typed-data layout (domain, primary type, field order) is byte-for-byte
  the same as the demo's so credentials issued against either package
  verify on either side.
- Add `shared/source.ts` with `resolveDid`, `assertSourceDidMatches`,
  `resolveBeneficiary` and a unit test. DID source = beneficiary.
- Implement `client/stake.ts` `createCredential`:
  - Read `chainId`, `contract`, `scope` from the challenge request.
  - Derive `beneficiary` from `request.beneficiary` if present, else from
    the signing account address.
  - Call `signScopeActiveProof(account, …)`.
  - Return `Credential.serialize({ challenge, payload: { signature,
    type: 'scope-active' }, source: 'did:pkh:eip155:{chainId}:{beneficiary}' })`.
  - Allow an optional `beneficiaryAccount` override (the demo supports
    this — the signing wallet can differ from the payer if for some
    reason the beneficiary is using a separate signer).
- Test: composes with an existing method set; `createCredential` produces
  a credential whose signature recovers to the expected beneficiary.

### Phase 4 — Server verify (signature + on-chain read)
Depends on: Phase 3.

- Replace `abi/escrow.ts` contents with the demo's MPPEscrow ABI.
- Add `server/escrowState.ts` with `assertEscrowState` and
  `assertEscrowOnChain` against the new ABI shape.
- Implement `server/stake.ts` `verify`:
  - Reuse our existing `assertRequestMatches` pattern (it's already
    better than the demo's loose pair-comparison loop) but adapt the
    field set to the new schema.
  - `resolveBeneficiary` from `credential.source` if `request.beneficiary`
    is missing; otherwise use the request value.
  - `recoverScopeActiveProofSigner` and check it matches the expected
    beneficiary.
  - `assertSourceDidMatches`.
  - Build a read-only `EvmClient` from the request `chainId`.
  - `assertEscrowOnChain(client, contract, { scope, beneficiary,
    counterparty, token, value })`.
  - Return the receipt shape `{ method, reference, status, timestamp }`
    where `reference = '${contract}:${scope}:${beneficiary}'` (matches the
    demo).
- Implement the `request()` echo hook for `beneficiary`/`externalId`/`scope`.
- Test (`server/index.test.ts` rewrite):
  - mocks `assertEscrowOnChain` and `createClient` like the demo's tests
    do, so we don't hit a real RPC.
  - covers: composes with method sets, defaults shape, echo hook,
    HMAC tamper rejection, mismatched challenge request rejection,
    mismatched DID chainId rejection, mismatched DID address rejection,
    success path returns the expected receipt.
  - **does not** copy any test that requires the deleted tx pipeline.

### Phase 5 — Documentation, README, and demo
- Update `README.md` to describe the new model in two sentences and link
  to this plan file.
- Update package `exports` if any new entry points were added (probably
  not — `client`, `server`, root re-exports stay the same).
- Drop `dist/` artifacts from the previous model (`pnpm build` after
  Phase 4 should produce a clean tree).

### Phase 6 — Consumer migration
- Switch the github-app from `@gitbondhq/mppx-stake` (linked to
  `mpp-stake-demo/packages/mppx-stake`) back to `@gitbondhq/mppx-escrow`
  (linked to this repo). This is the smallest commit in the sequence —
  it's the same package shape as the demo, so the import paths and
  parameter names stay the same as the github-app already has.
- Verify the github-app's own plan (`plans/mppx-stake-migration.md`)
  still applies — the "missing escrow creation flow" gap is the same
  regardless of which underlying package we use.

---

## Verification

After Phase 4 the package should hit:

- `pnpm typecheck` clean
- `pnpm lint` clean
- `pnpm test` — all tests pass without hitting real RPCs (mocked client +
  mocked `assertEscrowOnChain` per the demo's pattern)
- `pnpm build` — clean `dist/` tree, no leftover files from the deleted
  modules
- Manual review: `find src/ -type f` returns no surprise files; the tree
  matches the "what stays / added / deleted" lists in this plan.

After Phase 6:

- The github-app builds and typechecks against this package.
- The end-to-end manual smoke described in
  `github-app/plans/mppx-stake-migration.md` produces the same expected
  failure ("Escrow is not active"), proving the credential round-trip
  works and the gap is purely the missing on-chain creation step.

## Out of scope

- Anything in `mpp-stake-demo`. We are deliberately not modifying it; we
  read from it as a reference, and once Phase 6 lands the github-app no
  longer depends on it.
- The contract itself. We're consumers of whatever's deployed.
- Persisting issued challenges, replay protection beyond what `mppx`
  already provides via HMAC.
- A higher-level "create escrow" helper. That's a consumer concern. If
  multiple consumers end up needing the same helper, that's a future
  package, not this one.
