import { NextRequest, NextResponse } from 'next/server'

const GMAIL_MCP = 'https://gmailmcp.googleapis.com/mcp/v1'

export async function POST(req: NextRequest) {
  try {
    const { apiKey, gmailToken, domain, messageIds, labelName } = await req.json()
    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 400 })
    if (!gmailToken) return NextResponse.json({ error: 'Gmail OAuth token required' }, { status: 400 })
    if (!domain || !messageIds?.length || !labelName) {
      return NextResponse.json({ error: 'domain, messageIds, labelName required' }, { status: 400 })
    }

    const system = `You are a Gmail organizer with Gmail MCP access.
1. Call create_label with name "${labelName}" (ignore error if exists, capture label id).
2. For each message id, call modify_message: add label "${labelName}", remove label "INBOX".
Message IDs: ${messageIds.join(', ')}
Return ONLY JSON: {"moved":${messageIds.length},"label":"${labelName}","errors":[]}`

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
        max_tokens: 1000,
        system,
        messages: [{ role: 'user', content: `Move ${messageIds.length} emails to label "${labelName}"` }],
        mcp_servers: [{ type: 'url', url: GMAIL_MCP, name: 'gmail-mcp', authorization_token: gmailToken }],
        tools: [{ type: 'mcp_toolset', mcp_server_name: 'gmail-mcp' }],
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: err.error?.message || `HTTP ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    const text = data.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')

    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ error: 'No JSON in Claude response' }, { status: 500 })

    return NextResponse.json(JSON.parse(match[0]))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
