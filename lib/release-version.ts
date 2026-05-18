// Single source of truth for the current product release identifier.
// Bump this when a new "What's New" entry should auto-open for users.
// The WhatsNewSheet renders the entry tagged with this version and writes
// it to user_profiles.last_seen_release_version once dismissed.

export const RELEASE_VERSION = '2026.05.11-canvas'

export interface ReleaseEntry {
  version: string
  title: string
  body: string
  cta?: { label: string; href: string }
  hero?: { kind: 'image' | 'video'; src: string }
}

// The newest entry that matches RELEASE_VERSION is what the auto-sheet shows.
// Older entries remain for an in-app changelog view (future work).
export const RELEASES: ReleaseEntry[] = [
  {
    version: '2026.05.11-canvas',
    title: 'Canvas mode is live',
    body:
      'Drag-and-drop nodes for image and video generation. Wire prompts to models to outputs, then run the whole graph at once. Find it in the header — labeled BETA.',
    cta: { label: 'Open Canvas', href: '/canvas' },
  },
]

export function getEntryForVersion(version: string): ReleaseEntry | undefined {
  return RELEASES.find((r) => r.version === version)
}
