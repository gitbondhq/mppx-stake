import { Credential, Method } from 'mppx'
import type { Account } from 'viem'
import { isAddressEqual } from 'viem'

import { getChain } from '../chains.js'
import {
  brandStakeRequest,
  StakeAuthorizationMode,
  type StakeMethod,
} from '../method.js'
import { signScopeActiveProof } from '../shared/scopeActiveProof.js'

export type StakeClientParameters = {
  /**
   * The beneficiary's signing account. Required when the server issues a
   * {@link StakeAuthorizationMode.BENEFICIARY_BOUND} challenge; ignored for
   * {@link StakeAuthorizationMode.OWNER_AGNOSTIC} challenges.
   */
  beneficiaryAccount?: Account
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
    return Method.toClient(method, {
      async createCredential({ challenge }) {
        const request = brandStakeRequest(challenge.request)
        const chainId = request.methodDetails.chainId
        const beneficiaryAccount = parameters.beneficiaryAccount

        // Surface unsupported chains here rather than waiting for the server.
        getChain(chainId)

        if (request.mode === StakeAuthorizationMode.OWNER_AGNOSTIC)
          return Credential.serialize({
            challenge,
            payload: { type: request.mode },
          })

        if (!beneficiaryAccount)
          throw new Error(
            `beneficiaryAccount is required for ${request.mode} challenges.`,
          )

        if (
          request.beneficiary &&
          !isAddressEqual(request.beneficiary, beneficiaryAccount.address)
        )
          throw new Error(
            'Challenge beneficiary does not match the beneficiary signing account.',
          )

        const beneficiary = request.beneficiary ?? beneficiaryAccount.address

        const signature = await signScopeActiveProof(beneficiaryAccount, {
          amount: request.amount,
          beneficiary,
          chainId,
          challengeId: challenge.id,
          contract: request.contract,
          counterparty: request.counterparty,
          expires: challenge.expires,
          scope: request.scope,
          token: request.token,
        })

        return Credential.serialize({
          challenge,
          payload: {
            signature,
            type: StakeAuthorizationMode.BENEFICIARY_BOUND,
          },
          source: `did:pkh:eip155:${chainId}:${beneficiaryAccount.address}`,
        })
      },
    })
  }
}
