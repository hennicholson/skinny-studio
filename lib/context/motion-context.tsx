'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  BuilderState,
  estimateTokenCost,
  TokenEstimate,
  validateBuilderState,
  VIDEO_TYPES,
} from '@/lib/motion';

// Types for motion projects and brand profiles
export interface BrandProfile {
  id: string;
  whop_user_id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  accent_colors: string[];
  heading_font: string;
  body_font: string;
  custom_fonts: string[];
  logo_url: string | null;
  logo_dark_url: string | null;
  icon_url: string | null;
  watermark_url: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface MotionScene {
  id: string;
  project_id: string;
  name: string;
  start_frame: number;
  end_frame: number;
  duration_seconds: number;
  content: Record<string, any>;
  effects: string[];
  elements: MotionElement[];
  generated_code: string | null;
  status: 'pending' | 'generated' | 'edited';
  sort_order: number;
}

export interface MotionElement {
  id: string;
  type: 'text' | 'shape' | 'particle' | 'effect' | 'media';
  name: string;
  content: Record<string, any>;
  effects: string[];
  timing: {
    startFrame: number;
    endFrame: number;
  };
}

export interface MotionProject {
  id: string;
  whop_user_id: string;
  brand_profile_id: string | null;
  title: string;
  description: string | null;
  status: 'draft' | 'generating' | 'rendering' | 'complete' | 'error';
  video_type: string;
  effects: string[];
  color_theme: string | null;
  custom_colors: { primary: string; secondary: string; background?: string } | null;
  speed: 'slow' | 'normal' | 'fast' | 'ultra';
  easing: string;
  intensity: number;
  duration: number;
  headline: string | null;
  subtitle: string | null;
  details: string | null;
  natural_language: string | null;
  timeline: MotionScene[];
  generated_code: string | null;
  output_url: string | null;
  thumbnail_url: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  created_at: string;
  updated_at: string;
}

// Default builder state
const defaultBuilderState: BuilderState = {
  videoType: 'announcement',
  effects: [],
  colorTheme: 'lime',
  speed: 'normal',
  easing: 'smooth',
  intensity: 0.5,
  title: '',
  subtitle: '',
  details: '',
  duration: 10,
  naturalLanguage: '',
};

interface MotionContextType {
  // Builder State
  builderState: BuilderState;
  setBuilderState: React.Dispatch<React.SetStateAction<BuilderState>>;
  updateBuilderField: <K extends keyof BuilderState>(field: K, value: BuilderState[K]) => void;
  resetBuilder: () => void;

  // Token Estimation
  tokenEstimate: TokenEstimate | null;
  refreshEstimate: () => void;

  // Validation
  validationErrors: string[];
  isValid: boolean;

  // Brand Profiles
  brandProfiles: BrandProfile[];
  selectedBrandProfile: BrandProfile | null;
  setBrandProfiles: React.Dispatch<React.SetStateAction<BrandProfile[]>>;
  selectBrandProfile: (profile: BrandProfile | null) => void;
  loadBrandProfiles: () => Promise<void>;

  // Projects
  projects: MotionProject[];
  currentProject: MotionProject | null;
  setProjects: React.Dispatch<React.SetStateAction<MotionProject[]>>;
  setCurrentProject: React.Dispatch<React.SetStateAction<MotionProject | null>>;
  loadProjects: () => Promise<void>;
  saveProject: () => Promise<MotionProject | null>;
  reloadCurrentProject: () => Promise<MotionProject | null>;

  // Generation State
  isGenerating: boolean;
  generationProgress: string;
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  setGenerationProgress: React.Dispatch<React.SetStateAction<string>>;

  // Rendering State
  isRendering: boolean;
  renderProgress: number;
  setIsRendering: React.Dispatch<React.SetStateAction<boolean>>;
  setRenderProgress: React.Dispatch<React.SetStateAction<number>>;

  // Timeline
  activeSceneId: string | null;
  setActiveSceneId: React.Dispatch<React.SetStateAction<string | null>>;
  activeElementId: string | null;
  setActiveElementId: React.Dispatch<React.SetStateAction<string | null>>;

  // Playback
  currentFrame: number;
  setCurrentFrame: React.Dispatch<React.SetStateAction<number>>;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
}

const MotionContext = createContext<MotionContextType | undefined>(undefined);

export function MotionProvider({ children }: { children: ReactNode }) {
  // Builder State
  const [builderState, setBuilderState] = useState<BuilderState>(defaultBuilderState);

  // Token Estimation
  const [tokenEstimate, setTokenEstimate] = useState<TokenEstimate | null>(null);

  // Validation
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Brand Profiles
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrandProfile, setSelectedBrandProfile] = useState<BrandProfile | null>(null);

  // Projects
  const [projects, setProjects] = useState<MotionProject[]>([]);
  const [currentProject, setCurrentProject] = useState<MotionProject | null>(null);

  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');

  // Rendering State
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  // Timeline
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [activeElementId, setActiveElementId] = useState<string | null>(null);

  // Playback
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Auth headers helper - same pattern as storyboard-context
  const getAuthHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (typeof window !== 'undefined') {
      const devToken = localStorage.getItem('whop-dev-token');
      const devUserId = localStorage.getItem('whop-dev-user-id');

      if (devToken) headers['x-whop-user-token'] = devToken;
      if (devUserId) headers['x-whop-user-id'] = devUserId;
    }

