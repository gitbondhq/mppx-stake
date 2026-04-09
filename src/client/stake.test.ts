import { Challenge, Credential } from 'mppx'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'

import { createStakeMethod } from '../methods.js'
import { recoverScopeActiveProofSigner } from '../shared/scopeActiveProof.js'
import type { StakeCredentialPayload } from '../stakeSchema.js'
import { createStakeClient } from './stake.js'

const account = privateKeyToAccount(
  '0x59c6995e998f97a5a0044976f3c9d4e6f7b0f3c0a4f4f6c9c8f58d15a1b2c3d4',
)
const otherAccount = privateKeyToAccount(
  '0x8b3a350cf5c34c9194ca85829b4b6fd2e8f5f10f1f49ffb3874c7f5f7b6b2d44',
)
const methodName = 'tempo'
const stakeMethod = createStakeMethod({ name: methodName })

const baseRequest = {
  amount: '5000000',
  contract: '0x1111111111111111111111111111111111111111',
  counterparty: '0x2222222222222222222222222222222222222222',
  token: '0x20C0000000000000000000000000000000000000',
  scope: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  methodDetails: {
    chainId: 42431,
  },
} as const

const makeChallenge = (request: typeof baseRequest = baseRequest) =>
  Challenge.fromMethod(stakeMethod, {
    expires: '2026-01-01T00:00:00.000Z',
    id: 'challenge-1',
    realm: 'api.example.com',
    request,
  })

describe('client stake', () => {
  it('signs a scope-active credential whose signature recovers to the signer', async () => {
    const method = createStakeClient(stakeMethod)({ account })
    const challenge = makeChallenge()

    const serialized = await method.createCredential({ challenge })
    const credential =
      Credential.deserialize<StakeCredentialPayload>(serialized)

    expect(credential.payload.type).toBe('scope-active')
    expect(credential.source).toBe(
      `did:pkh:eip155:${baseRequest.methodDetails.chainId}:${account.address}`,
    )

    const recovered = await recoverScopeActiveProofSigner({
      beneficiary: account.address,
      chainId: baseRequest.methodDetails.chainId,
      challengeId: challenge.id,
      contract: baseRequest.contract,
      expires: challenge.expires,
      scope: baseRequest.scope,
      signature: credential.payload.signature,
    })

    expect(recovered).toBe(account.address)
  })

  it('uses beneficiaryAccount for signing when provided', async () => {
    const method = createStakeClient(stakeMethod)({
      account: otherAccount,
      beneficiaryAccount: account,
    })
    const serialized = await method.createCredential({
      challenge: makeChallenge(),
    })
    const credential =
      Credential.deserialize<StakeCredentialPayload>(serialized)

    expect(credential.source).toBe(
      `did:pkh:eip155:${baseRequest.methodDetails.chainId}:${account.address}`,
    )
  })

  it('throws when the challenge beneficiary does not match the signer', async () => {
    const method = createStakeClient(stakeMethod)({ account })
    const challenge = makeChallenge({
      ...baseRequest,
      // @ts-expect-error narrow type doesn't carry through readonly literal
      beneficiary: otherAccount.address,
    })

    await expect(method.createCredential({ challenge })).rejects.toThrow(
      /beneficiary signing account/,
    )
  })

  it('throws on an unsupported chain', async () => {
    const method = createStakeClient(stakeMethod)({ account })
    const challenge = makeChallenge({
      ...baseRequest,
      methodDetails: { chainId: 9999 },
    } as unknown as typeof baseRequest)

    await expect(method.createCredential({ challenge })).rejects.toThrow(
      /Unsupported chainId/,
    )
  })
})
