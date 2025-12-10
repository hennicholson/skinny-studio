'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Plus, GitBranch } from 'lucide-react'
import { Workflow } from '@/lib/mock-data'
import { WorkflowCard } from './workflow-card'

interface WorkflowViewProps {
  workflows: Workflow[]
  onCreateNew?: () => void
  onRun?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
}

export function WorkflowView({
  workflows,
  onCreateNew,
  onRun,
  onEdit,
  onDelete
}: WorkflowViewProps) {
  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Workflows</h2>
            <p className="text-sm text-zinc-500 mt-1">Chain multiple models together</p>
          </div>

          <motion.button
            onClick={onCreateNew}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-skinny-yellow text-black text-sm font-bold uppercase hover:bg-skinny-green transition-colors focus:outline-none focus:ring-2 focus:ring-skinny-yellow/50 focus:ring-offset-2 focus:ring-offset-black"
            aria-label="Create a new workflow"
          >
            <Plus size={18} aria-hidden="true" />
            New Workflow
          </motion.button>
        </div>

        {/* Workflows List */}
        {workflows.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workflows.map((workflow) => (
              <WorkflowCard
                key={workflow.id}
                workflow={workflow}
                onRun={onRun}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-20 h-20 rounded-2xl bg-zinc-900 border-2 border-zinc-800 flex items-center justify-center mb-6">
              <GitBranch size={32} className="text-zinc-600" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No workflows yet</h3>
            <p className="text-zinc-500 mb-6 max-w-md">
              Create your first workflow to chain multiple AI models together for complex creative tasks.
            </p>
            <motion.button
              onClick={onCreateNew}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-skinny-yellow text-black font-bold uppercase hover:bg-skinny-green transition-colors focus:outline-none focus:ring-2 focus:ring-skinny-yellow/50 focus:ring-offset-2 focus:ring-offset-black"
              aria-label="Create your first workflow"
            >
              <Plus size={18} aria-hidden="true" />
              Create Workflow
            </motion.button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
