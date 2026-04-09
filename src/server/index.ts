// Public server entry — only this file is referenced by `package.json` exports.
// Sibling files in this directory are package-private.
import { createStakeMethod, type StakeMethodParameters } from '../methods.js'
import { createStakeServer, type StakeServerParameters } from './stake.js'

type CreateServerStakeParameters = StakeServerParameters & StakeMethodParameters
type ServerStakeFactory = (
  parameters: CreateServerStakeParameters,
) => ReturnType<ReturnType<typeof createStakeServer>>

/** Server-side `stake` method implementation used to issue and verify challenges. */
export const stake: ServerStakeFactory = ({ name, ...parameters }) =>
  createStakeServer(createStakeMethod({ name }))(parameters)
