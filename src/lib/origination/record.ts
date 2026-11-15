import {
  decodePublicFields,
  encodePublicFields,
  type IdentityDomainFields,
  type KeyBindingMode,
  type OperationalDomainFields,
  type PublicFieldsWire,
  type TransportedConsumerContextWire,
} from '@sawaswap/crypto'
import type { TransactionIntroductionV3 } from '@sawaswap/scn-client'
import { bytesToHex, hexToBytes, type Address, type Hex } from 'viem'
import type { TransactionMaterial } from './material'
import type { MomoCorridor, QuoteRecordWire } from './quoteRecord'

/**
 * The Console's local record of one origination — the minimum safe recovery of
 * the C01 scope (answers of 2 November 2026, Q4; PR54.F4 keeps it a C01 duty).
 *
 * It is written before anything leaves the browser and updated at every step,
 * so a reload resumes from where the last step finished:
 *
 *  - `PREPARED` — material built, keys verified, Consumer Context signed;
 *    nothing on chain.
 *  - `COMMIT_REQUESTED` — the wallet has been asked to commit. If the
 *    transaction hash came back it is here; if it did not, the commit may still
 *    have been sent, so the Console never commits again from this record and
 *    instead looks for its `momoLegHash` on chain.
 *  - `COMMITTED` — the STID is known. The sealed objects are written to the
 *    record before the first post, so every retry sends the same bytes and SCN
 *    answers `IDEMPOTENT` rather than `SLOT_OCCUPIED`.
 *  - `DELIVERED` — SCN acknowledged all three objects. The unsealed material
 *    and the sealed objects are deleted; a summary remains.
 *  - `ABANDONED` — nothing was escrowed (the commit was refused by the wallet
 *    or reverted). The material is deleted.
 *
 * The record holds unsealed Identity material until delivery. It lives in this
 * browser profile only: clearing the site data before both posts land loses it,
 * and the escrow then comes back through TW1 expiry and `expireTW2`.
 */
export type OriginationPhase =
  'PREPARED' | 'COMMIT_REQUESTED' | 'COMMITTED' | 'DELIVERED' | 'ABANDONED'

export interface OriginationLogEntry {
  /** Unix milliseconds. */
  at: number
  event: string
}

export interface OriginationRecord {
  version: 1
  id: string
  phase: OriginationPhase
  /** Unix milliseconds. */
  createdAt: number
  /** ADR 123n15h7v6d §5.2: the mode in use is recorded with the origination. */
  mode: KeyBindingMode
  chainId: number
  settlement: Address
  originator: Address
  ssid: string
  quoteRecord: QuoteRecordWire
  corridor: MomoCorridor
  escrowAmount: string
  momoAmount: string
  beneficiary: Address
  eligibleClaimant: Address
  momoLegHash: Hex
  stcn: string
  /** Unsealed material and the verified public keys; deleted on delivery. */
  secret?: {
    material: MaterialWire
    relayKey: Hex
    bridgeKey: Hex
    consumerContext: TransportedConsumerContextWire
  }
  commit?: { requestedAtBlock: string; txHash?: Hex }
  stid?: Hex
  sealed?: { preimage: string; payout: string; introduction: TransactionIntroductionV3 }
  posted: { preimage?: string; payout?: string; introduction?: string }
  log: OriginationLogEntry[]
}

export interface MaterialWire {
  publicFields: PublicFieldsWire
  operational: {
    countryCode: string
    mnoId: string
    receiverEndpointCommitment: Hex
    operationalBlindingInput: Hex
  }
  identity: {
    userCMomoEndpoint: string
    endpointSalt: Hex
    agentBMomoEndpoint: string
    userAAddress: string
    agentBAddress: string
    momoReference: string
    executionInstructions: string
    identityBlindingInput: Hex
  }
  identityHash: Hex
  momoLegHash: Hex
}

