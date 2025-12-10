'use client'

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react'
import { Workflow, WorkflowStep, WorkflowRunProgress, Generation } from '@/lib/types'
import { mockWorkflows } from '@/lib/types'
import { saveToStorage, loadFromStorage, STORAGE_KEYS } from '@/lib/storage'

// ============================================
// Workflow Context - Manage Workflows
// ============================================

interface WorkflowContextType {
  // Workflows
  workflows: Workflow[]
  activeWorkflow: Workflow | null

  // Builder state
  isBuilding: boolean
  editingWorkflow: Workflow | null

  // Runner state
  isRunning: boolean
  runProgress: WorkflowRunProgress | null

  // Workflow CRUD
  createWorkflow: (workflow: Omit<Workflow, 'id' | 'createdAt' | 'runCount' | 'isPublic'>) => Workflow
  updateWorkflow: (id: string, updates: Partial<Workflow>) => void
  deleteWorkflow: (id: string) => void
  duplicateWorkflow: (id: string) => Workflow

  // Builder actions
  startBuilding: (workflow?: Workflow) => void
  stopBuilding: () => void
  setEditingWorkflow: (workflow: Workflow | null) => void

  // Runner actions
  runWorkflow: (workflowId: string, initialInput: string) => Promise<Generation[]>
  pauseRun: () => void
  cancelRun: () => void

  // Step management
  addStep: (workflowId: string, step: Omit<WorkflowStep, 'id' | 'order'>) => void
  updateStep: (workflowId: string, stepId: string, updates: Partial<WorkflowStep>) => void
  removeStep: (workflowId: string, stepId: string) => void
  reorderSteps: (workflowId: string, fromIndex: number, toIndex: number) => void
}

const WorkflowContext = createContext<WorkflowContextType | null>(null)

