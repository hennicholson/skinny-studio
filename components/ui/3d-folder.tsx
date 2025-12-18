"use client"

import { useState, useRef, forwardRef } from "react"
import { cn } from "@/lib/utils"
import { X, ChevronLeft, ChevronRight } from "lucide-react"

interface Project {
  id: string
  image: string
  title: string
}

interface AnimatedFolderProps {
  title: string
  projects: Project[]
  className?: string
  onClick?: () => void
  isActive?: boolean
}

export function AnimatedFolder({ title, projects, className, onClick, isActive }: AnimatedFolderProps) {
  const [isHovered, setIsHovered] = useState(false)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center",
        "p-4 rounded-xl cursor-pointer",
        "bg-zinc-900/50 border border-white/[0.06]",
        "transition-all duration-500 ease-out",
        "hover:shadow-xl hover:shadow-skinny-yellow/5",
        "hover:border-skinny-yellow/20",
        isActive && "border-skinny-yellow/40 bg-skinny-yellow/5",
        "group",
        className,
      )}
      style={{
        minWidth: "140px",
        minHeight: "160px",
        perspective: "1000px",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      {/* Subtle background glow on hover */}
      <div
        className="absolute inset-0 rounded-xl transition-opacity duration-500 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 70%, var(--skinny-yellow) 0%, transparent 70%)",
          opacity: isHovered ? 0.08 : 0,
        }}
      />

      <div className="relative flex items-center justify-center mb-2" style={{ height: "80px", width: "100px" }}>
        {/* Folder back layer */}
        <div
          className="absolute w-16 h-12 rounded-lg"
          style={{
            background: "linear-gradient(135deg, #8B7500 0%, #6B5A00 100%)",
            transformOrigin: "bottom center",
            transform: isHovered ? "rotateX(-15deg)" : "rotateX(0deg)",
            transition: "transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            zIndex: 10,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
        />

        {/* Folder tab */}
        <div
          className="absolute w-6 h-2 rounded-t-md"
          style={{
            background: "#7A6800",
            top: "calc(50% - 24px - 6px)",
            left: "calc(50% - 32px + 8px)",
            transformOrigin: "bottom center",
            transform: isHovered ? "rotateX(-25deg) translateY(-2px)" : "rotateX(0deg)",
            transition: "transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            zIndex: 10,
          }}
        />

        {/* Project cards preview */}
        <div
          className="absolute"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 20,
          }}
        >
          {projects.slice(0, 3).map((project, index) => (
            <ProjectCardPreview
              key={project.id}
              ref={(el) => {
                cardRefs.current[index] = el
              }}
              image={project.image}
              title={project.title}
              delay={index * 60}
              isVisible={isHovered}
              index={index}
            />
          ))}
        </div>

        {/* Folder front layer */}
        <div
          className="absolute w-16 h-12 rounded-lg"
          style={{
            background: "linear-gradient(135deg, #D6FC51 0%, #A8C940 100%)",
            top: "calc(50% - 24px + 2px)",
            transformOrigin: "bottom center",
            transform: isHovered ? "rotateX(25deg) translateY(4px)" : "rotateX(0deg)",
            transition: "transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            zIndex: 30,
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          }}
        />

        {/* Folder shine effect */}
        <div
          className="absolute w-16 h-12 rounded-lg overflow-hidden pointer-events-none"
          style={{
            top: "calc(50% - 24px + 2px)",
            background: "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%)",
            transformOrigin: "bottom center",
            transform: isHovered ? "rotateX(25deg) translateY(4px)" : "rotateX(0deg)",
            transition: "transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            zIndex: 31,
          }}
        />
      </div>

      {/* Folder title */}
      <h3
        className={cn(
          "text-sm font-semibold mt-2 transition-all duration-300 truncate max-w-full px-2",
          isActive ? "text-skinny-yellow" : "text-white"
        )}
        style={{
          transform: isHovered ? "translateY(2px)" : "translateY(0)",
        }}
      >
        {title}
      </h3>

      {/* Project count */}
      <p
        className="text-xs text-zinc-500 transition-all duration-300"
        style={{
          opacity: isHovered ? 0.7 : 1,
        }}
      >
        {projects.length} items
      </p>

      {/* Active indicator */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 bg-gradient-to-b from-skinny-yellow to-skinny-green rounded-full" />
      )}
    </div>
  )
}