export function encodeMaterial(material: TransactionMaterial): MaterialWire {
  const { operational, identity } = material
  return {
    publicFields: encodePublicFields(material.publicFields),
    operational: {
      countryCode: operational.countryCode,
      mnoId: operational.mnoId,
      receiverEndpointCommitment: bytesToHex(operational.receiverEndpointCommitment),
      operationalBlindingInput: bytesToHex(operational.operationalBlindingInput),
    },
    identity: {
      userCMomoEndpoint: identity.userCMomoEndpoint,
      endpointSalt: bytesToHex(identity.endpointSalt),
      agentBMomoEndpoint: identity.agentBMomoEndpoint,
      userAAddress: identity.userAAddress,
      agentBAddress: identity.agentBAddress,
      momoReference: identity.momoReference,
      executionInstructions: identity.executionInstructions,
      identityBlindingInput: bytesToHex(identity.identityBlindingInput),
    },
    identityHash: material.identityHash,
    momoLegHash: material.momoLegHash,
  }
}

export function decodeMaterial(wire: MaterialWire): TransactionMaterial {
  const operational: OperationalDomainFields = {
    countryCode: wire.operational.countryCode,
    mnoId: wire.operational.mnoId,
    receiverEndpointCommitment: hexToBytes(wire.operational.receiverEndpointCommitment),
    operationalBlindingInput: hexToBytes(wire.operational.operationalBlindingInput),
  }
  const identity: IdentityDomainFields = {
    ...wire.identity,
    endpointSalt: hexToBytes(wire.identity.endpointSalt),
    identityBlindingInput: hexToBytes(wire.identity.identityBlindingInput),
  }
  return {
    publicFields: decodePublicFields(wire.publicFields),
    operational,
    identity,
    identityHash: wire.identityHash,
    momoLegHash: wire.momoLegHash,
  }
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                     */
/* -------------------------------------------------------------------------- */

export interface OriginationStore {
  list(): OriginationRecord[]
  get(id: string): OriginationRecord | undefined
  put(record: OriginationRecord): void
}

const RECORD_PREFIX = 'sawaswap.console.origination.v1:'

/**
 * Records in `localStorage`, one key each. A write that fails (quota, private
 * mode) throws, and the flow stops before the step that needed it: a step whose
 * record could not be written must not be taken.
 */
export function localOriginationStore(storage: Storage = window.localStorage): OriginationStore {
  return {
    list() {
      const records: OriginationRecord[] = []
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (key === null || !key.startsWith(RECORD_PREFIX)) continue
        const raw = storage.getItem(key)
        if (raw === null) continue
        try {
          records.push(JSON.parse(raw) as OriginationRecord)
        } catch {
          // An unreadable record is skipped from the list but never deleted.
        }
      }
      return records.sort((a, b) => b.createdAt - a.createdAt)
    },
    get(id) {
      const raw = storage.getItem(RECORD_PREFIX + id)
      return raw === null ? undefined : (JSON.parse(raw) as OriginationRecord)
    },
    put(record) {
      storage.setItem(RECORD_PREFIX + record.id, JSON.stringify(record))
    },
  }
}

/** An in-memory store, for tests. */
export function memoryOriginationStore(): OriginationStore {
  const records = new Map<string, string>()
  return {
    list: () =>
      [...records.values()]
        .map((raw) => JSON.parse(raw) as OriginationRecord)
        .sort((a, b) => b.createdAt - a.createdAt),
    get: (id) => {
      const raw = records.get(id)
      return raw === undefined ? undefined : (JSON.parse(raw) as OriginationRecord)
    },
    put: (record) => void records.set(record.id, JSON.stringify(record)),
  }
}

/** Phases in which the record still owns an unfinished transaction. */
export const isOpenPhase = (phase: OriginationPhase): boolean =>
  phase === 'PREPARED' || phase === 'COMMIT_REQUESTED' || phase === 'COMMITTED'
