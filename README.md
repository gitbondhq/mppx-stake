## `@gitbondhq/mppx-stake`

An `mppx` stake method that proves an MPPEscrow is **already active** for a
given scope and beneficiary. The credential is an off-chain EIP-712 signature
the beneficiary makes; the server verifies it by recovering the signer and
reading `isEscrowActive` / `getActiveEscrow` from chain.

The package does **not** create escrows. Anything that touches gas — escrow
funding, fee-payer cosigning, transaction submission — is the consumer's
responsibility. See `plans/proof-model-migration.md` for the design notes
behind this split.
