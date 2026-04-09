import { type Credential, Method, PaymentRequest } from 'mppx'
import type { Address } from 'viem'
import { isAddressEqual } from 'viem'

import {
  brandStakeRequest,
  type StakeChallengeRequest,
  type StakeCredentialPayload,
  type StakeMethod,
} from '../method.js'
import { createEvmClient } from '../shared/evmClient.js'
import { recoverScopeActiveProofSigner } from '../shared/scopeActiveProof.js'
import {
  assertSourceDidMatches,
  resolveBeneficiary,
} from '../shared/sourceDid.js'
import { type AssertEscrowActive, assertEscrowOnChain } from './escrowState.js'

export type StakeServerParameters = {
  chainId: number
  contract?: Address | undefined
  counterparty?: Address | undefined
  token?: Address | undefined
  description?: string | undefined
  /**
   * Override the on-chain active-escrow verification. Defaults to a
   * canonical `isEscrowActive(scope, beneficiary)` + `getActiveEscrow`
   * read against the bundled MPPEscrow ABI. Provide your own when your
   * contract uses a different lookup pattern.
   */
  assertEscrowActive?: AssertEscrowActive | undefined
}

/**
 * Turns the shared stake schema into a server method that issues stake
 * challenges and verifies scope-active proofs against on-chain state.
 */
export const createStakeServer = (method: StakeMethod) => {
  return (parameters: StakeServerParameters) => {
    const { chainId } = parameters
    const assertEscrowActive =
      parameters.assertEscrowActive ?? assertEscrowOnChain

    return Method.toServer(method, {
      defaults: {
        contract: parameters.contract,
        counterparty: parameters.counterparty,
        token: parameters.token,
        description: parameters.description,
        methodDetails: { chainId },
      },

      async request({ credential, request }) {
        const echoed = echoFromCredential(credential, method)
        return {
          ...request,
          ...echoed,
          methodDetails: { chainId },
        }
      },

      async verify({ credential, request }) {
        const challengeRequest = brandStakeRequest(credential.challenge.request)
        const currentRequest = brandStakeRequest(
          PaymentRequest.fromMethod(method, {
            ...request,
            methodDetails: { chainId },
          }),
        )
        assertRequestMatches(currentRequest, challengeRequest)

        const challengeChainId = challengeRequest.methodDetails.chainId
        const hintedBeneficiary =
          challengeRequest.beneficiary ??
          resolveBeneficiary(challengeChainId, credential.source)

        const payload = credential.payload as StakeCredentialPayload
        const recovered = await recoverScopeActiveProofSigner({
          amount: challengeRequest.amount,
          beneficiary: hintedBeneficiary,
          chainId: challengeChainId,
          challengeId: credential.challenge.id,
          contract: challengeRequest.contract,
          counterparty: challengeRequest.counterparty,
          expires: credential.challenge.expires,
          scope: challengeRequest.scope,
          signature: payload.signature,
          token: challengeRequest.token,
        })

        if (
          challengeRequest.beneficiary &&
          !isAddressEqual(challengeRequest.beneficiary, recovered)
        )
          throw new Error(
            'Recovered beneficiary does not match the challenged beneficiary.',
          )

        assertSourceDidMatches(challengeChainId, credential.source, recovered)

        const client = createEvmClient(challengeChainId)
        await assertEscrowActive(client, challengeRequest.contract, {
          beneficiary: recovered,
          counterparty: challengeRequest.counterparty,
          scope: challengeRequest.scope,
          token: challengeRequest.token,
          value: BigInt(challengeRequest.amount),
        })

        return {
          method: method.name,
          reference: `${challengeRequest.contract}:${challengeRequest.scope}:${recovered}`,
          status: 'success',
          timestamp: new Date().toISOString(),
        } as const
      },
    })
  }
}

/**
 * Echoes the beneficiary, externalId, and scope of a present credential into
 * the follow-up request. The point: once the client has proved a beneficiary
 * for a scope, the next request shouldn't be free to silently change them.
 */
const echoFromCredential = (
  credential: Credential.Credential | null | undefined,
  method: StakeMethod,
): Partial<
  Pick<StakeChallengeRequest, 'beneficiary' | 'externalId' | 'scope'>
> => {
  if (!credential) return {}
  if (
    credential.challenge.method !== method.name ||
    credential.challenge.intent !== method.intent
  )
    return {}

  const parsed = method.schema.request.safeParse(credential.challenge.request)
  if (!parsed.success) return {}
  const echoed = brandStakeRequest(parsed.data)

  return {
    ...(echoed.beneficiary ? { beneficiary: echoed.beneficiary } : {}),
    ...(echoed.externalId ? { externalId: echoed.externalId } : {}),
    scope: echoed.scope,
  }
}

/**
 * Verifies that the request currently being served still matches the original
 * challenge fields the client responded to. Mismatches are silent attacks
 * (server thinks it's serving one resource, client signed another), so the
 * field set here is intentionally narrow.
 */
const assertRequestMatches = (
  currentRequest: StakeChallengeRequest,
  challengeRequest: StakeChallengeRequest,
) => {
  assertOptionalAddress(
    'beneficiary',
    currentRequest.beneficiary,
    challengeRequest.beneficiary,
  )
  assertAddress('contract', currentRequest.contract, challengeRequest.contract)
  assertAddress(
    'counterparty',
    currentRequest.counterparty,
    challengeRequest.counterparty,
  )
  assertAddress('token', currentRequest.token, challengeRequest.token)

  const pairs = [
    ['amount', currentRequest.amount, challengeRequest.amount],
    ['externalId', currentRequest.externalId, challengeRequest.externalId],
    ['policy', currentRequest.policy, challengeRequest.policy],
    ['resource', currentRequest.resource, challengeRequest.resource],
    ['scope', currentRequest.scope, challengeRequest.scope],
    [
      'chainId',
      currentRequest.methodDetails.chainId,
      challengeRequest.methodDetails.chainId,
    ],
  ] as const

  for (const [label, expected, received] of pairs)
    if (String(expected ?? '') !== String(received ?? ''))
      throw new Error(`Challenge ${label} does not match this route.`)
}

const assertAddress = (label: string, expected: Address, received: Address) => {
  if (!isAddressEqual(expected, received))
    throw new Error(`Challenge ${label} does not match this route.`)
}

const assertOptionalAddress = (
  label: string,
  expected: Address | undefined,
  received: Address | undefined,
) => {
  if (!expected && !received) return
  if (!expected || !received || !isAddressEqual(expected, received))
    throw new Error(`Challenge ${label} does not match this route.`)
}
