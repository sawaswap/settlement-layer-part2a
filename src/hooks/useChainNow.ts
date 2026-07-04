import { useEffect, useRef, useState } from 'react'
import { useBlock } from 'wagmi'

/**
 * Current chain time in unix seconds, ticking once per second for a smooth
 * countdown (Agreement C.2 — "live countdown based on block.timestamp").
 * Seeds from the latest block's timestamp and advances locally between blocks,
 * re-syncing whenever a new block arrives.
 */
export function useChainNow(): number {
  const { data: block } = useBlock({ watch: true })
  const base = useRef<{ chainTs: number; wallMs: number } | null>(null)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    if (block?.timestamp != null) {
      base.current = { chainTs: Number(block.timestamp), wallMs: Date.now() }
    }
  }, [block?.timestamp])

  useEffect(() => {
    const id = setInterval(() => {
      if (base.current) {
        const elapsed = Math.floor((Date.now() - base.current.wallMs) / 1000)
        setNow(base.current.chainTs + elapsed)
      } else {
        setNow(Math.floor(Date.now() / 1000))
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return now
}
