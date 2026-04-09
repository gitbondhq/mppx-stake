import { Challenge } from 'mppx'

import { createStakeMethod, type StakeChallengeRequest } from './method.js'

export type StakeChallenge = Challenge.Challenge<
  StakeChallengeRequest,
  'stake',
  string
>

type ParseStakeChallengeOptions = {
  methodName: string
}

export const parseStakeChallenge = (
  value: Response | unknown,
  options: ParseStakeChallengeOptions,
): StakeChallenge => {
  const method = createStakeMethod({ name: options.methodName })

  if (value instanceof Response)
    return Challenge.fromResponse(value, {
      methods: [method],
    }) as StakeChallenge

  const parsed = Challenge.Schema.parse(value)

  if (parsed.method !== method.name || parsed.intent !== method.intent)
    throw new Error(
      `Expected a ${method.name}/${method.intent} challenge, received ${parsed.method}/${parsed.intent}.`,
    )

  return Challenge.fromMethod(method, {
    description: parsed.description,
    digest: parsed.digest,
    expires: parsed.expires,
    id: parsed.id,
    ...(parsed.opaque ? { meta: parsed.opaque } : {}),
    realm: parsed.realm,
    request: parsed.request as StakeChallengeRequest,
  }) as StakeChallenge
}
