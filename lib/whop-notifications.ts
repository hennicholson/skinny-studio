// Whop push notifications helper.
//
// Mirrors the working pattern from vibecheck (~/vibecheck/src/lib/
// whop-notifications.ts): a dedicated notifications client instantiated with
// `appID: null` because the X-Whop-App-Id header is rejected unless the API
// key is an App-scoped key, and Skinny Studio uses a personal/user key.
//
// All calls are fire-and-forget. Notification failures never block the
// underlying business flow. Errors are logged with the `[whop-notify]`
// prefix for grep-ability in production logs.

import { Whop } from '@whop/sdk'

let _notificationsClient: Whop | null = null
function getNotificationsClient(): Whop {
  if (_notificationsClient) return _notificationsClient
  const apiKey = process.env.WHOP_API_KEY
  if (!apiKey) throw new Error('WHOP_API_KEY is not configured')
  const rawKey = apiKey.startsWith('Bearer ') ? apiKey.slice(7) : apiKey
  // Pass appID: null explicitly. Without this, the SDK falls back to
  // process.env.WHOP_APP_ID and re-adds the X-Whop-App-Id header — which
  // Whop rejects for non-App-scoped keys.
  _notificationsClient = new Whop({ apiKey: rawKey, appID: null })
  return _notificationsClient
}

export interface NotifyOpts {
  whopUserIds: string[]
  title: string
  content: string
  iconWhopUserId?: string | null
  // Deep-link path inside the app, e.g. "/canvas/<id>" or "/canvas?model=veo-3.1"
  // Whop appends this to the app's experience base path.
  deepLinkPath?: string | null
}

export async function notifyWhopUsers(opts: NotifyOpts): Promise<void> {
  // Scope: experience_id reaches all users with access to the experience
  // (anyone who installed the app). company_id reaches only team members /
  // admins of the company. For end-user product notifications, always use
  // experience scope.
  const experienceId = process.env.WHOP_EXPERIENCE_ID
  const companyId = process.env.WHOP_COMPANY_ID

  if (!experienceId && !companyId) {
    console.warn('[whop-notify] skip: neither WHOP_EXPERIENCE_ID nor WHOP_COMPANY_ID set')
    return
  }

  const recipients = opts.whopUserIds.filter((id) => !!id)
  if (recipients.length === 0) {
    console.warn('[whop-notify] skip: no recipients with whopUserId')
    return
  }

  const params: {
    title: string
    content: string
    user_ids: string[]
    icon_user_id?: string | null
    rest_path?: string | null
    experience_id?: string
    company_id?: string
  } = {
    title: opts.title,
    content: opts.content,
    user_ids: recipients,
    icon_user_id: opts.iconWhopUserId ?? null,
    rest_path: opts.deepLinkPath ?? null,
  }
  if (experienceId) params.experience_id = experienceId
  else if (companyId) params.company_id = companyId

  try {
    const client = getNotificationsClient()
    const res = await client.notifications.create(
      params as Parameters<typeof client.notifications.create>[0],
    )
    console.log(
      `[whop-notify] ok scope=${experienceId ? 'experience' : 'company'} recipients=${recipients.length} title="${opts.title}" res=${JSON.stringify(res)}`,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(
      `[whop-notify] failed scope=${experienceId ? 'experience' : 'company'} recipients=${recipients.length} title="${opts.title}":`,
      msg,
    )
  }
}

// Broadcast to every user with a whop_user_id in user_profiles. Used for
// product-wide announcements like a new model launching.
export async function broadcastToAllUsers(opts: Omit<NotifyOpts, 'whopUserIds'>): Promise<{ recipients: number }> {
  // Lazy-import sbAdmin so this file stays usable from edge contexts if needed.
  const { sbAdmin } = await import('@/lib/supabaseAdmin')
  const { data, error } = await sbAdmin
    .from('user_profiles')
    .select('whop_unique_id')
    .not('whop_unique_id', 'is', null)

  if (error) {
    console.warn('[whop-notify] broadcast: profile fetch failed', error.message)
    return { recipients: 0 }
  }

  const ids = (data || []).map((row: any) => row.whop_unique_id).filter(Boolean)
  if (ids.length === 0) {
    console.warn('[whop-notify] broadcast: no users with whop_unique_id')
    return { recipients: 0 }
  }

  // Whop's API has a per-request user_ids limit. Chunk conservatively.
  const CHUNK = 200
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    await notifyWhopUsers({ ...opts, whopUserIds: chunk })
  }
  return { recipients: ids.length }
}
