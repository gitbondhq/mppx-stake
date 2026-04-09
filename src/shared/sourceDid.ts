import type { Address } from 'viem'
import { getAddress, isAddressEqual } from 'viem'

const didPattern = /^did:pkh:eip155:(\d+):(0x[0-9a-fA-F]{40})$/

/**
 * Parses a credential source DID into the EVM beneficiary address and chain id.
 *
 * In the proof-of-existing-escrow model the credential signer is the
 * beneficiary, so the address inside the DID is the **beneficiary** — not the
 * payer that funded the escrow on chain.
 */
export const resolveDid = (value: string | undefined) => {
  if (!value) throw new Error('stake credentials must include a source DID.')

  const match = didPattern.exec(value)
  if (!match) throw new Error(`Invalid source DID: ${value}`)

  return {
    address: getAddress(match[2]!),
    chainId: Number(match[1]!),
  }
}

/** Resolves the beneficiary address from the credential source for the expected chain. */
export const resolveBeneficiary = (
  chainId: number,
  source: string | undefined,
): Address => {
  const did = resolveDid(source)
  if (did.chainId !== chainId)
    throw new Error('Source DID chainId does not match the challenge chainId.')

  return did.address
}

/**
 * Validates an optional source DID against the recovered beneficiary address.
 * No-op when the credential carries no source — verification of the
 * beneficiary itself happens via signature recovery.
 */
export const assertSourceDidMatches = (
  chainId: number,
  source: string | undefined,
  beneficiary: Address,
) => {
  if (!source) return

  const did = resolveDid(source)
  if (did.chainId !== chainId)
    throw new Error('Source DID chainId does not match the challenge chainId.')
  if (!isAddressEqual(did.address, beneficiary))
    throw new Error('Source DID does not match the recovered beneficiary.')
}
