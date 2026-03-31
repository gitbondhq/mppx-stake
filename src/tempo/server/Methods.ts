import { tempo as upstreamTempo } from 'mppx/server'

import { stake as stake_, type StakeParameters } from './Stake.js'

type ServerTempoParameters = Parameters<typeof upstreamTempo.charge>[0] &
  Parameters<typeof upstreamTempo.session>[0] &
  StakeParameters

type ServerTempoTuple = readonly [
  ...ReturnType<typeof upstreamTempo>,
  ReturnType<typeof stake_>,
]

export type TempoParameters = ServerTempoParameters

type TempoFn = {
  (parameters?: TempoParameters): ServerTempoTuple
  charge: typeof upstreamTempo.charge
  session: typeof upstreamTempo.session
  settle: typeof upstreamTempo.settle
  stake: typeof stake_
}

export const tempo: TempoFn = Object.assign(
  (parameters: TempoParameters = {}): ServerTempoTuple =>
    [...upstreamTempo(parameters), stake_(parameters)] as const,
  {
    charge: upstreamTempo.charge,
    session: upstreamTempo.session,
    settle: upstreamTempo.settle,
    stake: stake_,
  },
)
