import {
  encodeStcn,
  identityHash as computeIdentityHash,
  momoLegHash as computeMomoLegHash,
  operationalHash,
  publicHash,
  receiverEndpointCommitmentBytes,
  type IdentityDomainFields,
  type OperationalDomainFields,
  type PublicDomainFields,
} from '@sawaswap/crypto'
import type { Address, Hex } from 'viem'
import type { AcceptedQuote } from './quoteRecord'
import { refuse } from './errors'
import { messageOf } from './quoteRecord'

/** The pilot's logical creator identifier (layouts §1, 86cb152xc v1.2.13). */
export const CREATED_BY = 'sawalabs:operator-console'

/** The sender side of the corridor, as the AgentOS profiles register it. */
export const SENDER_CONTEXT = { rail: 'crypto', blockchain: 'base', assetStandard: 'USDC' } as const

/** The direction value of CMM in the deployed Settlement Contract. */
const DIRECTION_CMM = 0

/** The four secret inputs a transaction needs, each from a CSPRNG (86cb152xc v1.2.13). */
export interface MaterialEntropy {
  stcnBytes: Uint8Array
  endpointSalt: Uint8Array
  operationalBlindingInput: Uint8Array
  identityBlindingInput: Uint8Array
}

export function freshEntropy(random: (length: number) => Uint8Array): MaterialEntropy {
  return {
    stcnBytes: random(10),
    endpointSalt: random(32),
    operationalBlindingInput: random(32),
    identityBlindingInput: random(32),
  }
}

export const browserRandom = (length: number): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(length))

export interface TransactionMaterial {
  publicFields: PublicDomainFields
  operational: OperationalDomainFields
  identity: IdentityDomainFields
  identityHash: Hex
  momoLegHash: Hex
}

/**
 * The three domains and the commitment, from the accepted quote and the
 * originator's inputs — the 86cb152xc v1.2.13 sequence: acceptance first
 * (§2.4c.4(d)), then the preimage, then the hash `commitPoI` will carry.
 *
 * The amounts come from the accepted quote and nowhere else: `momoAmount` is
 * `Q_CMM(escrowAmount)`, never a second figure. The STCN doubles as the MoMo
 * reference, so the code User C sees and the reference Agent B pays with are
 * one value.
 */
export function buildMaterial(input: {
  accepted: AcceptedQuote
  userCMomoEndpoint: string
  originator: Address
  chainId: number
  settlement: Address
  tokenAddress: Address
  executionInstructions: string
  entropy: MaterialEntropy
  /** Unix seconds. */
  createdAt: bigint
}): TransactionMaterial {
  const { accepted, entropy } = input
  const { corridor } = accepted
  const stcn = encodeStcn(entropy.stcnBytes)

  const publicFields: PublicDomainFields = {
    direction: DIRECTION_CMM,
    stcn,
    quoteId: accepted.record.quoteId,
    chainId: BigInt(input.chainId),
    settlementContract: input.settlement,
    tokenAddress: input.tokenAddress,
    escrowAmount: accepted.escrowAmount,
    momoCurrency: corridor.currency,
    momoAmount: accepted.momoAmount,
    corridor: {
      sender: { ...SENDER_CONTEXT },
      receiver: {
        rail: 'momo',
        countryCode: corridor.countryCode,
        mno: corridor.mno,
        currency: corridor.currency,
      },
    },
    createdAt: input.createdAt,
    createdBy: CREATED_BY,
  }

  const identity: IdentityDomainFields = {
    userCMomoEndpoint: input.userCMomoEndpoint,
    endpointSalt: entropy.endpointSalt,
    agentBMomoEndpoint: accepted.record.bridge.momoEndpoint,
    userAAddress: input.originator,
    agentBAddress: accepted.record.bridge.address,
    momoReference: stcn,
    executionInstructions: input.executionInstructions,
    identityBlindingInput: entropy.identityBlindingInput,
  }

  let receiverEndpointCommitment: Uint8Array
  try {
    receiverEndpointCommitment = receiverEndpointCommitmentBytes({
      endpointSalt: identity.endpointSalt,
      endpoint: identity.userCMomoEndpoint,
    })
  } catch (cause) {
    return refuse('INVALID_INPUT', `User C's mobile-money number: ${messageOf(cause)}`)
  }
  if (!input.userCMomoEndpoint.startsWith(corridor.countryCode)) {
    refuse(
      'INVALID_INPUT',
      `User C's number ${input.userCMomoEndpoint} is not in the quote's corridor (${corridor.countryCode}).`,
    )
  }

  const operational: OperationalDomainFields = {
    countryCode: corridor.countryCode,
    mnoId: corridor.mno,
    receiverEndpointCommitment,
    operationalBlindingInput: entropy.operationalBlindingInput,
  }
  const identityHash = computeIdentityHash(identity)
  const momoLegHash = computeMomoLegHash({
    publicHash: publicHash(publicFields),
    operationalHash: operationalHash(operational),
    identityHash,
  })
  return { publicFields, operational, identity, identityHash, momoLegHash }
}
