import {
  decodeTransportedConsumerContext,
  generateBoxKeypair,
  randomBoxNonce,
  sealConsumerContext,
  signingDigest,
  verifyConsumerContext,
} from '@sawaswap/crypto'
import {
  hashTypedData,
  parseSignature,
  serializeCompactSignature,
  signatureToCompactSignature,
  type Hex,
} from 'viem'
import { describe, expect, it } from 'vitest'
import {
  consumerContextTypedData,
  originSignatureFromWallet,
  sealAndSignConsumerContext,
} from './consumerContext'
import { OriginationRefusal } from './errors'
import { CHAIN_ID, ORIGINATOR, RELAY, SCA, SETTLEMENT } from './testing'

const domain = { chainId: BigInt(CHAIN_ID), verifyingContract: SETTLEMENT }
const MOMO_LEG_HASH = `0x${'5a'.repeat(32)}` as Hex
const SALT = new Uint8Array(32).fill(7)

function envelope() {
  return sealConsumerContext({
    plaintext: {
      momoLegHash: MOMO_LEG_HASH,
      endpointSalt: SALT,
      relayAddress: RELAY.address,
      relayX25519PublicKey: RELAY.box.publicKey,
    },
    scaX25519PublicKey: SCA.box.publicKey,
    senderEphemeral: generateBoxKeypair(),
    nonce: randomBoxNonce(),
  }).envelope
}

describe('Consumer Context typed data', () => {
  it("the wallet's EIP-712 digest is the one @sawaswap/crypto signs and the SCA recovers against", () => {
    const sealed = envelope()
    const typedData = consumerContextTypedData(domain, sealed)
    expect(hashTypedData(typedData)).toBe(signingDigest(domain, sealed))
  })

  it('a change to any envelope field changes the digest the wallet signs', () => {
    const sealed = envelope()
    const base = hashTypedData(consumerContextTypedData(domain, sealed))
    const nonce = sealed.nonce.slice()
    nonce[23] = nonce[23]! ^ 1
    expect(hashTypedData(consumerContextTypedData(domain, { ...sealed, nonce }))).not.toBe(base)
    expect(hashTypedData(consumerContextTypedData({ ...domain, chainId: 8453n }, sealed))).not.toBe(
      base,
    )
  })
})

describe('wallet signature → transported originSignature', () => {
  it('normalises 27/28 to yParity and expands an EIP-2098 compact signature to the same 65 bytes', async () => {
    const sealed = envelope()
    const signature = await ORIGINATOR.account.signTypedData(
      consumerContextTypedData(domain, sealed),
    )
    const { v } = parseSignature(signature)
    expect([27n, 28n]).toContain(v)
    const full = originSignatureFromWallet(signature)
    expect(full).toHaveLength(65)
    expect([0, 1]).toContain(full[64])
    const compact = serializeCompactSignature(
      signatureToCompactSignature(parseSignature(signature)),
    )
    expect(originSignatureFromWallet(compact)).toEqual(full)
  })

  it('refuses any other length', () => {
    expect(() => originSignatureFromWallet(`0x${'11'.repeat(66)}`)).toThrow(OriginationRefusal)
  })
})

describe('sealAndSignConsumerContext', () => {
  const sign = (account = ORIGINATOR.account) => ({
    momoLegHash: MOMO_LEG_HASH,
    endpointSalt: SALT,
    relayAddress: RELAY.address,
    relayX25519PublicKey: RELAY.box.publicKey,
    scaX25519PublicKey: SCA.box.publicKey,
    domain,
    originator: ORIGINATOR.address,
    signTypedData: (typedData: Parameters<typeof account.signTypedData>[0]) =>
      account.signTypedData(typedData),
  })

  it('produces a Consumer Context the SCA accepts on all seven checks', async () => {
    const wire = await sealAndSignConsumerContext(sign())
    const verdict = verifyConsumerContext({
      transported: decodeTransportedConsumerContext({ ...wire }),
      domain,
      sca: SCA.box,
    })
    expect(verdict.accepted).toBe(true)
    if (verdict.accepted) {
      expect(verdict.plaintext.endpointSalt).toEqual(SALT)
      expect(verdict.plaintext.relayAddress.toLowerCase()).toBe(RELAY.address.toLowerCase())
      expect(verdict.originator.toLowerCase()).toBe(ORIGINATOR.address.toLowerCase())
    }
  })

  it('refuses before any gas when the wallet signs as another account', async () => {
    await expect(sealAndSignConsumerContext(sign(RELAY.account))).rejects.toMatchObject({
      code: 'SIGNATURE_MISMATCH',
    })
  })
})
