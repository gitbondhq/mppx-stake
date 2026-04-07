import { Challenge } from 'mppx'
import { describe, expect, it } from 'vitest'

import type { StakeChallenge } from './challenge.js'
import { parseStakeChallenge, withStakeFeePayer } from './challenge.js'
import { stake as createStakeMethod } from './Methods.js'

const methodName = 'tempo'
const stakeMethod = createStakeMethod({ name: methodName })

const request = {
  amount: '5000000',
  beneficiary: '0x3333333333333333333333333333333333333333',
  chainId: 42431,
  contract: '0x1111111111111111111111111111111111111111',
  counterparty: '0x2222222222222222222222222222222222222222',
  token: '0x20C0000000000000000000000000000000000000',
  description: 'Stake required',
  externalId: 'github:owner/repo:pr:1',
  policy: 'repo-pr-v1',
  resource: 'owner/repo#1',
  stakeKey:
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
} as const

describe('stake challenge helpers', () => {
  it('parses a stake challenge object into the shared typed request shape', () => {
    const original = Challenge.fromMethod(stakeMethod, {
      id: 'challenge-1',
      realm: 'api.example.com',
      request: {
        ...request,
        feePayer: true,
      },
    }) as StakeChallenge

    expect(
      parseStakeChallenge(original, {
        methodName,
      }),
    ).toEqual(original)
  })

  it('parses a 402 response carrying a stake challenge', () => {
    const original = Challenge.fromMethod(stakeMethod, {
      id: 'challenge-2',
      realm: 'api.example.com',
      request,
    }) as StakeChallenge
    const response = new Response(null, {
      headers: {
        'WWW-Authenticate': Challenge.serialize(original),
      },
      status: 402,
    })

    expect(
      parseStakeChallenge(response, {
        methodName,
      }),
    ).toEqual(original)
  })

  it('rewrites only the feePayer flag', () => {
    const original = Challenge.fromMethod(stakeMethod, {
      id: 'challenge-3',
      realm: 'api.example.com',
      request,
    }) as StakeChallenge
    const updated = withStakeFeePayer(original, false)

    expect(updated.request.methodDetails.feePayer).toBe(false)
    expect(updated.request.amount).toBe(original.request.amount)
    expect(updated.request.counterparty).toBe(original.request.counterparty)
    expect(updated.request.contract).toBe(original.request.contract)
    expect(updated.request.policy).toBe(original.request.policy)
    expect(updated.request.resource).toBe(original.request.resource)
    expect(updated.request.stakeKey).toBe(original.request.stakeKey)
    expect(updated.request.token).toBe(original.request.token)
    expect(updated.request.methodDetails.chainId).toBe(
      original.request.methodDetails.chainId,
    )
    expect(updated.id).toBe(original.id)
    expect(updated.method).toBe(original.method)
    expect(updated.intent).toBe(original.intent)
    expect(updated.realm).toBe(original.realm)
  })
})
