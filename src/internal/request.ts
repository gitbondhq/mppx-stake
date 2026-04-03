import { z } from 'mppx'
import type { Address, Hex } from 'viem'

import type { StakeChallengeRequest } from '../stakeSchema.js'

/** MPP stake amounts are base-unit integer strings, not decimal display values. */
export const baseUnitAmount = () =>
  z.string().check(z.regex(/^\d+$/, 'Invalid base-unit amount'))

export type TypedStakeRequest = {
  amount: bigint
  beneficiary?: Address | undefined
  chainId: number
  contract: Address
  counterparty: Address
  token: Address
  submission?: 'push' | 'pull' | undefined
  stakeKey: Hex
}

/**
 * Normalizes the wire-format request into strongly typed values used by the
 * client and server transaction helpers.
 */
export const toTypedRequest = (
  request: StakeChallengeRequest,
): TypedStakeRequest => ({
  amount: BigInt(request.amount),
  beneficiary: request.methodDetails.beneficiary
    ? (request.methodDetails.beneficiary as Address)
    : undefined,
  chainId: request.methodDetails.chainId,
  contract: request.contract as Address,
  counterparty: request.methodDetails.counterparty as Address,
  token: request.token as Address,
  submission: request.methodDetails.submission,
  stakeKey: request.methodDetails.stakeKey as Hex,
})
