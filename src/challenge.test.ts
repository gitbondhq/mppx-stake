import { Challenge, Method } from 'mppx'
import { describe, expect, it } from 'vitest'

import type { StakeChallenge } from './challenge.js'
import { parseStakeChallenge } from './challenge.js'
import { createStakeMethod, StakeAuthorizationMode } from './method.js'

const stakeMethod = createStakeMethod()

const request = {
  amount: '5000000',
  beneficiary: '0x3333333333333333333333333333333333333333',
  contract: '0x1111111111111111111111111111111111111111',
  counterparty: '0x2222222222222222222222222222222222222222',
  token: '0x20C0000000000000000000000000000000000000',
  description: 'Stake required',
  externalId: 'github:owner/repo:pr:1',
  mode: StakeAuthorizationMode.BENEFICIARY_BOUND,
  policy: 'repo-pr-v1',
  resource: 'owner/repo#1',
  scope: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  methodDetails: {
    chainId: 42431,
  },
} as const

describe('stake challenge helpers', () => {
  it('parses a stake challenge object', () => {
    const original = Challenge.fromMethod(stakeMethod, {
      id: 'challenge-1',
      realm: 'api.example.com',
      request,
    }) as StakeChallenge

    expect(parseStakeChallenge(original)).toEqual(original)
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

    expect(parseStakeChallenge(response)).toEqual(original)
  })

  it('rejects a challenge whose method does not match', () => {
    const otherMethod = Method.from({
      name: 'other',
      intent: 'stake',
      schema: stakeMethod.schema,
    })
    const original = Challenge.fromMethod(otherMethod, {
      id: 'challenge-3',
      realm: 'api.example.com',
      request,
    }) as StakeChallenge

    expect(() => parseStakeChallenge(original)).toThrow(
      /Expected a evm\/stake challenge/,
    )
  })
})
