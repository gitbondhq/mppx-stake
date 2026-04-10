import { Challenge, Credential } from 'mppx'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'

import {
  createStakeMethod,
  StakeAuthorizationMode,
  type StakeCredentialPayload,
} from '../method.js'
import { recoverScopeActiveProofSigner } from '../shared/scopeActiveProof.js'
import { createStakeClient } from './stake.js'

const beneficiaryAccount = privateKeyToAccount(
  '0x59c6995e998f97a5a0044976f3c9d4e6f7b0f3c0a4f4f6c9c8f58d15a1b2c3d4',
)
const otherAccount = privateKeyToAccount(
  '0x8b3a350cf5c34c9194ca85829b4b6fd2e8f5f10f1f49ffb3874c7f5f7b6b2d44',
)
const methodName = 'tempo'
const stakeMethod = createStakeMethod({ name: methodName })

const baseRequest = {
  amount: '5000000',
  contract: '0x1111111111111111111111111111111111111111' as const,
  counterparty: '0x2222222222222222222222222222222222222222' as const,
  mode: StakeAuthorizationMode.BENEFICIARY_BOUND,
  token: '0x20C0000000000000000000000000000000000000' as const,
  scope:
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const,
  methodDetails: {
    chainId: 42431,
  },
}

const makeChallenge = (request: typeof baseRequest = baseRequest) =>
  Challenge.fromMethod(stakeMethod, {
    expires: '2026-01-01T00:00:00.000Z',
    id: 'challenge-1',
    realm: 'api.example.com',
    request,
  })

// `Challenge.fromMethod` widens `intent`/`method` to `string` in its return
// type, so the literal-typed `method.createCredential` parameter needs a
// cast at each test call site.
type CredentialChallenge = Parameters<
  ReturnType<ReturnType<typeof createStakeClient>>['createCredential']
>[0]['challenge']

describe('client stake', () => {
  it('signs a scope-beneficiary-active credential whose signature recovers to the signer', async () => {
    const method = createStakeClient(stakeMethod)({ beneficiaryAccount })
    const challenge = makeChallenge() as CredentialChallenge

    const serialized = await method.createCredential({ challenge })
    const credential =
      Credential.deserialize<StakeCredentialPayload>(serialized)

    expect(credential.payload.type).toBe(StakeAuthorizationMode.BENEFICIARY_BOUND)
    if (credential.payload.type !== StakeAuthorizationMode.BENEFICIARY_BOUND)
      throw new Error(
        'Expected a scope-beneficiary-active payload in this test.',
      )

    expect(credential.source).toBe(
      `did:pkh:eip155:${baseRequest.methodDetails.chainId}:${beneficiaryAccount.address}`,
    )
    expect(credential.payload.signature).toBeDefined()

    const recovered = await recoverScopeActiveProofSigner({
      amount: baseRequest.amount,
      beneficiary: beneficiaryAccount.address,
      chainId: baseRequest.methodDetails.chainId,
      challengeId: challenge.id,
      contract: baseRequest.contract,
      counterparty: baseRequest.counterparty,
      expires: challenge.expires,
      scope: baseRequest.scope,
      signature: credential.payload.signature,
      token: baseRequest.token,
    })

    expect(recovered).toBe(beneficiaryAccount.address)
  })

  it('throws when the challenge beneficiary does not match the signer', async () => {
    const method = createStakeClient(stakeMethod)({ beneficiaryAccount })
    const challenge = makeChallenge({
      ...baseRequest,
      // @ts-expect-error narrow type doesn't carry through readonly literal
      beneficiary: otherAccount.address,
    }) as CredentialChallenge

    await expect(method.createCredential({ challenge })).rejects.toThrow(
      /beneficiary signing account/,
    )
  })

  it('throws on an unsupported chain', async () => {
    const method = createStakeClient(stakeMethod)({ beneficiaryAccount })
    const challenge = makeChallenge({
      ...baseRequest,
      methodDetails: { chainId: 9999 },
    } as unknown as typeof baseRequest) as CredentialChallenge

    await expect(method.createCredential({ challenge })).rejects.toThrow(
      /Unsupported chainId/,
    )
  })

  it('omits the signature and source when verifyBeneficiaryStake is false', async () => {
    const method = createStakeClient(stakeMethod)({
      verifyBeneficiaryStake: false,
    })
    const challenge = makeChallenge({
      ...baseRequest,
      mode: StakeAuthorizationMode.OWNER_AGNOSTIC,
    }) as CredentialChallenge

    const serialized = await method.createCredential({ challenge })
    const credential =
      Credential.deserialize<StakeCredentialPayload>(serialized)

    expect(credential.payload).toEqual({ type: 'scope-active' })
    expect(credential.source).toBeUndefined()
  })

  it('omits the signature for scope-active challenges even with a beneficiary account', async () => {
    const method = createStakeClient(stakeMethod)({ beneficiaryAccount })
    const challenge = makeChallenge({
      ...baseRequest,
      mode: StakeAuthorizationMode.OWNER_AGNOSTIC,
    }) as CredentialChallenge

    const serialized = await method.createCredential({ challenge })
    const credential =
      Credential.deserialize<StakeCredentialPayload>(serialized)

    expect(credential.payload).toEqual({ type: 'scope-active' })
    expect(credential.source).toBeUndefined()
  })

  it('rejects verifyBeneficiaryStake false for scope-beneficiary-active challenges', async () => {
    const method = createStakeClient(stakeMethod)({
      verifyBeneficiaryStake: false,
    })
    const challenge = makeChallenge() as CredentialChallenge

    await expect(method.createCredential({ challenge })).rejects.toThrow(
      /requires beneficiary proof creation/i,
    )
  })
})
