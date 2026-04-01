import { Credential, Method, z } from 'mppx'
import type { Address } from 'viem'

import * as Account from '../../internal/account.js'
import {
  resolveTransportPolicy,
  transportPolicySchema,
} from '../../internal/chains.js'
import type { EIP1193Provider } from '../../internal/client.js'
import {
  createClient,
  prepareAndProviderSign,
  prepareAndSign,
  submitCalls,
} from '../../internal/client.js'
import { createPermitParams } from '../../internal/permit.js'
import { toTypedRequest } from '../../internal/request.js'
import { buildLegacyCalls, buildPermitCalls } from '../../internal/tx.js'
import * as Methods from '../Methods.js'

export type StakeParameters = {
  feeToken?: Address | undefined
  mode?: 'push' | 'pull' | undefined
  permitDeadlineSeconds?: number | undefined
  provider?: EIP1193Provider | undefined
  transportPolicy?: 'auto' | 'permit' | 'legacy' | undefined
} & Account.GetResolverParameters

export const stake = (parameters: StakeParameters = {}) => {
  const getAccount = Account.getResolver({ account: parameters.account })

  return Method.toClient(Methods.stake, {
    context: z.strictObject({
      account: z.optional(z.custom<Account.GetResolverParameters['account']>()),
      feeToken: z.optional(z.address()),
      mode: z.optional(z.enum(['push', 'pull'])),
      transportPolicy: z.optional(transportPolicySchema),
    }),

    async createCredential({ challenge, context }) {
      const typed = toTypedRequest(challenge.request)
      const client = createClient({ chainId: typed.chainId })
      const account = getAccount(client, context)

      const beneficiary = typed.beneficiary ?? account.address
      const feeToken =
        (context?.feeToken as Address | undefined) ?? parameters.feeToken
      const mode =
        context?.mode ??
        parameters.mode ??
        (account.type === 'json-rpc' ? 'push' : 'pull')
      const transportPolicy = resolveTransportPolicy({
        chainId: typed.chainId,
        transportPolicy: context?.transportPolicy ?? parameters.transportPolicy,
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
              currency: typed.currency,
              deadlineSeconds: parameters.permitDeadlineSeconds,
              permitFactory: createPermitParams,
              stakeKey: typed.stakeKey,
            })
          : buildLegacyCalls({
              amount: typed.amount,
              beneficiary,
              contract: typed.contract,
              counterparty: typed.counterparty,
              currency: typed.currency,
              stakeKey: typed.stakeKey,
            })

      const source = `did:pkh:eip155:${typed.chainId}:${account.address}`

      if (mode === 'push') {
        const hash = await submitCalls(client, account, calls, feeToken)
        return Credential.serialize({
          challenge,
          payload: { hash, type: 'hash' },
          source,
        })
      }

      const provider = parameters.provider
      const signature =
        provider && calls.length === 1
          ? await prepareAndProviderSign(client, account, calls[0]!, provider)
          : await prepareAndSign(client, account, calls, feeToken)
      return Credential.serialize({
        challenge,
        payload: { signature, type: 'transaction' },
        source,
      })
    },
  })
}
