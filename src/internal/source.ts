import { getAddress } from 'viem'

import { parseDid } from './did.js'

type StakeChallengeRequest = {
  amount: string
  contract: string
  currency: string
  methodDetails: {
    action: 'createEscrow'
    beneficiary?: string | undefined
    chainId: number
    counterparty: string
    stakeKey: string
  }
}

export const resolvePayerAndBeneficiary = (
  request: StakeChallengeRequest,
  source: string | undefined,
) => {
  const did = parseDid(source)
  if (did.chainId !== request.methodDetails.chainId)
    throw new Error('Source DID chainId does not match the challenge chainId.')

  return {
    beneficiary: request.methodDetails.beneficiary
      ? getAddress(request.methodDetails.beneficiary)
      : did.address,
    payer: did.address,
  }
}
