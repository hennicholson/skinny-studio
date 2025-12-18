"use client"

import { cn } from "@/lib/utils"
import React, { useState, createContext, useContext, ReactNode, useEffect, useRef } from "react"
import { AnimatePresence, motion, useAnimation, PanInfo } from "framer-motion"
import { Menu, X } from "lucide-react"

interface Links {
  label: string
  href?: string
  icon: React.JSX.Element | React.ReactNode
  onClick?: () => void
  isActive?: boolean
  badge?: number | string
}

interface SidebarContextProps {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  animate: boolean
  variant: 'inline' | 'overlay'
}

const SidebarContext = createContext<SidebarContextProps | undefined>(undefined)

export const useSidebar = () => {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return context
}

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
  variant = 'inline',
}: {
  children: React.ReactNode
  open?: boolean
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>
  animate?: boolean
  variant?: 'inline' | 'overlay'
}) => {
  const [openState, setOpenState] = useState(false)

  const open = openProp !== undefined ? openProp : openState
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate, variant }}>
      {children}
    </SidebarContext.Provider>
  )
}

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
  variant = 'inline',
}: {
  children: React.ReactNode
  open?: boolean
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>
  animate?: boolean
  variant?: 'inline' | 'overlay'
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate} variant={variant}>
      {children}
    </SidebarProvider>
  )
}

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props as React.ComponentProps<"div">)} />
    </>
  )
}

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate, variant } = useSidebar()

  // Overlay variant - pull tab that slides in
  if (variant === 'overlay') {
    return (
      <div
        className="hidden md:block fixed left-0 top-0 h-full z-40"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        {/* Hover trigger zone - thin strip on the left edge */}
        <div className="absolute left-0 top-0 w-4 h-full z-50" />

        {/* Collapsed tab indicator */}
        <motion.div
          className={cn(
            "absolute left-2 top-1/2 -translate-y-1/2",
            "w-2 h-16 rounded-full",
            "bg-gradient-to-b from-skinny-yellow/60 to-skinny-green/60",
            "shadow-lg shadow-skinny-yellow/20",
            "transition-opacity duration-200",
            open ? "opacity-0" : "opacity-100"
          )}
        />

        {/* Expanded sidebar */}
        <motion.div
          className={cn(
            "h-full px-4 py-4 flex flex-col shrink-0",
            "bg-zinc-950/95 backdrop-blur-2xl",
            "border-r border-white/[0.06]",
            "shadow-2xl shadow-black/50",
            className
          )}
          initial={{ x: -260 }}
          animate={{
            x: open ? 0 : -260,
            width: 260,
          }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 35,
          }}
          {...props}
        >
          {children}
        </motion.div>
      </div>
    )
  }

  // Inline variant - collapsible sidebar (default for library)
  return (
    <motion.div
      className={cn(
        "h-full px-4 py-4 hidden md:flex md:flex-col shrink-0",
        "bg-zinc-950/80 backdrop-blur-2xl",
        "border-r border-white/[0.04]",
        className
      )}
      animate={{
        width: animate ? (open ? "260px" : "72px") : "260px",
      }}
      transition={{
        duration: 0.3,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export const MobileSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) => {
  const { open, setOpen } = useSidebar()
  const controls = useAnimation()
  const edgeSwipeRef = useRef<{ startX: number; startY: number } | null>(null)

  // Handle edge swipe to open sidebar
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      // Only track if touch starts within 20px of left edge
      if (touch.clientX < 20 && !open) {
        edgeSwipeRef.current = { startX: touch.clientX, startY: touch.clientY }
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!edgeSwipeRef.current || open) return
      const touch = e.touches[0]
      const diffX = touch.clientX - edgeSwipeRef.current.startX
      const diffY = Math.abs(touch.clientY - edgeSwipeRef.current.startY)

      // If horizontal swipe is > 50px and more horizontal than vertical
      if (diffX > 50 && diffX > diffY * 1.5) {
        setOpen(true)
        edgeSwipeRef.current = null
      }
    }

    const handleTouchEnd = () => {
      edgeSwipeRef.current = null
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [open, setOpen])

  // Handle swipe to close drawer
  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -50 || info.velocity.x < -500) {
      setOpen(false)
    } else {
      controls.start({ x: 0 })
    }
  }

  return (
    <>
      {/* Floating toggle button - positioned to the left of bottom nav */}
      <button
        type="button"
        onClick={() => {
          console.log('Sidebar button clicked, current open:', open)
          setOpen(!open)
        }}
        className={cn(
          "fixed z-[60] md:hidden",
          "w-10 h-10 flex items-center justify-center",
          "rounded-full bg-zinc-900/95 backdrop-blur-xl border border-white/10",
          "shadow-[0_4px_20px_rgba(0,0,0,0.3)]",
          "active:scale-95 transition-all",
          "bottom-3 left-4"
        )}
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Menu className="h-4 w-4 text-zinc-400" />
      </button>

      {/* Fullscreen overlay drawer */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99] md:hidden"
            />

            {/* Drawer with swipe-to-close */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 40,
              }}
              drag="x"
              dragConstraints={{ left: -280, right: 0 }}
              dragElastic={0.1}
              onDragEnd={handleDragEnd}
              className={cn(
                "fixed h-full w-[280px] max-w-[85vw] inset-y-0 left-0 bg-zinc-950 p-4 z-[100] flex flex-col justify-between md:hidden",
                "border-r border-white/[0.06]",
                "touch-pan-y",
                className
              )}
            >
              {/* Drag handle indicator */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 w-1 h-12 bg-zinc-700/50 rounded-full" />

              <button
                className="absolute right-3 top-3 z-50 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5 text-zinc-400" />
              </button>
              {children}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

export const SidebarLink = ({
  link,
  className,
  ...props
}: {
  link: Links
  className?: string
}) => {
  const { open, animate } = useSidebar()

  const handleClick = (e: React.MouseEvent) => {
    if (link.onClick) {
      e.preventDefault()
      link.onClick()
    }
  }

  const Wrapper = link.href ? 'a' : 'button'

  return (
    <Wrapper
      href={link.href}
      onClick={handleClick}
      className={cn(
        "flex items-center gap-3 group/sidebar py-2.5 px-3 rounded-xl transition-all duration-200",
        "hover:bg-white/[0.04]",
        link.isActive && "bg-white/[0.06]",
        !link.href && "w-full text-left",
        className
      )}
      {...props}
    >
      {/* Icon container */}
      <div className={cn(
        "flex items-center justify-center shrink-0 w-5 h-5 transition-colors",
        link.isActive ? "text-skinny-yellow" : "text-zinc-500 group-hover/sidebar:text-zinc-300"
      )}>
        {link.icon}
      </div>

      {/* Label with animation */}
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        transition={{ duration: 0.2, delay: open ? 0.1 : 0 }}
        className={cn(
          "text-[13px] font-medium whitespace-pre inline-block transition-all duration-200",
          "group-hover/sidebar:translate-x-0.5",
          link.isActive ? "text-white" : "text-zinc-400 group-hover/sidebar:text-zinc-200"
        )}
      >
        {link.label}
      </motion.span>

      {/* Badge */}
      {link.badge !== undefined && open && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "ml-auto text-[11px] font-medium tabular-nums px-1.5 py-0.5 rounded-md",
            link.isActive ? "text-zinc-300 bg-white/[0.08]" : "text-zinc-600"
          )}
        >
          {link.badge}
        </motion.span>
      )}

      {/* Active indicator */}
      {link.isActive && (
        <motion.div
          layoutId="activeSidebarIndicator"
          className="absolute left-0 w-[3px] h-5 bg-gradient-to-b from-skinny-yellow to-skinny-green rounded-full shadow-[0_0_8px_rgba(234,179,8,0.4)]"
          transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
        />
      )}
    </Wrapper>
  )
}

