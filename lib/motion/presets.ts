// Skinny Motion - Presets Configuration
// All available effects, colors, and animation options

export interface ColorTheme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  bg: string;
}

export interface Effect {
  id: string;
  name: string;
  description: string;
  category?: string;
}

export interface EasingStyle {
  id: string;
  name: string;
  description: string;
  curve: number[];
}

// Video Types - Common SaaS video formats
export const VIDEO_TYPES = [
  { id: 'announcement', name: 'Announcement', description: 'New product or feature reveal', icon: 'megaphone' },
  { id: 'product', name: 'Product Launch', description: 'SaaS or app showcase', icon: 'rocket' },
  { id: 'feature', name: 'Feature Highlight', description: 'Speed and performance demo', icon: 'zap' },
  { id: 'social', name: 'Social Clip', description: 'Short intro or outro', icon: 'phone' },
  { id: 'explainer', name: 'Explainer', description: 'How it works walkthrough', icon: 'lightbulb' },
  { id: 'testimonial', name: 'Testimonial', description: 'Customer quote highlight', icon: 'message' },
] as const;

// Color Themes - Modern SaaS color palettes
export const COLOR_THEMES: ColorTheme[] = [
  { id: 'lime', name: 'Lime', primary: '#D6FC51', secondary: '#B8E040', bg: '#0D0D0D' },
  { id: 'purple', name: 'Purple Haze', primary: '#A78BFA', secondary: '#7C3AED', bg: '#0D0D0D' },
  { id: 'ocean', name: 'Ocean Blue', primary: '#60A5FA', secondary: '#3B82F6', bg: '#0D0D0D' },
  { id: 'sunset', name: 'Sunset', primary: '#F97316', secondary: '#EF4444', bg: '#0D0D0D' },
  { id: 'teal', name: 'Teal Mint', primary: '#4ECDC4', secondary: '#2DD4BF', bg: '#0D0D0D' },
  { id: 'pink', name: 'Hot Pink', primary: '#EC4899', secondary: '#DB2777', bg: '#0D0D0D' },
  { id: 'gold', name: 'Gold Premium', primary: '#F59E0B', secondary: '#D97706', bg: '#0D0D0D' },
  { id: 'emerald', name: 'Emerald', primary: '#10B981', secondary: '#059669', bg: '#0D0D0D' },
  { id: 'rose', name: 'Rose', primary: '#FB7185', secondary: '#F43F5E', bg: '#0D0D0D' },
  { id: 'cyber', name: 'Cyberpunk', primary: '#00FFFF', secondary: '#FF00FF', bg: '#0D0D0D' },
  { id: 'mono', name: 'Monochrome', primary: '#FFFFFF', secondary: '#A1A1AA', bg: '#0D0D0D' },
  { id: 'retro', name: 'Retro Neon', primary: '#FF6B6B', secondary: '#4ECDC4', bg: '#1A1A2E' },
];

