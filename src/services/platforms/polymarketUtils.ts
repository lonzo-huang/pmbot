import type { Market } from '@/stores/appStore'

export interface PolymarketMarketMetadata {
  id: string
  conditionId: string
  slug: string
  type: 'event' | 'market'
  assetIds: string[]
  question: string
  volume: number
  liquidity: number
  endDate: string
  category: string
}

interface FetchOptions {
  logger?: (message: string) => void
}

const log = (options: FetchOptions | undefined, message: string) => {
  options?.logger?.(message)
}

export const extractSlugFromUrl = (url: string): { slug: string; type: 'event' | 'market' } | null => {
  try {
    let cleanUrl = url.trim()
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl
    }
    const urlObj = new URL(cleanUrl)
    const pathname = urlObj.pathname.replace(/^\/+/g, '').replace(/\/+/g, '/')
    const pathParts = pathname.split('/')

    const typeIndex = pathParts.findIndex(p => p === 'event' || p === 'market')
    if (typeIndex !== -1 && pathParts[typeIndex + 1]) {
      return {
        slug: decodeURIComponent(pathParts[typeIndex + 1]),
        type: pathParts[typeIndex] as 'event' | 'market',
      }
    }

    const lastPart = pathParts.filter(Boolean).pop()
    return lastPart ? { slug: decodeURIComponent(lastPart), type: 'market' } : null
  } catch {
    return null
  }
}

const getUtcTime = (dateStr: string): number => {
  if (!dateStr) return 0
  const d = new Date(dateStr)
  return Number.isNaN(d.getTime()) ? 0 : d.getTime()
}

const normaliseAssetIds = (market: any): string[] => {
  const { clobTokenIds } = market
  if (clobTokenIds) {
    try {
      const parsed = typeof clobTokenIds === 'string' ? JSON.parse(clobTokenIds) : clobTokenIds
      if (Array.isArray(parsed)) {
        return parsed.filter((id: any) => typeof id === 'string' && id.length > 0)
      }
    } catch {
      console.warn('[polymarketUtils] Failed to parse clobTokenIds:', clobTokenIds)
    }
  }

  const tokens = market.tokens || market.outcomes || []
  if (Array.isArray(tokens)) {
    return tokens
      .map((t: any) => {
        if (typeof t === 'string') return t
        return t.id || t.token_id || t.clobTokenId || t.assetId || ''
      })
      .filter(Boolean)
  }

  return []
}

const inferCategory = (market: any): string => {
  if (market.category) return market.category

  const question = (market.question || '').toLowerCase()
  if (/bitcoin|ethereum|crypto|btc|eth|sol|polygon/.test(question)) return 'crypto'
  if (/election|president|congress|senate|vote/.test(question)) return 'politics'
  if (/fed|rate|gdp|inflation|economy/.test(question)) return 'economics'
  if (/nba|nfl|mlb|soccer|sport/.test(question)) return 'sports'
  return 'other'
}

const getSeriesKey = (slug: string): string => {
  const match = slug.match(/^(.*?)-(\d{9,})$/)
  return match ? match[1] : slug
}

const fetchLatestMarketInSeries = async (
  baseSlug: string,
  options?: FetchOptions,
): Promise<PolymarketMarketMetadata | null> => {
  try {
    const searchUrl = `/api/gamma/markets?search=${encodeURIComponent(baseSlug)}&limit=20&active=true&closed=false`
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      log(options, `❌ Series search failed: ${response.status}`)
      return null
    }

    const raw = await response.json()
    const markets: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.markets)
        ? raw.markets
        : Array.isArray(raw?.data)
          ? raw.data
          : []

    if (markets.length === 0) {
      log(options, `⚠️ No markets returned for series ${baseSlug}`)
      return null
    }

    const now = Date.now()
    const scored = markets
      .filter(m => typeof m?.slug === 'string' && m.slug.startsWith(baseSlug))
      .map(m => ({
        market: m,
        start: getUtcTime(m.startDateIso || m.startDate || m.start_date),
        end: getUtcTime(m.endDateIso || m.endDate || m.end_date),
      }))

    if (scored.length === 0) {
      log(options, `⚠️ Series markets did not match prefix ${baseSlug}`)
      return null
    }

    scored.sort((a, b) => {
      const aActive = a.start <= now && now < a.end
      const bActive = b.start <= now && now < b.end
      if (aActive !== bActive) return aActive ? -1 : 1
      return b.start - a.start
    })

    const chosen = scored[0].market
    log(options, `🆕 Series fallback selected: ${chosen?.question || chosen?.title || chosen?.slug}`)
    let metadata = toMetadata(chosen, chosen.slug || baseSlug, 'market')

    if (metadata.assetIds.length === 0 || metadata.endDate === '2026-12-31T23:59:59Z' || !metadata.endDate) {
      const enriched = await enrichMarketById(metadata, options)
      if (enriched) {
        metadata = enriched
      }
    }

    return metadata
  } catch (error: any) {
    log(options, `❌ fetchLatestMarketInSeries error: ${error?.message || error}`)
    return null
  }
}

