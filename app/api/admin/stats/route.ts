import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from '@/lib/whop'
import { isAdmin } from '@/lib/admin'

export async function GET() {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    if (!whop || !isAdmin(whop.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get total users
    const { count: totalUsers } = await sbAdmin
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })

    // Get active users (last 24h)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: activeUsers } = await sbAdmin
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .gte('updated_at', yesterday)

    // Get total generations
    const { count: totalGenerations } = await sbAdmin
      .from('generations')
      .select('*', { count: 'exact', head: true })

    // Get today's generations
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count: todayGenerations } = await sbAdmin
      .from('generations')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString())

    // Get total revenue (sum of all balances spent)
    const { data: revenueData } = await sbAdmin
      .from('generations')
      .select('cost_cents')
    const totalRevenue = revenueData?.reduce((sum, g) => sum + (g.cost_cents || 0), 0) || 0

    // Get model counts
    const { count: totalModels } = await sbAdmin
      .from('studio_models')
      .select('*', { count: 'exact', head: true })

    const { count: activeModels } = await sbAdmin
      .from('studio_models')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)

    // Get top models by usage (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: topModelsData } = await sbAdmin
      .from('generations')
      .select('model_id')
      .gte('created_at', weekAgo)

    const modelUsage: Record<string, number> = {}
    topModelsData?.forEach(g => {
      if (g.model_id) {
        modelUsage[g.model_id] = (modelUsage[g.model_id] || 0) + 1
      }
    })

    // Get model names for top models
    const topModelIds = Object.entries(modelUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id]) => id)

    const { data: modelNames } = await sbAdmin
      .from('studio_models')
      .select('id, name')
      .in('id', topModelIds)

    const topModels = topModelIds.map(id => ({
      id,
      name: modelNames?.find(m => m.id === id)?.name || id,
      count: modelUsage[id]
    }))

    // Recent activity (last 10 generations)
    const { data: recentActivity } = await sbAdmin
      .from('generations')
      .select(`
        id,
        created_at,
        model_id,
        cost_cents,
        user_profile_id
      `)
      .order('created_at', { ascending: false })
      .limit(10)

    // Get usernames for recent activity
    const userIds = Array.from(new Set(recentActivity?.map(a => a.user_profile_id).filter(Boolean) || []))
    const { data: userNames } = await sbAdmin
      .from('user_profiles')
      .select('id, username')
      .in('id', userIds)

    const recentWithNames = recentActivity?.map(a => ({
      ...a,
      username: userNames?.find(u => u.id === a.user_profile_id)?.username || 'Unknown',
      model_name: modelNames?.find(m => m.id === a.model_id)?.name || a.model_id
    }))

    // Get Gemini token usage stats (for orchestrator)
    // Total tokens (all time)
    const { data: totalTokensData } = await sbAdmin
      .from('gemini_usage')
      .select('total_tokens, estimated_cost_cents, is_platform_key')

    const totalTokens = totalTokensData?.reduce((sum, u) => sum + (u.total_tokens || 0), 0) || 0
    const totalOrchestratorCost = totalTokensData?.reduce((sum, u) => sum + parseFloat(u.estimated_cost_cents || 0), 0) || 0

    // Platform key usage only (what admin is paying for)
    const platformTokens = totalTokensData
      ?.filter(u => u.is_platform_key)
      .reduce((sum, u) => sum + (u.total_tokens || 0), 0) || 0
    const platformCost = totalTokensData
      ?.filter(u => u.is_platform_key)
      .reduce((sum, u) => sum + parseFloat(u.estimated_cost_cents || 0), 0) || 0

    // Today's token usage
    const { data: todayTokensData } = await sbAdmin
      .from('gemini_usage')
      .select('total_tokens, estimated_cost_cents, is_platform_key')
      .gte('created_at', todayStart.toISOString())

    const todayTokens = todayTokensData?.reduce((sum, u) => sum + (u.total_tokens || 0), 0) || 0
    const todayPlatformTokens = todayTokensData
      ?.filter(u => u.is_platform_key)
      .reduce((sum, u) => sum + (u.total_tokens || 0), 0) || 0
    const todayPlatformCost = todayTokensData
      ?.filter(u => u.is_platform_key)
      .reduce((sum, u) => sum + parseFloat(u.estimated_cost_cents || 0), 0) || 0

    // Yesterday's tokens for comparison
    const yesterdayStart = new Date(todayStart)
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)
    const { data: yesterdayTokensData } = await sbAdmin
      .from('gemini_usage')
      .select('total_tokens, is_platform_key')
      .gte('created_at', yesterdayStart.toISOString())
      .lt('created_at', todayStart.toISOString())

    const yesterdayPlatformTokens = yesterdayTokensData
      ?.filter(u => u.is_platform_key)
      .reduce((sum, u) => sum + (u.total_tokens || 0), 0) || 0

    return NextResponse.json({
      stats: {
        totalUsers: totalUsers || 0,
        activeUsers: activeUsers || 0,
        totalGenerations: totalGenerations || 0,
        todayGenerations: todayGenerations || 0,
        totalRevenue: totalRevenue,
        totalModels: totalModels || 0,
        activeModels: activeModels || 0,
      },
      // Orchestrator token usage stats
      orchestratorStats: {
        totalTokens,
        totalCostCents: totalOrchestratorCost,
        platformTokens,
        platformCostCents: platformCost,
        todayTokens,
        todayPlatformTokens,
        todayPlatformCostCents: todayPlatformCost,
        yesterdayPlatformTokens,
      },
      topModels,
      recentActivity: recentWithNames || []
    })
  } catch (error) {
    console.error('Admin stats error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}
