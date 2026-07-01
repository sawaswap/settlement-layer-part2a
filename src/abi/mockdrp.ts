// Auto-extracted from settlement-layer-part1 build artifacts (M3 deployment of record).
// Source: out/MockDRP.sol/MockDRP.json. Do not hand-edit; regenerate from the verified contract.
export const mockDrpAbi = [
  {
    "type": "function",
    "name": "called",
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
    "name": "preset",
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
        "type": "uint8",
        "internalType": "enum IDRP.Outcome"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "resolve",
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
        "type": "uint8",
        "internalType": "enum IDRP.Outcome"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setOutcome",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "outcome",
        "type": "uint8",
        "internalType": "enum IDRP.Outcome"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setRevert",
    "inputs": [
      {
        "name": "stid",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "revertFlag",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "shouldRevert",
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
  }
] as const;
