// Public server entry — only this file is referenced by `package.json` exports.
// Sibling files in this directory are package-private.
import { createStakeMethod } from '../method.js'
import { createStakeServer, type StakeServerParameters } from './stake.js'

export type {
  AssertEscrowActive,
  EscrowRecord,
  EscrowVerificationParams,
} from './escrowState.js'
export { assertEscrowState } from './escrowState.js'
export type { StakeServerParameters } from './stake.js'

type ServerStakeFactory = (
  parameters: StakeServerParameters,
) => ReturnType<ReturnType<typeof createStakeServer>>

/** Server-side `stake` method implementation used to issue and verify challenges. */
export const serverStake: ServerStakeFactory = parameters =>
  createStakeServer(createStakeMethod())(parameters)
