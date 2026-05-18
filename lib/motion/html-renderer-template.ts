// HTML Renderer Template Generator
// Creates a self-contained HTML file that renders the user's specific motion graphic

export interface RenderConfig {
  title: string;
  code: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
}

export function generateRendererHTML(config: RenderConfig): string {
  const {
    title,
    code,
    duration,
    width,
    height,
    fps,
    primaryColor,
    secondaryColor,
    backgroundColor,
  } = config;

  const totalFrames = duration * fps;

  // Process the code to work in browser context
  // Remove TypeScript types, imports, and export statements
  const processedCode = code
    // Remove multi-line import statements (handles imports spanning multiple lines)
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];?/g, '')
    // Remove single-line named imports
    .replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?/g, '')
    // Remove default imports
    .replace(/import\s+\w+\s+from\s+['"][^'"]+['"];?/g, '')
    // Remove side-effect imports
    .replace(/import\s+['"][^'"]+['"];?/g, '')
    // Remove any remaining import lines
    .replace(/^import\s+.*$/gm, '')
    // Remove export default
    .replace(/export\s+default\s+/, 'window.GeneratedVideo = ')
    // Remove named exports
    .replace(/export\s+const\s+/g, 'const ')
    .replace(/export\s+function\s+/g, 'function ')
    // Remove TypeScript type annotations
    .replace(/:\s*React\.FC\s*/g, ' ')
    .replace(/:\s*React\.FC<[^>]*>\s*/g, ' ')
    .replace(/:\s*\{[^}]*\}\s*(?==)/g, ' ')
    // Remove angle brackets type params
    .replace(/<[A-Z][^<>]*>/g, '')
    // Make the component available globally
    .replace(/const\s+GeneratedVideo\s*=/, 'window.GeneratedVideo =')
    .replace(/function\s+GeneratedVideo\s*\(/, 'window.GeneratedVideo = function(')
    // Clean up extra blank lines left from removed imports
    .replace(/\n\s*\n\s*\n/g, '\n\n');

  // Escape for embedding
  const escapedCode = processedCode
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Skinny Renderer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root { --lime: ${primaryColor}; --secondary: ${secondaryColor}; --bg: #0a0a0a; --surface: #141414; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: white; min-height: 100vh; display: flex; flex-direction: column; }
    .header { padding: 16px 24px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between; }
    .logo { display: flex; align-items: center; gap: 12px; }
    .logo-icon { width: 32px; height: 32px; background: linear-gradient(135deg, var(--lime), var(--secondary)); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
    .title { font-size: 14px; font-weight: 600; }
    .subtitle { font-size: 11px; color: rgba(255,255,255,0.5); }
    .main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; gap: 24px; }
    .preview-container { background: #000; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.5); position: relative; }
    #previewFrame { width: ${Math.min(width, 960)}px; height: ${Math.round((Math.min(width, 960) / width) * height)}px; border: none; background: ${backgroundColor}; }
    .render-area { position: fixed; top: -9999px; left: -9999px; width: ${width}px; height: ${height}px; overflow: hidden; }
    #renderContainer { width: ${width}px; height: ${height}px; position: relative; background: ${backgroundColor}; }
    .controls { display: flex; flex-direction: column; align-items: center; gap: 16px; width: 100%; max-width: 600px; }
    .progress-container { width: 100%; display: none; }
    .progress-container.active { display: block; }
    .progress-header { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
    .progress-percent { color: var(--lime); font-weight: 600; }
    .progress-bar { height: 6px; background: var(--surface); border-radius: 3px; overflow: hidden; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, var(--lime), var(--secondary)); width: 0%; transition: width 0.1s; }
    .btn { background: linear-gradient(135deg, var(--lime), var(--secondary)); border: none; border-radius: 10px; padding: 14px 32px; font-size: 14px; font-weight: 600; color: #000; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s; }
    .btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(214,252,81,0.3); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: var(--surface); color: white; border: 1px solid rgba(255,255,255,0.1); }
    .btn-row { display: flex; gap: 12px; }
    .info { font-size: 12px; color: rgba(255,255,255,0.4); text-align: center; }
    .success { display: none; text-align: center; padding: 20px; background: var(--surface); border: 1px solid var(--lime); border-radius: 12px; }
    .success.show { display: block; }
    .success h3 { margin-bottom: 4px; }
    .success p { color: rgba(255,255,255,0.5); font-size: 13px; }
    .warning { display: none; background: rgba(255,100,100,0.1); border: 1px solid rgba(255,100,100,0.3); border-radius: 12px; padding: 16px; text-align: center; max-width: 500px; }
    .warning.show { display: block; }
    .playback { display: flex; align-items: center; gap: 12px; width: 100%; }
    .playback input[type="range"] { flex: 1; height: 6px; -webkit-appearance: none; background: var(--surface); border-radius: 3px; cursor: pointer; }
    .playback input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; background: white; border-radius: 50%; cursor: grab; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
    .frame-info { font-size: 12px; color: rgba(255,255,255,0.5); min-width: 100px; text-align: right; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: var(--lime); color: #000; border-radius: 6px; font-size: 11px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">
      <div class="logo-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </div>
      <div>
        <div class="title">${title}</div>
        <div class="subtitle">${duration}s • ${width}×${height} • ${fps}fps</div>
      </div>
    </div>
    <div class="badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
      Skinny Studio
    </div>
  </div>

  <div class="main">
    <div class="warning" id="warning">
      <strong>⚠️ Browser Not Supported</strong><br><br>
      <span style="font-size:13px;color:rgba(255,255,255,0.7)">MediaRecorder API is required for video recording.</span><br>
      <span style="font-size:12px;color:rgba(255,255,255,0.5)">Please use a modern browser like Chrome, Firefox, Edge, or Safari</span>
    </div>

    <div class="preview-container">
      <iframe id="previewFrame" scrolling="no"></iframe>
    </div>

    <div class="controls">
      <div class="playback">
        <button class="btn btn-secondary" id="playBtn" style="padding:10px 16px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <input type="range" id="scrubber" min="0" max="${totalFrames - 1}" value="0">
        <span class="frame-info" id="frameInfo">Frame 1 / ${totalFrames}</span>
      </div>

      <div class="progress-container" id="progressContainer">
        <div class="progress-header">
          <span id="progressStage">Preparing...</span>
          <span class="progress-percent" id="progressPercent">0%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" id="progressFill"></div>
        </div>
      </div>

      <div class="success" id="success">
        <h3>✓ Render Complete!</h3>
        <p>Your video has been downloaded</p>
      </div>

      <div class="export-info" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 16px; text-align: center; max-width: 400px;">
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">Export Options</div>
        <div style="font-size: 12px; color: rgba(255,255,255,0.6); line-height: 1.5;">
          <strong>Screen Record:</strong> Use your system's screen recorder to capture this preview<br><br>
          <strong>Desktop App:</strong> For high-quality MP4 export, use the <a href="https://github.com/skinny-studio/skinny-renderer/releases" target="_blank" style="color: var(--lime);">Skinny Renderer</a> app
        </div>
      </div>

      <p class="info">Preview runs locally in your browser.</p>
    </div>
  </div>

  <!-- Hidden render area -->
  <div class="render-area">
    <div id="renderContainer"></div>
  </div>

  <!-- Load libraries -->
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"><\/script>
  <script src="https://html2canvas.hertzen.com/dist/html2canvas.min.js"><\/script>

  <!-- Remotion Mocks (no JSX, uses React.createElement) -->
  <script>
    // ============================================
    // Configuration
    // ============================================
    const CONFIG = {
      width: ${width},
      height: ${height},
      fps: ${fps},
      totalFrames: ${totalFrames},
      duration: ${duration},
      backgroundColor: '${backgroundColor}',
      primaryColor: '${primaryColor}',
      secondaryColor: '${secondaryColor}',
    };

    // ============================================
    // Remotion Runtime Mocks
    // ============================================
    const RemotionContext = {
      frame: 0,
      fps: CONFIG.fps,
      width: CONFIG.width,
      height: CONFIG.height,
      durationInFrames: CONFIG.totalFrames,
    };

    // useCurrentFrame hook
    window.useCurrentFrame = function() {
      return RemotionContext.frame;
    };

    // useVideoConfig hook
    window.useVideoConfig = function() {
      return {
        fps: RemotionContext.fps,
        width: RemotionContext.width,
        height: RemotionContext.height,
        durationInFrames: RemotionContext.durationInFrames,
        id: 'generated-video',
        defaultProps: {},
      };
    };

    // interpolate function
    window.interpolate = function(input, inputRange, outputRange, options) {
      options = options || {};
      const extrapolateLeft = options.extrapolateLeft || 'extend';
      const extrapolateRight = options.extrapolateRight || 'extend';

      if (inputRange.length !== outputRange.length) {
        throw new Error('inputRange and outputRange must have the same length');
      }

      // Handle out of range - left
      if (input <= inputRange[0]) {
        if (extrapolateLeft === 'clamp') return outputRange[0];
        if (extrapolateLeft === 'identity') return input;
        const slope = (outputRange[1] - outputRange[0]) / (inputRange[1] - inputRange[0]);
        return outputRange[0] + slope * (input - inputRange[0]);
      }

      // Handle out of range - right
      if (input >= inputRange[inputRange.length - 1]) {
        if (extrapolateRight === 'clamp') return outputRange[outputRange.length - 1];
        if (extrapolateRight === 'identity') return input;
        const lastIdx = inputRange.length - 1;
        const slope = (outputRange[lastIdx] - outputRange[lastIdx - 1]) / (inputRange[lastIdx] - inputRange[lastIdx - 1]);
        return outputRange[lastIdx] + slope * (input - inputRange[lastIdx]);
      }

      // Find the segment
      for (let i = 0; i < inputRange.length - 1; i++) {
        if (input >= inputRange[i] && input <= inputRange[i + 1]) {
          const t = (input - inputRange[i]) / (inputRange[i + 1] - inputRange[i]);
          return outputRange[i] + t * (outputRange[i + 1] - outputRange[i]);
        }
      }

      return outputRange[outputRange.length - 1];
    };

    // spring function
    window.spring = function(config) {
      const { frame, fps, config: springConfig = {} } = config;
      const { damping = 10, mass = 1, stiffness = 100, overshootClamping = false } = springConfig;

      const t = frame / fps;
      const omega = Math.sqrt(stiffness / mass);
      const zeta = damping / (2 * Math.sqrt(stiffness * mass));

      let value;
      if (zeta < 1) {
        const omegaD = omega * Math.sqrt(1 - zeta * zeta);
        value = 1 - Math.exp(-zeta * omega * t) * (Math.cos(omegaD * t) + (zeta * omega / omegaD) * Math.sin(omegaD * t));
      } else if (zeta === 1) {
        value = 1 - (1 + omega * t) * Math.exp(-omega * t);
      } else {
        const s1 = -omega * (zeta - Math.sqrt(zeta * zeta - 1));
        const s2 = -omega * (zeta + Math.sqrt(zeta * zeta - 1));
        value = 1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1);
      }

      if (overshootClamping) {
        value = Math.min(1, Math.max(0, value));
      }

      return value;
    };

    // Easing functions
    window.Easing = {
      linear: function(t) { return t; },
      ease: function(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
      easeIn: function(t) { return t * t * t; },
      easeOut: function(t) { return (--t) * t * t + 1; },
      easeInOut: function(t) { return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1; },
      bezier: function(x1, y1, x2, y2) {
        return function(t) {
          const cx = 3 * x1;
          const bx = 3 * (x2 - x1) - cx;
          const ax = 1 - cx - bx;
          const cy = 3 * y1;
          const by = 3 * (y2 - y1) - cy;
          const ay = 1 - cy - by;
          const sampleX = function(t) { return ((ax * t + bx) * t + cx) * t; };
          const sampleY = function(t) { return ((ay * t + by) * t + cy) * t; };
          let t2 = t;
          for (let i = 0; i < 8; i++) {
            const x = sampleX(t2) - t;
            if (Math.abs(x) < 0.001) break;
            const dx = (3 * ax * t2 + 2 * bx) * t2 + cx;
            if (dx === 0) break;
            t2 -= x / dx;
          }
          return sampleY(t2);
        };
      },
      sin: function(t) { return 1 - Math.cos((t * Math.PI) / 2); },
      circle: function(t) { return 1 - Math.sqrt(1 - t * t); },
      exp: function(t) { return t === 0 ? 0 : Math.pow(2, 10 * (t - 1)); },
      bounce: function(t) {
        if (t < 1 / 2.75) return 7.5625 * t * t;
        if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
        if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
        return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
      },
      back: function(s) {
        s = s || 1.70158;
        return function(t) { return t * t * ((s + 1) * t - s); };
      },
      elastic: function(a, p) {
        a = a || 1;
        p = p || 0.3;
        return function(t) {
          if (t === 0 || t === 1) return t;
          const s = p / (2 * Math.PI) * Math.asin(1 / a);
          return -(a * Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1 - s) * (2 * Math.PI) / p));
        };
      },
      in: function(easing) { return easing; },
      out: function(easing) { return function(t) { return 1 - easing(1 - t); }; },
      inOut: function(easing) {
        return function(t) {
          return t < 0.5 ? easing(t * 2) / 2 : 1 - easing((1 - t) * 2) / 2;
        };
      },
    };

    // AbsoluteFill component
    window.AbsoluteFill = function(props) {
      const { children, style = {}, className = '' } = props || {};
      return React.createElement('div', {
        className: className,
        style: Object.assign({
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }, style)
      }, children);
    };

    // Sequence component
    window.Sequence = function(props) {
      const { children, from = 0, durationInFrames, layout = 'absolute-fill', style = {} } = props || {};
      const frame = useCurrentFrame();

      if (frame < from) return null;
      if (durationInFrames !== undefined && frame >= from + durationInFrames) return null;

      const layoutStyle = layout === 'absolute-fill' ? {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      } : {};

      return React.createElement('div', {
        style: Object.assign({}, layoutStyle, style)
      }, children);
    };

    // Img component
    window.Img = function(props) {
      return React.createElement('img', props);
    };

    // Audio component (no-op in render)
    window.Audio = function() { return null; };

    // Video component (simplified)
    window.Video = function(props) {
      return React.createElement('video', Object.assign({ muted: true, playsInline: true }, props));
    };

    // staticFile helper
    window.staticFile = function(path) { return path; };

    // random helper (deterministic based on seed)
    window.random = function(seed) {
      if (seed === undefined) return Math.random();
      const x = Math.sin(seed * 9999) * 10000;
      return x - Math.floor(x);
    };

    // measureSpring helper
    window.measureSpring = function(config) {
      config = config || {};
      const fps = config.fps || 30;
      for (let frame = 0; frame < 1000; frame++) {
        const value = spring({ frame, fps, config });
        if (Math.abs(value - 1) < 0.001) return frame;
      }
      return 1000;
    };

    // delayRender / continueRender (no-op)
    window.delayRender = function() { return 0; };
    window.continueRender = function() {};
  <\/script>

  <!-- User's Generated Component (JSX - needs Babel) -->
  <script type="text/babel" data-presets="react">
    try {
      ${escapedCode}
    } catch (e) {
      console.error('Error loading generated code:', e);
      window.GeneratedVideo = function() {
        return <AbsoluteFill style={{ backgroundColor: CONFIG.backgroundColor, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: '#ff6b6b', fontSize: 24 }}>Error loading animation</div>
        </AbsoluteFill>;
      };
    }
  <\/script>

  <!-- Renderer Logic (no JSX) -->
  <script>
    // Wait for Babel to compile the user code
    window.addEventListener('DOMContentLoaded', function() {
      // Small delay to ensure Babel has finished
      setTimeout(initRenderer, 100);
    });

    function initRenderer() {
      // ============================================
      // Renderer
      // ============================================
    const previewFrame = document.getElementById('previewFrame');
    const renderContainer = document.getElementById('renderContainer');
    const scrubber = document.getElementById('scrubber');
    const frameInfo = document.getElementById('frameInfo');
    const playBtn = document.getElementById('playBtn');
    const renderBtn = document.getElementById('renderBtn');
    const progressContainer = document.getElementById('progressContainer');
    const progressStage = document.getElementById('progressStage');
    const progressPercent = document.getElementById('progressPercent');
    const progressFill = document.getElementById('progressFill');
    const success = document.getElementById('success');
    const warningEl = document.getElementById('warning');

    let isPlaying = false;
    let animationId = null;
    let reactRoot = null;
    let previewRoot = null;
    let previewDoc = null;

    // Check MediaRecorder support (for WebM recording)
    const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
    if (!hasMediaRecorder) {
      warningEl.classList.add('show');
      renderBtn.disabled = true;
    }

    // Initialize preview iframe
    function initPreview() {
      const scale = Math.min(960, CONFIG.width) / CONFIG.width;
      const html = \`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: \${CONFIG.backgroundColor}; overflow: hidden; }
            #root { width: \${CONFIG.width}px; height: \${CONFIG.height}px; transform: scale(\${scale}); transform-origin: top left; position: relative; }
          </style>
        </head>
        <body><div id="root"></div></body>
        </html>
      \`;
      previewFrame.srcdoc = html;
      previewFrame.onload = function() {
        previewDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;
        const previewContainer = previewDoc.getElementById('root');

        // Copy React and our globals to iframe
        previewFrame.contentWindow.React = React;
        previewFrame.contentWindow.ReactDOM = ReactDOM;
        previewFrame.contentWindow.useCurrentFrame = useCurrentFrame;
        previewFrame.contentWindow.useVideoConfig = useVideoConfig;
        previewFrame.contentWindow.interpolate = interpolate;
        previewFrame.contentWindow.spring = spring;
        previewFrame.contentWindow.Easing = Easing;
        previewFrame.contentWindow.AbsoluteFill = AbsoluteFill;
        previewFrame.contentWindow.Sequence = Sequence;
        previewFrame.contentWindow.Img = Img;
        previewFrame.contentWindow.Audio = Audio;
        previewFrame.contentWindow.Video = Video;
        previewFrame.contentWindow.staticFile = staticFile;
        previewFrame.contentWindow.random = random;
        previewFrame.contentWindow.measureSpring = measureSpring;
        previewFrame.contentWindow.delayRender = delayRender;
        previewFrame.contentWindow.continueRender = continueRender;

        previewRoot = ReactDOM.createRoot(previewContainer);
        updatePreview(0);
      };
    }

    // Update preview for a specific frame
    function updatePreview(frameNum) {
      RemotionContext.frame = frameNum;

      if (previewRoot && window.GeneratedVideo) {
        previewRoot.render(React.createElement(window.GeneratedVideo));
      }

      frameInfo.textContent = \`Frame \${frameNum + 1} / \${CONFIG.totalFrames}\`;
      scrubber.value = frameNum;
    }

    // Initialize hidden render container
    function initRenderContainer() {
      reactRoot = ReactDOM.createRoot(renderContainer);
    }

    // Render frame to canvas using html2canvas
    async function renderFrameToCanvas(frameNum, canvas) {
      RemotionContext.frame = frameNum;

      // Render React component to hidden container
      return new Promise((resolve, reject) => {
        reactRoot.render(React.createElement(window.GeneratedVideo));

        // Wait for React to render
        requestAnimationFrame(() => {
          requestAnimationFrame(async () => {
            try {
              const result = await html2canvas(renderContainer, {
                width: CONFIG.width,
                height: CONFIG.height,
                scale: 1,
                backgroundColor: CONFIG.backgroundColor,
                logging: false,
                useCORS: true,
                allowTaint: true,
              });

              // Draw to our canvas
              const ctx = canvas.getContext('2d');
              ctx.drawImage(result, 0, 0);
              resolve();
            } catch (err) {
              reject(err);
            }
          });
        });
      });
    }

    // Scrubber control
    scrubber.addEventListener('input', function() {
      const frame = parseInt(scrubber.value);
      updatePreview(frame);
    });

    // Play/Pause control
    playBtn.addEventListener('click', function() {
      isPlaying = !isPlaying;
      playBtn.innerHTML = isPlaying
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';

      if (isPlaying) {
        let frame = parseInt(scrubber.value);
        const startTime = performance.now();
        const startFrame = frame;

        function playLoop() {
          if (!isPlaying) return;

          const elapsed = performance.now() - startTime;
          frame = (startFrame + Math.floor(elapsed / (1000 / CONFIG.fps))) % CONFIG.totalFrames;

          updatePreview(frame);
          animationId = requestAnimationFrame(playLoop);
        }
        playLoop();
      } else {
        cancelAnimationFrame(animationId);
      }
    });

    // Render to video using Canvas recording (WebM)
    renderBtn.addEventListener('click', async function() {
      // Stop playback
      isPlaying = false;
      cancelAnimationFrame(animationId);
      playBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';

      renderBtn.disabled = true;
      progressContainer.classList.add('active');
      success.classList.remove('show');

      try {
        // Create canvas for rendering
        const canvas = document.createElement('canvas');
        canvas.width = CONFIG.width;
        canvas.height = CONFIG.height;
        const ctx = canvas.getContext('2d');

        // Use MediaRecorder with canvas stream - much more reliable
        const stream = canvas.captureStream(CONFIG.fps);
        const chunks = [];

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 8_000_000,
        });

        mediaRecorder.ondataavailable = function(e) {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        const recordingDone = new Promise((resolve, reject) => {
          mediaRecorder.onstop = resolve;
          mediaRecorder.onerror = reject;
        });

        mediaRecorder.start();

        // Render each frame
        for (let frame = 0; frame < CONFIG.totalFrames; frame++) {
          const progress = Math.round((frame / CONFIG.totalFrames) * 100);
          progressStage.textContent = \`Rendering frame \${frame + 1} / \${CONFIG.totalFrames}\`;
          progressPercent.textContent = progress + '%';
          progressFill.style.width = progress + '%';

          // Render frame to canvas
          await renderFrameToCanvas(frame, canvas);

          // Wait for frame duration to let MediaRecorder capture
          await new Promise(r => setTimeout(r, 1000 / CONFIG.fps));
        }

        // Stop recording
        progressStage.textContent = 'Finalizing video...';
        progressPercent.textContent = '99%';
        mediaRecorder.stop();
        await recordingDone;

        // Create WebM blob
        progressStage.textContent = 'Creating video file...';
        const webmBlob = new Blob(chunks, { type: 'video/webm' });

        // Download
        const url = URL.createObjectURL(webmBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '${title.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'skinny-motion'}.webm';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        progressContainer.classList.remove('active');
        success.classList.add('show');

      } catch (error) {
        console.error('Render error:', error);
        alert('Render failed: ' + error.message + '\\n\\nPlease try again or use a different browser.');
        progressContainer.classList.remove('active');
      }

      renderBtn.disabled = false;
    });

      // Initialize
      initPreview();
      initRenderContainer();
    }
  <\/script>
</body>
</html>`;
}

export default generateRendererHTML;