export function WorkflowProvider({ children }: { children: ReactNode }) {
  // Workflows state
  const [workflows, setWorkflows] = useState<Workflow[]>(mockWorkflows)
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null)

  // Builder state
  const [isBuilding, setIsBuilding] = useState(false)
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null)

  // Runner state
  const [isRunning, setIsRunning] = useState(false)
  const [runProgress, setRunProgress] = useState<WorkflowRunProgress | null>(null)
  const [shouldCancel, setShouldCancel] = useState(false)

  // Load workflows from storage on mount
  useEffect(() => {
    const saved = loadFromStorage<Workflow[]>(STORAGE_KEYS.WORKFLOWS)
    if (saved && saved.length > 0) {
      setWorkflows(saved)
    }
  }, [])

  // Save workflows to storage when changed
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.WORKFLOWS, workflows)
  }, [workflows])

  // Generate unique ID
  const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  // Create workflow
  const createWorkflow = useCallback((
    workflow: Omit<Workflow, 'id' | 'createdAt' | 'runCount' | 'isPublic'>
  ): Workflow => {
    const newWorkflow: Workflow = {
      ...workflow,
      id: generateId(),
      createdAt: new Date(),
      runCount: 0,
      isPublic: false,
    }
    setWorkflows(prev => [newWorkflow, ...prev])
    return newWorkflow
  }, [])

  // Update workflow
  const updateWorkflow = useCallback((id: string, updates: Partial<Workflow>) => {
    setWorkflows(prev => prev.map(wf =>
      wf.id === id ? { ...wf, ...updates, updatedAt: new Date() } : wf
    ))
  }, [])

  // Delete workflow
  const deleteWorkflow = useCallback((id: string) => {
    setWorkflows(prev => prev.filter(wf => wf.id !== id))
    if (activeWorkflow?.id === id) {
      setActiveWorkflow(null)
    }
  }, [activeWorkflow])

  // Duplicate workflow
  const duplicateWorkflow = useCallback((id: string): Workflow => {
    const original = workflows.find(wf => wf.id === id)
    if (!original) throw new Error('Workflow not found')

    const duplicate: Workflow = {
      ...original,
      id: generateId(),
      name: `${original.name} (Copy)`,
      createdAt: new Date(),
      runCount: 0,
      steps: original.steps.map(step => ({
        ...step,
        id: generateId(),
      })),
    }
    setWorkflows(prev => [duplicate, ...prev])
    return duplicate
  }, [workflows])

  // Start building
  const startBuilding = useCallback((workflow?: Workflow) => {
    setIsBuilding(true)
    setEditingWorkflow(workflow || null)
  }, [])

  // Stop building
  const stopBuilding = useCallback(() => {
    setIsBuilding(false)
    setEditingWorkflow(null)
  }, [])

  // Add step to workflow
  const addStep = useCallback((
    workflowId: string,
    step: Omit<WorkflowStep, 'id' | 'order'>
  ) => {
    setWorkflows(prev => prev.map(wf => {
      if (wf.id !== workflowId) return wf

      const newStep: WorkflowStep = {
        ...step,
        id: generateId(),
        order: wf.steps.length + 1,
      }

      return {
        ...wf,
        steps: [...wf.steps, newStep],
        updatedAt: new Date(),
      }
    }))
  }, [])

  // Update step
  const updateStep = useCallback((
    workflowId: string,
    stepId: string,
    updates: Partial<WorkflowStep>
  ) => {
    setWorkflows(prev => prev.map(wf => {
      if (wf.id !== workflowId) return wf

      return {
        ...wf,
        steps: wf.steps.map(step =>
          step.id === stepId ? { ...step, ...updates } : step
        ),
        updatedAt: new Date(),
      }
    }))
  }, [])

  // Remove step
  const removeStep = useCallback((workflowId: string, stepId: string) => {
    setWorkflows(prev => prev.map(wf => {
      if (wf.id !== workflowId) return wf

      const filteredSteps = wf.steps.filter(step => step.id !== stepId)
      // Reorder remaining steps
      const reorderedSteps = filteredSteps.map((step, index) => ({
        ...step,
        order: index + 1,
      }))

      return {
        ...wf,
        steps: reorderedSteps,
        updatedAt: new Date(),
      }
    }))
  }, [])

  // Reorder steps
  const reorderSteps = useCallback((
    workflowId: string,
    fromIndex: number,
    toIndex: number
  ) => {
    setWorkflows(prev => prev.map(wf => {
      if (wf.id !== workflowId) return wf

      const newSteps = [...wf.steps]
      const [removed] = newSteps.splice(fromIndex, 1)
      newSteps.splice(toIndex, 0, removed)

      // Update order numbers
      const reorderedSteps = newSteps.map((step, index) => ({
        ...step,
        order: index + 1,
      }))

      return {
        ...wf,
        steps: reorderedSteps,
        updatedAt: new Date(),
      }
    }))
  }, [])

  // Run workflow
  const runWorkflow = useCallback(async (
    workflowId: string,
    initialInput: string
  ): Promise<Generation[]> => {
    const workflow = workflows.find(wf => wf.id === workflowId)
    if (!workflow) throw new Error('Workflow not found')

    setIsRunning(true)
    setShouldCancel(false)
    setActiveWorkflow(workflow)

    const outputs: Generation[] = []

    setRunProgress({
      workflowId,
      currentStep: 0,
      totalSteps: workflow.steps.length,
      status: 'running',
      stepOutputs: [],
    })

    try {
      let previousOutput = initialInput

      for (let i = 0; i < workflow.steps.length; i++) {
        if (shouldCancel) {
          setRunProgress(prev => prev ? { ...prev, status: 'paused' } : null)
          break
        }

        const step = workflow.steps[i]

        setRunProgress(prev => prev ? {
          ...prev,
          currentStep: i + 1,
        } : null)

        // Replace template variables
        let prompt = step.promptTemplate
          .replace('{input}', initialInput)
          .replace('{previous_output}', previousOutput)

        // Simulate generation (will be replaced with real API)
        await new Promise(resolve => setTimeout(resolve, 2000))

        const generation: Generation = {
          id: `gen-${Date.now()}-${i}`,
          imageUrl: `https://picsum.photos/seed/${Date.now()}-${i}/800/${600 + Math.floor(Math.random() * 400)}`,
          prompt,
          model: {
            id: step.modelId,
            name: step.modelName || step.modelId,
            provider: 'Replicate',
          },
          createdAt: new Date(),
          isPublic: false,
          likes: 0,
        }

        outputs.push(generation)
        previousOutput = prompt // In real impl, this would be the image URL or analysis

        setRunProgress(prev => prev ? {
          ...prev,
          stepOutputs: [...prev.stepOutputs, generation],
        } : null)
      }

      // Update run count
      updateWorkflow(workflowId, {
        runCount: workflow.runCount + 1,
        lastRunAt: new Date(),
      })

      setRunProgress(prev => prev ? { ...prev, status: 'completed' } : null)

    } catch (error) {
      setRunProgress(prev => prev ? {
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      } : null)
    } finally {
      setIsRunning(false)
    }

    return outputs
  }, [workflows, shouldCancel, updateWorkflow])

  // Pause run
  const pauseRun = useCallback(() => {
    setShouldCancel(true)
    setRunProgress(prev => prev ? { ...prev, status: 'paused' } : null)
  }, [])

  // Cancel run
  const cancelRun = useCallback(() => {
    setShouldCancel(true)
    setIsRunning(false)
    setRunProgress(null)
    setActiveWorkflow(null)
  }, [])

  const value: WorkflowContextType = {
    workflows,
    activeWorkflow,
    isBuilding,
    editingWorkflow,
    isRunning,
    runProgress,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    duplicateWorkflow,
    startBuilding,
    stopBuilding,
    setEditingWorkflow,
    runWorkflow,
    pauseRun,
    cancelRun,
    addStep,
    updateStep,
    removeStep,
    reorderSteps,
  }

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  )
}

export function useWorkflow() {
  const context = useContext(WorkflowContext)
  if (!context) {
    throw new Error('useWorkflow must be used within a WorkflowProvider')
  }
  return context
}
