import { Method, PaymentRequest } from 'mppx'
import type { Account as ViemAccount, Address, Hex } from 'viem'
import { isAddressEqual, parseTransaction } from 'viem'
import { getTransactionReceipt } from 'viem/actions'
import { Transaction } from 'viem/tempo'

import {
  cosignWithFeePayer,
  createClient,
  submitRawSync,
} from '../../internal/client.js'
import { toTypedRequest } from '../../internal/request.js'
import { resolvePayerAndBeneficiary } from '../../internal/source.js'
import {
  assertEscrowCreatedReceipt,
  assertEscrowOnChain,
  getSerializedTransaction,
  isTempoTransaction,
  matchStakeCalls,
  toReceipt,
} from '../../internal/tx.js'
import * as Methods from '../Methods.js'

export type StakeDefaults = {
  beneficiary?: Address | undefined
  chainId?: number | undefined
  contract?: Address | undefined
  counterparty?: Address | undefined
  currency?: Address | undefined
  description?: string | undefined
}

export type StakeParameters = StakeDefaults & {
  feePayer?: ViemAccount | string | undefined
}

export const stake = <const parameters extends StakeParameters>(
  parameters = {} as parameters,
) => {
  const feePayerUrl =
    typeof parameters.feePayer === 'string' ? parameters.feePayer : undefined
  const feePayer =
    typeof parameters.feePayer === 'object'
      ? (parameters.feePayer as ViemAccount)
      : undefined

  return Method.toServer<typeof Methods.stake, StakeDefaults>(Methods.stake, {
    defaults: {
      beneficiary: parameters.beneficiary,
      chainId: parameters.chainId,
      contract: parameters.contract,
      counterparty: parameters.counterparty,
      currency: parameters.currency,
      description: parameters.description,
    },

    async request({ request }) {
      const chainId = request.chainId ?? parameters.chainId
      if (!chainId) throw new Error('No chainId configured for tempo.stake.')
      const submission =
        request.submission ?? (feePayer || feePayerUrl ? 'pull' : 'push')
      return { ...request, chainId, submission }
    },

    async verify({ credential, request }) {
      const challengeRequest = credential.challenge.request
      const currentRequest = PaymentRequest.fromMethod(Methods.stake, request)
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
        currency: typed.currency,
        payer,
        value: typed.amount,
      }
      const receiptParams = {
        ...verifyParams,
        contract: typed.contract,
        stakeKey: typed.stakeKey,
      }

      let receipt

      if (credential.payload.type === 'hash')
        receipt = await getTransactionReceipt(client, {
          hash: credential.payload.hash as Hex,
        })
      else {
        const serializedTransaction = getSerializedTransaction(
          credential.payload,
        )

        if (isTempoTransaction(serializedTransaction)) {
          const transaction = Transaction.deserialize(
            serializedTransaction as Transaction.TransactionSerializedTempo,
          )
          if (!transaction.signature || !transaction.from)
            throw new Error(
              'tempo.stake transactions must be signed by the payer first.',
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
          if (!transaction.to || !('data' in transaction) || !transaction.data)
            throw new Error('Standard transaction missing to or data.')

          matchStakeCalls({
            beneficiary,
            calls: [
              { to: transaction.to as Address, data: transaction.data as Hex },
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

      return toReceipt(receipt)
    },
  })
}

const assertRequestMatches = (
  currentRequest: typeof Methods.stake.schema.request._zod.output,
  challengeRequest: typeof Methods.stake.schema.request._zod.output,
) => {
  const pairs = [
    ['amount', currentRequest.amount, challengeRequest.amount],
    ['contract', currentRequest.contract, challengeRequest.contract],
    ['currency', currentRequest.currency, challengeRequest.currency],
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