// Effects organized by category
export const EFFECTS = {
  // Text animations
  text: [
    { id: 'textReveal', name: 'Text Reveal', description: 'Character by character animation' },
    { id: 'wordReveal', name: 'Word Reveal', description: 'Word by word animation' },
    { id: 'typewriter', name: 'Typewriter', description: 'Classic typing effect with cursor' },
    { id: 'textSplit', name: 'Split Text', description: 'Text splits and reforms dramatically' },
    { id: 'textWave', name: 'Wave Text', description: 'Letters animate in a wave pattern' },
    { id: 'textBounce', name: 'Bounce In', description: 'Letters bounce into position' },
    { id: 'textGlitch', name: 'Glitch Text', description: 'Digital glitch distortion effect' },
    { id: 'textMorph', name: 'Morph Text', description: 'Text morphs between states' },
    { id: 'textScale', name: 'Scale In', description: 'Text scales from center' },
    { id: 'textSlide', name: 'Slide In', description: 'Text slides in from edge' },
  ] as Effect[],

  // Particle systems
  particles: [
    { id: 'floatingParticles', name: 'Floating', description: 'Ambient floating particles' },
    { id: 'burstParticles', name: 'Burst', description: 'Explosion effect' },
    { id: 'sparkles', name: 'Sparkles', description: 'Twinkling sparkle effect' },
    { id: 'orbitingParticles', name: 'Orbiting', description: 'Particles in circular orbit' },
    { id: 'confetti', name: 'Confetti', description: 'Celebration confetti burst' },
    { id: 'dataFlow', name: 'Data Flow', description: 'Flowing data points visualization' },
    { id: 'snowfall', name: 'Snowfall', description: 'Gentle falling particles' },
    { id: 'fireflies', name: 'Fireflies', description: 'Organic glowing particles' },
    { id: 'particleTrail', name: 'Particle Trail', description: 'Particles following a path' },
    { id: 'particleGrid', name: 'Particle Grid', description: 'Connected particle network' },
  ] as Effect[],

  // Glow effects
  glows: [
    { id: 'glowPulse', name: 'Glow Pulse', description: 'Single pulsing glow' },
    { id: 'ambientGlow', name: 'Ambient Glow', description: 'Multi-layer color cycling' },
    { id: 'glowRing', name: 'Glow Ring', description: 'Expanding ring animation' },
    { id: 'colorShiftGlow', name: 'Color Shift', description: 'Color-shifting glow' },
    { id: 'neonGlow', name: 'Neon Glow', description: 'Electric neon light effect' },
    { id: 'spotlightGlow', name: 'Spotlight', description: 'Moving spotlight highlight' },
    { id: 'auraGlow', name: 'Aura', description: 'Soft surrounding aura' },
    { id: 'laserGlow', name: 'Laser', description: 'Sharp laser beam effect' },
  ] as Effect[],

  // 3D Card effects
  cards: [
    { id: 'card3DFlip', name: '3D Flip', description: 'Card flip animation' },
    { id: 'card3DEntrance', name: '3D Entrance', description: '3D tilt on entrance' },
    { id: 'staggeredCards', name: 'Staggered Cards', description: 'Sequential card reveal' },
    { id: 'depthStack', name: 'Depth Stack', description: 'Layered depth effect' },
    { id: 'cardFan', name: 'Card Fan', description: 'Cards spread like a fan' },
    { id: 'cardShuffle', name: 'Card Shuffle', description: 'Shuffling deck animation' },
    { id: 'parallaxCard', name: 'Parallax Card', description: 'Depth parallax on hover' },
    { id: 'floatingCard', name: 'Floating Card', description: 'Levitating card effect' },
  ] as Effect[],

  // Motion effects
  motion: [
    { id: 'motionBlur', name: 'Motion Blur', description: 'Velocity-based blur' },
    { id: 'speedLines', name: 'Speed Lines', description: 'Dynamic speed lines' },
    { id: 'zoomBlur', name: 'Zoom Blur', description: 'Zoom blur effect' },
    { id: 'liquidMotion', name: 'Liquid Motion', description: 'Fluid wavy transitions' },
    { id: 'elasticMotion', name: 'Elastic', description: 'Springy elastic movement' },
    { id: 'smoothFollow', name: 'Smooth Follow', description: 'Eased following motion' },
    { id: 'wobble', name: 'Wobble', description: 'Playful wobble effect' },
    { id: 'shake', name: 'Shake', description: 'Impact shake effect' },
    { id: 'bounce', name: 'Bounce', description: 'Bouncy entrance/exit' },
    { id: 'swipe', name: 'Swipe', description: 'Quick swipe transition' },
  ] as Effect[],

  // Border effects
  borders: [
    { id: 'gradientBorder', name: 'Gradient Border', description: 'Animated gradient border' },
    { id: 'drawingBorder', name: 'Drawing Border', description: 'Self-drawing border' },
    { id: 'shimmerBorder', name: 'Shimmer', description: 'Shimmer effect overlay' },
    { id: 'pulseBorder', name: 'Pulse Border', description: 'Pulsing border effect' },
    { id: 'scanlineBorder', name: 'Scanline', description: 'Scanning line effect' },
    { id: 'dashBorder', name: 'Dash March', description: 'Marching dashes animation' },
    { id: 'electricBorder', name: 'Electric', description: 'Electrical current effect' },
  ] as Effect[],

  // Transitions
  transitions: [
    { id: 'fadeTransition', name: 'Fade', description: 'Smooth fade in/out' },
    { id: 'slideTransition', name: 'Slide', description: 'Directional slide' },
    { id: 'wipeTransition', name: 'Wipe', description: 'Clean wipe effect' },
    { id: 'zoomTransition', name: 'Zoom', description: 'Zoom in/out transition' },
    { id: 'flipTransition', name: 'Flip', description: '3D flip transition' },
    { id: 'morphTransition', name: 'Morph', description: 'Shape morphing transition' },
    { id: 'pixelTransition', name: 'Pixel', description: 'Pixelate dissolve' },
    { id: 'curtainTransition', name: 'Curtain', description: 'Curtain reveal effect' },
    { id: 'circleTransition', name: 'Circle Wipe', description: 'Circular reveal' },
    { id: 'glitchTransition', name: 'Glitch', description: 'Digital glitch transition' },
  ] as Effect[],

  // UI Elements
  ui: [
    { id: 'mockupFloat', name: 'Floating Mockup', description: 'Device mockup with float' },
    { id: 'screenScroll', name: 'Screen Scroll', description: 'Scrolling UI demonstration' },
    { id: 'cursorClick', name: 'Cursor Click', description: 'Animated cursor interaction' },
    { id: 'tooltipReveal', name: 'Tooltip', description: 'Tooltip popup animation' },
    { id: 'notificationPop', name: 'Notification', description: 'Notification badge pop' },
    { id: 'loadingSpinner', name: 'Loading', description: 'Loading animation' },
    { id: 'progressBar', name: 'Progress Bar', description: 'Animated progress indicator' },
    { id: 'toggleSwitch', name: 'Toggle', description: 'Toggle switch animation' },
    { id: 'dropdown', name: 'Dropdown', description: 'Dropdown menu reveal' },
    { id: 'accordion', name: 'Accordion', description: 'Expanding sections' },
  ] as Effect[],

  // Shapes & Graphics
  shapes: [
    { id: 'geometricShapes', name: 'Geometric', description: 'Animated geometric shapes' },
    { id: 'blobMorph', name: 'Blob Morph', description: 'Organic blob morphing' },
    { id: 'linesDraw', name: 'Line Draw', description: 'Self-drawing lines' },
    { id: 'circleExpand', name: 'Circle Expand', description: 'Expanding circles' },
    { id: 'gridReveal', name: 'Grid Reveal', description: 'Grid pattern animation' },
    { id: 'wavyBackground', name: 'Wavy BG', description: 'Animated wavy background' },
    { id: 'gradientFlow', name: 'Gradient Flow', description: 'Flowing gradient colors' },
    { id: 'meshGradient', name: 'Mesh Gradient', description: 'Dynamic mesh gradient' },
    { id: 'noiseTexture', name: 'Noise', description: 'Animated noise texture' },
    { id: 'patternTile', name: 'Pattern Tile', description: 'Tiling pattern animation' },
  ] as Effect[],

  // Data Visualization
  data: [
    { id: 'chartGrow', name: 'Chart Growth', description: 'Animated bar/line chart' },
    { id: 'pieReveal', name: 'Pie Chart', description: 'Pie chart segment reveal' },
    { id: 'counterUp', name: 'Counter', description: 'Number counting animation' },
    { id: 'statReveal', name: 'Stat Reveal', description: 'Statistics with emphasis' },
    { id: 'graphDraw', name: 'Graph Draw', description: 'Self-drawing graphs' },
    { id: 'metricPulse', name: 'Metric Pulse', description: 'Pulsing metric highlight' },
    { id: 'percentageRing', name: 'Percentage Ring', description: 'Circular percentage' },
    { id: 'timelineProgress', name: 'Timeline', description: 'Timeline progression' },
  ] as Effect[],

  // Logo & Branding
  branding: [
    { id: 'logoReveal', name: 'Logo Reveal', description: 'Dramatic logo entrance' },
    { id: 'logoPulse', name: 'Logo Pulse', description: 'Pulsing logo emphasis' },
    { id: 'logoSpin', name: 'Logo Spin', description: '3D logo rotation' },
    { id: 'logoShatter', name: 'Logo Shatter', description: 'Break apart and reform' },
    { id: 'logoTrace', name: 'Logo Trace', description: 'Path tracing reveal' },
    { id: 'logoGlitch', name: 'Logo Glitch', description: 'Digital glitch reveal' },
    { id: 'logoStamp', name: 'Logo Stamp', description: 'Stamp/seal effect' },
    { id: 'watermark', name: 'Watermark', description: 'Subtle watermark fade' },
  ] as Effect[],
};

