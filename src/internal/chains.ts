import type { Address, Client } from 'viem'
import { readContract } from 'viem/actions'

import { erc20PermitAbi } from '../abi/erc20.js'

export type TransportPolicy = 'permit' | 'legacy'

const permitSupportCache = new Map<string, TransportPolicy>()

/**
 * Detects whether a token supports ERC-2612 permit so the client can choose
 * between a one-call permit flow and the legacy approve+create flow.
 */
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
