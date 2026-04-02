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
  submission?: 'push' | 'pull'
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

- `hash` means the client already submitted the stake transaction (push).
- `transaction` means the client signed a transaction for the server to inspect
  and optionally submit (pull). The signed transaction may be either a Tempo
  batch transaction (`0x76` prefix) or a standard EIP-1559 transaction (`0x02`
  prefix). See [Embedded Wallet Support](#embedded-wallet-support) for details.

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
| `provider` | `EIP1193Provider` | Optional wallet provider for signing (see [Embedded Wallet Support](#embedded-wallet-support)) |
| `feeToken` | address | Optional fee token forwarded to Tempo transaction submission |
| `permitDeadlineSeconds` | number | Optional override for permit expiry when using permit flow |

Client behavior:

- `tempo(...)` returns the upstream Tempo methods plus this package's `stake`
  method.
- The client reads the `submission` field from the server's challenge to decide
  whether to push or pull. If the server omits it, the client defaults to push.
- `submission: 'push'` submits calls with `sendCallsSync` and returns a
  credential with `payload.type = 'hash'`.
- `submission: 'pull'` signs a transaction request and returns a credential with
  `payload.type = 'transaction'`. When a `provider` is given and the transaction
  is a single call (permit flow), signing uses the provider's
  `eth_signTransaction`, producing a standard EIP-1559 transaction. Otherwise,
  signing uses viem's `signTransaction`, producing a Tempo batch transaction.
- Transport policy (permit vs legacy) is auto-detected by probing the token's
  `nonces()` function on-chain. If the token supports EIP-2612 permit, a single
  `createEscrowWithPermit` call is built. Otherwise, `approve` plus
  `createEscrow` is used. The result is cached per chain+token pair.

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
  It also sets the `submission` field in the challenge: `'pull'` when a fee
  payer is configured, `'push'` otherwise. This tells the client whether to
  submit the transaction itself or hand it to the server.
- `verify()` first ensures the request being verified still matches the
  original challenge for amount, contract, currency, chain, counterparty,
  beneficiary, and `stakeKey`.
- The payer is derived from the credential source DID.
- If the credential is a `hash`, the server:
  - fetches the receipt
  - checks for a matching `EscrowCreated` event
  - reads `getEscrow(stakeKey)` and verifies final escrow state
- If the credential is a signed `transaction`, the server:
  - if Tempo batch (`0x76`): deserializes the Tempo transaction, matches the
    call sequence, optionally cosigns with the fee payer, and submits
  - if standard EIP-1559 (`0x02`): parses the transaction, extracts `to`/`data`
    as a single call, validates it, and submits directly (fee payer cosigning is
    not available for standard transactions)
  - in both cases: verifies the receipt and final escrow state

## Embedded Wallet Support

Embedded wallets like Privy only support standard EVM transaction types (0, 1,
2, 4) and cannot sign Tempo's custom batch transaction type (`0x76`).
Additionally, Tempo's RPC rejects standard EIP-1559 transactions sent via
`eth_estimateGas` with type `0x2`, and does not allow native value transfers.

To work around this, the client SDK accepts an optional `provider` parameter
(any EIP-1193 compatible provider, such as Privy's `getEthereumProvider()`).
When a provider is given and the transaction is a single call (permit flow in
pull mode), the SDK:

1. Uses viem's `prepareTransactionRequest` with the Tempo client for gas
   estimation (Tempo's chain hooks handle the RPC format)
2. Converts the prepared transaction to a plain hex-encoded parameter object
3. Calls `eth_signTransaction` on the provider, which produces a standard
   EIP-1559 signed transaction (`0x02` prefix)
4. Returns the signed transaction as the credential payload

The server accepts both Tempo batch (`0x76`) and standard EIP-1559 (`0x02`)
transactions in the `transaction` credential type.

Example with Privy:

```ts
import { Mppx, tempo } from '@gitbondhq/mppx-escrow/client'
import { toViemAccount } from '@privy-io/react-auth'

const account = await toViemAccount({ wallet: embeddedWallet })
const provider = await embeddedWallet.getEthereumProvider()

const mppx = Mppx.create({
  methods: [tempo({ account, provider })],
  polyfill: false,
})
```

Limitations:

- Provider-based signing only works for single-call transactions (permit flow).
  Multi-call transactions (legacy approve + createEscrow) still require Tempo
  batch format and a wallet that supports type `0x76`.
- Fee payer cosigning is not available for standard EIP-1559 transactions. The
  server will reject standard transactions when a fee payer is configured.

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
