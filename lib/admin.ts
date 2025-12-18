// Admin authentication helpers

// List of Whop user IDs that have admin access
const ADMIN_WHOP_IDS = [
  '00457b68-e73a-48c1-8c28-7772ea6efdb9', // hmndigital
]

export function isAdmin(whopUserId: string | null | undefined): boolean {
  if (!whopUserId) return false
  return ADMIN_WHOP_IDS.includes(whopUserId)
}

export function requireAdmin(whopUserId: string | null | undefined): void {
  if (!isAdmin(whopUserId)) {
    throw new Error('Unauthorized: Admin access required')
  }
}
