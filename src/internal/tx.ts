import { TxEnvelopeTempo } from 'ox/tempo'
import type { Address, Client, Hex, TransactionReceipt } from 'viem'
import {
  decodeFunctionData,
  encodeFunctionData,
  isAddressEqual,
  parseEventLogs,
} from 'viem'
import { readContract } from 'viem/actions'

import { erc20ApproveAbi } from '../abi/erc20.js'
import { MPPEscrowAbi } from '../abi/MPPEscrow.js'
import type { StakeChallengeRequest } from '../stakeSchema.js'
import type { Account } from './account.js'

type PermitParams = {
  deadline: bigint
  r: `0x${string}`
  s: `0x${string}`
  v: number
}

/**
 * Builds the one-call permit flow used when the token supports ERC-2612.
 */
export const buildPermitCalls = (parameters: {
  account: Account
  amount: bigint
  beneficiary: Address
  chainId: number
  client: Client
  contract: Address
  counterparty: Address
  token: Address
  deadlineSeconds?: number | undefined
  permitFactory: (parameters: {
    account: Account
    amount: bigint
    chainId: number
    client: Client
    deadline: bigint
    owner: Address
    spender: Address
    token: Address
  }) => Promise<PermitParams>
  stakeKey: Hex
}) => {
  const {
    account,
    amount,
    beneficiary,
    chainId,
    client,
    contract,
    counterparty,
    token,
    stakeKey,
  } = parameters
  const deadline = BigInt(
    Math.floor(Date.now() / 1_000) + (parameters.deadlineSeconds ?? 60 * 60),
  )

  return parameters
    .permitFactory({
      account,
      amount,
      chainId,
      client,
      deadline,
      owner: account.address,
      spender: contract,
      token: token,
    })
    .then(
      permit =>
        [
          {
            data: encodeFunctionData({
              abi: MPPEscrowAbi,
              args: [
                stakeKey,
                account.address,
                counterparty,
                beneficiary,
                token,
                amount,
                permit,
              ],
              functionName: 'createEscrowWithPermit',
            }),
            to: contract,
          },
        ] as const,
    )
}

/**
 * Builds the legacy two-call flow: ERC20 approve, then escrow create.
 */
export const buildLegacyCalls = (parameters: {
  amount: bigint
  beneficiary: Address
  contract: Address
  counterparty: Address
  token: Address
  stakeKey: Hex
}) => {
  const { amount, beneficiary, contract, counterparty, token, stakeKey } =
    parameters
  return [
    {
      data: encodeFunctionData({
        abi: erc20ApproveAbi,
        args: [contract, amount],
        functionName: 'approve',
      }),
      to: token,
    },
    {
      data: encodeFunctionData({
        abi: MPPEscrowAbi,
        args: [stakeKey, counterparty, beneficiary, token, amount],
        functionName: 'createEscrow',
      }),
      to: contract,
    },
  ] as const
}

/** Transaction credentials store the serialized signed transaction in `payload.signature`. */
export const getSerializedTransaction = (payload: {
  signature: string
  type: 'transaction'
}) => payload.signature as Hex

/** Tempo batch transactions use a custom envelope prefix distinct from EIP-1559. */
export const isTempoTransaction = (serializedTransaction: string | undefined) =>
  serializedTransaction?.startsWith(TxEnvelopeTempo.serializedType) === true ||
  serializedTransaction?.startsWith(TxEnvelopeTempo.feePayerMagic) === true

/**
 * Matches decoded transaction calls against the original stake challenge.
 * This is the core guard that prevents the server from accepting a different
 * escrow than the one it asked the client to create.
 */
