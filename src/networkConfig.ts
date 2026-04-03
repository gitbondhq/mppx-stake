import type { Chain } from 'viem'
import { base, mainnet, tempo, tempoModerato } from 'viem/chains'

export const networkIds = [
  'tempoModerato',
  'tempo',
  'base',
  'ethereum',
] as const

export type NetworkId = (typeof networkIds)[number]
export type NetworkFamily = 'evm'

export type NetworkCapabilities = {
  supportsBatchCalls: boolean
  supportsFeePayer: boolean
}

export type NetworkPreset = {
  capabilities: NetworkCapabilities
  chain: Chain
  family: NetworkFamily
  id: NetworkId
}

export const networkPresets: Record<NetworkId, NetworkPreset> = {
  base: {
    capabilities: {
      supportsBatchCalls: false,
      supportsFeePayer: false,
    },
    chain: base,
    family: 'evm',
    id: 'base',
  },
  ethereum: {
    capabilities: {
      supportsBatchCalls: false,
      supportsFeePayer: false,
    },
    chain: mainnet,
    family: 'evm',
    id: 'ethereum',
  },
  tempo: {
    capabilities: {
      supportsBatchCalls: true,
      supportsFeePayer: true,
    },
    chain: tempo,
    family: 'evm',
    id: 'tempo',
  },
  tempoModerato: {
    capabilities: {
      supportsBatchCalls: true,
      supportsFeePayer: true,
    },
    chain: tempoModerato,
    family: 'evm',
    id: 'tempoModerato',
  },
}

/** Returns the preset metadata for a validated network id. */
export const getNetworkPreset = (networkId: NetworkId): NetworkPreset =>
  networkPresets[networkId]

/**
 * Validates a configured network id supplied by the consuming app.
 */
export const resolveNetworkId = (value: string): NetworkId => {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Network id must not be empty.')
  if (trimmed in networkPresets) return trimmed as NetworkId

  throw new Error(
    `Unsupported network "${trimmed}". Expected one of: ${networkIds.join(', ')}.`,
  )
}

/**
 * Finds the preset for a runtime chain id so the SDK can recover the matching
 * transport and capability settings from an incoming challenge.
 */
export const getNetworkPresetByChainId = (chainId: number): NetworkPreset => {
  const preset = Object.values(networkPresets).find(
    candidate => candidate.chain.id === chainId,
  )
  if (!preset)
    throw new Error(`No network preset configured for chainId ${chainId}.`)
  return preset
}
