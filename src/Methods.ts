import { Method, z } from 'mppx'

import { baseUnitAmount } from './internal/request.js'

const transactionCredentialSchema = z.object({
  signature: z.signature(),
  type: z.literal('transaction'),
})

export type StakeMethodParameters = {
  name: string
}

/**
 * Shared `name/stake` method schema used by both the client and server
 * adapters in this package.
 */
export const stake = ({ name }: StakeMethodParameters) =>
  Method.from({
    name,
    intent: 'stake',
    schema: {
      credential: {
        payload: z.union([
          z.object({
            hash: z.hash(),
            type: z.literal('hash'),
          }),
          transactionCredentialSchema,
        ]),
      },
      request: z.pipe(
        z.object({
          amount: baseUnitAmount(),
          beneficiary: z.optional(z.address()),
          chainId: z.number(),
          contract: z.address(),
          counterparty: z.address(),
          token: z.address(),
          description: z.optional(z.string()),
          externalId: z.optional(z.string()),
          submission: z.optional(z.enum(['push', 'pull'])),
          policy: z.optional(z.string()),
          resource: z.optional(z.string()),
          stakeKey: z.hash(),
        }),
        z.transform(
          ({
            amount,
            beneficiary,
            chainId,
            contract,
            counterparty,
            token,
            description,
            externalId,
            submission,
            policy,
            resource,
            stakeKey,
          }) => ({
            amount,
            contract,
            token,
            ...(description ? { description } : {}),
            ...(externalId ? { externalId } : {}),
            methodDetails: {
              action: 'createEscrow' as const,
              ...(beneficiary ? { beneficiary } : {}),
              chainId,
              counterparty,
              ...(submission ? { submission } : {}),
              ...(policy ? { policy } : {}),
              ...(resource ? { resource } : {}),
              stakeKey,
            },
          }),
        ),
      ),
    },
  })
