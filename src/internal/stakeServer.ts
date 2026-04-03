import { Method, PaymentRequest } from 'mppx'
import type { Account as ViemAccount, Address, Hex } from 'viem'
import { isAddressEqual, parseTransaction } from 'viem'
import { getTransactionReceipt } from 'viem/actions'
import { Transaction } from 'viem/tempo'

import { getNetworkPresetByChainId } from '../networkConfig.js'
import { cosignWithFeePayer, createClient, submitRawSync } from './client.js'
import { toTypedRequest } from './request.js'
import { resolvePayerAndBeneficiary } from './source.js'
import {
  assertEscrowCreatedReceipt,
  assertEscrowOnChain,
  getSerializedTransaction,
  isTempoTransaction,
  matchStakeCalls,
  toReceipt,
} from './tx.js'

type StakeMethod = Parameters<typeof Method.toServer>[0] & { name: string }

type StakeChallengeRequest = {
  amount: string
  contract: string
  token: string
  methodDetails: {
    action: 'createEscrow'
    beneficiary?: string | undefined
    chainId: number
    counterparty: string
    policy?: string | undefined
    resource?: string | undefined
    submission?: 'push' | 'pull' | undefined
    stakeKey: `0x${string}`
  }
}

type StakeCredentialPayload =
  | { hash: Hex; type: 'hash' }
  | { signature: string; type: 'transaction' }

export type StakeDefaults = {
  beneficiary?: Address | undefined
  chainId?: number | undefined
  contract?: Address | undefined
  counterparty?: Address | undefined
  token?: Address | undefined
  description?: string | undefined
}

export type StakeParameters = StakeDefaults & {
  feePayer?: ViemAccount | string | undefined
}

const getFeePayerUrl = (parameters: StakeParameters) =>
  typeof parameters.feePayer === 'string' ? parameters.feePayer : undefined

const getFeePayer = (parameters: StakeParameters): ViemAccount | undefined =>
  typeof parameters.feePayer === 'object' ? parameters.feePayer : undefined

/**
 * Turns the shared stake schema into a server method that can issue stake
 * challenges and verify either submitted tx hashes or signed tx payloads.
 */
export const createServerStake = (method: StakeMethod) => {
  return <const parameters extends StakeParameters>(
    parameters = {} as parameters,
  ) => {
    const feePayerUrl = getFeePayerUrl(parameters)
    const feePayer = getFeePayer(parameters)

    return Method.toServer(method, {
      defaults: {
        beneficiary: parameters.beneficiary,
        chainId: parameters.chainId,
        contract: parameters.contract,
        counterparty: parameters.counterparty,
        token: parameters.token,
        description: parameters.description,
      },

      async request({ request }) {
        const currentRequest = request as Record<string, unknown> & {
          chainId?: number | undefined
          submission?: 'push' | 'pull' | undefined
        }
        const chainId = currentRequest.chainId ?? parameters.chainId
        if (!chainId) throw new Error('No chainId configured for stake route.')
        const preset = getNetworkPresetByChainId(chainId)
        const submission =
          currentRequest.submission ??
          (feePayer || feePayerUrl
            ? preset.capabilities.supportsFeePayer
              ? 'pull'
              : 'push'
            : 'push')
        return { ...currentRequest, chainId, submission }
      },

      async verify({ credential, request }) {
        const challengeRequest = credential.challenge
          .request as StakeChallengeRequest
        const currentRequest = PaymentRequest.fromMethod(
          method,
          request as Record<string, unknown>,
        ) as StakeChallengeRequest
        assertRequestMatches(currentRequest, challengeRequest)

        const typed = toTypedRequest(challengeRequest)
        const { beneficiary, payer } = resolvePayerAndBeneficiary(
          challengeRequest,
          credential.source,
        )
        const client = createClient({
          chainId: typed.chainId,
          feePayerUrl,
        })

        const verifyParams = {
          beneficiary,
          counterparty: typed.counterparty,
          token: typed.token,
          payer,
          value: typed.amount,
        }
        const receiptParams = {
          ...verifyParams,
          contract: typed.contract,
          stakeKey: typed.stakeKey,
        }

        let receipt

        const payload = credential.payload as StakeCredentialPayload

        if (payload.type === 'hash')
          receipt = await getTransactionReceipt(client, {
            hash: payload.hash,
          })
        else {
          const serializedTransaction = getSerializedTransaction(payload)

          if (isTempoTransaction(serializedTransaction)) {
            const transaction = Transaction.deserialize(
              serializedTransaction as Transaction.TransactionSerializedTempo,
            )
            if (!transaction.signature || !transaction.from)
              throw new Error(
                'stake transactions must be signed by the payer first.',
              )

            matchStakeCalls({
              beneficiary,
              calls: transaction.calls ?? [],
              challenge: challengeRequest,
              payer,
            })

            const feeToken = transaction.feeToken as Address | undefined
            const finalTransaction = feePayer
              ? await cosignWithFeePayer(
                  client,
                  serializedTransaction,
                  feePayer,
                  feeToken,
                )
              : serializedTransaction

            receipt = await submitRawSync(client, finalTransaction)
          } else {
            // Standard EIP-1559 transaction (single-call permit flow).
            if (feePayer)
              throw new Error(
                'Fee payer cosigning requires a Tempo batch transaction.',
              )

            const transaction = parseTransaction(serializedTransaction)
            if (
              !transaction.to ||
              !('data' in transaction) ||
              !transaction.data
            )
              throw new Error('Standard transaction missing to or data.')

            matchStakeCalls({
              beneficiary,
              calls: [
                {
                  to: transaction.to as Address,
                  data: transaction.data as Hex,
                },
              ],
              challenge: challengeRequest,
              payer,
            })

            receipt = await submitRawSync(client, serializedTransaction)
          }
        }

        assertEscrowCreatedReceipt(receipt, receiptParams)
        await assertEscrowOnChain(
          client,
          typed.contract,
          typed.stakeKey,
          verifyParams,
        )

        return toReceipt(receipt, method.name)
      },
    })
  }
}

/**
 * Verifies that the request currently being served still matches the original
 * challenge fields the client responded to.
 */
const assertRequestMatches = (
  currentRequest: StakeChallengeRequest,
  challengeRequest: StakeChallengeRequest,
) => {
  const pairs = [
    ['amount', currentRequest.amount, challengeRequest.amount],
    ['contract', currentRequest.contract, challengeRequest.contract],
    ['token', currentRequest.token, challengeRequest.token],
    [
      'chainId',
      currentRequest.methodDetails.chainId,
      challengeRequest.methodDetails.chainId,
    ],
    [
      'counterparty',
      currentRequest.methodDetails.counterparty,
      challengeRequest.methodDetails.counterparty,
    ],
    [
      'stakeKey',
      currentRequest.methodDetails.stakeKey,
      challengeRequest.methodDetails.stakeKey,
    ],
  ] as const

  for (const [label, expected, received] of pairs)
    if (String(expected) !== String(received))
      throw new Error(`Challenge ${label} does not match this route.`)

  const currentBeneficiary = currentRequest.methodDetails.beneficiary
  const challengeBeneficiary = challengeRequest.methodDetails.beneficiary
  if (
    !currentBeneficiary !== !challengeBeneficiary ||
    (currentBeneficiary &&
      challengeBeneficiary &&
      !isAddressEqual(
        currentBeneficiary as Address,
        challengeBeneficiary as Address,
      ))
  )
    throw new Error('Challenge beneficiary does not match this route.')
}
