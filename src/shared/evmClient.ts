import type { Chain, Client, Transport } from 'viem'
import { createClient as viemCreateClient, http } from 'viem'

import { getChain } from '../chains.js'

export type EvmClient = Client<Transport, Chain>

/**
 * Creates a read-only viem client for a supported chain. The package only ever
 * reads chain state (escrow active checks, escrow tuple lookups), so there is
 * no fee-payer or signing plumbing here — consumers that need to send
 * transactions own that path.
 */
export const createClient = (parameters: { chainId: number }): EvmClient => {
  const chain = getChain(parameters.chainId)
  const url = chain.rpcUrls.default.http[0]
  if (!url) throw new Error(`No default RPC URL configured for ${chain.name}.`)
  return viemCreateClient({ chain, transport: http(url) }) as EvmClient
}
