// Public client entry — only this file is referenced by `package.json` exports.
// Sibling files in this directory are package-private.
import { createStakeMethod, type StakeMethodParameters } from '../method.js'
import { createStakeClient, type StakeClientParameters } from './stake.js'

type CreateClientStakeParameters = StakeClientParameters & StakeMethodParameters
type ClientStakeFactory = (
  parameters: CreateClientStakeParameters,
) => ReturnType<ReturnType<typeof createStakeClient>>

/** Client-side `stake` method implementation used to create credentials. */
export const clientStake: ClientStakeFactory = ({ name, ...parameters }) =>
  createStakeClient(createStakeMethod({ name }))(parameters)
