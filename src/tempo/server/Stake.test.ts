import { PaymentRequest } from 'mppx'
import type { Address, Hex, TransactionReceipt } from 'viem'
import { encodeFunctionData } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GitBondEscrowAbi } from '../../abi/GitBondEscrow.js'
import { buildLegacyCalls } from '../../internal/tx.js'
import * as Methods from '../Methods.js'
import { stake } from './Stake.js'

const payer = '0x4444444444444444444444444444444444444444' as Address
const beneficiary = '0x3333333333333333333333333333333333333333' as Address
const counterparty = '0x2222222222222222222222222222222222222222' as Address
const contract = '0x1111111111111111111111111111111111111111' as Address
const currency = '0x20C0000000000000000000000000000000000000' as Address
const stakeKey =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex
const chainId = 42431
const txHash =
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Hex

const rawInput = {
  amount: '5000000',
  beneficiary,
  chainId,
  contract,
  counterparty,
  currency,
  stakeKey,
}

const challengeRequest = PaymentRequest.fromMethod(Methods.stake, rawInput)

const mocks = vi.hoisted(() => ({
  assertEscrowCreatedReceipt: vi.fn(),
  assertEscrowOnChain: vi.fn().mockResolvedValue(undefined),
  cosignWithFeePayer: vi.fn(),
  createClient: vi.fn(() => ({})),
  getTransactionReceipt: vi.fn(),
  isTempoTransaction: vi.fn(() => true),
  parseTransaction: vi.fn(),
  submitRawSync: vi.fn(),
  transactionDeserialize: vi.fn(),
}))

vi.mock('../../internal/client.js', () => ({
  createClient: mocks.createClient,
  cosignWithFeePayer: mocks.cosignWithFeePayer,
  submitRawSync: mocks.submitRawSync,
}))

vi.mock('../../internal/tx.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../internal/tx.js')>()),
  assertEscrowCreatedReceipt: mocks.assertEscrowCreatedReceipt,
  assertEscrowOnChain: mocks.assertEscrowOnChain,
  isTempoTransaction: mocks.isTempoTransaction,
}))

vi.mock('viem/actions', async importOriginal => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  getTransactionReceipt: mocks.getTransactionReceipt,
}))

vi.mock('viem', async importOriginal => ({
  ...(await importOriginal<typeof import('viem')>()),
  parseTransaction: mocks.parseTransaction,
}))

vi.mock('viem/tempo', () => ({
  Transaction: { deserialize: mocks.transactionDeserialize },
}))

const mockReceipt = {
  logs: [],
  status: 'success',
  transactionHash: txHash,
} as unknown as TransactionReceipt

const makeCredential = (
  payload:
    | { hash: Hex; type: 'hash' }
    | { signature: Hex; type: 'transaction' },
) => ({
  challenge: {
    id: 'test-challenge-id',
    intent: 'stake' as const,
    method: 'tempo' as const,
    realm: 'test.example.com',
    request: challengeRequest,
  },
  payload,
  source: `did:pkh:eip155:${chainId}:${payer}`,
})

