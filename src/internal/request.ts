import { z } from 'mppx'
import type { Address, Hex } from 'viem'

import type { StakeChallengeRequest } from '../stakeSchema.js'

/** MPP stake amounts are base-unit integer strings, not decimal display values. */
export const baseUnitAmount = () =>
  z.string().check(z.regex(/^\d+$/, 'Invalid base-unit amount'))

export type TypedStakeRequest = {
  action: 'createEscrow'
  amount: bigint
  beneficiary?: Address | undefined
  chainId: number
  contract: Address
  counterparty: Address
  feePayer?: boolean | undefined
  token: Address
  stakeKey: Hex
}

/**
 * Normalizes the wire-format request into strongly typed values used by the
 * client and server transaction helpers.
 */
export const toTypedRequest = (
  request: StakeChallengeRequest,
): TypedStakeRequest => ({
  action: request.action ?? 'createEscrow',
  amount: BigInt(request.amount),
  beneficiary: request.beneficiary
    ? (request.beneficiary as Address)
    : undefined,
  chainId: request.methodDetails.chainId,
  contract: request.contract as Address,
  counterparty: request.counterparty as Address,
  feePayer: request.methodDetails.feePayer,
  token: request.token as Address,
  stakeKey: request.stakeKey as Hex,
})
