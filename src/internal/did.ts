import { getAddress } from 'viem'

const didPattern = /^did:pkh:eip155:(\d+):(0x[0-9a-fA-F]{40})$/

/** Parses the credential source DID into the EVM payer address and chain id. */
export const parseDid = (value: string | undefined) => {
  if (!value) throw new Error('stake credentials must include a source DID.')

  const match = didPattern.exec(value)
  if (!match) throw new Error(`Invalid source DID: ${value}`)

  return {
    address: getAddress(match[2]!),
    chainId: Number(match[1]!),
  }
}
