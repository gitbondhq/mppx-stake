import { Challenge, Credential, PaymentRequest } from 'mppx'
import { Mppx, tempo as upstreamTempo } from 'mppx/server'
import type { Address, Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createStakeMethod,
  StakeAuthorizationMode,
  type StakeCredentialPayload,
} from '../method.js'
import { signScopeActiveProof } from '../shared/scopeActiveProof.js'
import { serverStake } from './index.js'

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
  mode: StakeAuthorizationMode.BENEFICIARY_BOUND,
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
  mode: rawInput.mode,
  policy: rawInput.policy,
  resource: rawInput.resource,
  scope: rawInput.scope,
  token: rawInput.token,
  methodDetails: { chainId },
}
const routeChallengeRequest = {
  ...routeRequest,
}

const stakeMethod = createStakeMethod({ name: methodName })
const challengeRequest = PaymentRequest.fromMethod(stakeMethod, rawInput)
const scopeActiveChallengeRequest = PaymentRequest.fromMethod(stakeMethod, {
  ...rawInput,
  mode: StakeAuthorizationMode.OWNER_AGNOSTIC,
})

const mocks = vi.hoisted(() => ({
  assertEscrowOnChain: vi.fn().mockResolvedValue(undefined),
  createEvmClient: vi.fn(() => ({})),
}))

vi.mock('../shared/evmClient.js', () => ({
  createEvmClient: mocks.createEvmClient,
}))

vi.mock('./escrowState.js', async importOriginal => ({
  ...(await importOriginal<typeof import('./escrowState.js')>()),
  assertEscrowOnChain: mocks.assertEscrowOnChain,
}))

type ProofOverrides = {
  amount?: string
  counterparty?: `0x${string}`
  scope?: `0x${string}`
  token?: `0x${string}`
}

const createCredentialPayload = (parameters: {
  mode: typeof challengeRequest.mode
  signature?: Hex
}): StakeCredentialPayload => {
  if (parameters.mode === StakeAuthorizationMode.BENEFICIARY_BOUND) {
    if (!parameters.signature)
      throw new Error(
        'Test setup error: scope-beneficiary-active payload requires a signature.',
      )

    return {
      signature: parameters.signature,
      type: StakeAuthorizationMode.BENEFICIARY_BOUND,
    }
  }

  return { type: StakeAuthorizationMode.OWNER_AGNOSTIC }
}

const makeCredential = async (parameters?: {
  challengeRequest?: typeof challengeRequest
  includeSignature?: boolean
  proofOverrides?: ProofOverrides
  source?: string
}) => {
  const request = parameters?.challengeRequest ?? challengeRequest
  const proof = parameters?.proofOverrides
  const signature =
    parameters?.includeSignature === false
      ? undefined
      : await signScopeActiveProof(beneficiaryAccount, {
          amount: proof?.amount ?? request.amount,
          beneficiary,
          chainId,
          challengeId: 'test-challenge-id',
          contract,
          counterparty:
            proof?.counterparty ?? (request.counterparty as `0x${string}`),
          expires,
          scope: proof?.scope ?? (request.scope as `0x${string}`),
          token: proof?.token ?? (request.token as `0x${string}`),
        })

  // Discriminate "explicitly passed undefined" from "not passed at all" so the
  // requires-source-DID test can produce a credential with no source.
  const source =
    parameters && 'source' in parameters
      ? parameters.source
      : `did:pkh:eip155:${chainId}:${beneficiary}`

  return {
    challenge: {
      expires,
      id: 'test-challenge-id',
      intent: 'stake' as const,
      method: methodName,
      realm,
      request,
    },
    payload: createCredentialPayload({
      mode: request.mode,
      signature,
    }),
    source,
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
    amount: request.amount,
    beneficiary,
    chainId,
    challengeId: challenge.id,
    contract,
    counterparty: request.counterparty as `0x${string}`,
    expires: challenge.expires,
    scope: request.scope as `0x${string}`,
    token: request.token as `0x${string}`,
  })

  return {
    challenge,
    payload: createCredentialPayload({
      mode: request.mode,
      signature,
    }),
    source: `did:pkh:eip155:${chainId}:${beneficiary}`,
  }
}

