import type { Address, Hex } from 'viem'

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

export type StakeCredentialPayload = {
  signature: Hex
  type: 'scope-active'
}
