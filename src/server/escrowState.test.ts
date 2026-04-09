import type { Address, Hex } from 'viem'
import { describe, expect, it } from 'vitest'

import { assertEscrowState, type EscrowRecord } from './escrowState.js'

const beneficiary = '0x3333333333333333333333333333333333333333' as Address
const counterparty = '0x2222222222222222222222222222222222222222' as Address
const payer = '0x4444444444444444444444444444444444444444' as Address
const token = '0x20C0000000000000000000000000000000000000' as Address
const scope =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex
const value = 5_000_000n

const baseEscrow: EscrowRecord = {
  id: 1n,
  scope,
  payer,
  beneficiary,
  counterparty,
  token,
  principal: value,
  depositedAt: 0n,
  isActive: true,
}

const baseParams = { beneficiary, counterparty, scope, token, value }

describe('assertEscrowState', () => {
  it('accepts an escrow matching the expected terms', () => {
    expect(() => assertEscrowState(baseEscrow, baseParams)).not.toThrow()
  })

  it('accepts an escrow whose principal exceeds the requested minimum', () => {
    expect(() =>
      assertEscrowState({ ...baseEscrow, principal: value + 1n }, baseParams),
    ).not.toThrow()
  })

  it('rejects an inactive escrow', () => {
    expect(() =>
      assertEscrowState({ ...baseEscrow, isActive: false }, baseParams),
    ).toThrow(/Escrow is not active/)
  })

  it('rejects a beneficiary mismatch', () => {
    expect(() =>
      assertEscrowState(
        {
          ...baseEscrow,
          beneficiary: '0x9999999999999999999999999999999999999999' as Address,
        },
        baseParams,
      ),
    ).toThrow(/escrow\.beneficiary/)
  })

  it('rejects a counterparty mismatch', () => {
    expect(() =>
      assertEscrowState(
        {
          ...baseEscrow,
          counterparty: '0x9999999999999999999999999999999999999999' as Address,
        },
        baseParams,
      ),
    ).toThrow(/escrow\.counterparty/)
  })

  it('rejects a token mismatch', () => {
    expect(() =>
      assertEscrowState(
        {
          ...baseEscrow,
          token: '0x9999999999999999999999999999999999999999' as Address,
        },
        baseParams,
      ),
    ).toThrow(/escrow\.token/)
  })

  it('rejects a scope mismatch', () => {
    expect(() =>
      assertEscrowState(
        {
          ...baseEscrow,
          scope:
            '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex,
        },
        baseParams,
      ),
    ).toThrow(/escrow\.scope/)
  })

  it('rejects a principal below the requested value', () => {
    expect(() =>
      assertEscrowState({ ...baseEscrow, principal: value - 1n }, baseParams),
    ).toThrow(/escrow\.principal/)
  })
})
