import { describe, expect, it } from 'vitest'

import { stake } from './Stake.js'

describe('tempo client stake', () => {
  it('accepts valid context with feeToken', () => {
    const method = stake({})

    expect(
      method.context?.parse({
        feeToken: '0x0000000000000000000000000000000000000001',
      }),
    ).toEqual({
      feeToken: '0x0000000000000000000000000000000000000001',
    })
  })

  it('rejects unknown context options', () => {
    const method = stake({})

    expect(() => method.context?.parse({ transportPolicy: 'permit' })).toThrow()
    expect(() => method.context?.parse({ preferPermit: true })).toThrow()
  })
})
