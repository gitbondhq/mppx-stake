import {
  createServerStake,
  type StakeParameters as ServerStakeParameters,
} from '../internal/stakeServer.js'
import {
  stake as createStakeMethod,
  type StakeMethodParameters,
} from '../Methods.js'

type CreateServerStakeParameters = ServerStakeParameters & StakeMethodParameters
type ServerStakeFactory = (
  parameters: CreateServerStakeParameters,
) => ReturnType<ReturnType<typeof createServerStake>>

/** Server-side `stake` method implementation used to issue and verify challenges. */
export const stake: ServerStakeFactory = ({ name, ...parameters }) =>
  createServerStake(createStakeMethod({ name }))(parameters)
