import { Credential, Method, z } from 'mppx'
import type { Address } from 'viem'

import * as Account from './account.js'
import { detectTransportPolicy } from './chains.js'
import type { EIP1193Provider } from './client.js'
import {
  createClient,
  prepareAndSign,
  providerSubmitCalls,
  submitCalls,
} from './client.js'
import { createPermitParams } from './permit.js'
import { toTypedRequest } from './request.js'
import { buildLegacyCalls, buildPermitCalls } from './tx.js'

type StakeMethod = Parameters<typeof Method.toClient>[0]

export type StakeParameters = {
  feeToken?: Address | undefined
  provider?: EIP1193Provider | undefined
} & Account.GetResolverParameters

/**
 * Turns the shared stake schema into a client method that can:
 * 1. build the escrow calls
 * 2. choose permit vs approve+create
 * 3. either submit the transaction or return a signed payload
 */
export const createClientStake = (method: StakeMethod) => {
  return (parameters: StakeParameters = {}) => {
    const getAccount = Account.getResolver({ account: parameters.account })

    return Method.toClient(method, {
      context: z.strictObject({
        account: z.optional(
          z.custom<Account.GetResolverParameters['account']>(),
        ),
        feeToken: z.optional(z.address()),
      }),

      async createCredential({ challenge, context }) {
        const typed = toTypedRequest(
          challenge.request as Parameters<typeof toTypedRequest>[0],
        )
        const client = createClient({ chainId: typed.chainId })
        const account = getAccount(client, context)

        const beneficiary = typed.beneficiary ?? account.address
        const feeToken =
          (context?.feeToken as Address | undefined) ?? parameters.feeToken
        const submission = typed.submission ?? 'push'
        const transportPolicy = await detectTransportPolicy({
          chainId: typed.chainId,
          client,
          token: typed.token,
          owner: account.address,
        })

        const calls =
          transportPolicy === 'permit'
            ? await buildPermitCalls({
                account,
                amount: typed.amount,
                beneficiary,
                chainId: typed.chainId,
                client,
                contract: typed.contract,
                counterparty: typed.counterparty,
                token: typed.token,
                permitFactory: createPermitParams,
                stakeKey: typed.stakeKey,
              })
            : buildLegacyCalls({
                amount: typed.amount,
                beneficiary,
                contract: typed.contract,
                counterparty: typed.counterparty,
                token: typed.token,
                stakeKey: typed.stakeKey,
              })

        const source = `did:pkh:eip155:${typed.chainId}:${account.address}`
        const provider = parameters.provider

        if (submission === 'push') {
          const hash = provider
            ? await providerSubmitCalls(client, account, calls, provider)
            : await submitCalls(client, account, calls, feeToken)
          return Credential.serialize({
            challenge,
            payload: { hash, type: 'hash' },
            source,
          })
        }

        // Pull mode requires Tempo batch transactions (0x76) which wallet
        // providers cannot sign. Pull is only triggered when the server has a
        // fee payer configured, and fee payer cosigning requires 0x76.
        if (provider)
          throw new Error(
            'Pull mode is not supported with a wallet provider. ' +
              'Wallet providers can only produce standard EIP-1559 transactions ' +
              'which cannot be cosigned by a fee payer.',
          )

        const signature = await prepareAndSign(client, account, calls, feeToken)
        return Credential.serialize({
          challenge,
          payload: { signature, type: 'transaction' },
          source,
        })
      },
    })
  }
}
