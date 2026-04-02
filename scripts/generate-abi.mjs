#!/usr/bin/env node
/**
 * Reads the MPPEscrow ABI from the local forge build output and writes it
 * as a TypeScript module that the SDK can import directly.
 *
 * Usage: node scripts/generate-abi.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const forgeArtifact = resolve(
  __dirname,
  '../../../out/MPPEscrow.sol/MPPEscrow.json',
)
const outFile = resolve(__dirname, '../src/abi/MPPEscrow.ts')

const artifact = JSON.parse(readFileSync(forgeArtifact, 'utf-8'))
const abi = JSON.stringify(artifact.abi, null, 2)

const source = `// Auto-generated from local forge build output — do not edit manually.
import type { Abi } from 'viem'

export const MPPEscrowAbi = ${abi} as const satisfies Abi
`

writeFileSync(outFile, source)
console.log(`Wrote ${outFile}`)
