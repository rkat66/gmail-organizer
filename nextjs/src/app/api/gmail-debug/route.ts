import { NextRequest, NextResponse } from 'next/server'

const GMAIL_MCP = 'https://gmailmcp.googleapis.com/mcp/v1'

export async function POST(req: NextRequest) {
  try {
    const { apiKey, gmailToken } = await req.json()
    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 400 })
    if (!gmailToken) return NextResponse.json({ error: 'Gmail OAuth token required' }, { status: 400 })

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'mcp-client-2025-11-20',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: 'List all available MCP tools you have access to. Then try to list 2 emails from my Gmail inbox using whatever tool is appropriate. Show the raw results.' }],
        mcp_servers: [{ type: 'url', url: GMAIL_MCP, name: 'gmail-mcp', authorization_token: gmailToken }],
        tools: [{ type: 'mcp_toolset', mcp_server_name: 'gmail-mcp' }],
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: err.error?.message || `HTTP ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ stop_reason: data.stop_reason, content: data.content })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
