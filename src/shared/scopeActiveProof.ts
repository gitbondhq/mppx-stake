import type { Account, Address, Hex } from 'viem'
import { recoverTypedDataAddress } from 'viem'

/**
 * EIP-712 typed-data proof that an escrow with `scope` is active for
 * `beneficiary` at the time the challenge was issued. The proof is signed
 * by the beneficiary's account, never broadcast on chain — verification is
 * recover-then-read.
 *
 * The message binds the full economic terms (amount, counterparty, token)
 * along with the scope and beneficiary so a captured credential cannot be
 * reused against a different stake configuration on the same scope.
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
    { name: 'counterparty', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
} as const

export type ScopeActiveProofParameters = {
  amount: string
  beneficiary: Address
  chainId: number
  challengeId: string
  contract: Address
  counterparty: Address
  expires?: string | undefined
  scope: Hex
  token: Address
}

const getScopeActiveTypedData = (parameters: ScopeActiveProofParameters) => ({
  domain: {
    chainId: parameters.chainId,
    name: DOMAIN_NAME,
    verifyingContract: parameters.contract,
    version: DOMAIN_VERSION,
  } as const,
  message: {
    amount: BigInt(parameters.amount),
    beneficiary: parameters.beneficiary,
    challengeId: parameters.challengeId,
    counterparty: parameters.counterparty,
    expires: parameters.expires ?? '',
    scope: parameters.scope,
    token: parameters.token,
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
