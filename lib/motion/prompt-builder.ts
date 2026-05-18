// Skinny Motion - Prompt Builder
// Converts visual builder selections into structured prompts for Claude

import {
  getThemeById,
  getEffectById,
  type ColorTheme,
} from './presets';

export interface BuilderState {
  videoType: 'announcement' | 'product' | 'feature' | 'social' | 'explainer' | 'testimonial';
  effects: string[];
  colorTheme: string;
  customColors?: { primary: string; secondary: string; background?: string };
  speed: 'slow' | 'normal' | 'fast' | 'ultra';
  easing: string;
  intensity: number;
  title: string;
  subtitle?: string;
  details?: string;
  duration: number;
  naturalLanguage?: string;
  // Brand profile overrides
  brandProfile?: {
    primaryColor?: string;
    secondaryColor?: string;
    backgroundColor?: string;
    headingFont?: string;
    bodyFont?: string;
    logoUrl?: string;
    watermarkUrl?: string;
  };
}

// Comprehensive effect descriptions for Claude prompt generation
const EFFECT_DESCRIPTIONS: Record<string, string> = {
  // Text effects
  textReveal: 'TextReveal for character-by-character text animation with staggered timing',
  wordReveal: 'WordReveal for word-by-word text animation with spring physics',
  typewriter: 'Typewriter effect with blinking cursor and realistic typing rhythm',
  textSplit: 'SplitText that explodes apart then reforms dramatically',
  textWave: 'WaveText where letters animate in a smooth wave pattern',
  textBounce: 'BounceText with letters dropping and bouncing into place',
  textGlitch: 'GlitchText with digital distortion and RGB split effects',
  textMorph: 'MorphText that transforms between different states smoothly',
  textScale: 'ScaleText zooming in from center with overshoot',
  textSlide: 'SlideText entering from off-screen with momentum',

  // Particle effects
  floatingParticles: 'FloatingParticles as ambient background elements with gentle drift',
  burstParticles: 'BurstParticles for explosive reveal moments with outward force',
  sparkles: 'Sparkles for twinkling accent effects with random timing',
  orbitingParticles: 'OrbitingParticles circling around key elements in 3D',
  confetti: 'Confetti burst with colorful falling particles and rotation',
  dataFlow: 'DataFlow visualization showing connected flowing points',
  snowfall: 'Snowfall with gentle drifting particles and depth layers',
  fireflies: 'Fireflies with organic glowing particles that pulse',
  particleTrail: 'ParticleTrail following motion paths with fade',
  particleGrid: 'ParticleGrid network with animated connections',

  // Glow effects
  glowPulse: 'GlowPulse for pulsing emphasis behind key elements',
  ambientGlow: 'AmbientGlow for multi-color atmospheric lighting',
  glowRing: 'GlowRing with expanding ring animations on reveals',
  colorShiftGlow: 'ColorShiftGlow for dynamic color-cycling backgrounds',
  neonGlow: 'NeonGlow with electric buzzing neon light effect',
  spotlightGlow: 'SpotlightGlow with moving focus highlight',
  auraGlow: 'AuraGlow soft ethereal surrounding glow',
  laserGlow: 'LaserGlow sharp beam effect with bloom',

  // Card effects
  card3DFlip: 'Card3DFlip for 3D card flip transitions with perspective',
  card3DEntrance: 'Card3DEntrance for dramatic 3D tilt on entrance',
  staggeredCards: 'StaggeredCards for sequential card reveals with offset timing',
  depthStack: 'DepthStack for layered depth effects with parallax',
  cardFan: 'CardFan spreading cards like a dealer',
  cardShuffle: 'CardShuffle with shuffling deck animation',
  parallaxCard: 'ParallaxCard with depth parallax on movement',
  floatingCard: 'FloatingCard with levitating hover effect',

  // Motion effects
  motionBlur: 'MotionBlur for velocity-based blur on fast movements',
  speedLines: 'SpeedLines for dynamic speed emphasis radiating outward',
  zoomBlur: 'ZoomBlur for dramatic zoom-in/out blur effects',
  liquidMotion: 'LiquidMotion with fluid wavy organic transitions',
  elasticMotion: 'ElasticMotion with springy rubber-band movement',
  smoothFollow: 'SmoothFollow with eased following motion',
  wobble: 'Wobble with playful jelly-like movement',
  shake: 'Shake impact effect for emphasis',
  bounce: 'Bounce with bouncy entrances and exits',
  swipe: 'Swipe quick directional transition',

  // Border effects
  gradientBorder: 'GradientBorder for animated gradient borders that rotate',
  drawingBorder: 'DrawingBorder for self-drawing border animations with stroke',
  shimmerBorder: 'ShimmerBorder for shimmer highlight sweeping across',
  pulseBorder: 'PulseBorder for pulsing border emphasis',
  scanlineBorder: 'ScanlineBorder with scanning line effect',
  dashBorder: 'DashBorder with marching dashes animation',
  electricBorder: 'ElectricBorder with electrical current arcing',

  // Transitions
  fadeTransition: 'FadeTransition smooth opacity fade',
  slideTransition: 'SlideTransition directional slide between scenes',
  wipeTransition: 'WipeTransition clean horizontal/vertical wipe',
  zoomTransition: 'ZoomTransition zoom in/out between scenes',
  flipTransition: 'FlipTransition 3D flip between scenes',
  morphTransition: 'MorphTransition shape morphing between scenes',
  pixelTransition: 'PixelTransition pixelate dissolve effect',
  curtainTransition: 'CurtainTransition curtain reveal animation',
  circleTransition: 'CircleTransition circular iris wipe',
  glitchTransition: 'GlitchTransition digital glitch between scenes',

  // UI Elements
  mockupFloat: 'MockupFloat device mockup with floating animation',
  screenScroll: 'ScreenScroll UI demonstration with auto-scroll',
  cursorClick: 'CursorClick animated cursor with click effect',
  tooltipReveal: 'TooltipReveal popup animation',
  notificationPop: 'NotificationPop badge with pop animation',
  loadingSpinner: 'LoadingSpinner animated loader',
  progressBar: 'ProgressBar with animated fill',
  toggleSwitch: 'ToggleSwitch on/off animation',
  dropdown: 'Dropdown menu reveal animation',
  accordion: 'Accordion expanding sections',

  // Shapes
  geometricShapes: 'GeometricShapes animated abstract shapes',
  blobMorph: 'BlobMorph organic blob morphing',
  linesDraw: 'LinesDraw self-drawing vector lines',
  circleExpand: 'CircleExpand outward expanding circles',
  gridReveal: 'GridReveal grid pattern animation',
  wavyBackground: 'WavyBackground animated wavy pattern',
  gradientFlow: 'GradientFlow flowing gradient colors',
  meshGradient: 'MeshGradient dynamic mesh gradient',
  noiseTexture: 'NoiseTexture animated noise pattern',
  patternTile: 'PatternTile tiling pattern animation',

  // Data
  chartGrow: 'ChartGrow animated bar/line chart growth',
  pieReveal: 'PieReveal pie chart segment by segment',
  counterUp: 'CounterUp number counting animation',
  statReveal: 'StatReveal statistics with emphasis animation',
  graphDraw: 'GraphDraw self-drawing line graphs',
  metricPulse: 'MetricPulse pulsing metric highlight',
  percentageRing: 'PercentageRing circular percentage animation',
  timelineProgress: 'TimelineProgress timeline bar animation',

  // Branding
  logoReveal: 'LogoReveal dramatic logo entrance animation',
  logoPulse: 'LogoPulse pulsing logo emphasis',
  logoSpin: 'LogoSpin 3D logo rotation',
  logoShatter: 'LogoShatter break apart and reform effect',
  logoTrace: 'LogoTrace path tracing reveal',
  logoGlitch: 'LogoGlitch digital glitch logo reveal',
  logoStamp: 'LogoStamp stamp/seal press effect',
  watermark: 'Watermark subtle watermark fade in',
};

