import {
  createClientStake,
  type StakeParameters as ClientStakeParameters,
} from '../internal/stakeClient.js'
import {
  stake as createStakeMethod,
  type StakeMethodParameters,
} from '../Methods.js'

type CreateClientStakeParameters = ClientStakeParameters & StakeMethodParameters
type ClientStakeFactory = (
  parameters: CreateClientStakeParameters,
) => ReturnType<ReturnType<typeof createClientStake>>

/** Client-side `stake` method implementation used to create credentials. */
export const stake: ClientStakeFactory = ({ name, ...parameters }) =>
  createClientStake(createStakeMethod({ name }))(parameters)
