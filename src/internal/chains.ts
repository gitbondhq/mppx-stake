import { z } from 'mppx'
import type { Chain } from 'viem'
import { tempo, tempoModerato } from 'viem/chains'

export type TempoChain = typeof tempo | typeof tempoModerato

export const chains: Record<number, Chain> = {
  [tempo.id]: tempo,
  [tempoModerato.id]: tempoModerato,
}

export const transportPolicySchema = z.enum(['auto', 'permit', 'legacy'])

export type TransportPolicy = 'auto' | 'permit' | 'legacy'
export type ResolvedTransportPolicy = Exclude<TransportPolicy, 'auto'>

const defaultTransportPolicyByChainId: Record<number, ResolvedTransportPolicy> =
  {
    [tempo.id]: 'legacy',
    [tempoModerato.id]: 'permit',
  }

export const resolveTransportPolicy = (parameters: {
  chainId: number
  transportPolicy?: TransportPolicy | undefined
}): ResolvedTransportPolicy => {
  const { chainId, transportPolicy = 'auto' } = parameters
  if (transportPolicy !== 'auto') return transportPolicy
  return defaultTransportPolicyByChainId[chainId] ?? 'permit'
}
