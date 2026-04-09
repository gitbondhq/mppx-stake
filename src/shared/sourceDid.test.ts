import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  assertSourceDidMatches,
  resolveBeneficiary,
  resolveDid,
} from './sourceDid.js'

const beneficiary = '0x3333333333333333333333333333333333333333' as Address
const chainId = 42431
const source = `did:pkh:eip155:${chainId}:${beneficiary}` as const

describe('resolveDid', () => {
  it('parses a well-formed DID', () => {
    expect(resolveDid(source)).toEqual({ address: beneficiary, chainId })
  })

  it('throws on a missing source', () => {
    expect(() => resolveDid(undefined)).toThrow(/must include a source DID/)
  })

  it('throws on an unrecognised DID format', () => {
    expect(() => resolveDid('did:web:example.com')).toThrow(
      /Invalid source DID/,
    )
  })
})

describe('resolveBeneficiary', () => {
  it('returns the address when chainId matches', () => {
    expect(resolveBeneficiary(chainId, source)).toBe(beneficiary)
  })

  it('throws when chainId does not match', () => {
    expect(() => resolveBeneficiary(1, source)).toThrow(/chainId/)
  })
})

describe('assertSourceDidMatches', () => {
  it('is a no-op when source is missing', () => {
    expect(() =>
      assertSourceDidMatches(chainId, undefined, beneficiary),
    ).not.toThrow()
  })

  it('passes when DID matches the beneficiary', () => {
    expect(() =>
      assertSourceDidMatches(chainId, source, beneficiary),
    ).not.toThrow()
  })

  it('throws when DID chainId does not match', () => {
    expect(() => assertSourceDidMatches(1, source, beneficiary)).toThrow(
      /chainId/,
    )
  })

  it('throws when DID address does not match the recovered beneficiary', () => {
    const wrong = '0x4444444444444444444444444444444444444444' as Address
    expect(() => assertSourceDidMatches(chainId, source, wrong)).toThrow(
      /does not match the recovered beneficiary/,
    )
  })
})
