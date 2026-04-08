import type { Chain } from 'viem'
import {
  base,
  baseSepolia,
  mainnet,
  sepolia,
  tempo,
  tempoModerato,
} from 'viem/chains'

export const supportedChains: readonly Chain[] = [
  mainnet,
  sepolia,
  base,
  baseSepolia,
  tempo,
  tempoModerato,
]

const chainsById = new Map<number, Chain>(
  supportedChains.map(chain => [chain.id, chain]),
)

/** Non-throwing predicate for callers that want to branch on support. */
export const isChainSupported = (chainId: number): boolean =>
  chainsById.has(chainId)

/** Returns the viem chain definition for a supported chain id. */
export const getChain = (chainId: number): Chain => {
  const chain = chainsById.get(chainId)
  if (!chain)
    throw new Error(
      `Unsupported chainId ${chainId}. Supported: ${supportedChains
        .map(candidate => `${candidate.name} (${candidate.id})`)
        .join(', ')}.`,
    )
  return chain
}
