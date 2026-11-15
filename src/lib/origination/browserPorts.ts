import { parseEventLogs, type Address, type Hex, type PublicClient, type WalletClient } from 'viem'
import { settlementAbi } from '@/abi/settlement'
import { erc20Abi } from '@/abi/erc20'
import type { ChainPort, WalletPort } from './flow'

/**
 * The flow's ports over viem clients, as wagmi supplies them in the browser.
 *
 * Base Sepolia's public RPC serves reads from nodes that may lag a write just
 * confirmed, so every read that follows a write is polled rather than trusted
 * once (the allowance after `approve`, the transaction after `commitPoI`). The
 * STID itself is taken from the receipt's own logs, which do not lag.
 */

/** Public RPCs cap `eth_getLogs` ranges; 200 blocks is Base Sepolia's. */
const LOG_RANGE = 200n
/** About a day of Base Sepolia blocks: further back, the operator is asked instead. */
const MAX_SCAN = 45_000n

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function browserChainPort(input: {
  client: PublicClient
  chainId: number
  settlement: Address
  tokenAddress: Address
  tokenSymbol: string
  tokenDecimals: number
}): ChainPort {
  const { client, settlement } = input
  const readTransaction = (stid: Hex) =>
    client.readContract({
      address: settlement,
      abi: settlementAbi,
      functionName: 'getTransaction',
      args: [stid],
    })
  return {
    chainId: input.chainId,
    settlement,
    tokenAddress: input.tokenAddress,
    tokenSymbol: input.tokenSymbol,
    tokenDecimals: input.tokenDecimals,
    blockNumber: () => client.getBlockNumber(),
    transactionExists: (stid) =>
      client.readContract({
        address: settlement,
        abi: settlementAbi,
        functionName: 'transactionExists',
        args: [stid],
      }),
    transactionState: async (stid) => Number((await readTransaction(stid)).state),
    async findCommitted({ originator, fromBlock, momoLegHash }) {
      const latest = await client.getBlockNumber()
      const start = latest - fromBlock > MAX_SCAN ? latest - MAX_SCAN : fromBlock
      for (let from = start; from <= latest; from += LOG_RANGE) {
        const to = from + LOG_RANGE - 1n < latest ? from + LOG_RANGE - 1n : latest
        const logs = await client.getContractEvents({
          address: settlement,
          abi: settlementAbi,
          eventName: 'PoICommitted',
          args: { originator },
          fromBlock: from,
          toBlock: to,
        })
        for (const log of logs) {
          const stid = log.args.stid
          if (stid === undefined) continue
          const committed = await readTransaction(stid)
          if (committed.momoLegHash.toLowerCase() === momoLegHash.toLowerCase()) return stid
        }
      }
      return undefined
    },
  }
}

/** True for a request the user declined in the wallet (EIP-1193 4001), at any depth. */
export function isUserRejection(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 8; depth += 1) {
    const e = current as { name?: string; code?: number; cause?: unknown }
    if (e.name === 'UserRejectedRequestError' || e.code === 4001) return true
    current = e.cause
  }
  return false
}

export function browserWalletPort(input: {
  client: PublicClient
  wallet: WalletClient
  account: Address
  settlement: Address
  tokenAddress: Address
}): WalletPort {
  const { client, wallet, account, settlement, tokenAddress } = input
  const chain = wallet.chain ?? null
  return {
    address: account,
    signTypedData: (typedData) => wallet.signTypedData({ account, ...typedData }),
    async ensureAllowance(amount) {
      const allowance = () =>
        client.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [account, settlement],
        })
      if ((await allowance()) >= amount) return
      const hash = await wallet.writeContract({
        account,
        chain,
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [settlement, amount],
      })
      const receipt = await client.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success')
        throw new Error(`The approval reverted in ${hash}. Nothing was committed.`)
      for (let attempt = 0; attempt < 10; attempt += 1) {
        if ((await allowance()) >= amount) return
        await pause(1500)
      }
      throw new Error(
        'The approval was mined but the allowance still reads short. Nothing was committed; try again.',
      )
    },
    async commitPoI(args) {
      const poi = { ...args, direction: 0 }
      // Simulated first: a commit that would revert names its reason here,
      // before the wallet is asked and before any fee.
      const { request } = await client.simulateContract({
        account,
        address: settlement,
        abi: settlementAbi,
        functionName: 'commitPoI',
        args: [poi],
      })
      return wallet.writeContract({ ...request, chain })
    },
    async waitForCommit(hash) {
      const receipt = await client.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') return { reverted: true }
      const events = parseEventLogs({
        abi: settlementAbi,
        eventName: 'PoICommitted',
        logs: receipt.logs.filter((log) => log.address.toLowerCase() === settlement.toLowerCase()),
      })
      const stid = events[0]?.args.stid
      if (stid !== undefined) return { stid }
      throw new Error(`commitPoI succeeded in ${hash} but no PoICommitted event was found.`)
    },
    isUserRejection,
  }
}
