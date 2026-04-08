import { z } from 'mppx'

/** MPP stake amounts are base-unit integer strings, not decimal display values. */
export const baseUnitAmount = () =>
  z.string().check(z.regex(/^\d+$/, 'Invalid base-unit amount'))
