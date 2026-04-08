// Auto-generated from monorepo forge build output — do not edit manually.
import type { Abi } from 'viem'

export const escrowAbi = [
  {
    type: 'constructor',
    inputs: [
      {
        name: '_whitelistedTokens',
        type: 'address[]',
        internalType: 'address[]',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'addRefundDelegate',
    inputs: [
      {
        name: 'delegate',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'addSlashDelegate',
    inputs: [
      {
        name: 'delegate',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'createEscrow',
    inputs: [
      {
        name: 'scope',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'counterparty',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'beneficiary',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'token',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'escrowId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getActiveEscrow',
    inputs: [
      {
        name: 'scope',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'beneficiary',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct IMPPEscrow.Escrow',
        components: [
          {
            name: 'id',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'scope',
            type: 'bytes32',
            internalType: 'bytes32',
          },
          {
            name: 'payer',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'beneficiary',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'counterparty',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'token',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'principal',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'depositedAt',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'isActive',
            type: 'bool',
            internalType: 'bool',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getActiveEscrowId',
    inputs: [
      {
        name: 'scope',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'beneficiary',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'escrowId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getEscrow',
    inputs: [
      {
        name: 'escrowId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct IMPPEscrow.Escrow',
        components: [
          {
            name: 'id',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'scope',
            type: 'bytes32',
            internalType: 'bytes32',
          },
          {
            name: 'payer',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'beneficiary',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'counterparty',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'token',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'principal',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'depositedAt',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'isActive',
            type: 'bool',
            internalType: 'bool',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isEscrowActive',
    inputs: [
      {
        name: 'scope',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'beneficiary',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'nextEscrowId',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'refundDelegates',
    inputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'refundEscrow',
    inputs: [
      {
        name: 'escrowId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'removeRefundDelegate',
    inputs: [
      {
        name: 'delegate',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'removeSlashDelegate',
    inputs: [
      {
        name: 'delegate',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'slashDelegates',
    inputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'slashEscrow',
    inputs: [
      {
        name: 'escrowId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'tokenWhitelist',
    inputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalEscrowed',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalEscrowedByToken',
    inputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'EscrowCreated',
    inputs: [
      {
        name: 'escrowId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'scope',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'payer',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'beneficiary',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'counterparty',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'token',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'EscrowRefunded',
    inputs: [
      {
        name: 'escrowId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'scope',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'payer',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'beneficiary',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'token',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'EscrowSlashed',
    inputs: [
      {
        name: 'escrowId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'scope',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'payer',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'beneficiary',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'counterparty',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'token',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'RefundDelegateUpdated',
    inputs: [
      {
        name: 'counterparty',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'delegate',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'authorized',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'SlashDelegateUpdated',
    inputs: [
      {
        name: 'counterparty',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'delegate',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'authorized',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'MPPEscrow__EscrowAlreadyExists',
    inputs: [],
  },
  {
    type: 'error',
    name: 'MPPEscrow__EscrowNotActive',
    inputs: [],
  },
  {
    type: 'error',
    name: 'MPPEscrow__InvalidAddress',
    inputs: [],
  },
  {
    type: 'error',
    name: 'MPPEscrow__InvalidAmount',
    inputs: [],
  },
  {
    type: 'error',
    name: 'MPPEscrow__NotAuthorized',
    inputs: [],
  },
  {
    type: 'error',
    name: 'MPPEscrow__TokenNotWhitelisted',
    inputs: [
      {
        name: 'token',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
  {
    type: 'error',
    name: 'SafeERC20FailedOperation',
    inputs: [
      {
        name: 'token',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
] as const satisfies Abi
