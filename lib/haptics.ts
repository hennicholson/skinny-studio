/**
 * Haptic Feedback Utility
 *
 * Provides tactile feedback for mobile interactions.
 * Uses navigator.vibrate() on Android and attempts to use
 * AudioContext for iOS (which doesn't support vibration API).
 */

type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'selection'

// Vibration patterns in milliseconds
const patterns: Record<HapticType, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 30,
  success: [10, 50, 10],
  error: [20, 100, 20, 100, 20],
  selection: 5,
}

/**
 * Trigger haptic feedback
 *
 * @param type - The type of haptic feedback
 * @returns boolean - Whether haptic feedback was triggered
 */
export function haptic(type: HapticType = 'light'): boolean {
  // Check if vibration API is available (Android)
  if ('vibrate' in navigator) {
    try {
      const pattern = patterns[type]
      navigator.vibrate(pattern)
      return true
    } catch (err) {
      console.warn('Haptic feedback failed:', err)
      return false
    }
  }

  // For iOS, we can't trigger haptics from web without user interaction
  // but we can still return false gracefully
  return false
}

/**
 * Light haptic for selections and taps
 */
export function hapticLight() {
  return haptic('light')
}

/**
 * Medium haptic for confirmations
 */
export function hapticMedium() {
  return haptic('medium')
}

/**
 * Heavy haptic for important actions
 */
export function hapticHeavy() {
  return haptic('heavy')
}

/**
 * Success haptic pattern
 */
export function hapticSuccess() {
  return haptic('success')
}

/**
 * Error haptic pattern
 */
export function hapticError() {
  return haptic('error')
}

/**
 * Selection change haptic (lightest)
 */
export function hapticSelection() {
  return haptic('selection')
}

/**
 * Custom vibration pattern
 * @param pattern - Array of on/off durations in ms, or single duration
 */
export function hapticCustom(pattern: number | number[]): boolean {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern)
      return true
    } catch (err) {
      return false
    }
  }
  return false
}

/**
 * Check if haptic feedback is supported
 */
export function isHapticSupported(): boolean {
  return 'vibrate' in navigator
}
