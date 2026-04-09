import { Method, z } from 'mppx'
import type { Address, Hex } from 'viem'

import { baseUnitAmount } from './shared/request.js'

/**
 * The wire shape of a stake challenge request.
 *
 * Hand-written rather than derived from `stakeRequestSchema` so the address
 * and hash fields keep viem's branded types (`Address`, `Hex`) — `z.address()`
 * and friends erase those brands to plain `string`. The runtime schema below
 * is the runtime source of truth; this type is the compile-time source of
 * truth. Keep them in sync (tests catch most drift).
 */
export type StakeChallengeRequest = {
  amount: string
  beneficiary?: Address | undefined
  contract: Address
  counterparty: Address
  description?: string | undefined
  externalId?: string | undefined
  policy?: string | undefined
  resource?: string | undefined
  scope: Hex
  token: Address
  methodDetails: {
    chainId: number
  }
}

export type StakeCredentialPayload = {
  signature: Hex
  type: 'scope-active'
}

export type StakeMethodParameters = {
  name: string
}

const stakeRequestSchema = z.object({
  amount: baseUnitAmount(),
  beneficiary: z.optional(z.address()),
  contract: z.address(),
  counterparty: z.address(),
  description: z.optional(z.string()),
  externalId: z.optional(z.string()),
  policy: z.optional(z.string()),
  resource: z.optional(z.string()),
  scope: z.hash(),
  token: z.address(),
  methodDetails: z.object({
    chainId: z.number(),
  }),
})

const stakeCredentialPayloadSchema = z.object({
  signature: z.signature(),
  type: z.literal('scope-active'),
})

/**
 * Shared `name/stake` method schema used by both the client and server
 * adapters in this package.
 */
export const createStakeMethod = ({ name }: StakeMethodParameters) =>
  Method.from({
    name,
    intent: 'stake',
    schema: {
      credential: { payload: stakeCredentialPayloadSchema },
      request: stakeRequestSchema,
    },
  })