// Video type context for Claude
const VIDEO_TYPE_CONTEXT: Record<string, string> = {
  announcement: 'This is an announcement video for revealing something new. Make it exciting and impactful with a grand reveal moment. Build anticipation then deliver the payoff.',
  product: 'This is a product launch video showcasing a SaaS or app. Feature floating UI elements, device mockups, and professional aesthetics. Show the product in its best light.',
  feature: 'This is a feature highlight video demonstrating speed and performance. Use motion blur, speed lines, and dynamic elements to convey velocity and efficiency.',
  social: 'This is a short social media clip. Keep it punchy, attention-grabbing, and optimized for quick consumption. Hook viewers in the first second.',
  explainer: 'This is an explainer video walking through how something works. Use clear visual hierarchy, step-by-step reveals, and helpful UI demonstrations.',
  testimonial: 'This is a testimonial or quote highlight video. Feature large, impactful typography with emotional emphasis and trust-building visuals.',
};

// Speed context
const SPEED_CONTEXT: Record<string, string> = {
  slow: 'Use slow, elegant animation timing. Let elements breathe with longer durations (1.5x normal) and gentle, flowing movements.',
  normal: 'Use balanced animation timing. Standard pace that feels natural and professional.',
  fast: 'Use fast, energetic animation timing. Quick reveals, punchy movements, and dynamic pacing (0.6x normal duration).',
  ultra: 'Use ultra-fast, rapid-fire pacing. Instant impacts, minimal holds, maximum energy (0.4x normal duration).',
};

// Easing context
const EASING_CONTEXT: Record<string, string> = {
  smooth: 'Use smooth, professional easing (ease-out). Clean and polished feel.',
  bouncy: 'Use bouncy easing with playful overshoot. Energetic and fun.',
  elastic: 'Use elastic, springy easing. Organic and dynamic with oscillation.',
  dramatic: 'Use dramatic easing with sharp accelerations. Bold and impactful.',
  snappy: 'Use snappy easing with quick stops. Sharp and precise.',
  easeOut: 'Use ease-out timing. Fast start, smooth deceleration.',
  easeIn: 'Use ease-in timing. Slow start, fast finish.',
  linear: 'Use linear timing. Constant mechanical movement.',
  anticipate: 'Use anticipation timing. Wind up before the action.',
  overshoot: 'Use overshoot timing. Exceed target then settle back.',
};