// Get all effects as a flat array
export const ALL_EFFECTS = Object.values(EFFECTS).flat();

// Animation Speeds
export const SPEED_OPTIONS = [
  { id: 'slow', name: 'Slow', description: 'Relaxed, elegant pace', multiplier: 1.5 },
  { id: 'normal', name: 'Normal', description: 'Balanced timing', multiplier: 1.0 },
  { id: 'fast', name: 'Fast', description: 'Energetic, punchy', multiplier: 0.6 },
  { id: 'ultra', name: 'Ultra', description: 'Rapid-fire pace', multiplier: 0.4 },
] as const;

// Easing Styles
export const EASING_STYLES: EasingStyle[] = [
  { id: 'smooth', name: 'Smooth', description: 'Clean, professional', curve: [0.22, 1, 0.36, 1] },
  { id: 'bouncy', name: 'Bouncy', description: 'Playful bounce', curve: [0.68, -0.55, 0.265, 1.55] },
  { id: 'elastic', name: 'Elastic', description: 'Springy feel', curve: [0.175, 0.885, 0.32, 1.275] },
  { id: 'dramatic', name: 'Dramatic', description: 'Bold emphasis', curve: [0.87, 0, 0.13, 1] },
  { id: 'snappy', name: 'Snappy', description: 'Quick and sharp', curve: [0.5, 1.5, 0.5, 1] },
  { id: 'easeOut', name: 'Ease Out', description: 'Fast start, slow end', curve: [0, 0, 0.2, 1] },
  { id: 'easeIn', name: 'Ease In', description: 'Slow start, fast end', curve: [0.4, 0, 1, 1] },
  { id: 'linear', name: 'Linear', description: 'Constant speed', curve: [0, 0, 1, 1] },
  { id: 'anticipate', name: 'Anticipate', description: 'Wind up before action', curve: [0.36, 0, 0.66, -0.56] },
  { id: 'overshoot', name: 'Overshoot', description: 'Exceed then settle', curve: [0.34, 1.56, 0.64, 1] },
];

