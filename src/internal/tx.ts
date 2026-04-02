import { TxEnvelopeTempo } from 'ox/tempo'
import type { Address, Client, Hex, TransactionReceipt } from 'viem'
import {
  decodeFunctionData,
  encodeFunctionData,
  isAddressEqual,
  parseEventLogs,
} from 'viem'
import { readContract } from 'viem/actions'

import { MPPEscrowAbi } from '../abi/MPPEscrow.js'
import { erc20ApproveAbi } from './abi.js'
import type { Account } from './account.js'

type PermitParams = {
  deadline: bigint
  r: `0x${string}`
  s: `0x${string}`
  v: number
}

export const buildPermitCalls = (parameters: {
  account: Account
  amount: bigint
  beneficiary: Address
  chainId: number
  client: Client
  contract: Address
  counterparty: Address
  currency: Address
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
    currency,
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
      token: currency,
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
                currency,
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

export const buildLegacyCalls = (parameters: {
  amount: bigint
  beneficiary: Address
  contract: Address
  counterparty: Address
  currency: Address
  stakeKey: Hex
}) => {
  const { amount, beneficiary, contract, counterparty, currency, stakeKey } =
    parameters
  return [
    {
      data: encodeFunctionData({
        abi: erc20ApproveAbi,
        args: [contract, amount],
        functionName: 'approve',
      }),
      to: currency,
    },
    {
      data: encodeFunctionData({
        abi: MPPEscrowAbi,
        args: [stakeKey, counterparty, beneficiary, currency, amount],
        functionName: 'createEscrow',
      }),
      to: contract,
    },
  ] as const
}

export const getSerializedTransaction = (payload: {
  signature: string
  type: 'transaction'
}) => payload.signature as Hex

export const isTempoTransaction = (serializedTransaction: string | undefined) =>
  serializedTransaction?.startsWith(TxEnvelopeTempo.serializedType) === true ||
  serializedTransaction?.startsWith(TxEnvelopeTempo.feePayerMagic) === true

type StakeRequest = {
  amount: string
  contract: string
  currency: string
  methodDetails: {
    action: 'createEscrow'
    beneficiary?: string | undefined
    chainId: number
    counterparty: string
    stakeKey: string
  }
}

export const matchStakeCalls = (parameters: {
  beneficiary: Address
  calls: readonly { data?: Hex | undefined; to?: Address | undefined }[]
  challenge: StakeRequest
  payer: Address
}) => {
  const { beneficiary, calls, challenge, payer } = parameters
  const amount = BigInt(challenge.amount)
  const contract = challenge.contract as Address
  const counterparty = challenge.methodDetails.counterparty as Address
  const currency = challenge.currency as Address
  const stakeKey = challenge.methodDetails.stakeKey as Hex

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
    assertAddress('currency', tokenArg, currency)
    assertMatch('amount', amountArg, amount)

    return 'permit' as const
  }

  if (calls.length === 2) {
    const [approveCall, createEscrowCall] = calls
    if (
      !approveCall?.data ||
      !approveCall.to ||
      !isAddressEqual(approveCall.to, currency)
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
    assertAddress('currency', tokenArg, currency)
    assertMatch('amount', amountArg, amount)

    return 'legacy' as const
  }

  throw new Error('Invalid stake transaction: unexpected call count.')
}

type EscrowVerificationParams = {
  beneficiary: Address
  counterparty: Address
  currency: Address
  payer: Address
  value: bigint
}

export const assertEscrowCreatedReceipt = (
  receipt: TransactionReceipt,
  parameters: EscrowVerificationParams & {
    contract: Address
    stakeKey: Hex
  },
) => {
  if (receipt.status !== 'success')
    throw new Error(`Stake transaction reverted: ${receipt.transactionHash}`)

  const {
    beneficiary,
    contract,
    counterparty,
    currency,
    payer,
    stakeKey,
    value,
  } = parameters
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
      isAddressEqual(log.args.token, currency) &&
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

export const assertEscrowState = (
  escrow: EscrowState,
  parameters: EscrowVerificationParams,
) => {
  const { beneficiary, counterparty, currency, payer, value } = parameters

  if (!escrow.isActive) throw new Error('Escrow is not active.')
  assertAddress('escrow.payer', escrow.payer, payer)
  assertAddress('escrow.beneficiary', escrow.beneficiary, beneficiary)
  assertAddress('escrow.counterparty', escrow.counterparty, counterparty)
  assertAddress('escrow.token', escrow.token, currency)
  assertMatch('escrow.principal', escrow.principal, value)
}

export const assertEscrowOnChain = async (
  client: Client,
  contract: Address,
  stakeKey: Hex,
  parameters: EscrowVerificationParams,
) => {
  const escrow = (await readContract(client, {
    abi: MPPEscrowAbi,
    address: contract,
    args: [stakeKey],
    functionName: 'getEscrow',
  })) as EscrowState

  assertEscrowState(escrow, parameters)
}

export const toReceipt = (receipt: TransactionReceipt) =>
  ({
    method: 'tempo',
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
