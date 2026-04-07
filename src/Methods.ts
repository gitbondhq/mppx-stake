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
          description: z.optional(z.string()),
          externalId: z.optional(z.string()),
          feePayer: z.optional(z.boolean()),
          policy: z.optional(z.string()),
          resource: z.optional(z.string()),
          stakeKey: z.hash(),
          token: z.address(),
        }),
        z.transform(
          ({
            amount,
            beneficiary,
            chainId,
            contract,
            counterparty,
            description,
            externalId,
            feePayer,
            policy,
            resource,
            stakeKey,
            token,
          }) => ({
            amount,
            ...(beneficiary !== undefined ? { beneficiary } : {}),
            contract,
            counterparty,
            ...(description !== undefined ? { description } : {}),
            ...(externalId !== undefined ? { externalId } : {}),
            ...(policy !== undefined ? { policy } : {}),
            ...(resource !== undefined ? { resource } : {}),
            stakeKey,
            token,
            methodDetails: {
              chainId,
              ...(feePayer !== undefined ? { feePayer } : {}),
            },
          }),
        ),
      ),
    },
  })
