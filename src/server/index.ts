import { createServerStake } from '../internal/stakeServer.js'
import { stake as stakeMethod } from '../Methods.js'

/** Server-side `stake` method implementation used to issue and verify challenges. */
export const stake: ReturnType<typeof createServerStake> =
  createServerStake(stakeMethod)