const toMetadata = (market: any, slug: string, type: 'event' | 'market'): PolymarketMarketMetadata => {
  return {
    id: market.id || market.conditionId || slug,
    conditionId: market.conditionId || '',
    slug: market.slug || slug,
    type: market.slug ? 'market' : type,
    assetIds: normaliseAssetIds(market),
    question: market.question || market.title || 'Unknown',
    volume: market.volumeNum || market.volume || 0,
    liquidity: market.liquidityNum || market.liquidity || 0,
    endDate: market.endDateIso || market.endDate || '2026-12-31T23:59:59Z',
    category: inferCategory(market),
  }
}

const pickCurrentMarketFromEvent = (firstResult: any, options?: FetchOptions): any => {
  if (!firstResult.markets || firstResult.markets.length === 0) return firstResult

  const now = Date.now()
  const sortedMarkets = [...firstResult.markets].sort((a: any, b: any) => {
    const activeA = !a.resolved && !a.closed
    const activeB = !b.resolved && !b.closed
    if (activeA !== activeB) return activeA ? -1 : 1

    const startA = getUtcTime(a.startDateIso || a.startDate || a.start_date)
    const startB = getUtcTime(b.startDateIso || b.startDate || b.start_date)
    const endA = getUtcTime(a.endDateIso || a.endDate || a.end_date)
    const endB = getUtcTime(b.endDateIso || b.endDate || b.end_date)

    const isCurrentA = now >= startA && now < endA
    const isCurrentB = now >= startB && now < endB
    if (isCurrentA !== isCurrentB) return isCurrentA ? -1 : 1

    const diffA = endA - now
    const diffB = endB - now

    if (diffA > 0 && diffB <= 0) return -1
    if (diffB > 0 && diffA <= 0) return 1
    if (diffA > 0 && diffB > 0) return diffA - diffB
    return endB - endA
  })

  const market = sortedMarkets[0]
  log(options, `📦 Event contains ${firstResult.markets.length} markets. Automatically selected current interval (UTC Sync).`)

  console.log('[polymarketUtils] UTC Market selection info:', {
    selected: market.question || market.title,
    id: market.id,
    endDate: market.endDateIso || market.endDate,
    now: new Date().toISOString(),
    allMarketsCount: firstResult.markets.length,
  })

  return market
}

