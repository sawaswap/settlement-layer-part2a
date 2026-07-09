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

  // Screen 3 test-harness control that presets the MockDRP outcome so both DRP
  // terminals (DRP-Settled / DRP-Reversed) are reachable browser-only, without a
  // CLI. MockDRP is explicitly "not a production DRP"; the control is isolated
  // and disappears with it. Set 'false' to hide it (e.g. if outcomes are preset
  // out-of-band) — pending Francis's steer (20260708 clarification, point c).
  VITE_ENABLE_DRP_HARNESS: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),

  // Lower bound for Screen 4's transaction discovery (no-backend SPA, so the
  // dashboard pages PoICommitted logs client-side). Defaults to the deployment
  // block of the default Settlement instance (0x9645…8331 on Base Sepolia) so
  // history is complete; point at a later block to narrow the scan when the
  // Console targets a different instance or you only need recent activity.
  VITE_INDEX_FROM_BLOCK: z.coerce.number().int().nonnegative().default(42110394),
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
