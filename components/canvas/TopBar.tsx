'use client'

// Skinny Studio canvas top bar.
// Left:  back · SKINNY wordmark · inline title · "..." menu
// Right: last-saved · cost chip · share · user chip · balance chip
//        · Publish · Run all / Stop · comments · "..."

import Link from 'next/link'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  MoreHorizontal,
  Play,
  History,
  Keyboard,
  Loader2,
  Wallet,
  User as UserIcon,
  Pencil,
  LogOut,
  CircleUser,
  CreditCard,
} from 'lucide-react'
import { formatCents } from '@/lib/canvas/cost'
import { useUser } from '@/lib/context/user-context'

interface TopBarProps {
  title: string
  onTitleChange: (t: string) => void
  lastSavedAt?: Date | null
  saving: boolean
  running: boolean
  onRun: () => void
  onStop: () => void
  /** Open the canvas run history sheet. */
  onHistoryClick?: () => void
  /** Open the keyboard shortcuts overlay (also bound to "?"). */
  onShortcutsClick?: () => void
  /** Sign out — clears the local Whop dev token + bounces home. */
  onSignOut?: () => void
  estimatedCostCents: number
  /** Optional: number of nodes — when 0, Run becomes disabled w/ tooltip. */
  nodeCount?: number
  /** Number of gen-able nodes the user has marquee-selected. When ≥ 2 (or ≥ 1
   *  but < nodeCount), the run button auto-switches to "Run selected (N)". */
  selectedRunnableCount?: number
}

