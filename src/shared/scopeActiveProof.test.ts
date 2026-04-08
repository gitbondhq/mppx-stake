import type { Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'

import {
  recoverScopeActiveProofSigner,
  signScopeActiveProof,
} from './scopeActiveProof.js'

const account = privateKeyToAccount(
  '0x59c6995e998f97a5a0044976f3c9d4e6f7b0f3c0a4f4f6c9c8f58d15a1b2c3d4',
)

const baseParameters = {
  beneficiary: account.address,
  chainId: 42431,
  challengeId: 'challenge-1',
  contract: '0x1111111111111111111111111111111111111111',
  expires: '2026-01-01T00:00:00.000Z',
  scope:
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex,
} as const

describe('scopeActiveProof', () => {
  it('round-trips a signature back to the signing account', async () => {
    const signature = await signScopeActiveProof(account, baseParameters)
    const recovered = await recoverScopeActiveProofSigner({
      ...baseParameters,
      signature,
    })

    expect(recovered).toBe(account.address)
  })

  it('recovers a different address when any field is tampered', async () => {
    const signature = await signScopeActiveProof(account, baseParameters)
    const recovered = await recoverScopeActiveProofSigner({
      ...baseParameters,
      challengeId: 'challenge-2',
      signature,
    })

    expect(recovered).not.toBe(account.address)
  })

  it('treats a missing expires the same as the empty string', async () => {
    const withoutExpires = { ...baseParameters, expires: undefined }
    const sigA = await signScopeActiveProof(account, {
      ...withoutExpires,
      expires: '',
    })
    const sigB = await signScopeActiveProof(account, withoutExpires)

    expect(sigA).toBe(sigB)
  })
})
