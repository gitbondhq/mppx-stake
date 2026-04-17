# `@gitbondhq/mppx-stake`

An [`mppx`](https://github.com/wevm/mppx) stake method that proves an
[MPPEscrow](https://github.com/gitbondhq/mpp-stake-demo) is **already active**
for a given scope and beneficiary.

In the default `BENEFICIARY_BOUND` mode, the credential is an off-chain
EIP-712 signature. The server verifies it by recovering the signer and reading
`isEscrowActive` / `getActiveEscrow` from chain. In `OWNER_AGNOSTIC` mode,
no signature is produced — only on-chain state is checked. **No gas is spent
during the credential round-trip.**

```
client                                              server
  │  GET /resource                                    │
  │ ────────────────────────────────────────────────► │
  │  402 + stake challenge                            │
  │ ◄──────────────────────────────────────────────── │
  │                                                   │
  │  signTypedData over { challengeId, expires,       │
  │                       scope, beneficiary }        │
  │                                                   │
  │  retry with credential                            │
  │ ────────────────────────────────────────────────► │
  │                                                   │
  │                              recover signer       │
  │                              read isEscrowActive  │
  │                              read getActiveEscrow │
  │                              assert state         │
  │                                                   │
  │  200 + receipt                                    │
  │ ◄──────────────────────────────────────────────── │
```

## ⚠️ What this package does **not** do

It does not create escrows. It only attests that one already exists. Your
escrow must be funded on chain **before** the credential round-trip — if it
isn't, `assertEscrowOnChain` will reject the credential with `Escrow is not
active for the expected beneficiary.`

Anything that touches gas — escrow funding, fee-payer cosigning, transaction
submission — is the consumer's responsibility. The package re-exports
[`escrowAbi`](#abi) so you can build that path with viem directly.

## Install

```sh
npm install @gitbondhq/mppx-stake mppx viem
```

`mppx` and `viem` are peer-adjacent — install them yourself so you control
the versions.

## Server

Configure a stake method, plug it into `Mppx.create`, and mount the handler
on your route. Per-route fields (`amount`, `scope`, anything else specific
to that resource) are passed at handler-construction time.

```ts
import { serverStake } from '@gitbondhq/mppx-stake/server'
import { Mppx } from 'mppx/server'
import { keccak256, toHex } from 'viem'

const mppx = Mppx.create({
  methods: [
    serverStake({
      chainId: 42431, // tempoModerato
      contract: '0xe1c4d3dce17bc111181ddf716f75bae49e61a336',
      counterparty: '0x2222222222222222222222222222222222222222',
      token: '0x20C0000000000000000000000000000000000000',
      description: 'Bond required to merge',
    }),
  ],
  secretKey: process.env.MPP_SECRET_KEY,
})

// In your route handler:
const handler = Mppx.toNodeListener(
  mppx.stake({
    amount: '20000', // 0.02 USDC, base units
    scope: keccak256(toHex(`bond:${owner}/${repo}#${pr}`)),
    externalId: `github:${owner}/${repo}#${pr}`,
    resource: `${owner}/${repo}#${pr}`,
  }),
)

await handler(req, res)
```

The first call returns `402` with a stake challenge. The second call (same
URL, with the credential in `Authorization`) runs verification: HMAC-binds
the challenge, recovers the typed-data signer, validates the source DID,
reads chain state, and returns the receipt.

The server supports two authorization modes via the `mode` parameter
(`StakeAuthorizationMode` enum):

- **`BENEFICIARY_BOUND`** (default) — the client signs an EIP-712 proof and
  the server recovers the signer to verify the beneficiary.
- **`OWNER_AGNOSTIC`** — the client skips signature creation; only on-chain
  escrow state is checked. Because the bundled verifier is keyed by
  `(scope, beneficiary)`, this mode requires a custom `assertEscrowActive`
  implementation.

### Server parameters

| Parameter          | Type                     | Required | Notes                                                                                        |
| ------------------ | ------------------------ | -------- | -------------------------------------------------------------------------------------------- |
| `chainId`          | `number`                 | yes      | Must be in [`supportedChains`](#chains).                                                     |
| `rpcUrl`           | `string`                 | no       | Override viem's default public RPC (use a paid endpoint).                                    |
| `contract`         | `Address`                | no       | Default escrow contract for this route.                                                      |
| `counterparty`     | `Address`                | no       | Default counterparty.                                                                        |
| `token`            | `Address`                | no       | Default ERC-20 token.                                                                        |
| `mode`             | `StakeAuthorizationMode` | no       | Defaults to `BENEFICIARY_BOUND`; set to `OWNER_AGNOSTIC` with a custom `assertEscrowActive`. |
| `description`      | `string`                 | no       | Shown to the client in the challenge UI.                                                     |
| `consumeChallenge` | `(id) => Promise<void>`  | no       | Replay-protection hook — see below. Stateless by default.                                    |

`contract`, `counterparty`, and `token` are **defaults** — they can be
overridden per-route. Anything you don't set in the configuration must be
passed at the call site.

### Replay protection

`verify` is **stateless by default** — a captured credential can be replayed
against the same route until its `expires` lapses. For production, plug in
the `consumeChallenge` hook with a TTL'd store keyed on the challenge id:

```ts
import { createClient } from 'redis'

const redis = createClient({ url: process.env.REDIS_URL })
await redis.connect()

serverStake({
  chainId: 42431,
  contract: '0x...',
  consumeChallenge: async (challengeId) => {
    // Atomic claim — `SET NX` returns null if the key already exists.
    const claimed = await redis.set(
      `mppx:stake:challenge:${challengeId}`,
      '1',
      { NX: true, EX: 600 }, // 10 min, > the challenge `expires` window
    )
    if (!claimed) throw new Error('Challenge already consumed.')
  },
})
```

The hook fires after HMAC binding and signature recovery succeed (so junk
credentials don't burn challenge ids) but **before** the on-chain read (so
a transient RPC failure leaves the slot consumed rather than reusable).
Use any atomic claim primitive your store supports — Redis `SET NX`,
Postgres `INSERT ... ON CONFLICT`, DynamoDB conditional writes — so two
concurrent verifies of the same credential can't both succeed. Throw to
reject; the verify call will surface your error to the client.

## Client

The client method optionally takes a viem `Account` (or anything with
`signTypedData`) and signs the proof when the server returns a 402. The
account's address is what gets bound into the typed-data proof and the
`did:pkh:eip155:{chainId}:{address}` source — so pass the **beneficiary's**
signing account, not a payer or relayer.

```ts
import { clientStake } from '@gitbondhq/mppx-stake/client'
import { Mppx } from 'mppx/client'
import { privateKeyToAccount } from 'viem/accounts'

const beneficiaryAccount = privateKeyToAccount(
  process.env.PRIVATE_KEY as `0x${string}`,
)

const mppx = Mppx.create({
  methods: [clientStake({ beneficiaryAccount })],
})

// `mppx.fetch` follows the 402 → credential → retry flow automatically.
const res = await mppx.fetch('https://api.example.com/resource', {
  method: 'POST',
})
```

The server-issued challenge `mode` is authoritative for client behavior:
`BENEFICIARY_BOUND` requires a `beneficiaryAccount` to sign the proof, while
`OWNER_AGNOSTIC` skips signature creation entirely (no `beneficiaryAccount`
needed). The client will throw if a `BENEFICIARY_BOUND` challenge is received
without a `beneficiaryAccount`.

## Schema

The challenge request shape both sides agree on:

```ts
type StakeChallengeRequest = {
  amount: string                       // base-unit integer string
  beneficiary?: Address                // defaults to the credential signer
  contract: Address                    // escrow contract
  counterparty: Address                // the other party
  description?: string
  externalId?: string                  // application-side identifier
  mode: StakeAuthorizationMode         // 'scope-beneficiary-active' | 'scope-active'
  policy?: string                      // application-side policy tag
  resource?: string                    // application-side resource tag
  scope: Hex                           // bytes32, the per-resource identifier
  token: Address                       // ERC-20 token address
  methodDetails: { chainId: number }
}
```

The credential payload is a discriminated union based on `mode`:

```ts
type StakeCredentialPayload =
  | { signature: Hex; type: 'scope-beneficiary-active' }  // BENEFICIARY_BOUND
  | { type: 'scope-active' }                              // OWNER_AGNOSTIC
```

The `scope` is whatever bytes32 your application uses to uniquely identify
"the thing being staked against" — typically `keccak256` of a stable
identifier (PR number, document ID, session key, etc.).

### Parsing a challenge from a 402 response

```ts
import { parseStakeChallenge } from '@gitbondhq/mppx-stake'

const challenge = parseStakeChallenge(response)
// challenge.request.scope, challenge.request.amount, ...
```

Useful when your client needs to render the challenge to a user before
deciding whether to sign — e.g. showing the bond amount on a payment page.

## Chains

```ts
import {
  supportedChains,
  isChainSupported,
  getChain,
} from '@gitbondhq/mppx-stake'
```

`supportedChains` is the read-only list of viem `Chain` definitions this
package will create read-only clients for (mainnet, sepolia, base,
baseSepolia, tempo, tempoModerato). `getChain(chainId)` throws on
unsupported chains; `isChainSupported(chainId)` is the non-throwing
predicate.

Pass a `chainId` you already know is supported and the package handles
the rest — there's no `NetworkPreset` or per-chain config object to wire.

## ABI

```ts
import { escrowAbi } from '@gitbondhq/mppx-stake/abi'
```

The MPPEscrow ABI as a viem-compatible `as const`. Useful when you build
the escrow-creation flow yourself with `viem/actions` (e.g. `writeContract`
or `simulateContract` against `createEscrow`).

## Wire compatibility

The EIP-712 domain (`MPP Scope Active Stake / 1`), primary type
(`ScopeActiveStake { challengeId, expires, scope, beneficiary, counterparty,
token, amount }`), and DID source format (`did:pkh:eip155:{chainId}:{address}`)
still match [`mpp-stake-demo/packages/mppx-stake`](https://github.com/gitbondhq/mpp-stake-demo)
byte-for-byte. Challenge requests in this package now also carry `mode`, so
full wire compatibility depends on the peer understanding that request field.

## Subpath exports

| Entry                            | Use                                                              |
| -------------------------------- | ---------------------------------------------------------------- |
| `@gitbondhq/mppx-stake`          | Schema, types, chain helpers, challenge parser.                  |
| `@gitbondhq/mppx-stake/client`   | `clientStake()` — configures a client method that signs proofs.  |
| `@gitbondhq/mppx-stake/server`   | `serverStake()` — configures a server method that verifies them. |
| `@gitbondhq/mppx-stake/abi`      | `escrowAbi`.                                                     |
