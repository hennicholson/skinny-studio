'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, CreditCard, Zap, Palette, Bell, Shield, ChevronRight, Key, Check, Eye, EyeOff, ExternalLink, Cpu, Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SkillsManager } from '@/components/skills/skills-manager'
import {
  ORCHESTRATOR_MODELS,
  VOICE_MODELS,
  OrchestratorModel,
  getApiSettings,
  saveApiSettings,
  ApiSettings
} from '@/lib/api-settings'

interface SettingsSectionProps {
  icon: React.ReactNode
  title: string
  description: string
  onClick?: () => void
  rightElement?: React.ReactNode
}

function SettingsSection({ icon, title, description, onClick, rightElement }: SettingsSectionProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      className="w-full flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 text-left transition-colors"
    >
      <div className="p-2 rounded-lg bg-zinc-800 text-skinny-yellow">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-white">{title}</h3>
        <p className="text-xs text-zinc-500 truncate">{description}</p>
      </div>
      {rightElement || <ChevronRight size={18} className="text-zinc-600" />}
    </motion.button>
  )
}

function ModelCard({
  model,
  isSelected,
  onSelect
}: {
  model: OrchestratorModel
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full p-4 rounded-xl border text-left transition-all",
        isSelected
          ? "bg-skinny-yellow/10 border-skinny-yellow/50"
          : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className={cn(
              "font-medium",
              isSelected ? "text-skinny-yellow" : "text-white"
            )}>
              {model.name}
            </h4>
            {model.supportsVoice && (
              <Mic size={12} className="text-purple-400" />
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1">{model.description}</p>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-600">
            <span>{typeof model.limits.rpm === 'number' ? `${model.limits.rpm} RPM` : 'Unlimited RPM'}</span>
            <span>{typeof model.limits.tpm === 'number' ? `${(model.limits.tpm / 1000).toFixed(0)}K TPM` : 'Unlimited TPM'}</span>
          </div>
        </div>
        {isSelected && (
          <Check size={18} className="text-skinny-yellow flex-shrink-0" />
        )}
      </div>
    </button>
  )
}

export function SettingsView() {
  const [settings, setSettings] = useState<ApiSettings>({
    googleApiKey: '',
    selectedModelId: 'gemini-2.0-flash-lite',
    voiceEnabled: false,
  })
  const [showApiKey, setShowApiKey] = useState(false)
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [showSkillsManager, setShowSkillsManager] = useState(false)

  // Load settings on mount
  useEffect(() => {
    setSettings(getApiSettings())
  }, [])

  const handleApiKeyChange = (value: string) => {
    setSettings(prev => ({ ...prev, googleApiKey: value }))
    setApiKeySaved(false)
  }

  const handleSaveApiKey = () => {
    saveApiSettings({ googleApiKey: settings.googleApiKey })
    setApiKeySaved(true)
    setTimeout(() => setApiKeySaved(false), 2000)
  }

  const handleModelSelect = (modelId: string) => {
    setSettings(prev => ({ ...prev, selectedModelId: modelId }))
    saveApiSettings({ selectedModelId: modelId })
  }

  const selectedModel = ORCHESTRATOR_MODELS.find(m => m.id === settings.selectedModelId) || ORCHESTRATOR_MODELS[2]

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Settings</h2>
          <p className="text-sm text-zinc-500 mt-1">Manage your account and preferences</p>
        </motion.div>

        {/* API Configuration Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-8"
        >
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">API Configuration</h3>

          {/* API Key Input */}
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 mb-3">
            <div className="flex items-center gap-2 mb-3">
              <Key size={16} className="text-skinny-yellow" />
              <span className="text-sm font-medium text-white">Google AI API Key</span>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 text-xs text-skinny-yellow hover:text-skinny-green transition-colors"
              >
                Get free key <ExternalLink size={12} />
              </a>
            </div>

            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={settings.googleApiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder="AIza..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 pr-20 text-sm focus:outline-none focus:border-skinny-yellow/50 transition-colors font-mono"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors"
                >
                  {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mt-3">
              <p className="text-[10px] text-zinc-600">
                Your key is stored locally and never sent to our servers
              </p>
              <button
                onClick={handleSaveApiKey}
                disabled={!settings.googleApiKey}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all",
                  settings.googleApiKey
                    ? apiKeySaved
                      ? "bg-green-500/20 text-green-400"
                      : "bg-skinny-yellow text-black hover:bg-skinny-green"
                    : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                )}
              >
                {apiKeySaved ? 'Saved!' : 'Save'}
              </button>
            </div>
          </div>

          {/* Model Selector */}
          <button
            onClick={() => setShowModelSelector(!showModelSelector)}
            className="w-full p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 text-left transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-zinc-800 text-skinny-yellow">
                <Cpu size={18} />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-white">Orchestrator Model</h4>
                <p className="text-xs text-zinc-500">{selectedModel.name}</p>
              </div>
              <ChevronRight
                size={18}
                className={cn(
                  "text-zinc-600 transition-transform",
                  showModelSelector && "rotate-90"
                )}
              />
            </div>
          </button>

          <AnimatePresence>
            {showModelSelector && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 pt-3">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Free Tier Models</p>
                  {ORCHESTRATOR_MODELS.map(model => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      isSelected={settings.selectedModelId === model.id}
                      onSelect={() => handleModelSelect(model.id)}
                    />
                  ))}

                  {/* Voice models section - coming soon */}
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2 mt-4 flex items-center gap-2">
                    Voice Mode <span className="text-purple-400">(Coming Soon)</span>
                  </p>
                  {VOICE_MODELS.map(model => (
                    <div key={model.id} className="opacity-50 cursor-not-allowed">
                      <ModelCard
                        model={model}
                        isSelected={false}
                        onSelect={() => {}}
                      />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Account Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Account</h3>
          <div className="space-y-2">
            <SettingsSection
              icon={<User size={18} />}
              title="Profile"
              description="Manage your profile and account details"
            />
            <SettingsSection
              icon={<CreditCard size={18} />}
              title="Balance & Usage"
              description="View credits and top up your account"
            />
          </div>
        </motion.div>

        {/* Creative Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Creative</h3>
          <div className="space-y-2">
            <SettingsSection
              icon={<Zap size={18} />}
              title="Skills"
              description="Create and manage custom prompting guides"
              onClick={() => setShowSkillsManager(true)}
            />
            <SettingsSection
              icon={<Palette size={18} />}
              title="Default Generation Model"
              description="FLUX Schnell"
            />
          </div>
        </motion.div>

        {/* Skills Manager Modal */}
        <SkillsManager
          isOpen={showSkillsManager}
          onClose={() => setShowSkillsManager(false)}
        />

        {/* Preferences Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Preferences</h3>
          <div className="space-y-2">
            <SettingsSection
              icon={<Bell size={18} />}
              title="Notifications"
              description="Manage notification preferences"
            />
            <SettingsSection
              icon={<Shield size={18} />}
              title="Privacy"
              description="Control your data and privacy settings"
            />
          </div>
        </motion.div>

        {/* Version Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center py-8"
        >
          <p className="text-xs text-zinc-600">
            Skinny Studio v1.0.0
          </p>
          <p className="text-xs text-zinc-700 mt-1">
            Powered by Replicate & Google AI
          </p>
        </motion.div>
      </div>
    </div>
  )
}
