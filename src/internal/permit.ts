import type { Address, Client } from 'viem'
import { parseSignature } from 'viem'
import { readContract, signTypedData } from 'viem/actions'

import { erc20NameAbi, erc20PermitAbi, erc20VersionAbi } from '../abi/erc20.js'
import type { Account } from './account.js'

export type CreatePermitParameters = {
  account: Account
  amount: bigint
  chainId: number
  client: Client
  deadline: bigint
  owner: Address
  spender: Address
  token: Address
}

/**
 * Builds the ERC-2612 permit payload consumed by `createEscrowWithPermit`.
 * This signs token spend authorization, not the escrow intent itself.
 */
export const createPermitParams = async (
  parameters: CreatePermitParameters,
) => {
  const { account, amount, chainId, client, deadline, owner, spender, token } =
    parameters
  const nonce = await readContract(client, {
    abi: erc20PermitAbi,
    address: token,
    args: [owner],
    functionName: 'nonces',
  })
  const name = await readContract(client, {
    abi: erc20NameAbi,
    address: token,
    functionName: 'name',
  })
  const version = await (async () => {
    try {
      return await readContract(client, {
        abi: erc20VersionAbi,
        address: token,
        functionName: 'version',
      })
    } catch {
      return '1'
    }
  })()

  const signature = await signTypedData(client, {
    account,
    domain: {
      chainId,
      name,
      verifyingContract: token,
      version,
    },
    message: {
      deadline,
      nonce,
      owner,
      spender,
      value: amount,
    },
    primaryType: 'Permit',
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
  })
  const parsed = parseSignature(signature)

  return {
    deadline,
    r: parsed.r,
    s: parsed.s,
    v: Number(parsed.v ?? parsed.yParity ?? 0),
  }
}