export const matchStakeCalls = (parameters: {
  beneficiary: Address
  calls: readonly { data?: Hex | undefined; to?: Address | undefined }[]
  challenge: StakeChallengeRequest
  payer: Address
}) => {
  const { beneficiary, calls, challenge, payer } = parameters
  const amount = BigInt(challenge.amount)
  const contract = challenge.contract as Address
  const counterparty = challenge.counterparty as Address
  const token = challenge.token as Address
  const stakeKey = challenge.stakeKey as Hex

  if (calls.length === 1) {
    const [call] = calls
    if (!call?.data || !call.to || !isAddressEqual(call.to, contract))
      throw new Error('Invalid permit transaction: wrong target contract.')

    const { args, functionName } = decodeFunctionData({
      abi: MPPEscrowAbi,
      data: call.data,
    })

    if (functionName !== 'createEscrowWithPermit')
      throw new Error(
        'Invalid permit transaction: expected createEscrowWithPermit.',
      )

    const [
      key,
      payerArg,
      counterpartyArg,
      beneficiaryArg,
      tokenArg,
      amountArg,
    ] = args as unknown as [Hex, Address, Address, Address, Address, bigint]

    assertMatch('stakeKey', key, stakeKey)
    assertAddress('payer', payerArg, payer)
    assertAddress('counterparty', counterpartyArg, counterparty)
    assertAddress('beneficiary', beneficiaryArg, beneficiary)
    assertAddress('token', tokenArg, token)
    assertMatch('amount', amountArg, amount)

    return 'permit' as const
  }

  if (calls.length === 2) {
    const [approveCall, createEscrowCall] = calls
    if (
      !approveCall?.data ||
      !approveCall.to ||
      !isAddressEqual(approveCall.to, token)
    )
      throw new Error('Invalid legacy transaction: wrong approve target.')

    if (
      !createEscrowCall?.data ||
      !createEscrowCall.to ||
      !isAddressEqual(createEscrowCall.to, contract)
    )
      throw new Error('Invalid legacy transaction: wrong escrow target.')

    const approve = decodeFunctionData({
      abi: erc20ApproveAbi,
      data: approveCall.data,
    })
    if (approve.functionName !== 'approve')
      throw new Error('Invalid legacy transaction: first call must be approve.')

    const [spender, approvedAmount] = approve.args as [Address, bigint]

    assertAddress('approve.spender', spender, contract)
    assertMatch('approve.amount', approvedAmount, amount)

    const escrow = decodeFunctionData({
      abi: MPPEscrowAbi,
      data: createEscrowCall.data,
    })
    if (escrow.functionName !== 'createEscrow')
      throw new Error(
        'Invalid legacy transaction: second call must be createEscrow.',
      )

    const [key, counterpartyArg, beneficiaryArg, tokenArg, amountArg] =
      escrow.args as [Hex, Address, Address, Address, bigint]

    assertMatch('stakeKey', key, stakeKey)
    assertAddress('counterparty', counterpartyArg, counterparty)
    assertAddress('beneficiary', beneficiaryArg, beneficiary)
    assertAddress('token', tokenArg, token)
    assertMatch('amount', amountArg, amount)

    return 'legacy' as const
  }

  throw new Error('Invalid stake transaction: unexpected call count.')
}

type EscrowVerificationParams = {
  beneficiary: Address
  counterparty: Address
  token: Address
  payer: Address
  value: bigint
}

/** Confirms the transaction receipt emitted the expected `EscrowCreated` event. */
export const assertEscrowCreatedReceipt = (
  receipt: TransactionReceipt,
  parameters: EscrowVerificationParams & {
    contract: Address
    stakeKey: Hex
  },
) => {
  if (receipt.status !== 'success')
    throw new Error(`Stake transaction reverted: ${receipt.transactionHash}`)

  const { beneficiary, contract, counterparty, token, payer, stakeKey, value } =
    parameters
  const logs = parseEventLogs({
    abi: MPPEscrowAbi,
    eventName: 'EscrowCreated',
    logs: receipt.logs,
  })
  const match = logs.find(
    log =>
      isAddressEqual(log.address, contract) &&
      log.args.key === stakeKey &&
      isAddressEqual(log.args.payer, payer) &&
      isAddressEqual(log.args.beneficiary, beneficiary) &&
      isAddressEqual(log.args.counterparty, counterparty) &&
      isAddressEqual(log.args.token, token) &&
      log.args.amount === value,
  )

  if (!match) throw new Error('No matching EscrowCreated event found.')
}

export type EscrowState = {
  beneficiary: Address
  counterparty: Address
  isActive: boolean
  payer: Address
  principal: bigint
  token: Address
}

/** Confirms the resolved on-chain escrow matches the expected payer and terms. */
export const assertEscrowState = (
  escrow: EscrowState,
  parameters: EscrowVerificationParams,
) => {
  const { beneficiary, counterparty, token, payer, value } = parameters

  if (!escrow.isActive) throw new Error('Escrow is not active.')
  assertAddress('escrow.payer', escrow.payer, payer)
  assertAddress('escrow.beneficiary', escrow.beneficiary, beneficiary)
  assertAddress('escrow.counterparty', escrow.counterparty, counterparty)
  assertAddress('escrow.token', escrow.token, token)
  assertMatch('escrow.principal', escrow.principal, value)
}

/** Verifies the canonical active-state query, then checks the full escrow record. */
export const assertEscrowOnChain = async (
  client: Client,
  contract: Address,
  stakeKey: Hex,
  parameters: EscrowVerificationParams,
) => {
  const isActive = (await readContract(client, {
    abi: MPPEscrowAbi,
    address: contract,
    args: [stakeKey, parameters.payer],
    functionName: 'isEscrowActive',
  })) as boolean

  if (!isActive) throw new Error('Escrow is not active for the expected payer.')

  const escrow = (await readContract(client, {
    abi: MPPEscrowAbi,
    address: contract,
    args: [stakeKey],
    functionName: 'getEscrow',
  })) as EscrowState

  assertEscrowState(escrow, parameters)
}

/** Converts a successful transaction receipt into the MPP receipt shape. */
export const toReceipt = (receipt: TransactionReceipt, method: string) =>
  ({
    method,
    reference: receipt.transactionHash,
    status: 'success',
    timestamp: new Date().toISOString(),
  }) as const

const assertAddress = (label: string, actual: Address, expected: Address) => {
  if (!isAddressEqual(actual, expected)) throw new Error(`Mismatched ${label}.`)
}

const assertMatch = (
  label: string,
  actual: bigint | string,
  expected: bigint | string,
) => {
  if (String(actual) !== String(expected))
    throw new Error(`Mismatched ${label}.`)
}