const enrichMarketById = async (
  metadata: PolymarketMarketMetadata,
  options?: FetchOptions,
): Promise<PolymarketMarketMetadata | null> => {
  try {
    const detailsUrl = `/api/gamma/markets/${metadata.id}`
    const response = await fetch(detailsUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      log(options, `⚠️ Market detail fetch failed (${response.status}), trying fallback query`)
      const byIdUrl = `/api/gamma/markets?id=${encodeURIComponent(metadata.id)}`
      const byIdResponse = await fetch(byIdUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
      if (!byIdResponse.ok) {
        return null
      }
      const fallbackRaw: any = await byIdResponse.json()
      const fallbackMarket = Array.isArray(fallbackRaw)
        ? fallbackRaw[0]
        : Array.isArray(fallbackRaw?.markets)
          ? fallbackRaw.markets[0]
          : fallbackRaw?.data?.[0] || fallbackRaw?.data || null
      if (!fallbackMarket) return null
      const enriched = toMetadata(fallbackMarket, fallbackMarket.slug || metadata.slug, 'market')
      return {
        ...metadata,
        ...enriched,
        assetIds: enriched.assetIds.length > 0 ? enriched.assetIds : metadata.assetIds,
      }
    }

    const rawData: any = await response.json()
    const market = rawData?.market || rawData?.data || rawData
    if (!market) return null

    const enriched = toMetadata(market, market.slug || metadata.slug, 'market')
    return {
      ...metadata,
      ...enriched,
      assetIds: enriched.assetIds.length > 0 ? enriched.assetIds : metadata.assetIds,
    }
  } catch (error: any) {
    log(options, `❌ enrichMarketById error: ${error?.message || error}`)
    return null
  }
}

export const fetchMarketDataFromSlug = async (
  slug: string,
  type: 'event' | 'market',
  options?: FetchOptions,
): Promise<PolymarketMarketMetadata | null> => {
  const endpoint = type === 'event' ? '/events' : '/markets'
  log(options, `🔍 Query Gamma API: ${endpoint}?slug=${slug}`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  try {
    const gammaUrl = `/api/gamma${endpoint}?slug=${encodeURIComponent(slug)}`
    const response = await fetch(gammaUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`API failed: ${response.status}`)
    }

    const rawData: any = await response.json()
    const results = Array.isArray(rawData) ? rawData : [rawData]

    if (results.length === 0 || !results[0]) {
      log(options, `❌ No ${type} found for slug: ${slug}`)
      if (type === 'market') {
        return fetchMarketDataFromSlug(slug, 'event', options)
      }
      return null
    }

    const firstResult = results[0]
    const now = Date.now()
    const marketEnd = getUtcTime(firstResult.endDateIso || firstResult.endDate || firstResult.end_date)
    const isOldMarket = (marketEnd > 0 && marketEnd < now) || !firstResult.active || firstResult.closed || firstResult.resolved

    if (type === 'market' && isOldMarket) {
      const eventSlug = firstResult.event?.slug || firstResult.eventSlug
      if (eventSlug && eventSlug !== slug) {
        log(options, `⚠️ Current market interval has expired (UTC check). Redirecting to parent event: ${eventSlug}`)
        return fetchMarketDataFromSlug(eventSlug, 'event', options)
      }
    }

    const market = type === 'event' ? pickCurrentMarketFromEvent(firstResult, options) : firstResult

    let metadata = toMetadata(market, slug, type)

    if (metadata.assetIds.length === 0 || metadata.endDate === '2026-12-31T23:59:59Z' || metadata.endDate === '') {
      const enriched = await enrichMarketById(metadata, options)
      if (enriched) {
        metadata = enriched
      }
    }

    const nowMillis = Date.now()
    const metadataEnd = getUtcTime(metadata.endDate)
    if (metadataEnd > 0 && metadataEnd < nowMillis - 60_000) {
      const seriesKey = getSeriesKey(metadata.slug || slug)
      log(options, `⚠️ Selected market appears stale (${metadata.endDate}), searching series ${seriesKey}`)
      const latest = await fetchLatestMarketInSeries(seriesKey, options)
      if (latest) {
        metadata = latest
      }
    }

    if (metadata.assetIds.length === 0) {
      log(options, '❌ No asset IDs detected for market')
      return null
    }

    log(options, `✅ Found market: ${metadata.question}`)
    console.log('[polymarketUtils] Polymarket Asset IDs:', metadata.assetIds)

    return metadata
  } catch (error: any) {
    clearTimeout(timeoutId)
    log(options, `❌ Fetch failed: ${error.message || error}`)
    return null
  }
}

export const toMarket = (metadata: PolymarketMarketMetadata): Market => ({
  id: metadata.id,
  conditionId: metadata.conditionId,
  slug: metadata.slug,
  type: metadata.type,
  question: metadata.question,
  volume: metadata.volume,
  liquidity: metadata.liquidity,
  outcomePrices: [0.5, 0.5],
  endDate: metadata.endDate,
  active: true,
  category: metadata.category,
  assetIds: metadata.assetIds,
})

const FIVE_MINUTES_MS = 5 * 60 * 1000
const EASTERN_TIMEZONE = 'America/New_York'
export const BTC_5M_SERIES_SLUG = 'btc-updown-5m'

// ✅ 修复：使用 longOffset 格式获取正确的时区偏移
const getEasternParts = (date: Date) => {
  // 使用 longOffset 格式来获取准确的 GMT 偏移值
  const easternFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIMEZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'longOffset', // ✅ 修复：使用 longOffset 而不是 short
  })

  const parts: Record<string, string> = {}
  let timeZoneName = 'GMT-05:00'
  easternFormatter.formatToParts(date).forEach(part => {
    if (part.type !== 'literal') {
      parts[part.type] = part.value
      if (part.type === 'timeZoneName') {
        timeZoneName = part.value
      }
    }
  })

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    timeZoneName,
  }
}

