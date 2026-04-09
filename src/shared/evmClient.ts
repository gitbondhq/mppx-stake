import type { Chain, Client, Transport } from 'viem'
import { createClient, http } from 'viem'

import { getChain } from '../chains.js'

/**
 * Creates a read-only viem client for a supported chain. The package only ever
 * reads chain state (escrow active checks, escrow tuple lookups), so there is
 * no fee-payer or signing plumbing here — consumers that need to send
 * transactions own that path.
 */
export const createEvmClient = (chainId: number): Client<Transport, Chain> => {
  const chain = getChain(chainId)
  const url = chain.rpcUrls.default.http[0]
  if (!url) throw new Error(`No default RPC URL configured for ${chain.name}.`)
  return createClient({ chain, transport: http(url) })
}