describe('tempo server stake', () => {
  it('keeps route defaults limited to shared request fields', () => {
    const method = stake({
      beneficiary,
      chainId,
      contract,
      counterparty,
      currency,
      description: 'Stake required',
    })

    expect(method.defaults).toEqual({
      beneficiary,
      chainId,
      contract,
      counterparty,
      currency,
      description: 'Stake required',
    })
    expect(method.defaults).not.toHaveProperty('externalId')
  })

  describe('verify', () => {
    beforeEach(() => vi.clearAllMocks())

    describe('hash credential', () => {
      it('fetches receipt and verifies on-chain state', async () => {
        mocks.getTransactionReceipt.mockResolvedValue(mockReceipt)

        const method = stake({ chainId, contract, currency })
        const credential = makeCredential({ hash: txHash, type: 'hash' })
        const result = await method.verify({ credential, request: rawInput })

        expect(result).toEqual({
          method: 'tempo',
          reference: txHash,
          status: 'success',
          timestamp: expect.any(String),
        })
        expect(mocks.getTransactionReceipt).toHaveBeenCalledOnce()
        expect(mocks.assertEscrowCreatedReceipt).toHaveBeenCalledOnce()
        expect(mocks.assertEscrowOnChain).toHaveBeenCalledOnce()
        expect(mocks.submitRawSync).not.toHaveBeenCalled()
      })
    })

    describe('transaction credential', () => {
      const serializedTx = '0x76aabbcc' as Hex
      const legacyCalls = buildLegacyCalls({
        amount: 5_000_000n,
        beneficiary,
        contract,
        counterparty,
        currency,
        stakeKey,
      })

      it('deserializes, matches calls, submits, and verifies', async () => {
        mocks.transactionDeserialize.mockReturnValue({
          calls: legacyCalls,
          from: payer,
          signature: '0xsig',
        })
        mocks.submitRawSync.mockResolvedValue(mockReceipt)

        const method = stake({ chainId, contract, currency })
        const credential = makeCredential({
          signature: serializedTx,
          type: 'transaction',
        })
        const result = await method.verify({ credential, request: rawInput })

        expect(result).toEqual({
          method: 'tempo',
          reference: txHash,
          status: 'success',
          timestamp: expect.any(String),
        })
        expect(mocks.isTempoTransaction).toHaveBeenCalledWith(serializedTx)
        expect(mocks.transactionDeserialize).toHaveBeenCalledOnce()
        expect(mocks.submitRawSync).toHaveBeenCalledOnce()
        expect(mocks.cosignWithFeePayer).not.toHaveBeenCalled()
        expect(mocks.assertEscrowCreatedReceipt).toHaveBeenCalledOnce()
        expect(mocks.assertEscrowOnChain).toHaveBeenCalledOnce()
      })

      it('cosigns when feePayer account is configured', async () => {
        mocks.transactionDeserialize.mockReturnValue({
          calls: legacyCalls,
          from: payer,
          signature: '0xsig',
        })
        const cosignedTx = '0xcosigned' as Hex
        mocks.cosignWithFeePayer.mockResolvedValue(cosignedTx)
        mocks.submitRawSync.mockResolvedValue(mockReceipt)

        const feePayerAccount = {
          address: '0x5555555555555555555555555555555555555555',
          type: 'local',
        }
        const method = stake({
          chainId,
          contract,
          currency,
          feePayer: feePayerAccount as never,
        })
        const credential = makeCredential({
          signature: serializedTx,
          type: 'transaction',
        })
        await method.verify({ credential, request: rawInput })

        expect(mocks.cosignWithFeePayer).toHaveBeenCalledWith(
          expect.anything(),
          serializedTx,
          feePayerAccount,
          undefined,
        )
        expect(mocks.submitRawSync).toHaveBeenCalledWith(
          expect.anything(),
          cosignedTx,
        )
      })

      it('passes feePayerUrl to createClient when feePayer is a string', async () => {
        mocks.transactionDeserialize.mockReturnValue({
          calls: legacyCalls,
          from: payer,
          signature: '0xsig',
        })
        mocks.submitRawSync.mockResolvedValue(mockReceipt)

        const method = stake({
          chainId,
          contract,
          currency,
          feePayer: 'https://feepayer.example.com',
        })
        const credential = makeCredential({
          signature: serializedTx,
          type: 'transaction',
        })
        await method.verify({ credential, request: rawInput })

        expect(mocks.createClient).toHaveBeenCalledWith({
          chainId,
          feePayerUrl: 'https://feepayer.example.com',
        })
        expect(mocks.cosignWithFeePayer).not.toHaveBeenCalled()
      })

      it('accepts standard transactions for single-call permit flow', async () => {
        const standardTx = '0x02aabbcc' as Hex
        const permitCallData = encodeFunctionData({
          abi: GitBondEscrowAbi,
          args: [
            stakeKey,
            payer,
            counterparty,
            beneficiary,
            currency,
            5_000_000n,
            {
              deadline: 0n,
              r: ('0x' + '00'.repeat(32)) as Hex,
              s: ('0x' + '00'.repeat(32)) as Hex,
              v: 27,
            },
          ],
          functionName: 'createEscrowWithPermit',
        })

        mocks.isTempoTransaction.mockReturnValue(false)
        mocks.parseTransaction.mockReturnValue({
          data: permitCallData,
          to: contract,
        })
        mocks.submitRawSync.mockResolvedValue(mockReceipt)

        const method = stake({ chainId, contract, currency })
        const credential = makeCredential({
          signature: standardTx,
          type: 'transaction',
        })

        const result = await method.verify({
          credential,
          request: rawInput,
        })

        expect(result).toEqual({
          method: 'tempo',
          reference: txHash,
          status: 'success',
          timestamp: expect.any(String),
        })
        expect(mocks.parseTransaction).toHaveBeenCalledWith(standardTx)
        expect(mocks.submitRawSync).toHaveBeenCalledOnce()
        expect(mocks.cosignWithFeePayer).not.toHaveBeenCalled()
      })

      it('rejects standard transactions when feePayer is configured', async () => {
        mocks.isTempoTransaction.mockReturnValue(false)
        mocks.parseTransaction.mockReturnValue({
          data: legacyCalls[0]!.data,
          to: legacyCalls[0]!.to,
        })

        const feePayerAccount = {
          address: '0x5555555555555555555555555555555555555555',
          type: 'local',
        }
        const method = stake({
          chainId,
          contract,
          currency,
          feePayer: feePayerAccount as never,
        })
        const credential = makeCredential({
          signature: '0x02aabbcc' as Hex,
          type: 'transaction',
        })

        await expect(
          method.verify({ credential, request: rawInput }),
        ).rejects.toThrow(/fee payer.*requires.*tempo batch/i)
      })

      it('rejects unsigned transactions', async () => {
        mocks.isTempoTransaction.mockReturnValue(true)
        mocks.transactionDeserialize.mockReturnValue({
          calls: [],
          from: undefined,
          signature: undefined,
        })

        const method = stake({ chainId, contract, currency })
        const credential = makeCredential({
          signature: serializedTx,
          type: 'transaction',
        })

        await expect(
          method.verify({ credential, request: rawInput }),
        ).rejects.toThrow(/must be signed/i)
      })
    })

    it('rejects when challenge request does not match', async () => {
      const method = stake({ chainId, contract, currency })
      const mismatchedRequest = PaymentRequest.fromMethod(Methods.stake, {
        ...rawInput,
        amount: '9999999',
      })
      const credential = {
        ...makeCredential({ hash: txHash, type: 'hash' }),
        challenge: {
          id: 'test-id',
          intent: 'stake' as const,
          method: 'tempo' as const,
          realm: 'test.example.com',
          request: mismatchedRequest,
        },
      }

      await expect(
        method.verify({ credential, request: rawInput }),
      ).rejects.toThrow(/does not match/i)
    })

    it('rejects when source DID chainId does not match', async () => {
      const method = stake({ chainId, contract, currency })
      const credential = {
        ...makeCredential({ hash: txHash, type: 'hash' }),
        source: `did:pkh:eip155:1:${payer}`,
      }

      await expect(
        method.verify({ credential, request: rawInput }),
      ).rejects.toThrow(/chainId/i)
    })
  })
})