export const SidebarSection = ({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) => {
  const { open, animate } = useSidebar()

  return (
    <div className="mb-6">
      <motion.div
        className="flex items-center justify-between px-3 mb-2"
        animate={{
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        transition={{ duration: 0.2 }}
      >
        <span className="text-[11px] sm:text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
          {title}
        </span>
        {action}
      </motion.div>
      <div className="flex flex-col gap-1">
        {children}
      </div>
    </div>
  )
}

export const SidebarLogo = ({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
}) => {
  const { open, animate } = useSidebar()

  return (
    <div className="flex items-center gap-3 px-2 py-3 mb-4">
      <div className="shrink-0">
        {icon}
      </div>
      <motion.div
        animate={{
          display: animate ? (open ? "block" : "none") : "block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        transition={{ duration: 0.2, delay: open ? 0.1 : 0 }}
        className="overflow-hidden"
      >
        <p className="text-[14px] font-semibold text-white whitespace-nowrap">{title}</p>
        {subtitle && (
          <p className="text-[11px] text-zinc-500 whitespace-nowrap">{subtitle}</p>
        )}
      </motion.div>
    </div>
  )
}

export const SidebarUser = ({
  name,
  avatar,
  subtitle,
  onClick,
}: {
  name: string
  avatar?: string
  subtitle?: string
  onClick?: () => void
}) => {
  const { open, animate } = useSidebar()

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors w-full"
    >
      <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-skinny-yellow to-skinny-green flex items-center justify-center overflow-hidden">
        {avatar ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-[13px] font-semibold text-black">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <motion.div
        animate={{
          display: animate ? (open ? "block" : "none") : "block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        transition={{ duration: 0.2, delay: open ? 0.1 : 0 }}
        className="overflow-hidden text-left"
      >
        <p className="text-[13px] font-medium text-white whitespace-nowrap truncate">{name}</p>
        {subtitle && (
          <p className="text-[11px] text-zinc-500 whitespace-nowrap truncate">{subtitle}</p>
        )}
      </motion.div>
    </button>
  )
}
