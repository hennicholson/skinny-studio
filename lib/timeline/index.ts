// Barrel export for the timeline IR + helpers.
//
// Importers should pull from '@/lib/timeline' rather than '@/lib/timeline/ir'
// directly so we have room to add validation, normalization, or migration
// utilities here later without churning every callsite.

export type {
  Timeline,
  TimelineClip,
  TimelineClipSource,
  TimelineTrack,
  TimelineTrackKind,
  TimelineUpload,
} from './ir'

export {
  DEFAULT_FPS,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  computeTimelineDuration,
  emptyTimelineDocument,
} from './ir'
