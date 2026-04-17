import { type Credential, Method, PaymentRequest } from 'mppx'
import type { Address } from 'viem'
import { isAddressEqual } from 'viem'

import {
  brandStakeRequest,
  StakeAuthorizationMode,
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
  /**
   * The authorization mode for stake challenges. Defaults to
   * {@link StakeAuthorizationMode.BENEFICIARY_BOUND}.
   */
  mode?: StakeAuthorizationMode
  chainId: number
  /**
   * Override the RPC endpoint used for on-chain reads. Defaults to viem's
   * built-in public RPC for the chain — set this in production to point at
   * a private/paid endpoint and avoid public-RPC rate limits.
   */
  rpcUrl?: string | undefined
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
  /**
   * Marks a challenge as consumed so the credential can't be replayed.
   * Called after HMAC + signature recovery succeed, before the on-chain
   * read. Throw to reject a replayed credential.
   *
   * Receives the challenge id and its `expires` timestamp so the store
   * can size its TTL precisely (the upstream `Expires.assert` has already
   * rejected expired credentials, so `expires` is guaranteed in the
   * future and non-null).
   *
   * Defaults to a no-op — `verify` is stateless out of the box. Production
   * deployments should plug in a TTL'd store (Redis, Postgres, KV) keyed
   * on the challenge id, with an entry lifetime of at least `expires`.
   * Use an atomic claim primitive (Redis `SET NX`, Postgres
   * `INSERT ... ON CONFLICT`, DynamoDB conditional write) so two
   * concurrent verifies of the same credential can't both succeed.
   */
  consumeChallenge?:
    | ((context: { id: string; expires: string }) => Promise<void>)
    | undefined
}

/**
 * Turns the shared stake schema into a server method that issues stake
 * challenges and verifies scope-active proofs against on-chain state.
 */
export const createStakeServer =
  (method: StakeMethod) => (parameters: StakeServerParameters) => {
    const { chainId, consumeChallenge, rpcUrl } = parameters
    const mode = parameters.mode ?? StakeAuthorizationMode.BENEFICIARY_BOUND

    if (
      mode === StakeAuthorizationMode.OWNER_AGNOSTIC &&
      !parameters.assertEscrowActive
    )
      throw new Error(
        'OWNER_AGNOSTIC mode requires a custom assertEscrowActive because the default verifier is beneficiary-bound.',
      )

    const assertEscrowActive =
      parameters.assertEscrowActive ?? assertEscrowOnChain

    return Method.toServer(method, {
      defaults: {
        contract: parameters.contract,
        counterparty: parameters.counterparty,
        token: parameters.token,
        description: parameters.description,
        mode,
        methodDetails: { chainId },
      },

      async request({ credential, request }) {
        const echoed = echoFromCredential(credential, method)
        return {
          ...request,
          ...echoed,
          mode,
          methodDetails: { chainId },
        }
      },

      async verify({ credential, request }) {
        const challengeRequest = brandStakeRequest(credential.challenge.request)
        const currentRequest = brandStakeRequest(
          PaymentRequest.fromMethod(method, {
            ...request,
            mode,
            methodDetails: { chainId },
          }),
        )
        assertRequestMatches(currentRequest, challengeRequest)

        const challengeChainId = challengeRequest.methodDetails.chainId
        const payload = credential.payload as StakeCredentialPayload
        if (payload.type !== challengeRequest.mode)
          throw new Error(
            'Stake credential payload type does not match the challenged mode.',
          )

        const beneficiary = await resolveVerifiedBeneficiary({
          challengeChainId,
          challengeRequest,
          credential,
          mode,
          payload,
        })

        // Replay protection runs after we've decided the credential is
        // genuine (HMAC + signature pass) but before the RPC read, so a
        // failed read leaves the slot consumed rather than reusable.
        if (consumeChallenge) {
          if (!credential.challenge.expires)
            throw new Error(
              'Stake credential is missing an expires timestamp; refusing to run replay protection.',
            )
          await consumeChallenge({
            id: credential.challenge.id,
            expires: credential.challenge.expires,
          })
        }

        const client = createEvmClient(challengeChainId, rpcUrl)
        await assertEscrowActive(client, challengeRequest.contract, {
          beneficiary,
          counterparty: challengeRequest.counterparty,
          scope: challengeRequest.scope,
          token: challengeRequest.token,
          value: BigInt(challengeRequest.amount),
        })

        return {
          method: method.name,
          reference: beneficiary
            ? `${challengeRequest.contract}:${challengeRequest.scope}:${beneficiary}`
            : `${challengeRequest.contract}:${challengeRequest.scope}`,
          status: 'success',
          timestamp: new Date().toISOString(),
        } as const
      },
    })
  }

const resolveVerifiedBeneficiary = async ({
  challengeChainId,
  challengeRequest,
  credential,
  mode,
  payload,
}: {
  challengeChainId: number
  challengeRequest: StakeChallengeRequest
  credential: Credential.Credential
  mode: StakeAuthorizationMode
  payload: StakeCredentialPayload
}): Promise<Address | undefined> => {
  if (mode !== StakeAuthorizationMode.BENEFICIARY_BOUND)
    return challengeRequest.beneficiary ?? undefined

  if (!('signature' in payload) || !payload.signature)
    throw new Error(
      'Stake credential is missing the scope-beneficiary-active signature.',
    )

  const hintedBeneficiary =
    challengeRequest.beneficiary ??
    resolveBeneficiary(challengeChainId, credential.source)

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
  return recovered
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
  if (currentRequest.beneficiary)
    assertAddress(
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
    ['mode', currentRequest.mode, challengeRequest.mode],
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
    if (String(expected) !== String(received))
      throw new Error(`Challenge ${label} does not match this route.`)
}

const assertAddress = (
  label: string,
  expected: Address,
  received: Address | undefined,
) => {
  if (!received || !isAddressEqual(expected, received))
    throw new Error(`Challenge ${label} does not match this route.`)
}
