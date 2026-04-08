import type { Account, Address, Hex } from 'viem'
import { recoverTypedDataAddress } from 'viem'

/**
 * EIP-712 typed-data proof that an escrow with `scope` is active for
 * `beneficiary` at the time the challenge was issued. The proof is signed
 * by the beneficiary's account, never broadcast on chain — verification is
 * recover-then-read.
 *
 * Domain, primary type, and field order are byte-for-byte compatible with
 * the upstream `mppx-stake` package so credentials produced by either
 * implementation verify on either side.
 */
const DOMAIN_NAME = 'MPP Scope Active Stake'
const DOMAIN_VERSION = '1'

const scopeActiveTypes = {
  ScopeActiveStake: [
    { name: 'challengeId', type: 'string' },
    { name: 'expires', type: 'string' },
    { name: 'scope', type: 'bytes32' },
    { name: 'beneficiary', type: 'address' },
  ],
} as const

export type ScopeActiveProofParameters = {
  beneficiary: Address
  chainId: number
  challengeId: string
  contract: Address
  expires?: string | undefined
  scope: Hex
}

const getScopeActiveTypedData = (parameters: ScopeActiveProofParameters) => ({
  domain: {
    chainId: parameters.chainId,
    name: DOMAIN_NAME,
    verifyingContract: parameters.contract,
    version: DOMAIN_VERSION,
  } as const,
  message: {
    beneficiary: parameters.beneficiary,
    challengeId: parameters.challengeId,
    expires: parameters.expires ?? '',
    scope: parameters.scope,
  },
  primaryType: 'ScopeActiveStake' as const,
  types: scopeActiveTypes,
})

export const signScopeActiveProof = async (
  account: Account,
  parameters: ScopeActiveProofParameters,
): Promise<Hex> => {
  if (!account.signTypedData)
    throw new Error('beneficiary account must support signTypedData().')
  return account.signTypedData(getScopeActiveTypedData(parameters))
}

export const recoverScopeActiveProofSigner = async (
  parameters: ScopeActiveProofParameters & { signature: Hex },
): Promise<Address> =>
  recoverTypedDataAddress({
    ...getScopeActiveTypedData(parameters),
    signature: parameters.signature,
  })