export function TopBar({
  title,
  onTitleChange,
  lastSavedAt,
  saving,
  running,
  onRun,
  onStop,
  onHistoryClick,
  onShortcutsClick,
  onSignOut,
  estimatedCostCents,
  nodeCount,
  selectedRunnableCount,
}: TopBarProps) {
  const { whop, balanceCents, balanceDollars, profile, isLoading } = useUser()
  const username = whop?.username || whop?.unique_id || null
  const lifetime = !!profile?.lifetime_access
  const lowBalance = !lifetime && balanceCents < 100
  const canRun = (nodeCount ?? 1) > 0
  // "Run selected" mode kicks in when the user has marquee-selected ≥ 2
  // runnable nodes (or just 1 — clicking the button still does the right
  // thing). We don't switch when the whole canvas is selected (count
  // === nodeCount); that's just "Run all" by another name.
  const selectedCount = selectedRunnableCount ?? 0
  const isSelectedMode = selectedCount >= 2 && selectedCount < (nodeCount ?? 0)

  return (
    <header className="relative z-30 h-14 px-3 sm:px-4 flex items-center gap-1.5 sm:gap-2 bg-zinc-950/85 backdrop-blur-md border-b border-white/[0.06] shrink-0">
      {/* === Left cluster === */}
      <Link
        href="/canvas"
        className="relative w-8 h-8 rounded-md flex items-center justify-center hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors shrink-0 after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] sm:after:inset-0"
        title="Back to canvases"
        aria-label="Back to canvases"
      >
        <ChevronLeft size={16} className="text-zinc-400" />
      </Link>

      {/* Skinny wordmark — small, brand-tinted. Hidden on the narrowest
          phones to keep the title prioritized; the BRAND lives in the
          back-link logic anyway. */}
      <Link
        href="/"
        className="hidden sm:flex items-center h-8 px-1.5 rounded-md hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors shrink-0"
        title="Skinny Studio home"
        aria-label="Skinny Studio home"
      >
        <Image
          src="/skinny-logo.svg"
          alt="Skinny Studio"
          width={64}
          height={19}
          priority
          className="h-3.5 w-auto opacity-90"
        />
      </Link>

      <span className="hidden sm:block h-4 w-px bg-white/[0.08] mx-0.5" />

      <InlineTitle title={title} onChange={onTitleChange} />

      {/* "Keyboard shortcuts" affordance next to the title — clearer than a
          generic "More" hamburger and pairs with the `?` key handler. Hidden
          on phones (the overflow menu surfaces it there). */}
      <Tooltip label="Keyboard shortcuts (?)">
        <button
          type="button"
          onClick={onShortcutsClick}
          className="hidden sm:flex w-8 h-8 rounded-md items-center justify-center hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors shrink-0"
          aria-label="Keyboard shortcuts"
        >
          <Keyboard size={13} />
        </button>
      </Tooltip>

      {/* === Right cluster === */}
      <div className="ml-auto flex items-center gap-1 shrink-0">
        <SaveStatus saving={saving} lastSavedAt={lastSavedAt} />

        {/* Cost chip — only on lg+ to keep the bar uncluttered on narrow Whop
            iframes. Mobile users see total cost in the PreRunCheck modal. */}
        {estimatedCostCents > 0 && (
          <div className="hidden lg:block">
            <CostChip cents={estimatedCostCents} nodeCount={nodeCount ?? 0} />
          </div>
        )}

        {/* User identity — only when authenticated. md+ only; mobile sees it in "..." */}
        {username && <UserMenu username={username} onSignOut={onSignOut} />}

        {/* Balance — clickable mini-pill, lime when funded, rose when low. */}
        {!isLoading && (
          <BalanceChip
            balanceDollars={balanceDollars}
            low={lowBalance}
            lifetime={lifetime}
          />
        )}

        <span className="hidden md:block h-4 w-px bg-white/[0.06] mx-0.5" />

        <IconBtn label="Run history" className="hidden md:flex" onClick={onHistoryClick}>
          <History size={13} />
        </IconBtn>

        {running ? (
          <motion.button
            type="button"
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            onClick={onStop}
            className="relative flex items-center gap-1.5 h-9 sm:h-8 px-3 sm:px-3 rounded-md bg-rose-500/15 ring-1 ring-rose-500/30 hover:bg-rose-500/25 text-xs font-medium text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 transition-colors"
            aria-label="Stop run"
          >
            <span className="relative flex w-2 h-2" aria-hidden>
              <span className="absolute inset-0 rounded-sm bg-rose-400/60 animate-ping" />
              <span className="relative w-2 h-2 rounded-sm bg-rose-400" />
            </span>
            <span className="hidden sm:inline">Stop</span>
          </motion.button>
        ) : (
          <Tooltip
            label={
              canRun
                ? isSelectedMode
                  ? `Run only the ${selectedCount} selected node${selectedCount === 1 ? '' : 's'} (⌘↵)`
                  : ''
                : 'Add a node to run'
            }
            side="bottom"
          >
            <motion.button
              type="button"
              whileHover={canRun ? { scale: 1.02 } : undefined}
              whileTap={canRun ? { scale: 0.98 } : undefined}
              onClick={canRun ? onRun : undefined}
              disabled={!canRun}
              aria-disabled={!canRun}
              aria-label={
                canRun
                  ? isSelectedMode
                    ? `Run ${selectedCount} selected nodes`
                    : 'Run all nodes'
                  : 'Run all nodes (add a node first)'
              }
              className={`flex items-center gap-1.5 h-9 sm:h-8 px-3 rounded-md text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 transition-colors ${
                canRun
                  ? isSelectedMode
                    ? 'bg-skinny-yellow/15 ring-1 ring-skinny-yellow/40 text-skinny-yellow hover:bg-skinny-yellow/25'
                    : 'bg-white text-zinc-900 hover:bg-zinc-100'
                  : 'bg-white/[0.06] text-zinc-500 ring-1 ring-white/[0.06] cursor-not-allowed opacity-60'
              }`}
            >
              <Play
                size={11}
                fill="currentColor"
                className={
                  canRun
                    ? isSelectedMode
                      ? 'text-skinny-yellow'
                      : 'text-skinny-green'
                    : 'text-zinc-600'
                }
                aria-hidden
              />
              {isSelectedMode ? (
                <>
                  <span className="hidden sm:inline">Run selected ({selectedCount})</span>
                  <span className="sm:hidden">Run ({selectedCount})</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">Run all</span>
                  <span className="sm:hidden">Run</span>
                </>
              )}
            </motion.button>
          </Tooltip>
        )}

        <OverflowMenu
          onHistoryClick={onHistoryClick}
          onShortcutsClick={onShortcutsClick}
          mobile={{
            cost: estimatedCostCents,
            nodeCount: nodeCount ?? 0,
            username,
            balanceDollars,
            lowBalance,
            lifetime,
            isLoading,
          }}
        />
      </div>
    </header>
  )
}

/* ───────────────────────── Inline title ───────────────────────── */

