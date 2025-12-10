'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  X,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Wand2,
  Loader2,
  Check,
  Copy,
  RefreshCw,
  Image as ImageIcon,
  Lightbulb,
} from 'lucide-react'
import { ImageUpload } from '@/components/ui/image-upload'

interface PlanningWizardProps {
  isOpen: boolean
  onClose: () => void
  onComplete: (result: PlanningResult) => void
  initialPrompt?: string
}

export interface PlanningResult {
  originalPrompt: string
  enhancedPrompt: string
  stylePreset: string | null
  referenceImages: File[]
  recommendedModel: string | null
}

type Step = 1 | 2 | 3

const stylePresets = [
  { id: 'cinematic', label: 'Cinematic', icon: '🎬', description: 'Film-like, dramatic lighting' },
  { id: 'product', label: 'Product', icon: '📦', description: 'Clean, commercial style' },
  { id: 'portrait', label: 'Portrait', icon: '👤', description: 'Professional headshots' },
  { id: 'abstract', label: 'Abstract', icon: '🎨', description: 'Artistic, experimental' },
  { id: 'nature', label: 'Nature', icon: '🌿', description: 'Natural, organic scenes' },
  { id: 'fantasy', label: 'Fantasy', icon: '✨', description: 'Magical, otherworldly' },
  { id: 'minimal', label: 'Minimal', icon: '⬜', description: 'Clean, simple compositions' },
  { id: 'vintage', label: 'Vintage', icon: '📷', description: 'Retro, nostalgic feel' },
]

