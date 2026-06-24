import { tool } from 'ai'
import { z } from 'zod'

export function getOsintTools(userKeys: { virustotal_api_key?: string } = {}) {
  return {
    search_web: tool({
      description: 'Search the web for information using DuckDuckGo Instant Answer API. Use this to find general knowledge, news, or basic information about a topic, threat actor, or organization.',
      parameters: z.object({
        query: z.string().describe('The search query'),
      }),
      execute: async ({ query }) => {
        try {
          const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&srlimit=3`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()
          
          if (data.query && data.query.search && data.query.search.length > 0) {
            const results = data.query.search.map((r: any) => {
              const snippet = r.snippet.replace(/<\/?[^>]+(>|$)/g, '')
              return `Title: ${r.title}\nSnippet: ${snippet}`
            })
            return { result: results.join('\n\n') }
          }
          
          return { result: "No direct search results found. You may need to refine your search or the topic is too obscure." }
        } catch (e) {
          return { error: `Search failed: ${e instanceof Error ? e.message : 'Unknown error'}` }
        }
      },
    }),

    virustotal_lookup: tool({
      description: 'Query VirusTotal for a hash (MD5, SHA-1, SHA-256), IP address, or domain to get its reputation and detection ratio. IMPORTANT: Only use this if you suspect something is malicious or if the user explicitly asks for a VirusTotal lookup.',
      parameters: z.object({
        indicator: z.string().describe('The IP address, domain, or file hash to lookup.'),
      }),
      execute: async ({ indicator }) => {
        const apiKey = userKeys.virustotal_api_key
        if (!apiKey) {
          return { error: "VirusTotal API key is not configured in user settings. Please ask the user to configure it." }
        }
        try {
          // VirusTotal v3 API search
          const res = await fetch(`https://www.virustotal.com/api/v3/search?query=${encodeURIComponent(indicator)}`, {
            headers: {
              'x-apikey': apiKey,
            }
          })
          if (!res.ok) throw new Error(`VT API HTTP ${res.status}`)
          const data = await res.json()
          
          const items = data.data
          if (!items || items.length === 0) {
            return { result: `No data found in VirusTotal for ${indicator}` }
          }
          
          const topResult = items[0]
          const stats = topResult.attributes.last_analysis_stats
          if (!stats) return { result: "Found in VirusTotal, but no analysis stats available." }
          
          return {
            indicator,
            type: topResult.type,
            detection_ratio: `${stats.malicious} / ${stats.malicious + stats.undetected + stats.harmless + stats.suspicious}`,
            malicious: stats.malicious,
            suspicious: stats.suspicious,
            harmless: stats.harmless,
            undetected: stats.undetected,
            reputation: topResult.attributes.reputation
          }
        } catch (e) {
          return { error: `VirusTotal lookup failed: ${e instanceof Error ? e.message : 'Unknown error'}` }
        }
      }
    })
  }
}
