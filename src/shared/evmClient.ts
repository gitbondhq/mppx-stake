import type { Chain, Client, Transport } from 'viem'
import { createClient, http } from 'viem'

import { getChain } from '../chains.js'

/**
 * Creates a read-only viem client for a supported chain. The package only ever
 * reads chain state (escrow active checks, escrow tuple lookups), so there is
 * no fee-payer or signing plumbing here — consumers that need to send
 * transactions own that path.
 *
 * Pass `rpcUrl` to point at a private/paid endpoint instead of viem's default
 * public RPC. Useful in production where the public RPC is rate-limited or
 * unavailable.
 */
export const createEvmClient = (
  chainId: number,
  rpcUrl?: string,
): Client<Transport, Chain> => {
  const chain = getChain(chainId)
  const url = rpcUrl ?? chain.rpcUrls.default.http[0]
  if (!url) throw new Error(`No default RPC URL configured for ${chain.name}.`)
  return createClient({ chain, transport: http(url) })
}
