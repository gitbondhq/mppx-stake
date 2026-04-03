import { createClientStake } from '../internal/stakeClient.js'
import { stake as stakeMethod } from '../Methods.js'

/** Client-side `stake` method implementation used to create credentials. */
export const stake: ReturnType<typeof createClientStake> =
  createClientStake(stakeMethod)
