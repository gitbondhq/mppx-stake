import { Method, z } from 'mppx'
import type { Address, Hex } from 'viem'

import { baseUnitAmount } from './shared/request.js'

// Each pair below ─ a TypeScript type and its zod schema ─ describes the
// same wire shape from two angles: the type is the compile-time source of
// truth (preserving viem's `Address`/`Hex` brands that `z.address()` erases),
// the schema is the runtime source of truth. Keep them in sync; tests cover
// most drift but if you add a field to one, add it to the other.

// ── Stake challenge request ──────────────────────────────────────────────

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

// ── Stake credential payload ─────────────────────────────────────────────

export type StakeCredentialPayload = {
  signature: Hex
  type: 'scope-active'
}

const stakeCredentialPayloadSchema = z.object({
  signature: z.signature(),
  type: z.literal('scope-active'),
})

// ── Method factory ───────────────────────────────────────────────────────

export type StakeMethodParameters = {
  name: string
}

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
