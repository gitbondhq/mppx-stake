import { getAddress } from 'viem'

import type { StakeChallengeRequest } from '../stakeSchema.js'
import { parseDid } from './did.js'

/**
 * Resolves the payer from the credential source DID and applies the contract's
 * beneficiary fallback rule when the challenge omits an explicit beneficiary.
 */
export const resolvePayerAndBeneficiary = (
  request: StakeChallengeRequest,
  source: string | undefined,
) => {
  const did = parseDid(source)
  if (did.chainId !== request.methodDetails.chainId)
    throw new Error('Source DID chainId does not match the challenge chainId.')

  return {
    beneficiary: request.beneficiary
      ? getAddress(request.beneficiary)
      : did.address,
    payer: did.address,
  }
}