// Simplified preview card for folder hover
const ProjectCardPreview = forwardRef<HTMLDivElement, {
  image: string
  title: string
  delay: number
  isVisible: boolean
  index: number
}>(({ image, title, delay, isVisible, index }, ref) => {
  const rotations = [-8, 0, 8]
  const translations = [-28, 0, 28]

  return (
    <div
      ref={ref}
      className={cn(
        "absolute w-10 h-14 rounded-md overflow-hidden shadow-lg",
        "bg-zinc-800 border border-white/10",
      )}
      style={{
        transform: isVisible
          ? `translateY(-45px) translateX(${translations[index]}px) rotate(${rotations[index]}deg) scale(1)`
          : "translateY(0px) translateX(0px) rotate(0deg) scale(0.5)",
        opacity: isVisible ? 1 : 0,
        transition: `all 500ms cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms`,
        zIndex: 10 - index,
        left: "-20px",
        top: "-28px",
      }}
    >
      <img src={image || "/placeholder.svg"} alt={title} className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
    </div>
  )
})

ProjectCardPreview.displayName = "ProjectCardPreview"

// Compact folder item for sidebar (simpler version)
interface CompactFolderProps {
  title: string
  count: number
  isActive?: boolean
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  isDragOver?: boolean
  className?: string
}

export function CompactFolder({
  title,
  count,
  isActive,
  onClick,
  onContextMenu,
  isDragOver,
  className
}: CompactFolderProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <button
      className={cn(
        "relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl",
        "transition-all duration-200",
        "hover:bg-white/[0.04]",
        isActive && "bg-white/[0.06]",
        isDragOver && "bg-skinny-yellow/10 ring-1 ring-skinny-yellow/40",
        className
      )}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Mini 3D folder icon */}
      <div
        className="relative w-8 h-8 flex-shrink-0"
        style={{ perspective: "200px" }}
      >
        {/* Back */}
        <div
          className="absolute inset-0 rounded-md"
          style={{
            background: "linear-gradient(135deg, #8B7500 0%, #6B5A00 100%)",
            transform: isHovered ? "rotateX(-10deg) scale(0.9)" : "rotateX(0deg) scale(0.9)",
            transformOrigin: "bottom center",
            transition: "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />
        {/* Front */}
        <div
          className="absolute inset-0 rounded-md"
          style={{
            background: isActive
              ? "linear-gradient(135deg, #D6FC51 0%, #B8FF00 100%)"
              : "linear-gradient(135deg, #D6FC51 0%, #A8C940 100%)",
            transform: isHovered ? "rotateX(15deg) translateY(2px) scale(0.95)" : "rotateX(0deg) scale(0.95)",
            transformOrigin: "bottom center",
            transition: "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            boxShadow: isActive ? "0 0 12px rgba(214, 252, 81, 0.3)" : "0 2px 6px rgba(0,0,0,0.2)",
          }}
        />
        {/* Shine */}
        <div
          className="absolute inset-0 rounded-md overflow-hidden pointer-events-none"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 50%)",
            transform: isHovered ? "rotateX(15deg) translateY(2px) scale(0.95)" : "rotateX(0deg) scale(0.95)",
            transformOrigin: "bottom center",
            transition: "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />
      </div>

      {/* Label */}
      <span className={cn(
        "flex-1 text-[13px] font-medium truncate text-left transition-colors duration-200",
        isActive ? "text-white" : "text-zinc-400 group-hover:text-zinc-200",
        isDragOver && "text-skinny-yellow"
      )}>
        {title}
      </span>

      {/* Count badge */}
      {count > 0 && (
        <span className={cn(
          "text-[11px] font-medium tabular-nums px-1.5 py-0.5 rounded-md",
          isActive ? "text-zinc-300 bg-white/[0.08]" : "text-zinc-600"
        )}>
          {count}
        </span>
      )}

      {/* Active indicator */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-gradient-to-b from-skinny-yellow to-skinny-green rounded-full shadow-[0_0_8px_rgba(214,252,81,0.4)]" />
      )}
    </button>
  )
}