function InlineTitle({ title, onChange }: { title: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const [width, setWidth] = useState(120)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  useLayoutEffect(() => {
    if (measureRef.current) {
      const w = measureRef.current.offsetWidth
      // Cap title width so a long title can't push the right cluster off-screen
      // on Whop's narrow iframe widths. Was 360px → 220px.
      setWidth(Math.min(Math.max(w + 12, 80), 220))
    }
  }, [title])

  return (
    <div
      className="relative flex items-center min-w-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          // Enter commits + blurs (lets users feel the save land). Esc reverts focus.
          if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        placeholder="Untitled"
        aria-label="Canvas title"
        spellCheck={false}
        style={{ width }}
        // 16px on mobile prevents iOS Safari zoom-on-focus.
        className={`peer bg-transparent text-base sm:text-sm font-medium text-zinc-100 placeholder-zinc-600 pl-2 pr-6 py-1 rounded transition-colors min-w-0 focus:outline-none ${
          focused ? 'bg-white/[0.05]' : hovered ? 'bg-white/[0.03]' : ''
        }`}
      />
      {/* Hidden measurer mirroring input style for auto-grow width. Keep in
          sync with the input className above (incl. responsive text size). */}
      <span
        ref={measureRef}
        aria-hidden
        className="invisible absolute left-0 top-0 whitespace-pre text-base sm:text-sm font-medium px-2 py-1"
      >
        {title || 'Untitled'}
      </span>
      {/* Lime underline on focus — animated. */}
      <span
        className={`pointer-events-none absolute left-2 right-6 bottom-0.5 h-px origin-left bg-skinny-yellow/70 transition-transform duration-200 ${
          focused ? 'scale-x-100' : 'scale-x-0'
        }`}
      />
      {/* Pencil affordance on hover (hidden when focused). */}
      <Pencil
        size={11}
        className={`pointer-events-none absolute right-1.5 text-zinc-500 transition-opacity ${
          hovered && !focused ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  )
}

/* ───────────────────────── Cost chip + tooltip ───────────────────────── */

function CostChip({ cents, nodeCount }: { cents: number; nodeCount: number }) {
  return (
    <Tooltip
      label={`${nodeCount} ${nodeCount === 1 ? 'node' : 'nodes'} · est ${formatCents(cents)} total`}
    >
      <div className="hidden sm:flex items-center h-8 px-2 rounded-md text-[11px] font-mono text-zinc-400 bg-white/[0.03] ring-1 ring-white/[0.04] hover:ring-white/[0.10] transition-colors">
        ~{formatCents(cents)}
      </div>
    </Tooltip>
  )
}

/* ───────────────────────── Balance chip ───────────────────────── */

function BalanceChip({
  balanceDollars,
  low,
  lifetime,
}: {
  balanceDollars: string
  low: boolean
  lifetime: boolean
}) {
  const tip = lifetime
    ? 'Lifetime access'
    : low
    ? 'Top up to keep generating'
    : `Balance: $${balanceDollars}`
  return (
    <Tooltip label={tip}>
      <a
        href="/?settings=balance"
        aria-label={lifetime ? 'Lifetime access' : `Balance $${balanceDollars}. Click to top up.`}
        className={`hidden sm:flex items-center h-8 px-2 gap-1.5 rounded-md text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-all ${
          low
            ? 'bg-rose-500/10 ring-1 ring-rose-500/30 text-rose-200 hover:bg-rose-500/15'
            : 'bg-white/[0.03] ring-1 ring-white/[0.04] text-zinc-300 hover:ring-skinny-yellow/30 hover:bg-white/[0.05] hover:text-zinc-100'
        }`}
      >
        <Wallet size={11} className={low ? 'text-rose-300' : 'text-skinny-yellow'} aria-hidden />
        <span className="font-mono">${balanceDollars}</span>
      </a>
    </Tooltip>
  )
}

/* ───────────────────────── User menu ───────────────────────── */

function UserMenu({ username, onSignOut }: { username: string; onSignOut?: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative hidden md:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Signed in as ${username}`}
        className={`flex items-center h-8 px-2 gap-1.5 rounded-md bg-white/[0.03] ring-1 ring-white/[0.04] hover:bg-white/[0.06] hover:ring-white/[0.10] text-zinc-300 hover:text-zinc-100 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-all ${
          open ? 'ring-skinny-yellow/30 bg-white/[0.06]' : ''
        }`}
      >
        <UserIcon size={11} className="text-zinc-500" aria-hidden />
        <span className="font-medium truncate max-w-[100px]">{username}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-9 w-44 rounded-lg bg-zinc-950/95 backdrop-blur-md ring-1 ring-white/[0.08] shadow-2xl py-1 z-50"
          >
            <MenuItem icon={CircleUser} href="/?settings=profile">
              Profile
            </MenuItem>
            <MenuItem icon={CreditCard} href="/?settings=balance">
              Balance
            </MenuItem>
            <div className="h-px bg-white/[0.06] my-1" />
            <MenuItem
              icon={LogOut}
              onClick={() => {
                setOpen(false)
                onSignOut?.()
              }}
            >
              Sign out
            </MenuItem>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MenuItem({
  icon: Icon,
  children,
  href,
  onClick,
}: {
  icon: any
  children: React.ReactNode
  href?: string
  onClick?: () => void
}) {
  const cls =
    'flex items-center gap-2 px-3 h-8 text-[12px] text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:outline-none focus-visible:bg-white/[0.06] focus-visible:text-zinc-100 transition-colors'
  if (href) {
    return (
      <a href={href} className={cls} role="menuitem">
        <Icon size={12} className="text-zinc-500" aria-hidden />
        {children}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={`${cls} w-full text-left`} role="menuitem">
      <Icon size={12} className="text-zinc-500" aria-hidden />
      {children}
    </button>
  )
}

/* ───────────────────────── Save status ───────────────────────── */

function SaveStatus({ saving, lastSavedAt }: { saving: boolean; lastSavedAt?: Date | null }) {
  if (saving) {
    return (
      <span className="hidden lg:flex items-center gap-1.5 text-[11px] text-zinc-500 px-2">
        <span className="relative flex w-1.5 h-1.5">
          <span className="absolute inset-0 rounded-full bg-amber-400/50 animate-ping" />
          <span className="relative w-1.5 h-1.5 rounded-full bg-amber-400" />
        </span>
        <Loader2 size={10} className="animate-spin" />
        Saving…
      </span>
    )
  }
  if (lastSavedAt) {
    return (
      <span className="hidden lg:flex items-center gap-1.5 text-[11px] text-zinc-500 px-2">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
        Saved {relativeTime(lastSavedAt)}
      </span>
    )
  }
  return null
}

/* ───────────────────────── Overflow / mobile menu ───────────────────────── */

function OverflowMenu({
  mobile,
  onHistoryClick,
  onShortcutsClick,
}: {
  mobile: {
    cost: number
    nodeCount: number
    username: string | null
    balanceDollars: string
    lowBalance: boolean
    lifetime: boolean
    isLoading: boolean
  }
  onHistoryClick?: () => void
  onShortcutsClick?: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] sm:after:inset-0"
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        title="More"
      >
        <MoreHorizontal size={13} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-9 w-52 rounded-lg bg-zinc-950/95 backdrop-blur-md ring-1 ring-white/[0.08] shadow-2xl py-1 z-50"
          >
            {/* Mobile-only: surface chips here when collapsed off the bar. */}
            <div className="md:hidden">
              {mobile.cost > 0 && (
                <div className="flex items-center justify-between px-3 h-8 text-[12px] text-zinc-400">
                  <span>Est. cost</span>
                  <span className="font-mono text-zinc-300">~{formatCents(mobile.cost)}</span>
                </div>
              )}
              {!mobile.isLoading && (
                <a
                  href="/?settings=balance"
                  className="flex items-center justify-between px-3 h-8 text-[12px] hover:bg-white/[0.06] transition-colors"
                  role="menuitem"
                >
                  <span className="text-zinc-400">Balance</span>
                  <span
                    className={`font-mono ${
                      mobile.lowBalance ? 'text-rose-300' : 'text-zinc-300'
                    }`}
                  >
                    ${mobile.balanceDollars}
                  </span>
                </a>
              )}
              {mobile.username && (
                <div className="flex items-center justify-between px-3 h-8 text-[12px] text-zinc-400">
                  <span>Signed in</span>
                  <span className="text-zinc-300 truncate max-w-[110px]">{mobile.username}</span>
                </div>
              )}
              <div className="h-px bg-white/[0.06] my-1" />
            </div>
            <MenuItem
              icon={History}
              onClick={() => {
                setOpen(false)
                onHistoryClick?.()
              }}
            >
              Run history
            </MenuItem>
            <MenuItem
              icon={Keyboard}
              onClick={() => {
                setOpen(false)
                onShortcutsClick?.()
              }}
            >
              Keyboard shortcuts
            </MenuItem>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ───────────────────────── Icon button + tooltip ───────────────────────── */

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  className = '',
}: {
  children: React.ReactNode
  label: string
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors ${className}`}
        aria-label={label}
      >
        {children}
      </button>
    </Tooltip>
  )
}

function Tooltip({
  label,
  children,
  side = 'bottom',
}: {
  label: string
  children: React.ReactNode
  side?: 'bottom' | 'top'
}) {
  const [show, setShow] = useState(false)
  if (!label) return <>{children}</>
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.span
            initial={{ opacity: 0, y: side === 'bottom' ? -2 : 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            role="tooltip"
            className={`pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded-md bg-zinc-900 ring-1 ring-white/[0.08] text-[11px] text-zinc-200 shadow-lg z-50 ${
              side === 'bottom' ? 'top-[calc(100%+6px)]' : 'bottom-[calc(100%+6px)]'
            }`}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 10) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return d.toLocaleDateString()
}
