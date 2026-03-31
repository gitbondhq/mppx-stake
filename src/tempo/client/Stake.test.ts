import { describe, expect, it } from 'vitest'

import { stake } from './Stake.js'

describe('tempo client stake', () => {
  it('accepts explicit transportPolicy values', () => {
    const method = stake({})

    expect(method.context?.parse({ transportPolicy: 'permit' })).toEqual({
      transportPolicy: 'permit',
    })
    expect(method.context?.parse({ transportPolicy: 'legacy' })).toEqual({
      transportPolicy: 'legacy',
    })
  })

  it('rejects the removed preferPermit option', () => {
    const method = stake({})

    expect(() => method.context?.parse({ preferPermit: true })).toThrow()
  })
})
