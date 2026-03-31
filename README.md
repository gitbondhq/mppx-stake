# `@gitbondhq/mppx-escrow`

MPP payment method for on-chain escrow on Tempo. Client and server TypeScript
SDK for creating, verifying, and settling escrow stakes via the GitBond smart
contract.

It adds a new payment method, `method="tempo"` with `intent="stake"`, so both
the client and server can share the same TypeScript implementation of:

- the `tempo/stake` request schema
- the credential schema for submitted or signed stake transactions
- the client-side transaction construction logic
- the server-side verification logic against the GitBond escrow contract

## Entry Points

- `@gitbondhq/mppx-escrow`
  Exports all core `mppx` primitives, `Methods.stake`, and `GitBondEscrowAbi`.
- `@gitbondhq/mppx-escrow/client`
  Exports `Mppx`, `Transport`, `Expires`, `tempo(...)`, and `stake(...)` for
  browser or client-side integrations.
- `@gitbondhq/mppx-escrow/server`
  Exports `Mppx`, server helpers from `mppx/server`, plus `tempo(...)` and
  `stake(...)` for API integrations.
- `@gitbondhq/mppx-escrow/tempo`
  Exposes the shared `Methods.stake` schema directly.
- `@gitbondhq/mppx-escrow/abi`
  Exposes `GitBondEscrowAbi`.

## What `tempo/stake` Means

The method represents "create an escrow stake on Tempo."

The request shape is:

```ts
type StakeRequest = {
  amount: string
  beneficiary?: `0x${string}`
  chainId: number
  contract: `0x${string}`
  counterparty: `0x${string}`
  currency: `0x${string}`
  description?: string
  externalId?: string
  policy?: string
  resource?: string
  stakeKey: `0x${string}`
}
```

Wire-format notes:

- `amount` must be a base-unit integer string, not a decimal string.
- `stakeKey` is the escrow key and must be a 32-byte hex hash.
- `externalId`, `policy`, and `resource` are metadata fields for the higher
  level GitBond policy layer.
- `beneficiary` is optional. If omitted, verification treats the payer as the
  beneficiary.

The credential payload has two variants:

```ts
type StakeCredentialPayload =
  | { type: 'hash'; hash: `0x${string}` }
  | { type: 'transaction'; signature: `0x${string}` }
```

- `hash` means the client already submitted the stake transaction.
- `transaction` means the client signed a Tempo transaction for the server to
  inspect and optionally submit.

## Client Integration

Typical setup:

```ts
import { Mppx, tempo } from '@gitbondhq/mppx-escrow/client'

Mppx.create({
  methods: [tempo({ account })],
})
```

Low-level export:

```ts
import { stake } from '@gitbondhq/mppx-escrow/client'

const method = stake({ account })
```

Client parameters:

| Option | Type | Purpose |
| --- | --- | --- |
| `account` | `viem` account or address | Default payer account used to create stake credentials |
| `mode` | `'push' \| 'pull'` | Whether the client submits the transaction or only signs it |
| `transportPolicy` | `'auto' \| 'permit' \| 'legacy'` | Controls permit vs approve+createEscrow call construction |
| `feeToken` | address | Optional fee token forwarded to Tempo transaction submission |
| `permitDeadlineSeconds` | number | Optional override for permit expiry when using permit flow |

Client behavior:

- `tempo(...)` returns the upstream Tempo methods plus this package's `stake`
  method.
- `mode: 'push'` submits calls with `sendCallsSync` and returns a credential
  with `payload.type = 'hash'`.
- `mode: 'pull'` signs a Tempo transaction request and returns a credential with
  `payload.type = 'transaction'`.
- Default mode is account-dependent:
  - `json-rpc` accounts default to `push`
  - all other accounts default to `pull`
- `transportPolicy: 'permit'` builds a single `createEscrowWithPermit` call.
- `transportPolicy: 'legacy'` builds `approve` plus `createEscrow`.
- `transportPolicy: 'auto'` resolves by chain:
  - Tempo mainnet: `legacy`
  - Tempo Moderato: `permit`
  - other chains: `permit`

## Server Integration

Typical setup:

```ts
import { Mppx, tempo } from '@gitbondhq/mppx-escrow/server'

const mppx = Mppx.create({
  methods: [
    tempo({
      chainId: 42431,
      contract: '0x1234...',
      currency: '0x20C0000000000000000000000000000000000000',
    }),
  ],
  secretKey: process.env.MPP_SECRET_KEY!,
})
```

Example route usage:

```ts
const result = await mppx.tempo.stake({
  amount: '5000000',
  counterparty: '0xabcd...',
  externalId: 'github:owner/repo:pr:1',
  policy: 'repo-pr-v1',
  resource: 'owner/repo#1',
  stakeKey:
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
})(request)

if (result.status === 402) return result.challenge
return result.withReceipt(Response.json({ ok: true }))
```

Low-level export:

```ts
import { stake } from '@gitbondhq/mppx-escrow/server'

const method = stake({
  chainId: 42431,
  contract: '0x1234...',
  currency: '0x20C0000000000000000000000000000000000000',
})
```

Server parameters:

| Option | Type | Purpose |
| --- | --- | --- |
| `chainId` | number | Default chain for the stake route |
| `contract` | address | Escrow contract address |
| `counterparty` | address | Default counterparty, if route-level |
| `currency` | address | Stake token |
| `beneficiary` | address | Optional route-level beneficiary |
| `description` | string | Optional route-level payment description |
| `feePayer` | `viem` account or URL | Optional fee payer for pull transactions |

Server behavior:

- `request()` fills `chainId` from the route config when omitted at call time.
- `verify()` first ensures the request being verified still matches the
  original challenge for amount, contract, currency, chain, counterparty,
  beneficiary, and `stakeKey`.
- The payer is derived from the credential source DID.
- If the credential is a `hash`, the server:
  - fetches the receipt
  - checks for a matching `EscrowCreated` event
  - reads `getEscrow(stakeKey)` and verifies final escrow state
- If the credential is a signed `transaction`, the server:
  - confirms it is a Tempo transaction
  - matches the call sequence against the expected escrow action
  - optionally applies the fee payer signature
  - submits the transaction
  - verifies the receipt and final escrow state

## ABI Sync

`GitBondEscrowAbi` is checked into `src/abi/GitBondEscrow.ts`. It is synced
automatically via a GitHub Action in the escrow repo when the contract changes.

## Development

```sh
npm run dev    # watch mode — recompile on change
npm run build  # compile to dist/
npm run lint   # eslint + type check
npm run fix    # eslint --fix + type check
npm test       # vitest
```
