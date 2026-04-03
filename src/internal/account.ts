import type { Account as ViemAccount, Address, Client } from 'viem'
import { parseAccount } from 'viem/accounts'

export type Account = ViemAccount

export type GetResolverParameters = {
  account?: Account | Address | undefined
}

/**
 * Returns an account resolver that prefers an explicit override, then a
 * default account, and finally the account already attached to the viem client.
 */
export const getResolver = (parameters: GetResolverParameters = {}) => {
  const { account: defaultAccount } = parameters

  return (
    client: Client,
    { account: override }: { account?: Account | Address | undefined } = {},
  ): Account => {
    const account = override ?? defaultAccount
    if (!account) {
      if (!client.account)
        throw new Error(
          'No account provided. Pass one to setup or request context.',
        )

      return client.account
    }

    return parseAccount(account)
  }
}
