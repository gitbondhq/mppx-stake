import { Challenge, Credential, PaymentRequest } from 'mppx'
import { Mppx } from 'mppx/server'
import type { Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createStakeMethod } from '../methods.js'
import { signScopeActiveProof } from '../shared/scopeActiveProof.js'
import { stake } from './index.js'

const beneficiaryAccount = privateKeyToAccount(
  '0x59c6995e998f97a5a0044976f3c9d4e6f7b0f3c0a4f4f6c9c8f58d15a1b2c3d4',
)
const beneficiary = beneficiaryAccount.address
const counterparty = '0x2222222222222222222222222222222222222222' as Address
const contract = '0x1111111111111111111111111111111111111111' as Address
const token = '0x20C0000000000000000000000000000000000000' as Address
const scope =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const
const alternateScope =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const
const chainId = 42431
const methodName = 'tempo'
const externalId = 'document:test:challenge'
const policy = 'slash'
const expires = '2026-01-01T00:00:00.000Z'
const realm = 'test.example.com'
const secretKey = 'test-secret'
const resource = 'documents/test'

const rawInput = {
  amount: '5000000',
  contract,
  counterparty,
  externalId,
  policy,
  resource,
  scope,
  token,
  methodDetails: { chainId },
}
const routeRequest = {
  amount: rawInput.amount,
  contract: rawInput.contract,
  counterparty: rawInput.counterparty,
  externalId: rawInput.externalId,
  policy: rawInput.policy,
  resource: rawInput.resource,
  scope: rawInput.scope,
  token: rawInput.token,
}

const stakeMethod = createStakeMethod({ name: methodName })
const challengeRequest = PaymentRequest.fromMethod(stakeMethod, rawInput)

const mocks = vi.hoisted(() => ({
  assertEscrowOnChain: vi.fn().mockResolvedValue(undefined),
  createClient: vi.fn(() => ({})),
}))

vi.mock('../shared/evmClient.js', () => ({
  createClient: mocks.createClient,
}))

vi.mock('./escrowState.js', async importOriginal => ({
  ...(await importOriginal<typeof import('./escrowState.js')>()),
  assertEscrowOnChain: mocks.assertEscrowOnChain,
}))

const makeCredential = async (parameters?: {
  challengeRequest?: typeof challengeRequest
  source?: string
}) => {
  const request = parameters?.challengeRequest ?? challengeRequest
  const signature = await signScopeActiveProof(beneficiaryAccount, {
    beneficiary,
    chainId,
    challengeId: 'test-challenge-id',
    contract,
    expires,
    scope: request.scope as `0x${string}`,
  })

  return {
    challenge: {
      expires,
      id: 'test-challenge-id',
      intent: 'stake' as const,
      method: methodName,
      realm,
      request,
    },
    payload: {
      signature,
      type: 'scope-active' as const,
    },
    source: parameters?.source ?? `did:pkh:eip155:${chainId}:${beneficiary}`,
  }
}

const makeIssuedCredential = async (parameters?: {
  challengeRequest?: typeof challengeRequest
}) => {
  const request = parameters?.challengeRequest ?? challengeRequest
  const challenge = Challenge.fromMethod(stakeMethod, {
    expires,
    realm,
    request,
    secretKey,
  })
  const signature = await signScopeActiveProof(beneficiaryAccount, {
    beneficiary,
    chainId,
    challengeId: challenge.id,
    contract,
    expires: challenge.expires,
    scope: request.scope as `0x${string}`,
  })

  return {
    challenge,
    payload: {
      signature,
      type: 'scope-active' as const,
    },
    source: `did:pkh:eip155:${chainId}:${beneficiary}`,
  }
}

