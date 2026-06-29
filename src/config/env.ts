import { z } from 'zod'

/**
 * Environment schema. Parsed and validated once at module load so a
 * misconfiguration fails loudly at startup rather than as a runtime surprise
 * deep inside a contract call. Every value is browser-public (no-backend SPA,
 * Agreement C.5.f) — this is configuration, not secrets.
 */
const address = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 20-byte 0x address')

const schema = z.object({
  VITE_APP_NAME: z.string().min(1).default('SawaSwap Operator Console'),

  VITE_CHAIN_ID: z.coerce.number().int().positive().default(84532),
  VITE_CHAIN_NAME: z.string().min(1).default('Base Sepolia'),
  VITE_RPC_URL: z.string().url().default('https://sepolia.base.org'),
  VITE_EXPLORER_URL: z.string().url().default('https://sepolia.basescan.org'),
  VITE_EXPLORER_NAME: z.string().min(1).default('Basescan'),
  VITE_NATIVE_SYMBOL: z.string().min(1).default('ETH'),

  VITE_SETTLEMENT_ADDRESS: address,
  VITE_MOCKDRP_ADDRESS: address,

  VITE_USDC_ADDRESS: address,
  VITE_USDC_SYMBOL: z.string().min(1).default('USDC'),
  VITE_USDC_DECIMALS: z.coerce.number().int().nonnegative().default(6),

  VITE_WALLETCONNECT_PROJECT_ID: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
})

const parsed = schema.safeParse(import.meta.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
    .join('\n')
  throw new Error(
    `Invalid environment configuration:\n${issues}\n\nCheck your .env against .env.example.`,
  )
}

export const env = parsed.data
