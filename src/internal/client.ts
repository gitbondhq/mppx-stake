import type { Account, Address, Client, Hex, Transport } from 'viem'
import { createClient as viemCreateClient, http, numberToHex } from 'viem'
import {
  prepareTransactionRequest,
  sendCallsSync,
  sendRawTransactionSync,
  signTransaction,
} from 'viem/actions'
import { Transaction } from 'viem/tempo'
import { withFeePayer } from 'viem/tempo'

import { chains } from './chains.js'

export type TempoClient = Client<Transport, (typeof chains)[number]>

export type EIP1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

export const createClient = (parameters: {
  chainId?: number | undefined
  feePayerUrl?: string | undefined
}): TempoClient => {
  const { feePayerUrl } = parameters
  const chainId = parameters.chainId ?? 42431
  const chain = chains[chainId]
  if (!chain) throw new Error(`No chain configured for chainId ${chainId}.`)
  const url = chain.rpcUrls.default.http[0]!
  return viemCreateClient({
    chain,
    transport: feePayerUrl
      ? withFeePayer(http(url), http(feePayerUrl))
      : http(url),
  }) as TempoClient
}

export type Call = { to: Address; data: Hex }

// Typed wrappers for viem actions.
//
// Viem's sendCallsSync and prepareTransactionRequest use deeply generic
// `Calls<Narrow<calls>, chain, account>` types designed for ABI-aware call
// inference. Since this package pre-encodes calldata via encodeFunctionData,
// we bypass that inference. These wrappers retype the viem functions with the
// simple `{ to, data }` call shape we actually use, keeping all type bridging
// in one place.

type SubmitCallsFn = (
  client: TempoClient,
  params: {
    account: Account
    calls: readonly Call[]
    experimental_fallback: boolean
    feeToken?: Address
  },
) => Promise<{
  receipts?: Array<{ transactionHash: Hex }> | undefined
}>

type PrepareCallsFn = (
  client: TempoClient,
  params: {
    account: Account
    calls: readonly Call[]
    feeToken?: Address
    nonceKey?: string
  },
) => Promise<{ gas?: bigint | undefined }>

type PrepareSingleCallFn = (
  client: TempoClient,
  params: {
    account: Account
    data: Hex
    to: Address
    value: bigint
  },
) => Promise<{
  chainId?: number | undefined
  gas?: bigint | undefined
  maxFeePerGas?: bigint | undefined
  maxPriorityFeePerGas?: bigint | undefined
  nonce?: number | undefined
}>

type SignPreparedFn = (
  client: TempoClient,
  params: { gas?: bigint | undefined },
) => Promise<Hex>

type CosignFn = (
  client: TempoClient,
  params: Record<string, unknown>,
) => Promise<Hex>

type SubmitRawSyncFn = (
  client: TempoClient,
  params: { serializedTransaction: Hex },
) => Promise<import('viem').TransactionReceipt>

const submitCallsAction = sendCallsSync as unknown as SubmitCallsFn
const prepareCallsAction =
  prepareTransactionRequest as unknown as PrepareCallsFn
const prepareSingleCallAction =
  prepareTransactionRequest as unknown as PrepareSingleCallFn
const signPreparedAction = signTransaction as unknown as SignPreparedFn
const cosignAction = signTransaction as unknown as CosignFn
const submitRawSyncAction = sendRawTransactionSync as unknown as SubmitRawSyncFn

export const submitCalls = async (
  client: TempoClient,
  account: Account,
  calls: readonly Call[],
  feeToken?: Address,
): Promise<Hex> => {
  const result = await submitCallsAction(client, {
    account,
    calls,
    experimental_fallback: true,
    ...(feeToken ? { feeToken } : {}),
  })
  const hash = result.receipts?.[0]?.transactionHash
  if (!hash) throw new Error('No transaction hash returned.')
  return hash
}

export const prepareAndSign = async (
  client: TempoClient,
  account: Account,
  calls: readonly Call[],
  feeToken?: Address,
): Promise<Hex> => {
  const prepared = await prepareCallsAction(client, {
    account,
    calls,
    ...(feeToken ? { feeToken } : {}),
    nonceKey: 'expiring',
  })
  if (prepared.gas) prepared.gas += 5_000n
  return signPreparedAction(client, prepared)
}

// Signs a single-call transaction via an EIP-1193 provider (e.g. Privy).
// Uses eth_signTransaction which produces a standard EIP-1559 (type 2)
// envelope, bypassing Tempo's custom 0x76 serialization that embedded
// wallets don't support.
export const prepareAndProviderSign = async (
  client: TempoClient,
  account: Account,
  call: Call,
  provider: EIP1193Provider,
): Promise<Hex> => {
  const prepared = await prepareSingleCallAction(client, {
    account,
    to: call.to,
    data: call.data,
    value: 0n,
  })
  if (prepared.gas) prepared.gas += 5_000n

  const txParams = {
    from: account.address,
    to: call.to,
    data: call.data,
    value: '0x0',
    gas: prepared.gas ? numberToHex(prepared.gas) : undefined,
    maxFeePerGas: prepared.maxFeePerGas
      ? numberToHex(prepared.maxFeePerGas)
      : undefined,
    maxPriorityFeePerGas: prepared.maxPriorityFeePerGas
      ? numberToHex(prepared.maxPriorityFeePerGas)
      : '0x0',
    chainId: prepared.chainId ? numberToHex(prepared.chainId) : undefined,
    nonce: prepared.nonce != null ? numberToHex(prepared.nonce) : undefined,
  }

  return (await provider.request({
    method: 'eth_signTransaction',
    params: [txParams],
  })) as Hex
}

export const cosignWithFeePayer = async (
  client: TempoClient,
  serializedTransaction: Hex,
  feePayer: Account,
  feeToken?: Address,
): Promise<Hex> => {
  const transaction = Transaction.deserialize(
    serializedTransaction as Transaction.TransactionSerializedTempo,
  )
  if ((transaction as { feePayerSignature?: unknown }).feePayerSignature)
    return serializedTransaction

  return cosignAction(client, {
    ...transaction,
    account: feePayer,
    feePayer,
    ...(feeToken ? { feeToken } : {}),
  })
}

export const submitRawSync = async (
  client: TempoClient,
  serializedTransaction: Hex,
) => submitRawSyncAction(client, { serializedTransaction })