describe('server stake', () => {
  it('exposes the stake method with the configured name', () => {
    const method = stake({ chainId, contract, token, name: methodName })
    expect(method.name).toBe(methodName)
    expect(method.intent).toBe('stake')
  })

  it('keeps route defaults limited to shared request fields', () => {
    const method = stake({
      chainId,
      contract,
      counterparty,
      token,
      description: 'Stake required',
      name: methodName,
    })

    expect(method.defaults).toEqual({
      contract,
      counterparty,
      token,
      description: 'Stake required',
      methodDetails: { chainId },
    })
    expect(method.defaults).not.toHaveProperty('externalId')
  })

  it('reuses echoed scope and externalId when a credential is present', async () => {
    const method = stake({ chainId, contract, token, name: methodName })
    const credential = await makeCredential()

    const request = await method.request!({
      credential,
      request: {
        ...routeRequest,
        externalId: 'document:test:fresh',
        scope: alternateScope,
      },
    })

    expect(request).toEqual({
      ...routeRequest,
      methodDetails: { chainId },
    })
  })

  describe('verify', () => {
    beforeEach(() => vi.clearAllMocks())

    it('recovers the beneficiary proof and verifies on-chain state', async () => {
      const method = stake({ chainId, contract, token, name: methodName })
      const credential = await makeCredential()

      const result = await method.verify({ credential, request: routeRequest })

      expect(result).toEqual({
        method: methodName,
        reference: `${contract}:${scope}:${beneficiary}`,
        status: 'success',
        timestamp: expect.any(String),
      })
      expect(mocks.createClient).toHaveBeenCalledWith({ chainId })
      expect(mocks.assertEscrowOnChain).toHaveBeenCalledWith(
        {},
        contract,
        expect.objectContaining({
          beneficiary,
          counterparty,
          scope,
          token,
          value: 5_000_000n,
        }),
      )
    })

    it('rejects a tampered challenge at the HMAC check', async () => {
      const method = stake({ chainId, contract, token, name: methodName })
      const mppx = Mppx.create({
        methods: [method],
        realm,
        secretKey,
      })
      const credential = await makeIssuedCredential()
      const tamperedCredential = {
        ...credential,
        challenge: {
          ...credential.challenge,
          request: PaymentRequest.fromMethod(stakeMethod, {
            ...credential.challenge.request,
            externalId: 'document:test:tampered',
          }),
        },
      }

      const stakeHandler = mppx.stake
      if (!stakeHandler) throw new Error('Stake method is not configured.')
      const result = await stakeHandler(routeRequest)(
        new Request(`https://${realm}/${resource}`, {
          headers: {
            Authorization: Credential.serialize(tamperedCredential),
          },
        }),
      )

      expect(result.status).toBe(402)
      if (result.status !== 402) throw new Error('Expected a 402 challenge.')
      expect(await result.challenge.text()).toContain(
        'challenge was not issued by this server',
      )
      expect(mocks.assertEscrowOnChain).not.toHaveBeenCalled()
    })

    it('rejects when the route request does not match the challenge', async () => {
      const method = stake({ chainId, contract, token, name: methodName })
      const mismatchedRequest = PaymentRequest.fromMethod(stakeMethod, {
        ...rawInput,
        amount: '9999999',
      })
      const credential = await makeCredential({
        challengeRequest: mismatchedRequest,
      })

      await expect(
        method.verify({ credential, request: routeRequest }),
      ).rejects.toThrow(/does not match/i)
    })

    it('rejects when the challenge resource does not match', async () => {
      const method = stake({ chainId, contract, token, name: methodName })
      const mismatchedRequest = PaymentRequest.fromMethod(stakeMethod, {
        ...rawInput,
        resource: 'documents/other',
      })
      const credential = await makeCredential({
        challengeRequest: mismatchedRequest,
      })

      await expect(
        method.verify({ credential, request: routeRequest }),
      ).rejects.toThrow(/resource/i)
    })

    it('rejects when the source DID chainId does not match', async () => {
      const method = stake({ chainId, contract, token, name: methodName })
      const credential = await makeCredential({
        source: `did:pkh:eip155:1:${beneficiary}`,
      })

      await expect(
        method.verify({ credential, request: routeRequest }),
      ).rejects.toThrow(/chainId/i)
    })

    it('rejects when the source DID address does not match the recovered beneficiary', async () => {
      const method = stake({ chainId, contract, token, name: methodName })
      const wrongAddress =
        '0x4444444444444444444444444444444444444444' as Address
      const credential = await makeCredential({
        source: `did:pkh:eip155:${chainId}:${wrongAddress}`,
      })

      await expect(
        method.verify({ credential, request: routeRequest }),
      ).rejects.toThrow(/recovered beneficiary/i)
    })
  })
})
