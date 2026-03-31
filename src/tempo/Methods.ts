import { Method, z } from 'mppx'

import { baseUnitAmount } from '../internal/request.js'

const transactionCredentialSchema = z.object({
  signature: z.signature(),
  type: z.literal('transaction'),
})

export const stake = Method.from({
  name: 'tempo',
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
        currency: z.address(),
        description: z.optional(z.string()),
        externalId: z.optional(z.string()),
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
          currency,
          description,
          externalId,
          policy,
          resource,
          stakeKey,
        }) => ({
          amount,
          contract,
          currency,
          ...(description ? { description } : {}),
          ...(externalId ? { externalId } : {}),
          methodDetails: {
            action: 'createEscrow' as const,
            ...(beneficiary ? { beneficiary } : {}),
            chainId,
            counterparty,
            ...(policy ? { policy } : {}),
            ...(resource ? { resource } : {}),
            stakeKey,
          },
        }),
      ),
    ),
  },
})
