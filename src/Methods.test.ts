import { PaymentRequest } from 'mppx'
import { describe, expect, it } from 'vitest'

import * as Methods from './Methods.js'

const request = {
  amount: '5000000',
  contract: '0x1111111111111111111111111111111111111111',
  counterparty: '0x2222222222222222222222222222222222222222',
  token: '0x20C0000000000000000000000000000000000000',
  description: 'Stake required',
  externalId: 'github:owner/repo:pr:1',
  policy: 'repo-pr-v1',
  resource: 'owner/repo#1',
  scope: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  methodDetails: {
    chainId: 42431,
  },
} as const

const stakeMethod = Methods.createStakeMethod({ name: 'tempo' })

describe('stake method schema', () => {
  it('parses a valid request', () => {
    const parsed = PaymentRequest.fromMethod(stakeMethod, request)

    expect(parsed).toEqual(request)
  })

  it('rejects decimal amounts', () => {
    expect(() =>
      PaymentRequest.fromMethod(stakeMethod, { ...request, amount: '5.00' }),
    ).toThrow(/base-unit amount/i)
  })

  it('rejects an invalid scope', () => {
    expect(() =>
      PaymentRequest.fromMethod(stakeMethod, {
        ...request,
        scope: '0x1234',
      }),
    ).toThrow(/hash/i)
  })

  it('accepts a scope-active credential payload', () => {
    expect(
      stakeMethod.schema.credential.payload.parse({
        signature:
          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc1b',
        type: 'scope-active',
      }),
    ).toEqual({
      signature:
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc1b',
      type: 'scope-active',
    })
  })

  it('rejects unknown credential payload variants', () => {
    expect(() =>
      stakeMethod.schema.credential.payload.parse({
        hash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        type: 'hash',
      }),
    ).toThrow()
  })
})
