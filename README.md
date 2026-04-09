# `@gitbondhq/mppx-stake`

An [`mppx`](https://github.com/wevm/mppx) stake method that proves an
[MPPEscrow](https://github.com/gitbondhq/mpp-stake-demo) is **already active**
for a given scope and beneficiary.

The credential is an off-chain EIP-712 signature, never a transaction. The
server verifies it by recovering the signer and reading
`isEscrowActive` / `getActiveEscrow` from chain. **No gas is spent during
the credential round-trip.**

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
import { stake } from '@gitbondhq/mppx-stake/server'
import { Mppx } from 'mppx/server'
import { keccak256, toHex } from 'viem'

const mppx = Mppx.create({
  methods: [
    stake({
      name: 'tempo',
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

### Server parameters

| Parameter      | Type      | Required | Notes                                                          |
| -------------- | --------- | -------- | -------------------------------------------------------------- |
| `name`         | `string`  | yes      | Method name shared with the client (e.g. `'tempo'`).           |
| `chainId`      | `number`  | yes      | Must be in [`supportedChains`](#chains).                       |
| `contract`     | `Address` | no       | Default escrow contract for this route.                        |
| `counterparty` | `Address` | no       | Default counterparty.                                          |
| `token`        | `Address` | no       | Default ERC-20 token.                                          |
| `description`  | `string`  | no       | Shown to the client in the challenge UI.                       |

`contract`, `counterparty`, and `token` are **defaults** — they can be
overridden per-route. Anything you don't set in the configuration must be
passed at the call site.

## Client

The client method takes a viem `Account` (or anything with
`signTypedData`) and signs the proof when the server returns a 402.

```ts
import { stake } from '@gitbondhq/mppx-stake/client'
import { Mppx } from 'mppx/client'
import { privateKeyToAccount } from 'viem/accounts'

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`)

const mppx = Mppx.create({
  methods: [stake({ name: 'tempo', account })],
})

// `mppx.fetch` follows the 402 → credential → retry flow automatically.
const res = await mppx.fetch('https://api.example.com/resource', {
  method: 'POST',
})
```

If the signing wallet is not the beneficiary (e.g. an embedded wallet
acting on behalf of a user-controlled account), pass a separate
`beneficiaryAccount`:

```ts
stake({
  name: 'tempo',
  account: payerAccount,         // any account that satisfies the framework
  beneficiaryAccount: userAccount, // signs the scope-active proof
})
```

The `beneficiaryAccount.address` is what gets bound into the typed-data
proof and the `did:pkh:eip155:{chainId}:{address}` source.

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
  policy?: string                      // application-side policy tag
  resource?: string                    // application-side resource tag
  scope: Hex                           // bytes32, the per-resource identifier
  token: Address                       // ERC-20 token address
  methodDetails: { chainId: number }
}
```

The credential payload:

```ts
type StakeCredentialPayload = {
  signature: Hex                       // EIP-712 ScopeActiveStake signature
  type: 'scope-active'
}
```

The `scope` is whatever bytes32 your application uses to uniquely identify
"the thing being staked against" — typically `keccak256` of a stable
identifier (PR number, document ID, session key, etc.).

### Parsing a challenge from a 402 response

```ts
import { parseStakeChallenge } from '@gitbondhq/mppx-stake'

const challenge = parseStakeChallenge(response, { methodName: 'tempo' })
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
(`ScopeActiveStake { challengeId, expires, scope, beneficiary }`), and DID
source format (`did:pkh:eip155:{chainId}:{address}`) match
[`mpp-stake-demo/packages/mppx-stake`](https://github.com/gitbondhq/mpp-stake-demo)
byte-for-byte. Credentials produced against either package verify on
either side.

## Subpath exports

| Entry                            | Use                                          |
| -------------------------------- | -------------------------------------------- |
| `@gitbondhq/mppx-stake`          | Schema, types, chain helpers, challenge parser. |
| `@gitbondhq/mppx-stake/client`   | `stake()` for the client (signs proofs).     |
| `@gitbondhq/mppx-stake/server`   | `stake()` for the server (verifies proofs).  |
| `@gitbondhq/mppx-stake/abi`      | `escrowAbi`.                                 |
