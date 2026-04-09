import { Credential, Method } from 'mppx'
import type { Account } from 'viem'
import { isAddressEqual } from 'viem'

import { getChain } from '../chains.js'
import type { StakeChallengeRequest } from '../methods.js'
import { signScopeActiveProof } from '../shared/scopeActiveProof.js'

type StakeMethod = Parameters<typeof Method.toClient>[0]

export type StakeClientParameters = {
  account: Account
  beneficiaryAccount?: Account | undefined
}

/**
 * Turns the shared stake schema into a client method that signs a typed-data
 * scope-active proof for an existing on-chain escrow.
 *
 * The credential round-trip never touches chain state — the consumer is
 * responsible for having created the escrow before the credential is signed.
 */
export const createStakeClient = (method: StakeMethod) => {
  return (parameters: StakeClientParameters) => {
    const beneficiaryAccount =
      parameters.beneficiaryAccount ?? parameters.account

    return Method.toClient(method, {
      async createCredential({ challenge }) {
        const request = challenge.request as StakeChallengeRequest
        const chainId = request.methodDetails.chainId

        // Surface unsupported chains here rather than waiting for the server.
        getChain(chainId)

        if (
          request.beneficiary &&
          !isAddressEqual(request.beneficiary, beneficiaryAccount.address)
        )
          throw new Error(
            'Challenge beneficiary does not match the beneficiary signing account.',
          )

        const beneficiary = request.beneficiary ?? beneficiaryAccount.address

        const signature = await signScopeActiveProof(beneficiaryAccount, {
          beneficiary,
          chainId,
          challengeId: challenge.id,
          contract: request.contract,
          expires: challenge.expires,
          scope: request.scope,
        })

        return Credential.serialize({
          challenge,
          payload: { signature, type: 'scope-active' },
          source: `did:pkh:eip155:${chainId}:${beneficiaryAccount.address}`,
        })
      },
    })
  }
}