describe('server stake', () => {
  it('exposes the stake method with the configured name', () => {
    const method = serverStake({ chainId, contract, token, name: methodName })
    expect(method.name).toBe(methodName)
    expect(method.intent).toBe('stake')
  })

  it('composes with an existing tempo method set', () => {
    const methods = [
      ...upstreamTempo({ account: beneficiaryAccount }),
      serverStake({ chainId, contract, token, name: methodName }),
    ] as const

    const stakeMethods = methods.filter(m => m.intent === 'stake')
    expect(stakeMethods).toHaveLength(1)
    expect(stakeMethods[0]?.name).toBe(methodName)
    expect(methods.length).toBeGreaterThan(1)
  })

  it('wires stake into Mppx.create()', () => {
    const mppx = Mppx.create({
      methods: [
        serverStake({ chainId, contract, token, name: methodName }),
      ] as const,
      secretKey,
    })

    expect(typeof mppx.stake).toBe('function')
    expect(typeof mppx[`${methodName}/stake`]).toBe('function')
  })

  it('keeps route defaults limited to shared request fields', () => {
    const method = serverStake({
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
      mode: StakeAuthorizationMode.BENEFICIARY_BOUND,
      methodDetails: { chainId },
    })
    expect(method.defaults).not.toHaveProperty('externalId')
  })

  it('reuses echoed scope and externalId when a credential is present', async () => {
    const method = serverStake({ chainId, contract, token, name: methodName })
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
      ...routeChallengeRequest,
    })
  })

  describe('verify', () => {
    beforeEach(() => vi.clearAllMocks())

    it('recovers the beneficiary proof and verifies on-chain state', async () => {
      const method = serverStake({ chainId, contract, token, name: methodName })
      const credential = await makeCredential()

      const result = await method.verify({ credential, request: routeRequest })

      expect(result).toEqual({
        method: methodName,
        reference: `${contract}:${scope}:${beneficiary}`,
        status: 'success',
        timestamp: expect.any(String),
      })
      expect(mocks.createEvmClient).toHaveBeenCalledWith(chainId, undefined)
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

    it('uses a custom assertEscrowActive override when provided', async () => {
      const customAssert = vi.fn().mockResolvedValue(undefined)
      const method = serverStake({
        assertEscrowActive: customAssert,
        chainId,
        contract,
        token,
        name: methodName,
      })
      const credential = await makeCredential()

      await method.verify({ credential, request: routeRequest })

      expect(customAssert).toHaveBeenCalledWith(
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
      expect(mocks.assertEscrowOnChain).not.toHaveBeenCalled()
    })

    it('rejects a replayed credential via consumeChallenge', async () => {
      const consumed = new Set<string>()
      const consumeChallenge = vi.fn(async (id: string) => {
        if (consumed.has(id)) throw new Error('Challenge already consumed.')
        consumed.add(id)
      })
      const method = serverStake({
        chainId,
        contract,
        token,
        name: methodName,
        consumeChallenge,
      })
      const credential = await makeCredential()

      await method.verify({ credential, request: routeRequest })
      await expect(
        method.verify({ credential, request: routeRequest }),
      ).rejects.toThrow(/already consumed/)

      expect(consumeChallenge).toHaveBeenCalledTimes(2)
      expect(mocks.assertEscrowOnChain).toHaveBeenCalledTimes(1)
    })

    it('does not consume the challenge when HMAC binding fails', async () => {
      const consumeChallenge = vi.fn().mockResolvedValue(undefined)
      const method = serverStake({
        chainId,
        contract,
        token,
        name: methodName,
        consumeChallenge,
      })
      const mppx = Mppx.create({ methods: [method], realm, secretKey })
      const issuedCredential = await makeIssuedCredential()
      const tamperedCredential = {
        ...issuedCredential,
        challenge: {
          ...issuedCredential.challenge,
          request: PaymentRequest.fromMethod(stakeMethod, {
            ...issuedCredential.challenge.request,
            externalId: 'document:test:tampered-replay',
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
      expect(consumeChallenge).not.toHaveBeenCalled()
    })

    it('passes a custom rpcUrl through to the evm client factory', async () => {
      const rpcUrl = 'https://private.rpc.example.com'
      const method = serverStake({
        chainId,
        contract,
        token,
        name: methodName,
        rpcUrl,
      })
      const credential = await makeCredential()

      await method.verify({ credential, request: routeRequest })

      expect(mocks.createEvmClient).toHaveBeenCalledWith(chainId, rpcUrl)
    })

    it('rejects a tampered challenge at the HMAC check', async () => {
      const method = serverStake({ chainId, contract, token, name: methodName })
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

    it('rejects a challenge tampered before signing at the HMAC check', async () => {
      // Adversary tampers the request *and* re-signs over the tampered values,
      // so the credential is internally consistent. The HMAC binding still
      // catches it because the embedded challenge.id was issued for the
      // original request, not the tampered one.
      const method = serverStake({ chainId, contract, token, name: methodName })
      const mppx = Mppx.create({
        methods: [method],
        realm,
        secretKey,
      })
      const issuedCredential = await makeIssuedCredential()
      const tamperedRequest = PaymentRequest.fromMethod(stakeMethod, {
        ...issuedCredential.challenge.request,
        externalId: 'document:test:tampered-before-sign',
      }) as typeof challengeRequest
      const signature = await signScopeActiveProof(beneficiaryAccount, {
        amount: tamperedRequest.amount,
        beneficiary,
        chainId,
        challengeId: issuedCredential.challenge.id,
        contract: tamperedRequest.contract as `0x${string}`,
        counterparty: tamperedRequest.counterparty as `0x${string}`,
        expires: issuedCredential.challenge.expires,
        scope: tamperedRequest.scope as `0x${string}`,
        token: tamperedRequest.token as `0x${string}`,
      })
      const credential = {
        ...issuedCredential,
        challenge: {
          ...issuedCredential.challenge,
          request: tamperedRequest,
        },
        payload: createCredentialPayload({
          mode: tamperedRequest.mode,
          signature,
        }),
      }

      const stakeHandler = mppx.stake
      if (!stakeHandler) throw new Error('Stake method is not configured.')
      const result = await stakeHandler(routeRequest)(
        new Request(`https://${realm}/${resource}`, {
          headers: { Authorization: Credential.serialize(credential) },
        }),
      )

      expect(result.status).toBe(402)
      if (result.status !== 402) throw new Error('Expected a 402 challenge.')
      expect(await result.challenge.text()).toContain(
        'challenge was not issued by this server',
      )
      expect(mocks.assertEscrowOnChain).not.toHaveBeenCalled()
    })

    it('rejects when the signature was created for different stake terms', async () => {
      // Credential is signed over a different amount than the embedded
      // challenge request carries. After P0 #2 the amount is part of the
      // typed-data hash, so signature recovery yields a different address
      // than the expected beneficiary, and verify rejects it.
      const method = serverStake({ chainId, contract, token, name: methodName })
      const credential = await makeCredential({
        proofOverrides: { amount: '9999999' },
      })

      await expect(
        method.verify({ credential, request: routeRequest }),
      ).rejects.toThrow(/recovered beneficiary/i)
    })

    it('rejects when the route request does not match the challenge', async () => {
      const method = serverStake({ chainId, contract, token, name: methodName })
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

    it('rejects when the payload type does not match the challenged mode', async () => {
      const method = serverStake({ chainId, contract, token, name: methodName })
      const credential = await makeCredential()

      await expect(
        method.verify({
          credential: {
            ...credential,
            payload: { type: StakeAuthorizationMode.OWNER_AGNOSTIC },
          },
          request: routeRequest,
        }),
      ).rejects.toThrow(/payload type does not match the challenged mode/i)
    })

    it('allows an echoed beneficiary when the current route does not pin one', async () => {
      const method = serverStake({ chainId, contract, token, name: methodName })
      const requestWithBeneficiary = PaymentRequest.fromMethod(stakeMethod, {
        ...rawInput,
        beneficiary,
      })
      const credential = await makeCredential({
        challengeRequest: requestWithBeneficiary,
      })

      await expect(
        method.verify({ credential, request: routeRequest }),
      ).resolves.toEqual(
        expect.objectContaining({
          method: methodName,
          reference: `${contract}:${scope}:${beneficiary}`,
          status: 'success',
        }),
      )
    })

    it('rejects when the challenge resource does not match', async () => {
      const method = serverStake({ chainId, contract, token, name: methodName })
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

    it('requires a source DID when the challenge omits beneficiary', async () => {
      const method = serverStake({ chainId, contract, token, name: methodName })
      const credential = await makeCredential({ source: undefined })

      await expect(
        method.verify({ credential, request: routeRequest }),
      ).rejects.toThrow(/when the challenge omits beneficiary/i)
    })

    it('rejects when the source DID chainId does not match', async () => {
      const method = serverStake({ chainId, contract, token, name: methodName })
      const credential = await makeCredential({
        source: `did:pkh:eip155:1:${beneficiary}`,
      })

      await expect(
        method.verify({ credential, request: routeRequest }),
      ).rejects.toThrow(/chainId/i)
    })

    it('rejects when the source DID address does not match the recovered beneficiary', async () => {
      const method = serverStake({ chainId, contract, token, name: methodName })
      const wrongAddress =
        '0x4444444444444444444444444444444444444444' as Address
      const credential = await makeCredential({
        source: `did:pkh:eip155:${chainId}:${wrongAddress}`,
      })

      await expect(
        method.verify({ credential, request: routeRequest }),
      ).rejects.toThrow(/recovered beneficiary/i)
    })

    it('rejects owner-agnostic mode without a custom escrow verifier', () => {
      expect(() =>
        serverStake({
          chainId,
          contract,
          token,
          name: methodName,
          mode: StakeAuthorizationMode.OWNER_AGNOSTIC,
        }),
      ).toThrow(/custom assertEscrowActive/i)
    })

    it('sets owner-agnostic mode in defaults', () => {
      const method = serverStake({
        assertEscrowActive: vi.fn().mockResolvedValue(undefined),
        chainId,
        contract,
        token,
        name: methodName,
        mode: StakeAuthorizationMode.OWNER_AGNOSTIC,
      })

      expect(method.defaults).toEqual(
        expect.objectContaining({
          mode: StakeAuthorizationMode.OWNER_AGNOSTIC,
        }),
      )
    })

    it('lets custom escrow verification ignore beneficiary in owner-agnostic mode', async () => {
      const customAssert = vi.fn().mockResolvedValue(undefined)
      const method = serverStake({
        assertEscrowActive: customAssert,
        chainId,
        contract,
        token,
        name: methodName,
        mode: StakeAuthorizationMode.OWNER_AGNOSTIC,
      })
      const credential = await makeCredential({
        challengeRequest: scopeActiveChallengeRequest,
        includeSignature: false,
        source: undefined,
      })

      const result = await method.verify({ credential, request: routeRequest })

      expect(result).toEqual({
        method: methodName,
        reference: `${contract}:${scope}`,
        status: 'success',
        timestamp: expect.any(String),
      })
      expect(customAssert).toHaveBeenCalledWith(
        {},
        contract,
        expect.objectContaining({
          beneficiary: undefined,
          counterparty,
          scope,
          token,
          value: 5_000_000n,
        }),
      )
    })

    it('does not resolve beneficiary from source in owner-agnostic mode', async () => {
      const customAssert = vi.fn().mockResolvedValue(undefined)
      const method = serverStake({
        assertEscrowActive: customAssert,
        chainId,
        contract,
        token,
        name: methodName,
        mode: StakeAuthorizationMode.OWNER_AGNOSTIC,
      })
      const spoofedBeneficiary =
        '0x4444444444444444444444444444444444444444' as Address
      const credential = await makeCredential({
        challengeRequest: scopeActiveChallengeRequest,
        includeSignature: false,
        source: `did:pkh:eip155:${chainId}:${spoofedBeneficiary}`,
      })

      await method.verify({ credential, request: routeRequest })

      expect(customAssert).toHaveBeenCalledWith(
        {},
        contract,
        expect.objectContaining({
          beneficiary: undefined,
        }),
      )
    })
  })
})
