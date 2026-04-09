import type { Address, Client, Hex, ReadContractReturnType } from 'viem'
import { isAddressEqual } from 'viem'
import { readContract } from 'viem/actions'

import { escrowAbi } from '../abi/escrow.js'

/**
 * The full escrow record returned by `MPPEscrow.getActiveEscrow`. Inferred
 * from the bundled ABI so it tracks the contract automatically — no
 * hand-maintained field list to drift out of sync.
 */
export type EscrowRecord = ReadContractReturnType<typeof escrowAbi, 'getActiveEscrow'>

export type EscrowVerificationParams = {
  beneficiary: Address
  counterparty: Address
  scope: Hex
  token: Address
  value: bigint
}

/** Confirms the resolved on-chain escrow matches the expected beneficiary and terms. */
export const assertEscrowState = (
  escrow: EscrowRecord,
  parameters: EscrowVerificationParams,
) => {
  if (!escrow.isActive) throw new Error('Escrow is not active.')
  assertAddress(
    'escrow.beneficiary',
    escrow.beneficiary,
    parameters.beneficiary,
  )
  assertAddress(
    'escrow.counterparty',
    escrow.counterparty,
    parameters.counterparty,
  )
  assertAddress('escrow.token', escrow.token, parameters.token)
  assertHex('escrow.scope', escrow.scope, parameters.scope)
  if (escrow.principal < parameters.value)
    throw new Error('Mismatched escrow.principal.')
}

/**
 * The signature consumers must implement when overriding the default
 * on-chain verification via `serverStake({ assertEscrowActive })`. Useful
 * when your contract uses a different active-escrow lookup pattern than
 * the canonical `(scope, beneficiary)` pair this package targets.
 */
export type AssertEscrowActive = (
  client: Client,
  contract: Address,
  parameters: EscrowVerificationParams,
) => Promise<void>

/** Verifies the canonical active-state query, then checks the full escrow record. */
export const assertEscrowOnChain: AssertEscrowActive = async (
  client,
  contract,
  parameters,
) => {
  const isActive = await readContract(client, {
    abi: escrowAbi,
    address: contract,
    args: [parameters.scope, parameters.beneficiary],
    functionName: 'isEscrowActive',
  })

  if (!isActive)
    throw new Error('Escrow is not active for the expected beneficiary.')

  const escrow = await readContract(client, {
    abi: escrowAbi,
    address: contract,
    args: [parameters.scope, parameters.beneficiary],
    functionName: 'getActiveEscrow',
  })

  assertEscrowState(escrow, parameters)
}

const assertAddress = (label: string, actual: Address, expected: Address) => {
  if (!isAddressEqual(actual, expected)) throw new Error(`Mismatched ${label}.`)
}

const assertHex = (label: string, actual: Hex, expected: Hex) => {
  if (actual.toLowerCase() !== expected.toLowerCase())
    throw new Error(`Mismatched ${label}.`)
}
