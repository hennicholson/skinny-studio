'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Play, Edit2, Trash2, GitBranch, MoreVertical } from 'lucide-react'
import { Workflow } from '@/lib/mock-data'
import { useState } from 'react'

interface WorkflowCardProps {
  workflow: Workflow
  onRun?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
}

export function WorkflowCard({ workflow, onRun, onEdit, onDelete }: WorkflowCardProps) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      className={cn(
        "relative overflow-hidden rounded-2xl p-5",
        "bg-zinc-900 border-2 border-zinc-800",
        "transition-all duration-300",
        "hover:border-skinny-yellow/50",
        "hover:shadow-[0_0_30px_rgba(214,252,81,0.1)]"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-skinny-yellow/10 border border-skinny-yellow/30">
            <GitBranch size={20} className="text-skinny-yellow" />
          </div>
          <div>
            <h3 className="font-bold text-white text-sm">{workflow.name}</h3>
            <p className="text-xs text-zinc-500">{workflow.steps.length} steps</p>
          </div>
        </div>

        {/* Menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <MoreVertical size={16} className="text-zinc-500" />
          </button>

          {showMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute right-0 top-full mt-1 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden z-10 min-w-[140px]"
            >
              <button
                onClick={() => {
                  onEdit?.(workflow.id)
                  setShowMenu(false)
                }}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left hover:bg-zinc-700 transition-colors"
              >
                <Edit2 size={14} />
                Edit
              </button>
              <button
                onClick={() => {
                  onDelete?.(workflow.id)
                  setShowMenu(false)
                }}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left text-red-400 hover:bg-zinc-700 transition-colors"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </motion.div>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-zinc-400 mb-4 line-clamp-2">
        {workflow.description}
      </p>

      {/* Steps Preview */}
      <div className="flex items-center gap-2 mb-4">
        {workflow.steps.slice(0, 3).map((step, index) => (
          <div
            key={step.id}
            className="flex items-center"
          >
            <span className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold">
              {index + 1}
            </span>
            {index < Math.min(workflow.steps.length - 1, 2) && (
              <div className="w-4 h-0.5 bg-zinc-700" />
            )}
          </div>
        ))}
        {workflow.steps.length > 3 && (
          <span className="text-xs text-zinc-500">+{workflow.steps.length - 3} more</span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span>{workflow.runCount} runs</span>
          <span>
            {workflow.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>

        <motion.button
          onClick={() => onRun?.(workflow.id)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-skinny-yellow text-black text-xs font-bold uppercase hover:bg-skinny-green transition-colors"
        >
          <Play size={14} />
          Run
        </motion.button>
      </div>
    </motion.div>
  )
}
