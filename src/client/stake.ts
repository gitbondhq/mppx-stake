import { Credential, Method } from 'mppx'
import type { Account } from 'viem'
import { isAddressEqual } from 'viem'

import { getChain } from '../chains.js'
import {
  BENEFICIARY_BOUND_STAKE_MODE,
  brandStakeRequest,
  OWNER_AGNOSTIC_STAKE_MODE,
  type StakeMethod,
} from '../method.js'
import { signScopeActiveProof } from '../shared/scopeActiveProof.js'

export type StakeClientParameters =
  | {
      /** The beneficiary's signing account. Produces the scope-active EIP-712 proof. */
      beneficiaryAccount: Account
      verifyBeneficiaryStake?: true
    }
  | {
      /** Not required when `verifyBeneficiaryStake: false` skips signature creation. */
      beneficiaryAccount?: Account
      verifyBeneficiaryStake: false
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

        if (request.mode === OWNER_AGNOSTIC_STAKE_MODE)
          return Credential.serialize({
            challenge,
            payload: { type: request.mode },
          })

        if (parameters.verifyBeneficiaryStake === false)
          throw new Error(
            `Challenge mode ${request.mode} requires beneficiary proof creation.`,
          )

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
            type: BENEFICIARY_BOUND_STAKE_MODE,
          },
          source: `did:pkh:eip155:${chainId}:${beneficiaryAccount.address}`,
        })
      },
    })
  }
}
