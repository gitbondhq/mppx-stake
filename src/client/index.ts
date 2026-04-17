// Public client entry — only this file is referenced by `package.json` exports.
// Sibling files in this directory are package-private.
import { createStakeMethod } from '../method.js'
import { createStakeClient, type StakeClientParameters } from './stake.js'

export type { StakeClientParameters } from './stake.js'

type ClientStakeFactory = (
  parameters: StakeClientParameters,
) => ReturnType<ReturnType<typeof createStakeClient>>

/** Client-side `stake` method implementation used to create credentials. */
export const clientStake: ClientStakeFactory = parameters =>
  createStakeClient(createStakeMethod())(parameters)