    return headers;
  }, []);

  // Update a single field in builder state
  const updateBuilderField = useCallback(<K extends keyof BuilderState>(
    field: K,
    value: BuilderState[K]
  ) => {
    setBuilderState(prev => ({ ...prev, [field]: value }));
  }, []);

  // Reset builder to defaults
  const resetBuilder = useCallback(() => {
    setBuilderState(defaultBuilderState);
    setSelectedBrandProfile(null);
    setCurrentProject(null);
    setActiveSceneId(null);
    setActiveElementId(null);
    setCurrentFrame(0);
    setIsPlaying(false);
  }, []);

  // Refresh token estimate
  const refreshEstimate = useCallback(() => {
    // Create state with brand profile colors if selected
    const stateWithBrand: BuilderState = {
      ...builderState,
      brandProfile: selectedBrandProfile ? {
        primaryColor: selectedBrandProfile.primary_color,
        secondaryColor: selectedBrandProfile.secondary_color,
        backgroundColor: selectedBrandProfile.background_color,
        headingFont: selectedBrandProfile.heading_font,
        bodyFont: selectedBrandProfile.body_font,
        logoUrl: selectedBrandProfile.logo_url || undefined,
        watermarkUrl: selectedBrandProfile.watermark_url || undefined,
      } : undefined,
    };

    const estimate = estimateTokenCost(stateWithBrand);
    setTokenEstimate(estimate);

    // Validate
    const validation = validateBuilderState(stateWithBrand);
    setValidationErrors(validation.errors);
  }, [builderState, selectedBrandProfile]);

  // Select brand profile and apply its colors
  const selectBrandProfile = useCallback((profile: BrandProfile | null) => {
    setSelectedBrandProfile(profile);

    if (profile) {
      // Apply brand colors as custom colors
      setBuilderState(prev => ({
        ...prev,
        customColors: {
          primary: profile.primary_color,
          secondary: profile.secondary_color,
          background: profile.background_color,
        },
      }));
    }
  }, []);

  // Load brand profiles from API
  const loadBrandProfiles = useCallback(async () => {
    try {
      const response = await fetch('/api/motion/brands', { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setBrandProfiles(data.profiles || []);

        // Auto-select default profile if one exists
        const defaultProfile = data.profiles?.find((p: BrandProfile) => p.is_default);
        if (defaultProfile) {
          selectBrandProfile(defaultProfile);
        }
      }
    } catch (err) {
      console.error('Failed to load brand profiles:', err);
    }
  }, [selectBrandProfile, getAuthHeaders]);

  // Load projects from API
  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch('/api/motion', { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  }, [getAuthHeaders]);

  // Save current builder state as a project
  const saveProject = useCallback(async (): Promise<MotionProject | null> => {
    try {
      const projectData = {
        title: builderState.title || 'Untitled Project',
        description: builderState.details || null,
        video_type: builderState.videoType,
        effects: builderState.effects,
        color_theme: builderState.colorTheme,
        custom_colors: builderState.customColors || null,
        speed: builderState.speed,
        easing: builderState.easing,
        intensity: builderState.intensity,
        duration: builderState.duration,
        headline: builderState.title,
        subtitle: builderState.subtitle || null,
        details: builderState.details || null,
        natural_language: builderState.naturalLanguage || null,
        brand_profile_id: selectedBrandProfile?.id || null,
      };

      const url = currentProject ? `/api/motion/${currentProject.id}` : '/api/motion';
      const method = currentProject ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(projectData),
      });

      if (response.ok) {
        const data = await response.json();
        const savedProject = data.project;
        setCurrentProject(savedProject);

        // Refresh projects list
        await loadProjects();

        return savedProject;
      }

      return null;
    } catch (err) {
      console.error('Failed to save project:', err);
      return null;
    }
  }, [builderState, selectedBrandProfile, currentProject, loadProjects, getAuthHeaders]);

  // Reload current project (to get updated generated_code after generation)
  const reloadCurrentProject = useCallback(async (): Promise<MotionProject | null> => {
    if (!currentProject) return null;

    try {
      const response = await fetch(`/api/motion/${currentProject.id}`, {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        const project = data.project;
        setCurrentProject(project);
        return project;
      }

      return null;
    } catch (err) {
      console.error('Failed to reload project:', err);
      return null;
    }
  }, [currentProject, getAuthHeaders]);

  // Compute isValid
  const isValid = validationErrors.length === 0 && builderState.title.trim() !== '';

  return (
    <MotionContext.Provider
      value={{
        // Builder State
        builderState,
        setBuilderState,
        updateBuilderField,
        resetBuilder,

        // Token Estimation
        tokenEstimate,
        refreshEstimate,

        // Validation
        validationErrors,
        isValid,

        // Brand Profiles
        brandProfiles,
        selectedBrandProfile,
        setBrandProfiles,
        selectBrandProfile,
        loadBrandProfiles,

        // Projects
        projects,
        currentProject,
        setProjects,
        setCurrentProject,
        loadProjects,
        saveProject,
        reloadCurrentProject,

        // Generation State
        isGenerating,
        generationProgress,
        setIsGenerating,
        setGenerationProgress,

        // Rendering State
        isRendering,
        renderProgress,
        setIsRendering,
        setRenderProgress,

        // Timeline
        activeSceneId,
        setActiveSceneId,
        activeElementId,
        setActiveElementId,

        // Playback
        currentFrame,
        setCurrentFrame,
        isPlaying,
        setIsPlaying,
      }}
    >
      {children}
    </MotionContext.Provider>
  );
}

export function useMotion() {
  const context = useContext(MotionContext);
  if (context === undefined) {
    throw new Error('useMotion must be used within a MotionProvider');
  }
  return context;
}

export default MotionProvider;
