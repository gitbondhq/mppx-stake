import type { Address, Hex } from 'viem'

export type StakeSubmission = 'push' | 'pull'

export type StakeChallengeRequest = {
  amount: string
  contract: Address
  token: Address
  description?: string | undefined
  externalId?: string | undefined
  methodDetails: {
    action: 'createEscrow'
    beneficiary?: Address | undefined
    chainId: number
    counterparty: Address
    policy?: string | undefined
    resource?: string | undefined
    stakeKey: Hex
    submission?: StakeSubmission | undefined
  }
}

export type StakeMethodInput = {
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
  submission?: StakeSubmission | undefined
}

export type StakeCredentialPayload =
  | { hash: Hex; type: 'hash' }
  | { signature: Hex; type: 'transaction' }

export const toStakeMethodInput = (
  request: StakeChallengeRequest,
): StakeMethodInput => {
  return {
    amount: request.amount,
    ...(request.methodDetails.beneficiary
      ? { beneficiary: request.methodDetails.beneficiary }
      : {}),
    chainId: request.methodDetails.chainId,
    contract: request.contract,
    counterparty: request.methodDetails.counterparty,
    token: request.token,
    ...(request.description ? { description: request.description } : {}),
    ...(request.externalId ? { externalId: request.externalId } : {}),
    ...(request.methodDetails.policy
      ? { policy: request.methodDetails.policy }
      : {}),
    ...(request.methodDetails.resource
      ? { resource: request.methodDetails.resource }
      : {}),
    stakeKey: request.methodDetails.stakeKey,
    ...(request.methodDetails.submission
      ? { submission: request.methodDetails.submission }
      : {}),
  }
}
