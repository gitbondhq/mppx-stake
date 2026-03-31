import { z } from 'mppx'
import type { Address, Hex } from 'viem'

export const baseUnitAmount = () =>
  z.string().check(z.regex(/^\d+$/, 'Invalid base-unit amount'))

export type TypedStakeRequest = {
  amount: bigint
  beneficiary?: Address | undefined
  chainId: number
  contract: Address
  counterparty: Address
  currency: Address
  stakeKey: Hex
}

export const toTypedRequest = (request: {
  amount: string
  contract: string
  currency: string
  methodDetails: {
    beneficiary?: string | undefined
    chainId: number
    counterparty: string
    stakeKey: string
  }
}): TypedStakeRequest => ({
  amount: BigInt(request.amount),
  beneficiary: request.methodDetails.beneficiary
    ? (request.methodDetails.beneficiary as Address)
    : undefined,
  chainId: request.methodDetails.chainId,
  contract: request.contract as Address,
  counterparty: request.methodDetails.counterparty as Address,
  currency: request.currency as Address,
  stakeKey: request.methodDetails.stakeKey as Hex,
})
