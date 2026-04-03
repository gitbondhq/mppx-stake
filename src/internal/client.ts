import type { Account, Address, Chain, Client, Hex, Transport } from 'viem'
import { createClient as viemCreateClient, http, numberToHex } from 'viem'
import {
  prepareTransactionRequest,
  sendCallsSync,
  sendRawTransactionSync,
  signTransaction,
} from 'viem/actions'
import { Transaction } from 'viem/tempo'
import { withFeePayer } from 'viem/tempo'

import {
  defaultNetwork,
  getNetworkPreset,
  getNetworkPresetByChainId,
} from '../networkConfig.js'

export type EvmClient = Client<Transport, Chain>

export type EIP1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

/**
 * Creates a viem client for the selected chain preset. When a fee payer URL is
 * provided and the chain supports it, the client is wrapped with that transport.
 */
export const createClient = (parameters: {
  chainId?: number | undefined
  feePayerUrl?: string | undefined
}): EvmClient => {
  const { feePayerUrl } = parameters
  const chainId =
    parameters.chainId ?? getNetworkPreset(defaultNetwork).chain.id
  const preset = getNetworkPresetByChainId(chainId)
  const url = preset.chain.rpcUrls.default.http[0]
  if (!url) throw new Error(`No default RPC URL configured for ${preset.id}.`)
  return viemCreateClient({
    chain: preset.chain,
    transport: feePayerUrl
      ? preset.capabilities.supportsFeePayer
        ? withFeePayer(http(url), http(feePayerUrl))
        : http(url)
      : http(url),
  }) as EvmClient
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
  client: EvmClient,
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
  client: EvmClient,
  params: {
    account: Account
    calls: readonly Call[]
    feeToken?: Address
    nonceKey?: string
  },
) => Promise<PreparedTransaction>

type PrepareSingleCallFn = (
  client: EvmClient,
  params: {
    account: Account
    data: Hex
    to: Address
    value: bigint
  },
) => Promise<PreparedSingleCallTransaction>

type PreparedTransaction = Record<string, unknown> & {
  gas?: bigint | undefined
}

type PreparedSingleCallTransaction = PreparedTransaction & {
  chainId?: number | undefined
  maxFeePerGas?: bigint | undefined
  maxPriorityFeePerGas?: bigint | undefined
  nonce?: number | undefined
}

type SignPreparedFn = (
  client: EvmClient,
  params: PreparedTransaction,
) => Promise<Hex>

type CosignFn = (
  client: EvmClient,
  params: Record<string, unknown>,
) => Promise<Hex>

type SubmitRawSyncFn = (
  client: EvmClient,
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

const getClientNetwork = (client: EvmClient) => {
  const chainId = client.chain?.id
  if (!chainId) throw new Error('Client is missing chain configuration.')
  return getNetworkPresetByChainId(chainId)
}

/**
 * Prepares and signs a single normal EVM transaction. This is the fallback
 * path used on chains without Tempo batch call support.
 */
const prepareAndSignSingleCall = async (
  client: EvmClient,
  account: Account,
  call: Call,
): Promise<Hex> => {
  const prepared = await prepareSingleCallAction(client, {
    account,
    to: call.to,
    data: call.data,
    value: 0n,
  })
  if (prepared.gas) prepared.gas += 5_000n
  return signPreparedAction(client, prepared)
}

const submitSequentialCalls = async (
  client: EvmClient,
  account: Account,
  calls: readonly Call[],
): Promise<Hex> => {
  let lastHash: Hex | undefined
  for (const call of calls) {
    const signed = await prepareAndSignSingleCall(client, account, call)
    const receipt = await submitRawSyncAction(client, {
      serializedTransaction: signed,
    })
    lastHash = receipt.transactionHash
  }
  if (!lastHash) throw new Error('No transaction hash returned.')
  return lastHash
}

/**
 * Submits already-built calls. Uses Tempo batch submission where supported and
 * otherwise falls back to sequential single-call transactions.
 */
export const submitCalls = async (
  client: EvmClient,
  account: Account,
  calls: readonly Call[],
  feeToken?: Address,
): Promise<Hex> => {
  const preset = getClientNetwork(client)
  if (!preset.capabilities.supportsBatchCalls) {
    if (feeToken)
      throw new Error(`${preset.id} does not support fee-token batched calls.`)
    return submitSequentialCalls(client, account, calls)
  }

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

/**
 * Produces a signed transaction payload for pull-mode credentials. On non-Tempo
 * chains this is limited to a single-call permit flow.
 */
export const prepareAndSign = async (
  client: EvmClient,
  account: Account,
  calls: readonly Call[],
  feeToken?: Address,
): Promise<Hex> => {
  const preset = getClientNetwork(client)
  if (!preset.capabilities.supportsBatchCalls) {
    if (feeToken)
      throw new Error(`${preset.id} does not support fee-token batched calls.`)
    if (calls.length !== 1)
      throw new Error(
        `${preset.id} pull submission only supports single-call stake transactions. Use a permit-enabled token or switch to push submission.`,
      )
    return prepareAndSignSingleCall(client, account, calls[0]!)
  }

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
  client: EvmClient,
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

/**
 * Push-mode helper for wallet providers that can only sign standard EIP-1559
 * transactions one call at a time.
 */
export const providerSubmitCalls = async (
  client: EvmClient,
  account: Account,
  calls: readonly Call[],
  provider: EIP1193Provider,
): Promise<Hex> => {
  let lastHash: Hex | undefined
  for (const call of calls) {
    const signed = await prepareAndProviderSign(client, account, call, provider)
    const receipt = await submitRawSyncAction(client, {
      serializedTransaction: signed,
    })
    lastHash = receipt.transactionHash
  }
  if (!lastHash) throw new Error('No transaction hash returned.')
  return lastHash
}

/**
 * Applies a Tempo fee payer signature to a serialized batch transaction before
 * the server submits it on behalf of the client.
 */
export const cosignWithFeePayer = async (
  client: EvmClient,
  serializedTransaction: Hex,
  feePayer: Account,
  feeToken?: Address,
): Promise<Hex> => {
  const preset = getClientNetwork(client)
  if (!preset.capabilities.supportsFeePayer)
    throw new Error(`${preset.id} does not support fee-payer cosigning.`)

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

/** Broadcasts a fully signed serialized transaction and returns its receipt. */
export const submitRawSync = async (
  client: EvmClient,
  serializedTransaction: Hex,
) => submitRawSyncAction(client, { serializedTransaction })
