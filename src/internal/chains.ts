import type { Address, Chain, Client } from 'viem'
import { readContract } from 'viem/actions'
import { tempo, tempoModerato } from 'viem/chains'

import { erc20PermitAbi } from './abi.js'

export type TempoChain = typeof tempo | typeof tempoModerato

export const chains: Record<number, Chain> = {
  [tempo.id]: tempo,
  [tempoModerato.id]: tempoModerato,
}

export type TransportPolicy = 'permit' | 'legacy'

const permitSupportCache = new Map<string, TransportPolicy>()

export const detectTransportPolicy = async (parameters: {
  chainId: number
  client: Client
  currency: Address
  owner: Address
}): Promise<TransportPolicy> => {
  const { chainId, client, currency, owner } = parameters
  const key = `${chainId}:${currency}`
  const cached = permitSupportCache.get(key)
  if (cached) return cached

  try {
    await readContract(client, {
      abi: erc20PermitAbi,
      address: currency,
      args: [owner],
      functionName: 'nonces',
    })
    permitSupportCache.set(key, 'permit')
    return 'permit'
  } catch {
    permitSupportCache.set(key, 'legacy')
    return 'legacy'
  }
}
