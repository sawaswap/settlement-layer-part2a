import {
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  encodeOriginSignature,
  encodeTransportedConsumerContext,
  generateBoxKeypair,
  normaliseYParity,
  randomBoxNonce,
  recoverSigner,
  sealConsumerContext,
  signingDigest,
  type ConsumerContextEnvelope,
  type Eip712Domain,
  type TransportedConsumerContextWire,
} from '@sawaswap/crypto'
import { bytesToHex, hexToBytes, type Address, type Hex } from 'viem'
import { refuse } from './errors'

/**
 * The Consumer Context v0.7 (ADR 86cb4mgeh, SWP-ADR-002 v0.8 §2.3), signed by
 * the originator's own wallet. The key never reaches this code: the wallet
 * signs EIP-712 typed data (`eth_signTypedData_v4`), and the Console recovers
 * the signer from the digest `@sawaswap/crypto` computes before any gas is
 * spent. A wallet that hashed the typed data differently would fail that
 * recovery here, not on the handset.
 */

export const CONSUMER_CONTEXT_TYPES = {
  ConsumerContextEnvelope: [
    { name: 'momoLegHash', type: 'bytes32' },
    { name: 'recipientKeyId', type: 'bytes32' },
    { name: 'senderEphemeralPublicKey', type: 'bytes32' },
    { name: 'nonce', type: 'bytes24' },
    { name: 'ciphertextHash', type: 'bytes32' },
  ],
} as const

export interface ConsumerContextTypedData {
  domain: { name: string; version: string; chainId: bigint; verifyingContract: Address }
  types: typeof CONSUMER_CONTEXT_TYPES
  primaryType: 'ConsumerContextEnvelope'
  message: {
    momoLegHash: Hex
    recipientKeyId: Hex
    senderEphemeralPublicKey: Hex
    nonce: Hex
    ciphertextHash: Hex
  }
}

/** What the wallet is asked to sign — the same structure `signingDigest` hashes. */
export function consumerContextTypedData(
  domain: Eip712Domain,
  envelope: ConsumerContextEnvelope,
): ConsumerContextTypedData {
  return {
    domain: {
      name: EIP712_DOMAIN_NAME,
      version: EIP712_DOMAIN_VERSION,
      chainId: domain.chainId,
      verifyingContract: domain.verifyingContract,
    },
    types: CONSUMER_CONTEXT_TYPES,
    primaryType: 'ConsumerContextEnvelope',
    message: {
      momoLegHash: envelope.momoLegHash,
      recipientKeyId: envelope.recipientKeyId,
      senderEphemeralPublicKey: bytesToHex(envelope.senderEphemeralPublicKey),
      nonce: bytesToHex(envelope.nonce),
      ciphertextHash: envelope.ciphertextHash,
    },
  }
}

/**
 * A wallet signature in the transported form `r ‖ s ‖ yParity` (65 bytes,
 * recovery byte 0 or 1). Wallets return 27/28, which §2.3 requires the
 * producer to normalise; a 64-byte EIP-2098 compact signature is expanded,
 * never transported (Build Default 1).
 */
export function originSignatureFromWallet(signature: Hex): Uint8Array {
  const bytes = hexToBytes(signature)
  if (bytes.length === 65) {
    let yParity: 0 | 1
    try {
      yParity = normaliseYParity(bytes[64]!)
    } catch (cause) {
      return refuse('SIGNATURE_MISMATCH', `The wallet's signature: ${String(cause)}`)
    }
    return encodeOriginSignature({ r: bytes.slice(0, 32), s: bytes.slice(32, 64), yParity })
  }
  if (bytes.length === 64) {
    const yParityAndS = bytes.slice(32, 64)
    const yParity = ((yParityAndS[0]! & 0x80) === 0 ? 0 : 1) as 0 | 1
    const s = yParityAndS.slice()
    s[0] = s[0]! & 0x7f
    return encodeOriginSignature({ r: bytes.slice(0, 32), s, yParity })
  }
  return refuse(
    'SIGNATURE_MISMATCH',
    `The wallet returned a ${String(bytes.length)}-byte signature; only 65-byte and 64-byte compact forms are accepted.`,
  )
}

/**
 * Seal the Consumer Context to the SCA, have the wallet sign the envelope, and
 * recover the signer locally. A signer other than the originator stops the
 * origination before the commit: the SCA's check (7) would refuse it later,
 * after the escrow had moved.
 */
export async function sealAndSignConsumerContext(input: {
  momoLegHash: Hex
  endpointSalt: Uint8Array
  relayAddress: Address
  relayX25519PublicKey: Uint8Array
  scaX25519PublicKey: Uint8Array
  domain: Eip712Domain
  originator: Address
  signTypedData: (typedData: ConsumerContextTypedData) => Promise<Hex>
}): Promise<TransportedConsumerContextWire> {
  const { envelope, ciphertext } = sealConsumerContext({
    plaintext: {
      momoLegHash: input.momoLegHash,
      endpointSalt: input.endpointSalt,
      relayAddress: input.relayAddress,
      relayX25519PublicKey: input.relayX25519PublicKey,
    },
    scaX25519PublicKey: input.scaX25519PublicKey,
    senderEphemeral: generateBoxKeypair(),
    nonce: randomBoxNonce(),
  })
  const signature = await input.signTypedData(consumerContextTypedData(input.domain, envelope))
  const originSignature = originSignatureFromWallet(signature)
  let signer: string
  try {
    signer = recoverSigner(signingDigest(input.domain, envelope), originSignature)
  } catch (cause) {
    return refuse(
      'SIGNATURE_MISMATCH',
      `The wallet's signature cannot be recovered: ${String(cause)}`,
    )
  }
  if (signer.toLowerCase() !== input.originator.toLowerCase()) {
    refuse(
      'SIGNATURE_MISMATCH',
      `The Consumer Context signature recovers to ${signer}, not to the connected wallet ` +
        `${input.originator}. Nothing was committed.`,
    )
  }
  return encodeTransportedConsumerContext({
    ...envelope,
    originator: input.originator,
    ciphertext,
    originSignature,
  })
}
