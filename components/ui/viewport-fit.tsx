'use client'

// No-op now. An earlier version applied CSS `zoom` to the body to auto-fit
// the UI on narrow viewports — that caused issues inside the Whop iframe
// (scroll, hit testing, popover coords). The layouts already use
// responsive Tailwind classes; if you bring back auto-zoom later, do it
// per-page with `transform: scale()` on an inner wrapper, NOT on body.

export function ViewportFit() {
  return null
}
