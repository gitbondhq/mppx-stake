import { PaymentRequest } from 'mppx'
import { describe, expect, it } from 'vitest'

import * as Methods from './Methods.js'

const request = {
  amount: '5000000',
  chainId: 42431,
  contract: '0x1111111111111111111111111111111111111111',
  counterparty: '0x2222222222222222222222222222222222222222',
  currency: '0x20C0000000000000000000000000000000000000',
  description: 'Stake required',
  externalId: 'github:owner/repo:pr:1',
  policy: 'repo-pr-v1',
  resource: 'owner/repo#1',
  stakeKey:
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
} as const

describe('tempo.Methods.stake', () => {
  it('exposes the expected method identity', () => {
    expect(Methods.stake.name).toBe('tempo')
    expect(Methods.stake.intent).toBe('stake')
  })

  it('parses a valid request into the wire shape', () => {
    const parsed = PaymentRequest.fromMethod(Methods.stake, request)

    expect(parsed).toEqual({
      amount: '5000000',
      contract: request.contract,
      currency: request.currency,
      description: request.description,
      externalId: request.externalId,
      methodDetails: {
        action: 'createEscrow',
        chainId: request.chainId,
        counterparty: request.counterparty,
        policy: request.policy,
        resource: request.resource,
        stakeKey: request.stakeKey,
      },
    })
  })

  it('rejects decimal amounts', () => {
    expect(() =>
      PaymentRequest.fromMethod(Methods.stake, { ...request, amount: '5.00' }),
    ).toThrow(/base-unit amount/i)
  })

  it('rejects an invalid stake key', () => {
    expect(() =>
      PaymentRequest.fromMethod(Methods.stake, {
        ...request,
        stakeKey: '0x1234',
      }),
    ).toThrow(/hash/i)
  })

  it('accepts hash and transaction payload variants', () => {
    expect(
      Methods.stake.schema.credential.payload.parse({
        hash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        type: 'hash',
      }),
    ).toEqual({
      hash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      type: 'hash',
    })

    expect(
      Methods.stake.schema.credential.payload.parse({
        signature:
          '0x76aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        type: 'transaction',
      }),
    ).toEqual({
      signature:
        '0x76aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      type: 'transaction',
    })
  })
})
