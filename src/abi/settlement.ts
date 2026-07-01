// Auto-extracted from settlement-layer-part1 build artifacts (M3 deployment of record).
// Source: out/Settlement.sol/Settlement.json. Do not hand-edit; regenerate from the verified contract.
export const settlementAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "usdc",
        "type": "address",
        "internalType": "contract IERC20"
      },
      {
        "name": "drp",
        "type": "address",
        "internalType": "contract IDRP"
      },
      {
        "name": "admin",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "defaultTimeWindows",
        "type": "tuple",
        "internalType": "struct TimeWindows",
        "components": [
          {
            "name": "tw1",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "tw2",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "tw3",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ADMIN_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_ADMIN_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DRP",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IDRP"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "USDC",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "commitPoI",
    "inputs": [
      {
        "name": "input",
        "type": "tuple",
        "internalType": "struct PoIInput",
        "components": [
          {
            "name": "beneficiary",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "eligibleClaimant",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "direction",
            "type": "uint8",
            "internalType": "enum Direction"
          },
          {
            "name": "escrowAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "momoLegHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "expireTW2",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "expireTW3",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getClaimHash",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getDefaultTimeWindows",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct TimeWindows",
        "components": [
          {
            "name": "tw1",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "tw2",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "tw3",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getNonce",
    "inputs": [
      {
        "name": "originator",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPoRHash",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRailPairTW1",
    "inputs": [
      {
        "name": "railPairId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleAdmin",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getTransaction",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct Transaction",
        "components": [
          {
            "name": "stid",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "originator",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "beneficiary",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "eligibleClaimant",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "direction",
            "type": "uint8",
            "internalType": "enum Direction"
          },
          {
            "name": "escrowAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "momoLegHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "tw1",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "tw2",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "tw3",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "committedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "state",
            "type": "uint8",
            "internalType": "enum State"
          },
          {
            "name": "drpInvoked",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "terminalMoved",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "grantRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "hasRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "invokeDRP",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "pokeTW1",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "renounceRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "callerConfirmation",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reverse",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "revokeRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setDefaultTimeWindows",
    "inputs": [
      {
        "name": "tw1",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "tw2",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "tw3",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setRailPairProfile",
    "inputs": [
      {
        "name": "railPairId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "tw1",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settle",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "submitClaim",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "claimData",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitPoR",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "porData",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      {
        "name": "interfaceId",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transactionExists",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "updateClaim",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "claimData",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "ClaimSubmitted",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "claimant",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimUpdated",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DRPInvoked",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PoICommitted",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "originator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "beneficiary",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "direction",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum Direction"
      },
      {
        "name": "escrowAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "tw1",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "tw2",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "tw3",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PoRSubmitted",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RailPairProfileSet",
    "inputs": [
      {
        "name": "railPairId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "tw1",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "by",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Reversed",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "originator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleAdminChanged",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "previousAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "newAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleGranted",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleRevoked",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Settled",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "beneficiary",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "StateChanged",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "previous",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum State"
      },
      {
        "name": "current",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum State"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TimeWindowsConfigured",
    "inputs": [
      {
        "name": "tw1",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "tw2",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "tw3",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "by",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AccessControlBadConfirmation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AccessControlUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "neededRole",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "AddressEmptyCode",
    "inputs": [
      {
        "name": "target",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "AddressInsufficientBalance",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "AlreadyFinalized",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ClaimAlreadyExists",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ClaimPending",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DRPAlreadyInvoked",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DuplicateSTID",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EscalationNotDue",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FailedInnerCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidClaimData",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidPoRData",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidState",
    "inputs": [
      {
        "name": "expected",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "actual",
        "type": "uint8",
        "internalType": "uint8"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidTimeWindow",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoClaim",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoClaimToUpdate",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotEligibleClaimant",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotImplementedM1",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotPoRSubmitter",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "TransactionNotFound",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WindowExpired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAmount",
    "inputs": []
  }
] as const;