// Intensity Presets
export const INTENSITY_OPTIONS = [
  { id: 'subtle', name: 'Subtle', value: 0.3, description: 'Minimal, understated' },
  { id: 'medium', name: 'Medium', value: 0.5, description: 'Balanced presence' },
  { id: 'bold', name: 'Bold', value: 0.8, description: 'Strong, noticeable' },
  { id: 'maximum', name: 'Maximum', value: 1.0, description: 'Full intensity' },
] as const;

// Font Styles
export const FONT_STYLES = [
  { id: 'modern', name: 'Modern Sans', description: 'Clean and contemporary', fontFamily: 'Inter, SF Pro, -apple-system' },
  { id: 'display', name: 'Bold Display', description: 'Strong and impactful', fontFamily: 'Bebas Neue, Montserrat' },
  { id: 'serif', name: 'Elegant Serif', description: 'Classic and refined', fontFamily: 'Playfair Display, Georgia' },
  { id: 'mono', name: 'Monospace', description: 'Technical and precise', fontFamily: 'JetBrains Mono, Fira Code' },
  { id: 'rounded', name: 'Rounded', description: 'Friendly and approachable', fontFamily: 'Nunito, Varela Round' },
  { id: 'condensed', name: 'Condensed', description: 'Tight and impactful', fontFamily: 'Oswald, Barlow Condensed' },
] as const;

// Aspect Ratios
export const ASPECT_RATIOS = [
  { id: '16:9', name: 'Widescreen', description: 'YouTube, presentations', width: 1920, height: 1080 },
  { id: '9:16', name: 'Vertical', description: 'TikTok, Reels, Stories', width: 1080, height: 1920 },
  { id: '1:1', name: 'Square', description: 'Instagram feed, LinkedIn', width: 1080, height: 1080 },
  { id: '4:5', name: 'Portrait', description: 'Instagram portrait', width: 1080, height: 1350 },
  { id: '4:3', name: 'Standard', description: 'Classic format', width: 1440, height: 1080 },
] as const;

// Helper functions
export function getThemeById(id: string): ColorTheme | undefined {
  return COLOR_THEMES.find(t => t.id === id);
}

export function getEffectById(id: string): Effect | undefined {
  return ALL_EFFECTS.find(e => e.id === id);
}

export function getEasingById(id: string): EasingStyle | undefined {
  return EASING_STYLES.find(e => e.id === id);
}

export function getEffectsByCategory(category: keyof typeof EFFECTS): Effect[] {
  return EFFECTS[category] || [];
}

export function getEffectCategories(): string[] {
  return Object.keys(EFFECTS);
}
