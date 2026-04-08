import { Method, z } from 'mppx'

import { baseUnitAmount } from './shared/request.js'

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
      credential: {
        payload: z.object({
          signature: z.signature(),
          type: z.literal('scope-active'),
        }),
      },
      request: z.object({
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
      }),
    },
  })
