import type { Address, Hex } from 'viem'

export type StakeChallengeRequest = {
  action?: 'createEscrow' | undefined
  amount: string
  beneficiary?: Address | undefined
  contract: Address
  counterparty: Address
  policy?: string | undefined
  resource?: string | undefined
  stakeKey: Hex
  token: Address
  description?: string | undefined
  externalId?: string | undefined
  methodDetails: {
    chainId: number
    feePayer?: boolean | undefined
  }
}

export type StakeMethodInput = {
  action?: 'createEscrow' | undefined
  amount: string
  beneficiary?: Address | undefined
  chainId: number
  contract: Address
  counterparty: Address
  token: Address
  description?: string | undefined
  externalId?: string | undefined
  policy?: string | undefined
  resource?: string | undefined
  stakeKey: Hex
  feePayer?: boolean | undefined
}

export type StakeCredentialPayload =
  | { hash: Hex; type: 'hash' }
  | { signature: Hex; type: 'transaction' }

export const toStakeMethodInput = (
  request: StakeChallengeRequest,
): StakeMethodInput => {
  return {
    ...(request.action !== undefined ? { action: request.action } : {}),
    amount: request.amount,
    ...(request.beneficiary !== undefined
      ? { beneficiary: request.beneficiary }
      : {}),
    chainId: request.methodDetails.chainId,
    contract: request.contract,
    counterparty: request.counterparty,
    token: request.token,
    ...(request.description !== undefined
      ? { description: request.description }
      : {}),
    ...(request.externalId !== undefined
      ? { externalId: request.externalId }
      : {}),
    ...(request.policy !== undefined ? { policy: request.policy } : {}),
    ...(request.resource !== undefined ? { resource: request.resource } : {}),
    stakeKey: request.stakeKey,
    ...(request.methodDetails.feePayer !== undefined
      ? { feePayer: request.methodDetails.feePayer }
      : {}),
  }
}
