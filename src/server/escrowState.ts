import type { Address, Client, Hex } from 'viem'
import { isAddressEqual } from 'viem'
import { readContract } from 'viem/actions'

import { escrowAbi } from '../abi/escrow.js'

export type EscrowState = {
  beneficiary: Address
  counterparty: Address
  depositedAt: bigint
  id: bigint
  isActive: boolean
  payer: Address
  principal: bigint
  scope: Hex
  token: Address
}

export type EscrowVerificationParams = {
  beneficiary: Address
  counterparty: Address
  scope: Hex
  token: Address
  value: bigint
}

/** Confirms the resolved on-chain escrow matches the expected beneficiary and terms. */
export const assertEscrowState = (
  escrow: EscrowState,
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

/** Verifies the canonical active-state query, then checks the full escrow record. */
export const assertEscrowOnChain = async (
  client: Client,
  contract: Address,
  parameters: EscrowVerificationParams,
) => {
  const isActive = (await readContract(client, {
    abi: escrowAbi,
    address: contract,
    args: [parameters.scope, parameters.beneficiary],
    functionName: 'isEscrowActive',
  })) as boolean

  if (!isActive)
    throw new Error('Escrow is not active for the expected beneficiary.')

  const escrow = (await readContract(client, {
    abi: escrowAbi,
    address: contract,
    args: [parameters.scope, parameters.beneficiary],
    functionName: 'getActiveEscrow',
  })) as EscrowState

  assertEscrowState(escrow, parameters)
}

const assertAddress = (label: string, actual: Address, expected: Address) => {
  if (!isAddressEqual(actual, expected)) throw new Error(`Mismatched ${label}.`)
}

const assertHex = (label: string, actual: Hex, expected: Hex) => {
  if (actual.toLowerCase() !== expected.toLowerCase())
    throw new Error(`Mismatched ${label}.`)
}