export function PlanningWizard({
  isOpen,
  onClose,
  onComplete,
  initialPrompt = '',
}: PlanningWizardProps) {
  const [step, setStep] = useState<Step>(1)
  const [rawIdea, setRawIdea] = useState(initialPrompt)
  const [stylePreset, setStylePreset] = useState<string | null>(null)
  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [enhancedPrompt, setEnhancedPrompt] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [recommendedModel, setRecommendedModel] = useState<string | null>(null)
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }

    // Focus close button when modal opens
    setTimeout(() => closeButtonRef.current?.focus(), 100)

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Reset state when modal closes
  const handleClose = useCallback(() => {
    setStep(1)
    setRawIdea(initialPrompt)
    setStylePreset(null)
    setReferenceImages([])
    setEnhancedPrompt('')
    setSuggestions([])
    setRecommendedModel(null)
    setIsEnhancing(false)
    setError(null)
    onClose()
  }, [initialPrompt, onClose])

  // Step 1 → Step 2: Enhance prompt
  const handleEnhance = async () => {
    if (!rawIdea.trim()) return

    setIsEnhancing(true)
    setError(null)

    try {
      // Call the enhance API
      const response = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: rawIdea,
          style: stylePreset,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to enhance prompt')
      }

      const data = await response.json()
      setEnhancedPrompt(data.enhancedPrompt || rawIdea)
      setSuggestions(data.suggestions || [])

      // Get model recommendation
      const modelResponse = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: data.enhancedPrompt || rawIdea }),
      })

      if (modelResponse.ok) {
        const modelData = await modelResponse.json()
        setRecommendedModel(modelData.modelId)
      }

      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsEnhancing(false)
    }
  }

  // Regenerate enhancement
  const handleRegenerate = async () => {
    setIsEnhancing(true)
    setError(null)

    try {
      const response = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: rawIdea,
          style: stylePreset,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to regenerate')
      }

      const data = await response.json()
      setEnhancedPrompt(data.enhancedPrompt || rawIdea)
      setSuggestions(data.suggestions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsEnhancing(false)
    }
  }

  // Copy to clipboard
  const handleCopy = async () => {
    await navigator.clipboard.writeText(enhancedPrompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Apply a suggestion
  const applySuggestion = (suggestion: string) => {
    setEnhancedPrompt(suggestion)
  }

  // Complete the wizard
  const handleComplete = () => {
    onComplete({
      originalPrompt: rawIdea,
      enhancedPrompt,
      stylePreset,
      referenceImages,
      recommendedModel,
    })
    handleClose()
  }

  // Step indicators
  const steps = [
    { num: 1, label: 'Describe' },
    { num: 2, label: 'Enhance' },
    { num: 3, label: 'Preview' },
  ]

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
            role="dialog"
            aria-modal="true"
            aria-labelledby="planning-wizard-title"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed inset-4 sm:inset-8 md:inset-12 lg:inset-20 bg-zinc-900 border-2 border-zinc-800 rounded-2xl overflow-hidden z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-skinny-yellow/20">
                  <Wand2 size={20} className="text-skinny-yellow" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="planning-wizard-title" className="text-lg font-bold uppercase tracking-wide">AI Planning Mode</h2>
                  <p className="text-xs text-zinc-500">Let AI help craft the perfect prompt</p>
                </div>
              </div>
              <button
                ref={closeButtonRef}
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-zinc-800 transition-colors focus:outline-none focus:ring-2 focus:ring-skinny-yellow"
                aria-label="Close planning wizard"
              >
                <X size={20} />
              </button>
            </div>

            {/* Progress Steps */}
            <div className="px-4 sm:px-6 py-4 border-b border-zinc-800">
              <div className="flex items-center justify-center gap-2">
                {steps.map((s, i) => (
                  <div key={s.num} className="flex items-center">
                    <button
                      onClick={() => s.num < step && setStep(s.num as Step)}
                      disabled={s.num > step}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-xl transition-all',
                        step === s.num
                          ? 'bg-skinny-yellow text-black'
                          : step > s.num
                          ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer'
                          : 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
                      )}
                    >
                      <span className="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-xs font-bold">
                        {step > s.num ? <Check size={12} /> : s.num}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wide hidden sm:inline">
                        {s.label}
                      </span>
                    </button>
                    {i < steps.length - 1 && (
                      <ArrowRight size={16} className="mx-2 text-zinc-700" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <AnimatePresence mode="wait">
                {/* Step 1: Describe */}
                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="max-w-2xl mx-auto space-y-6"
                  >
                    <div>
                      <h3 className="text-xl font-bold mb-2">Describe Your Vision</h3>
                      <p className="text-sm text-zinc-500">
                        Start with a rough idea. AI will help refine and enhance it.
                      </p>
                    </div>

                    {/* Main textarea */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                        Your Idea
                      </label>
                      <textarea
                        value={rawIdea}
                        onChange={(e) => setRawIdea(e.target.value)}
                        placeholder="A futuristic city at sunset with flying cars..."
                        className="w-full h-32 bg-zinc-800/50 border-2 border-zinc-700 rounded-xl p-4 text-sm resize-none focus:outline-none focus:border-skinny-yellow/50 placeholder:text-zinc-600"
                        autoFocus
                      />
                      <p className="text-xs text-zinc-600 text-right">
                        {rawIdea.length} characters
                      </p>
                    </div>

                    {/* Style presets */}
                    <div className="space-y-3">
                      <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                        Style Preset (Optional)
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {stylePresets.map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() =>
                              setStylePreset(stylePreset === preset.id ? null : preset.id)
                            }
                            className={cn(
                              'p-3 rounded-xl border-2 text-left transition-all',
                              stylePreset === preset.id
                                ? 'border-skinny-yellow bg-skinny-yellow/10'
                                : 'border-zinc-800 hover:border-zinc-700 bg-zinc-800/30'
                            )}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span>{preset.icon}</span>
                              <span className="text-xs font-bold">{preset.label}</span>
                            </div>
                            <p className="text-[10px] text-zinc-500">{preset.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Reference images */}
                    <div className="space-y-3">
                      <label className="text-xs font-bold uppercase tracking-wide text-zinc-500 flex items-center gap-2">
                        <ImageIcon size={14} />
                        Reference Images (Optional)
                      </label>
                      <ImageUpload
                        images={referenceImages}
                        onImagesChange={setReferenceImages}
                        maxImages={4}
                      />
                    </div>

                    {/* Error */}
                    {error && (
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                        {error}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Step 2: Enhance */}
                {step === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="max-w-2xl mx-auto space-y-6"
                  >
                    <div>
                      <h3 className="text-xl font-bold mb-2">AI Enhancement</h3>
                      <p className="text-sm text-zinc-500">
                        Review and edit your enhanced prompt.
                      </p>
                    </div>

                    {/* Before/After comparison */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                          Original
                        </label>
                        <div className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-800 text-sm text-zinc-400 min-h-[100px]">
                          {rawIdea}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold uppercase tracking-wide text-skinny-yellow flex items-center gap-2">
                            <Sparkles size={12} />
                            Enhanced
                          </label>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={handleCopy}
                              className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-white"
                              title="Copy to clipboard"
                            >
                              {copied ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                            <button
                              onClick={handleRegenerate}
                              disabled={isEnhancing}
                              className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-white disabled:opacity-50"
                              title="Regenerate"
                            >
                              <RefreshCw size={14} className={isEnhancing ? 'animate-spin' : ''} />
                            </button>
                          </div>
                        </div>
                        <textarea
                          value={enhancedPrompt}
                          onChange={(e) => setEnhancedPrompt(e.target.value)}
                          className="w-full p-4 rounded-xl bg-skinny-yellow/5 border-2 border-skinny-yellow/30 text-sm min-h-[100px] resize-none focus:outline-none focus:border-skinny-yellow/50"
                        />
                      </div>
                    </div>

                    {/* Suggestions */}
                    {suggestions.length > 0 && (
                      <div className="space-y-3">
                        <label className="text-xs font-bold uppercase tracking-wide text-zinc-500 flex items-center gap-2">
                          <Lightbulb size={14} />
                          Alternative Directions
                        </label>
                        <div className="space-y-2">
                          {suggestions.map((suggestion, index) => (
                            <button
                              key={index}
                              onClick={() => applySuggestion(suggestion)}
                              className="w-full p-3 rounded-xl bg-zinc-800/30 border border-zinc-800 hover:border-zinc-700 text-left text-sm text-zinc-400 hover:text-white transition-all"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Error */}
                    {error && (
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                        {error}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Step 3: Preview */}
                {step === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="max-w-2xl mx-auto space-y-6"
                  >
                    <div>
                      <h3 className="text-xl font-bold mb-2">Preview & Generate</h3>
                      <p className="text-sm text-zinc-500">
                        Review your final prompt and settings.
                      </p>
                    </div>

                    {/* Final prompt */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                          Final Prompt
                        </label>
                        <button
                          onClick={handleCopy}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-zinc-800 transition-colors text-xs text-zinc-500 hover:text-white"
                        >
                          {copied ? <Check size={12} /> : <Copy size={12} />}
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <textarea
                        value={enhancedPrompt}
                        onChange={(e) => setEnhancedPrompt(e.target.value)}
                        className="w-full p-4 rounded-xl bg-zinc-800/50 border-2 border-zinc-700 text-sm min-h-[120px] resize-none focus:outline-none focus:border-skinny-yellow/50"
                      />
                    </div>

                    {/* Settings summary */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      {/* Style */}
                      <div className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-800">
                        <label className="text-xs font-bold uppercase tracking-wide text-zinc-500 block mb-2">
                          Style
                        </label>
                        <p className="text-sm">
                          {stylePreset
                            ? stylePresets.find((p) => p.id === stylePreset)?.label
                            : 'None selected'}
                        </p>
                      </div>

                      {/* Recommended model */}
                      <div className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-800">
                        <label className="text-xs font-bold uppercase tracking-wide text-zinc-500 block mb-2">
                          Recommended Model
                        </label>
                        <p className="text-sm text-skinny-yellow">
                          {recommendedModel || 'FLUX 1.1 Pro'}
                        </p>
                      </div>
                    </div>

                    {/* Reference images preview */}
                    {referenceImages.length > 0 && (
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                          Reference Images ({referenceImages.length})
                        </label>
                        <div className="flex gap-2 flex-wrap">
                          {referenceImages.map((file, index) => (
                            <div
                              key={index}
                              className="w-16 h-16 rounded-lg overflow-hidden border-2 border-zinc-700"
                            >
                              <img
                                src={URL.createObjectURL(file)}
                                alt={`Reference ${index + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-t border-zinc-800">
              <button
                onClick={() => (step > 1 ? setStep((step - 1) as Step) : handleClose())}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors text-sm"
              >
                <ArrowLeft size={16} />
                <span>{step > 1 ? 'Back' : 'Cancel'}</span>
              </button>

              {step === 1 && (
                <button
                  onClick={handleEnhance}
                  disabled={!rawIdea.trim() || isEnhancing}
                  className={cn(
                    'flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all',
                    rawIdea.trim() && !isEnhancing
                      ? 'bg-skinny-yellow text-black hover:bg-skinny-green'
                      : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                  )}
                >
                  {isEnhancing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Enhancing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Enhance with AI</span>
                    </>
                  )}
                </button>
              )}

              {step === 2 && (
                <button
                  onClick={() => setStep(3)}
                  disabled={!enhancedPrompt.trim()}
                  className={cn(
                    'flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all',
                    enhancedPrompt.trim()
                      ? 'bg-skinny-yellow text-black hover:bg-skinny-green'
                      : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                  )}
                >
                  <span>Continue</span>
                  <ArrowRight size={16} />
                </button>
              )}

              {step === 3 && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleComplete}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-skinny-yellow text-black hover:bg-skinny-green font-bold text-sm transition-all"
                  >
                    <Sparkles size={16} />
                    <span>Generate Now</span>
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
