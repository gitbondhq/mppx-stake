import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'

import { Mppx } from '../../client/index.js'
import { stake, tempo } from './index.js'

const account = privateKeyToAccount(
  '0x8b3a350cf5c34c9194ca85829b4b6fd2e8f5f10f1f49ffb3874c7f5f7b6b2d44',
)

describe('tempo client exports', () => {
  it('returns upstream charge + session plus local stake', () => {
    const methods = tempo({ account })

    expect(methods).toHaveLength(3)
    expect(methods[0].intent).toBe('charge')
    expect(methods[1].intent).toBe('session')
    expect(methods[2].intent).toBe('stake')
  })

  it('exposes the standalone stake client method', () => {
    const method = stake({ account })
    expect(method.name).toBe('tempo')
    expect(method.intent).toBe('stake')
  })

  it('wires stake into Mppx.create()', () => {
    const mppx = Mppx.create({
      methods: [tempo({ account })] as const,
      polyfill: false,
    })

    expect(mppx.methods.some(method => method.intent === 'stake')).toBe(true)
  })
})
