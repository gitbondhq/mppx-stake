import { Method, z } from 'mppx'
import type { Address, Hex } from 'viem'
import { getAddress } from 'viem'

/** MPP stake amounts are base-unit integer strings, not decimal display values. */
const baseUnitAmount = () =>
  z.string().check(z.regex(/^\d+$/, 'Invalid base-unit amount'))

/**
 * Pins the ECDSA signature to the two valid encodings (64-byte r||s or
 * 65-byte r||s||v). `z.signature()` only checks the `0x`-hex shape and would
 * happily accept `0xdeadbeef`, which would then fail opaquely deep inside
 * viem's recovery path.
 */
const ecdsaSignature = () =>
  z
    .string()
    .check(
      z.regex(
        /^0x(?:[0-9a-fA-F]{128}|[0-9a-fA-F]{130})$/,
        'Invalid ECDSA signature',
      ),
    )

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
  signature: ecdsaSignature(),
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

/**
 * The configured stake method type. Hand-written rather than derived via
 * `ReturnType<typeof createStakeMethod>` because the arrow function widens
 * `intent: 'stake'` back to `string` on return, which would erase the
 * literal that downstream `Challenge`/`Credential` generics depend on.
 */
export type StakeMethod = {
  name: string
  intent: 'stake'
  schema: {
    credential: { payload: typeof stakeCredentialPayloadSchema }
    request: typeof stakeRequestSchema
  }
}

/**
 * Re-applies viem's `Address` / `Hex` brands to a zod-parsed stake request.
 *
 * `z.address()` and `z.hash()` erase viem brands at the type level, so the
 * server and client adapters can't pass parsed requests straight into viem
 * helpers without an `as` cast. This helper does the branding once so call
 * sites stay assertion-free.
 */
export const brandStakeRequest = (
  raw: z.output<typeof stakeRequestSchema>,
): StakeChallengeRequest => ({
  amount: raw.amount,
  ...(raw.beneficiary ? { beneficiary: getAddress(raw.beneficiary) } : {}),
  contract: getAddress(raw.contract),
  counterparty: getAddress(raw.counterparty),
  ...(raw.description ? { description: raw.description } : {}),
  ...(raw.externalId ? { externalId: raw.externalId } : {}),
  ...(raw.policy ? { policy: raw.policy } : {}),
  ...(raw.resource ? { resource: raw.resource } : {}),
  scope: raw.scope as Hex,
  token: getAddress(raw.token),
  methodDetails: { chainId: raw.methodDetails.chainId },
})