// ✅ 修复：改进时区偏移解析，支持更多格式
const parseTimeZoneOffset = (tzName: string): number => {
  // 处理 longOffset 格式: "GMT-05:00", "GMT-04:00", "GMT+08:00" 等
  const gmtMatch = tzName.match(/GMT([+-])(\d{2}):(\d{2})/i)
  if (gmtMatch) {
    const sign = gmtMatch[1] === '-' ? -1 : 1
    const hours = parseInt(gmtMatch[2], 10)
    const minutes = parseInt(gmtMatch[3], 10)
    return sign * (hours * 60 + minutes) * 60 * 1000
  }

  // 处理旧格式: "GMT-5", "GMT+8" 等
  const shortGmtMatch = tzName.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/i)
  if (shortGmtMatch) {
    const sign = shortGmtMatch[1].startsWith('-') ? -1 : 1
    const hours = Math.abs(parseInt(shortGmtMatch[1], 10))
    const minutes = shortGmtMatch[2] ? parseInt(shortGmtMatch[2], 10) : 0
    return sign * (hours * 60 + minutes) * 60 * 1000
  }

  // ✅ 修复：处理 EDT/EST 等时区名称
  const tzOffsets: Record<string, number> = {
    'EST': -5 * 60 * 60 * 1000,  // Eastern Standard Time (UTC-5)
    'EDT': -4 * 60 * 60 * 1000,  // Eastern Daylight Time (UTC-4)
    'CST': -6 * 60 * 60 * 1000,  // Central Standard Time (UTC-6)
    'CDT': -5 * 60 * 60 * 1000,  // Central Daylight Time (UTC-5)
    'MST': -7 * 60 * 60 * 1000,  // Mountain Standard Time (UTC-7)
    'MDT': -6 * 60 * 60 * 1000,  // Mountain Daylight Time (UTC-6)
    'PST': -8 * 60 * 60 * 1000,  // Pacific Standard Time (UTC-8)
    'PDT': -7 * 60 * 60 * 1000,  // Pacific Daylight Time (UTC-7)
  }

  const upperTz = tzName.toUpperCase()
  if (tzOffsets[upperTz] !== undefined) {
    return tzOffsets[upperTz]
  }

  // 默认使用 EST (-5 小时)
  console.warn(`[polymarketUtils] Unknown timezone: ${tzName}, defaulting to EST`)
  return -5 * 60 * 60 * 1000
}

const getEasternMillis = (date: Date): { easternMillis: number; offsetMillis: number } => {
  const { year, month, day, hour, minute, second, timeZoneName } = getEasternParts(date)
  const easternMillis = Date.UTC(year, month - 1, day, hour, minute, second)
  const offsetMillis = parseTimeZoneOffset(timeZoneName)
  
  // ✅ 调试日志
  console.log('[polymarketUtils] Time calculation:', {
    inputDate: date.toISOString(),
    easternTime: `${year}-${month}-${day} ${hour}:${minute}:${second}`,
    timeZoneName,
    offsetHours: offsetMillis / (60 * 60 * 1000),
  })
  
  return { easternMillis, offsetMillis }
}

export const getCurrentBtc5mSlug = (date: Date = new Date()): string => {
  const { easternMillis, offsetMillis } = getEasternMillis(date)
  const intervalEastern = Math.floor(easternMillis / FIVE_MINUTES_MS) * FIVE_MINUTES_MS
  const intervalUtc = intervalEastern - offsetMillis
  
  const slug = `btc-updown-5m-${Math.round(intervalUtc / 1000)}`
  
  // ✅ 调试日志
  console.log('[polymarketUtils] Slug calculation:', {
    intervalEastern: new Date(intervalEastern).toISOString(),
    intervalUtc: new Date(intervalUtc).toISOString(),
    slug,
  })
  
  return slug
}

export const getRollingBtc5mSlugs = (count = 4, date: Date = new Date()): string[] => {
  const slugs: string[] = []
  const { easternMillis, offsetMillis } = getEasternMillis(date)
  let intervalEastern = Math.floor(easternMillis / FIVE_MINUTES_MS) * FIVE_MINUTES_MS

  for (let i = 0; i < count; i += 1) {
    const intervalUtc = intervalEastern - offsetMillis
    slugs.push(`btc-updown-5m-${Math.round(intervalUtc / 1000)}`)
    intervalEastern -= FIVE_MINUTES_MS
  }

  console.log('[polymarketUtils] Rolling slugs:', slugs)
  return slugs
}

export const getBtc5mUrlFromSlug = (slug: string): string => `https://polymarket.com/zh/event/${slug}`

export const getCurrentBtc5mUrl = (date: Date = new Date()): string => getBtc5mUrlFromSlug(getCurrentBtc5mSlug(date))

export const BTC_5M_EVENT_URL = getCurrentBtc5mUrl()

export const fetchLatestBtc5mMetadata = async (options?: FetchOptions): Promise<PolymarketMarketMetadata | null> => {
  return fetchLatestMarketInSeries(BTC_5M_SERIES_SLUG, options)
}

export const BTC_5M_DEFAULT_METADATA: PolymarketMarketMetadata = {
  id: BTC_5M_SERIES_SLUG,
  conditionId: BTC_5M_SERIES_SLUG,
  slug: BTC_5M_SERIES_SLUG,
  type: 'event',
  assetIds: [],
  question: 'BTC 5m UP/DOWN Interval',
  volume: 0,
  liquidity: 0,
  endDate: '2026-12-31T23:59:59Z',
  category: 'crypto',
}