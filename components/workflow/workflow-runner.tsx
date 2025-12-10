'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  X,
  Play,
  Pause,
  Square,
  RefreshCw,
  Check,
  AlertCircle,
  Loader2,
  ArrowRight,
  Image as ImageIcon,
  Download,
} from 'lucide-react'
import { Workflow, WorkflowRunProgress, Generation } from '@/lib/types'

interface WorkflowRunnerProps {
  isOpen: boolean
  onClose: () => void
  workflow: Workflow | null
  onRunComplete?: (outputs: Generation[]) => void
}

type RunStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error'

interface StepOutput {
  stepId: string
  status: 'pending' | 'running' | 'completed' | 'error'
  output?: string
  error?: string
}

export function WorkflowRunner({
  isOpen,
  onClose,
  workflow,
  onRunComplete,
}: WorkflowRunnerProps) {
  const [inputPrompt, setInputPrompt] = useState('')
  const [status, setStatus] = useState<RunStatus>('idle')
  const [currentStep, setCurrentStep] = useState(0)
  const [stepOutputs, setStepOutputs] = useState<StepOutput[]>([])
  const [error, setError] = useState<string | null>(null)

  // Reset state when modal opens/closes or workflow changes
  useEffect(() => {
    if (isOpen && workflow) {
      setInputPrompt('')
      setStatus('idle')
      setCurrentStep(0)
      setStepOutputs(
        workflow.steps.map((step) => ({
          stepId: step.id,
          status: 'pending',
        }))
      )
      setError(null)
    }
  }, [isOpen, workflow])

  const handleClose = () => {
    if (status === 'running') {
      // Confirm before closing while running
      if (!confirm('Workflow is running. Are you sure you want to close?')) {
        return
      }
    }
    setStatus('idle')
    onClose()
  }

  const startRun = async () => {
    if (!workflow || !inputPrompt.trim()) return

    setStatus('running')
    setCurrentStep(0)
    setError(null)

    let previousOutput = ''

    for (let i = 0; i < workflow.steps.length; i++) {
      if (status === 'paused') {
        // Wait while paused
        await new Promise((resolve) => {
          const checkPause = setInterval(() => {
            if (status !== 'paused') {
              clearInterval(checkPause)
              resolve(null)
            }
          }, 100)
        })
      }

      setCurrentStep(i)

      // Update step status to running
      setStepOutputs((prev) =>
        prev.map((s, idx) => (idx === i ? { ...s, status: 'running' } : s))
      )

      const step = workflow.steps[i]

      try {
        // Build the prompt by replacing variables
        let prompt = step.promptTemplate
        prompt = prompt.replace('{input}', inputPrompt)
        if (step.usePreviousOutput && previousOutput) {
          prompt = prompt.replace('{previous_output}', previousOutput)
        }

        // Simulate generation (replace with actual API call)
        await simulateGeneration(prompt, step.modelId)

        // For demo purposes, we'll just use the prompt as output
        const output = `Generated output for step ${i + 1} using ${step.modelName || step.modelId}`
        previousOutput = output

        // Update step status to completed
        setStepOutputs((prev) =>
          prev.map((s, idx) =>
            idx === i ? { ...s, status: 'completed', output } : s
          )
        )
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Generation failed'

        setStepOutputs((prev) =>
          prev.map((s, idx) =>
            idx === i ? { ...s, status: 'error', error: errorMessage } : s
          )
        )

        setError(`Step ${i + 1} failed: ${errorMessage}`)
        setStatus('error')
        return
      }
    }

    setStatus('completed')
    // TODO: Call onRunComplete with actual Generation objects
  }

  const pauseRun = () => {
    if (status === 'running') {
      setStatus('paused')
    }
  }

  const resumeRun = () => {
    if (status === 'paused') {
      setStatus('running')
    }
  }

  const cancelRun = () => {
    setStatus('idle')
    setStepOutputs((prev) =>
      prev.map((s) => ({ ...s, status: 'pending', output: undefined, error: undefined }))
    )
    setCurrentStep(0)
    setError(null)
  }

  const retryRun = () => {
    setError(null)
    startRun()
  }

  // Simulated generation function (replace with actual API call)
  const simulateGeneration = async (prompt: string, modelId: string): Promise<void> => {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 2000))

    // Randomly fail sometimes for demo
    if (Math.random() < 0.1) {
      throw new Error('Simulated generation error')
    }
  }

  if (!workflow) return null

  const progress = stepOutputs.filter((s) => s.status === 'completed').length / workflow.steps.length * 100

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/90 backdrop-blur-md z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed inset-4 sm:inset-8 md:inset-12 lg:inset-20 bg-zinc-900 border-2 border-zinc-800 rounded-2xl overflow-hidden z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'p-2 rounded-xl',
                    status === 'running'
                      ? 'bg-blue-500/20'
                      : status === 'completed'
                      ? 'bg-green-500/20'
                      : status === 'error'
                      ? 'bg-red-500/20'
                      : 'bg-skinny-yellow/20'
                  )}
                >
                  {status === 'running' ? (
                    <Loader2 size={20} className="text-blue-400 animate-spin" />
                  ) : status === 'completed' ? (
                    <Check size={20} className="text-green-400" />
                  ) : status === 'error' ? (
                    <AlertCircle size={20} className="text-red-400" />
                  ) : (
                    <Play size={20} className="text-skinny-yellow" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-bold uppercase tracking-wide">
                    {workflow.name}
                  </h2>
                  <p className="text-xs text-zinc-500">
                    {status === 'idle' && 'Ready to run'}
                    {status === 'running' &&
                      `Running step ${currentStep + 1} of ${workflow.steps.length}`}
                    {status === 'paused' && 'Paused'}
                    {status === 'completed' && 'Completed successfully'}
                    {status === 'error' && 'Error occurred'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                aria-label="Close workflow runner"
              >
                <X size={20} />
              </button>
            </div>

            {/* Progress Bar */}
            {status !== 'idle' && (
              <div className="h-1 bg-zinc-800">
                <motion.div
                  className={cn(
                    'h-full',
                    status === 'error' ? 'bg-red-500' : 'bg-skinny-yellow'
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="max-w-2xl mx-auto space-y-6">
                {/* Input Prompt */}
                {status === 'idle' && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                      Initial Input
                    </label>
                    <textarea
                      value={inputPrompt}
                      onChange={(e) => setInputPrompt(e.target.value)}
                      placeholder="Enter the initial prompt for this workflow..."
                      rows={3}
                      className="w-full bg-zinc-800/50 border-2 border-zinc-700 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-skinny-yellow/50"
                      autoFocus
                    />
                    <p className="text-xs text-zinc-600">
                      This input will be available as {'{input}'} in your workflow steps.
                    </p>
                  </div>
                )}

                {/* Display input when running */}
                {status !== 'idle' && inputPrompt && (
                  <div className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-800">
                    <label className="text-xs font-bold uppercase tracking-wide text-zinc-500 block mb-2">
                      Input
                    </label>
                    <p className="text-sm text-zinc-400">{inputPrompt}</p>
                  </div>
                )}

                {/* Steps */}
                <div className="space-y-4">
                  <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                    Steps
                  </label>

                  <div className="space-y-3">
                    {workflow.steps.map((step, index) => {
                      const stepOutput = stepOutputs[index]
                      const isActive = index === currentStep && status === 'running'

                      return (
                        <div key={step.id}>
                          <motion.div
                            className={cn(
                              'rounded-xl border-2 p-4 transition-all',
                              isActive
                                ? 'border-blue-500/50 bg-blue-500/5'
                                : stepOutput?.status === 'completed'
                                ? 'border-green-500/30 bg-green-500/5'
                                : stepOutput?.status === 'error'
                                ? 'border-red-500/30 bg-red-500/5'
                                : 'border-zinc-800 bg-zinc-800/20'
                            )}
                            animate={
                              isActive
                                ? {
                                    borderColor: [
                                      'rgba(59, 130, 246, 0.5)',
                                      'rgba(59, 130, 246, 0.3)',
                                      'rgba(59, 130, 246, 0.5)',
                                    ],
                                  }
                                : {}
                            }
                            transition={{ duration: 1.5, repeat: Infinity }}
                          >
                            <div className="flex items-start gap-3">
                              {/* Step Number / Status */}
                              <div
                                className={cn(
                                  'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                                  isActive
                                    ? 'bg-blue-500/20'
                                    : stepOutput?.status === 'completed'
                                    ? 'bg-green-500/20'
                                    : stepOutput?.status === 'error'
                                    ? 'bg-red-500/20'
                                    : 'bg-zinc-800'
                                )}
                              >
                                {isActive ? (
                                  <Loader2 size={14} className="text-blue-400 animate-spin" />
                                ) : stepOutput?.status === 'completed' ? (
                                  <Check size={14} className="text-green-400" />
                                ) : stepOutput?.status === 'error' ? (
                                  <AlertCircle size={14} className="text-red-400" />
                                ) : (
                                  <span className="text-xs font-bold text-zinc-500">
                                    {index + 1}
                                  </span>
                                )}
                              </div>

                              {/* Step Info */}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm">
                                  {step.modelName || step.modelId}
                                </p>
                                <p className="text-xs text-zinc-500 truncate mt-0.5">
                                  {step.promptTemplate}
                                </p>

                                {/* Output */}
                                {stepOutput?.output && (
                                  <div className="mt-3 p-3 rounded-lg bg-zinc-800/50 text-xs text-zinc-400">
                                    {stepOutput.output}
                                  </div>
                                )}

                                {/* Error */}
                                {stepOutput?.error && (
                                  <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                                    {stepOutput.error}
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>

                          {/* Connector */}
                          {index < workflow.steps.length - 1 && (
                            <div className="flex justify-center py-2">
                              <ArrowRight
                                size={16}
                                className={cn(
                                  'rotate-90',
                                  stepOutput?.status === 'completed'
                                    ? 'text-green-500/50'
                                    : 'text-zinc-700'
                                )}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                {/* Completed State */}
                {status === 'completed' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-6 rounded-xl bg-green-500/10 border border-green-500/30 text-center"
                  >
                    <Check size={40} className="text-green-400 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-white mb-1">
                      Workflow Completed!
                    </h3>
                    <p className="text-sm text-zinc-400">
                      All {workflow.steps.length} steps completed successfully.
                    </p>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-t border-zinc-800">
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors text-sm"
              >
                {status === 'completed' ? 'Done' : 'Cancel'}
              </button>

              <div className="flex items-center gap-3">
                {status === 'idle' && (
                  <button
                    onClick={startRun}
                    disabled={!inputPrompt.trim()}
                    className={cn(
                      'flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-colors',
                      inputPrompt.trim()
                        ? 'bg-skinny-yellow text-black hover:bg-skinny-green'
                        : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                    )}
                  >
                    <Play size={16} />
                    <span>Start Run</span>
                  </button>
                )}

                {status === 'running' && (
                  <>
                    <button
                      onClick={pauseRun}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors"
                    >
                      <Pause size={16} />
                      <span>Pause</span>
                    </button>
                    <button
                      onClick={cancelRun}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm transition-colors"
                    >
                      <Square size={16} />
                      <span>Cancel</span>
                    </button>
                  </>
                )}

                {status === 'paused' && (
                  <>
                    <button
                      onClick={resumeRun}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-skinny-yellow text-black hover:bg-skinny-green font-bold text-sm transition-colors"
                    >
                      <Play size={16} />
                      <span>Resume</span>
                    </button>
                    <button
                      onClick={cancelRun}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm transition-colors"
                    >
                      <Square size={16} />
                      <span>Cancel</span>
                    </button>
                  </>
                )}

                {status === 'error' && (
                  <>
                    <button
                      onClick={retryRun}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-skinny-yellow text-black hover:bg-skinny-green font-bold text-sm transition-colors"
                    >
                      <RefreshCw size={16} />
                      <span>Retry</span>
                    </button>
                  </>
                )}

                {status === 'completed' && (
                  <button
                    onClick={cancelRun}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-skinny-yellow text-black hover:bg-skinny-green font-bold text-sm transition-colors"
                  >
                    <RefreshCw size={16} />
                    <span>Run Again</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
