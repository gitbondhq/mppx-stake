# `@gitbondhq/mppx-stake`

Minimal escrow stake method support for `mppx`.

This package does one thing:
- define the shared `stake/stake` method schema
- provide client helpers to build escrow stake credentials
- provide server helpers to verify those credentials against `MPPEscrow`

It does not try to own the full MPP method bundle. If you need `charge`,
`session`, or `settle`, register those from `mppx` yourself and then add
`stake`.

## Entry points

- `@gitbondhq/mppx-stake`
  - exports `Methods.stake`
  - exports `MPPEscrowAbi`
  - exports network preset helpers like `defaultNetwork` and `getNetworkPreset`
- `@gitbondhq/mppx-stake/client`
  - exports `stake(...)`
- `@gitbondhq/mppx-stake/server`
  - exports `stake(...)`
- `@gitbondhq/mppx-stake/abi`
  - exports `MPPEscrowAbi`

## Client usage

```ts
import { Mppx, tempo } from 'mppx/client'
import { stake } from '@gitbondhq/mppx-stake/client'

const mppx = Mppx.create({
  methods: [[...tempo({ account }), stake({ account })]],
})
```

If you only want the escrow method:

```ts
import { stake } from '@gitbondhq/mppx-stake/client'

const method = stake({ account })
```

## Server usage

```ts
import { Mppx, tempo } from 'mppx/server'
import { stake } from '@gitbondhq/mppx-stake/server'

const mppx = Mppx.create({
  methods: [
    [...tempo({ account }), stake({
      chainId: 42431,
      contract: '0x1234...',
      token: '0x20C0000000000000000000000000000000000000',
    })],
  ],
  secretKey: process.env.MPP_SECRET_KEY!,
})
```

If you only want the escrow method:

```ts
import { stake } from '@gitbondhq/mppx-stake/server'

const method = stake({
  chainId: 42431,
  contract: '0x1234...',
  token: '0x20C0000000000000000000000000000000000000',
})
```

## Notes

- The shared method identity is `method="stake"` with `intent="stake"`.
- This package only defines supported network presets. The consuming app chooses
  the active network.
- Base and Ethereum support come from changing the selected preset, not from
  separate package entry points.
