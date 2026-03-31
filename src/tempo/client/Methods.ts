import { tempo as upstreamTempo } from 'mppx/client'

import { stake as stake_, type StakeParameters } from './Stake.js'

type ClientTempoParameters = Parameters<typeof upstreamTempo.charge>[0] &
  Parameters<typeof upstreamTempo.session>[0] &
  StakeParameters

type ClientTempoTuple = readonly [
  ...ReturnType<typeof upstreamTempo>,
  ReturnType<typeof stake_>,
]

export type TempoParameters = ClientTempoParameters

type TempoFn = {
  (parameters?: TempoParameters): ClientTempoTuple
  charge: typeof upstreamTempo.charge
  session: typeof upstreamTempo.session
  stake: typeof stake_
}

export const tempo: TempoFn = Object.assign(
  (parameters: TempoParameters = {}): ClientTempoTuple =>
    [...upstreamTempo(parameters), stake_(parameters)] as const,
  {
    charge: upstreamTempo.charge,
    session: upstreamTempo.session,
    stake: stake_,
  },
)
