'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence, Reorder } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  X,
  Plus,
  Trash2,
  GripVertical,
  Sparkles,
  ArrowDown,
  Settings2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Workflow, WorkflowStep, AIModel } from '@/lib/types'

interface WorkflowBuilderProps {
  isOpen: boolean
  onClose: () => void
  onSave: (workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt' | 'runCount' | 'lastRunAt'>) => void
  models: AIModel[]
  existingWorkflow?: Workflow
}

interface StepFormData {
  id: string
  modelId: string
  promptTemplate: string
  usePreviousOutput: boolean
  isExpanded: boolean
}

const generateId = () => `step-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

export function WorkflowBuilder({
  isOpen,
  onClose,
  onSave,
  models,
  existingWorkflow,
}: WorkflowBuilderProps) {
  const [name, setName] = useState(existingWorkflow?.name || '')
  const [description, setDescription] = useState(existingWorkflow?.description || '')
  const [steps, setSteps] = useState<StepFormData[]>(() =>
    existingWorkflow?.steps.map((s) => ({
      id: s.id,
      modelId: s.modelId,
      promptTemplate: s.promptTemplate,
      usePreviousOutput: s.usePreviousOutput,
      isExpanded: true,
    })) || [
      {
        id: generateId(),
        modelId: models[0]?.id || '',
        promptTemplate: '{input}',
        usePreviousOutput: false,
        isExpanded: true,
      },
    ]
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleClose = useCallback(() => {
    setName('')
    setDescription('')
    setSteps([
      {
        id: generateId(),
        modelId: models[0]?.id || '',
        promptTemplate: '{input}',
        usePreviousOutput: false,
        isExpanded: true,
      },
    ])
    setErrors({})
    onClose()
  }, [models, onClose])

  const addStep = () => {
    const newStep: StepFormData = {
      id: generateId(),
      modelId: models[0]?.id || '',
      promptTemplate: steps.length > 0 ? '{previous_output}' : '{input}',
      usePreviousOutput: steps.length > 0,
      isExpanded: true,
    }
    setSteps([...steps, newStep])
  }

  const removeStep = (id: string) => {
    if (steps.length <= 1) return
    setSteps(steps.filter((s) => s.id !== id))
  }

  const updateStep = (id: string, updates: Partial<StepFormData>) => {
    setSteps(steps.map((s) => (s.id === id ? { ...s, ...updates } : s)))
  }

  const toggleExpanded = (id: string) => {
    setSteps(steps.map((s) => (s.id === id ? { ...s, isExpanded: !s.isExpanded } : s)))
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!name.trim()) {
      newErrors.name = 'Workflow name is required'
    }

    if (steps.length === 0) {
      newErrors.steps = 'At least one step is required'
    }

    steps.forEach((step, index) => {
      if (!step.modelId) {
        newErrors[`step-${index}-model`] = 'Model is required'
      }
      if (!step.promptTemplate.trim()) {
        newErrors[`step-${index}-prompt`] = 'Prompt template is required'
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = () => {
    if (!validate()) return

    const workflowSteps: WorkflowStep[] = steps.map((s, index) => ({
      id: s.id,
      order: index,
      modelId: s.modelId,
      modelName: models.find((m) => m.id === s.modelId)?.name,
      promptTemplate: s.promptTemplate,
      usePreviousOutput: s.usePreviousOutput,
    }))

    onSave({
      name: name.trim(),
      description: description.trim(),
      steps: workflowSteps,
      isPublic: false,
    })

    handleClose()
  }

  const getModelById = (id: string) => models.find((m) => m.id === id)

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
            className="fixed inset-4 sm:inset-8 md:inset-12 lg:inset-16 bg-zinc-900 border-2 border-zinc-800 rounded-2xl overflow-hidden z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-skinny-yellow/20">
                  <Settings2 size={20} className="text-skinny-yellow" />
                </div>
                <div>
                  <h2 className="text-lg font-bold uppercase tracking-wide">
                    {existingWorkflow ? 'Edit Workflow' : 'Create Workflow'}
                  </h2>
                  <p className="text-xs text-zinc-500">Chain multiple AI models together</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                aria-label="Close workflow builder"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="max-w-2xl mx-auto space-y-6">
                {/* Workflow Name & Description */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                      Workflow Name *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="My Awesome Workflow"
                      className={cn(
                        'w-full bg-zinc-800/50 border-2 rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors',
                        errors.name
                          ? 'border-red-500/50 focus:border-red-500'
                          : 'border-zinc-700 focus:border-skinny-yellow/50'
                      )}
                    />
                    {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                      Description (Optional)
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe what this workflow does..."
                      rows={2}
                      className="w-full bg-zinc-800/50 border-2 border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-skinny-yellow/50 resize-none transition-colors"
                    />
                  </div>
                </div>

                {/* Steps */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                      Workflow Steps
                    </label>
                    <span className="text-xs text-zinc-600">{steps.length} step(s)</span>
                  </div>

                  {errors.steps && <p className="text-xs text-red-400">{errors.steps}</p>}

                  <Reorder.Group
                    axis="y"
                    values={steps}
                    onReorder={setSteps}
                    className="space-y-3"
                  >
                    {steps.map((step, index) => (
                      <Reorder.Item key={step.id} value={step}>
                        <motion.div
                          layout
                          className={cn(
                            'rounded-xl border-2 overflow-hidden transition-colors',
                            step.isExpanded
                              ? 'border-zinc-700 bg-zinc-800/30'
                              : 'border-zinc-800 bg-zinc-900/50'
                          )}
                        >
                          {/* Step Header */}
                          <div
                            className="flex items-center gap-3 p-4 cursor-pointer"
                            onClick={() => toggleExpanded(step.id)}
                          >
                            <div className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400">
                              <GripVertical size={18} />
                            </div>

                            <div className="w-8 h-8 rounded-full bg-skinny-yellow/20 flex items-center justify-center text-sm font-bold text-skinny-yellow">
                              {index + 1}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">
                                {getModelById(step.modelId)?.name || 'Select model'}
                              </p>
                              <p className="text-xs text-zinc-500 truncate">
                                {step.promptTemplate || 'No prompt template'}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              {steps.length > 1 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    removeStep(step.id)
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                              {step.isExpanded ? (
                                <ChevronUp size={18} className="text-zinc-500" />
                              ) : (
                                <ChevronDown size={18} className="text-zinc-500" />
                              )}
                            </div>
                          </div>

                          {/* Step Content */}
                          <AnimatePresence>
                            {step.isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="p-4 pt-0 space-y-4">
                                  {/* Model Selector */}
                                  <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                                      Model
                                    </label>
                                    <select
                                      value={step.modelId}
                                      onChange={(e) =>
                                        updateStep(step.id, { modelId: e.target.value })
                                      }
                                      className={cn(
                                        'w-full bg-zinc-800/50 border-2 rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors appearance-none',
                                        errors[`step-${index}-model`]
                                          ? 'border-red-500/50'
                                          : 'border-zinc-700 focus:border-skinny-yellow/50'
                                      )}
                                    >
                                      <option value="">Select a model...</option>
                                      {models.map((model) => (
                                        <option key={model.id} value={model.id}>
                                          {model.name} ({model.provider})
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* Prompt Template */}
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                                        Prompt Template
                                      </label>
                                      <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                                        <code className="px-1.5 py-0.5 bg-zinc-800 rounded">
                                          {'{input}'}
                                        </code>
                                        <code className="px-1.5 py-0.5 bg-zinc-800 rounded">
                                          {'{previous_output}'}
                                        </code>
                                      </div>
                                    </div>
                                    <textarea
                                      value={step.promptTemplate}
                                      onChange={(e) =>
                                        updateStep(step.id, { promptTemplate: e.target.value })
                                      }
                                      placeholder="Enter your prompt template..."
                                      rows={3}
                                      className={cn(
                                        'w-full bg-zinc-800/50 border-2 rounded-xl px-4 py-3 text-sm focus:outline-none resize-none font-mono transition-colors',
                                        errors[`step-${index}-prompt`]
                                          ? 'border-red-500/50'
                                          : 'border-zinc-700 focus:border-skinny-yellow/50'
                                      )}
                                    />
                                    <p className="text-[10px] text-zinc-600">
                                      Use {'{input}'} for the initial input or {'{previous_output}'}{' '}
                                      to reference the output from the previous step.
                                    </p>
                                  </div>

                                  {/* Use Previous Output Toggle */}
                                  {index > 0 && (
                                    <label className="flex items-center gap-3 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={step.usePreviousOutput}
                                        onChange={(e) =>
                                          updateStep(step.id, {
                                            usePreviousOutput: e.target.checked,
                                          })
                                        }
                                        className="sr-only"
                                      />
                                      <div
                                        className={cn(
                                          'w-10 h-6 rounded-full transition-colors relative',
                                          step.usePreviousOutput
                                            ? 'bg-skinny-yellow'
                                            : 'bg-zinc-700'
                                        )}
                                      >
                                        <div
                                          className={cn(
                                            'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                                            step.usePreviousOutput
                                              ? 'translate-x-5'
                                              : 'translate-x-1'
                                          )}
                                        />
                                      </div>
                                      <span className="text-xs text-zinc-400">
                                        Use previous step's output as input
                                      </span>
                                    </label>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>

                        {/* Connector */}
                        {index < steps.length - 1 && (
                          <div className="flex justify-center py-2">
                            <ArrowDown size={20} className="text-zinc-700" />
                          </div>
                        )}
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>

                  {/* Add Step Button */}
                  <button
                    onClick={addStep}
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-zinc-700 hover:border-skinny-yellow/50 text-zinc-500 hover:text-skinny-yellow transition-colors"
                  >
                    <Plus size={18} />
                    <span className="text-sm font-medium">Add Step</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-t border-zinc-800">
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors text-sm"
              >
                Cancel
              </button>

              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-skinny-yellow text-black hover:bg-skinny-green font-bold text-sm transition-colors"
              >
                <Sparkles size={16} />
                <span>{existingWorkflow ? 'Save Changes' : 'Create Workflow'}</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