export function buildPromptFromSelections(state: BuilderState): string {
  // Determine colors - brand profile takes priority, then custom colors, then theme
  let theme: { primary: string; secondary: string; bg: string };

  if (state.brandProfile?.primaryColor) {
    theme = {
      primary: state.brandProfile.primaryColor,
      secondary: state.brandProfile.secondaryColor || state.brandProfile.primaryColor,
      bg: state.brandProfile.backgroundColor || '#0D0D0D',
    };
  } else if (state.customColors) {
    theme = {
      primary: state.customColors.primary,
      secondary: state.customColors.secondary,
      bg: state.customColors.background || '#0D0D0D',
    };
  } else {
    const themeData = getThemeById(state.colorTheme);
    theme = themeData || { primary: '#D6FC51', secondary: '#B8E040', bg: '#0D0D0D' };
  }

  const sections: string[] = [];

  // 1. Opening with video type and content
  sections.push(`Create a ${state.videoType} video with the headline "${state.title}"${state.subtitle ? ` and subtitle "${state.subtitle}"` : ''}.`);

  // 2. Video type context
  sections.push(VIDEO_TYPE_CONTEXT[state.videoType] || VIDEO_TYPE_CONTEXT.announcement);

  // 3. Natural language additions from user chat
  if (state.naturalLanguage?.trim()) {
    sections.push(`\nUser's specific request: ${state.naturalLanguage.trim()}`);
  }

  // 4. Additional details if provided
  if (state.details?.trim()) {
    sections.push(`Additional context: ${state.details.trim()}`);
  }

  // 5. Effects to use
  if (state.effects.length > 0) {
    const effectDescriptions = state.effects
      .map(id => EFFECT_DESCRIPTIONS[id] || getEffectById(id)?.description)
      .filter(Boolean);

    if (effectDescriptions.length > 0) {
      sections.push(`\nUse these specific effects:\n- ${effectDescriptions.join('\n- ')}`);
    }
  }

  // 6. Color palette
  sections.push(`\nColor palette:\n- Primary accent: ${theme.primary}\n- Secondary: ${theme.secondary}\n- Background: ${theme.bg} (dark)`);

  // 7. Brand profile fonts (if available)
  if (state.brandProfile?.headingFont || state.brandProfile?.bodyFont) {
    sections.push(`\nTypography:\n- Heading font: ${state.brandProfile.headingFont || 'Inter'}\n- Body font: ${state.brandProfile.bodyFont || 'Inter'}`);
  }

  // 8. Logo/watermark instructions (if available)
  if (state.brandProfile?.logoUrl) {
    sections.push(`\nInclude the brand logo using the provided logoUrl. Position it appropriately for the video type.`);
  }
  if (state.brandProfile?.watermarkUrl) {
    sections.push(`Add a subtle watermark in the corner using the provided watermarkUrl.`);
  }

  // 9. Animation style
  const speedContext = SPEED_CONTEXT[state.speed] || SPEED_CONTEXT.normal;
  const easingContext = EASING_CONTEXT[state.easing] || EASING_CONTEXT.smooth;
  const intensityLabel = state.intensity <= 0.3 ? 'subtle' : state.intensity <= 0.5 ? 'medium' : state.intensity <= 0.8 ? 'bold' : 'maximum';

  sections.push(`\nAnimation style:\n- ${speedContext}\n- ${easingContext}\n- Intensity: ${state.intensity} (${intensityLabel})`);

  // 10. Duration
  sections.push(`\nVideo duration: ${state.duration} seconds at 30fps (${state.duration * 30} frames total).`);

  // 11. Closing instruction
  sections.push('\nMake it visually stunning and professional. Ensure smooth transitions and proper timing for all animations. The motion should feel premium and polished.');

  return sections.join('\n');
}

// Generate a preview summary of selections (for UI display)
export function getSelectionSummary(state: Partial<BuilderState>): string {
  const parts: string[] = [];

  if (state.videoType) {
    parts.push(`${state.videoType} video`);
  }

  if (state.title) {
    parts.push(`"${state.title}"`);
  }

  if (state.effects && state.effects.length > 0) {
    parts.push(`${state.effects.length} effects`);
  }

  if (state.colorTheme) {
    parts.push(`${state.colorTheme} theme`);
  }

  if (state.speed) {
    parts.push(`${state.speed} pace`);
  }

  return parts.join(' • ') || 'Configure your video...';
}

// Validate builder state before generation
export function validateBuilderState(state: BuilderState): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!state.title?.trim()) {
    errors.push('Title is required');
  }

  if (!state.videoType) {
    errors.push('Video type must be selected');
  }

  if (state.effects.length === 0) {
    errors.push('Select at least one effect');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Get effect description for tooltip/preview
export function getEffectDescription(effectId: string): string {
  return EFFECT_DESCRIPTIONS[effectId] || getEffectById(effectId)?.description || 'No description available';
}

export default buildPromptFromSelections;
