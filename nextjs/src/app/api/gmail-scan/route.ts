import { NextRequest, NextResponse } from 'next/server'

const GMAIL_MCP = 'https://gmailmcp.googleapis.com/mcp/v1'

export async function POST(req: NextRequest) {
  try {
    const { apiKey, gmailToken, maxEmails } = await req.json()
    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 400 })
    if (!gmailToken) return NextResponse.json({ error: 'Gmail OAuth token required' }, { status: 400 })

    const system = `You are a Gmail organizer assistant with Gmail MCP access.
Use the search_threads tool with query "in:inbox" and pageSize ${maxEmails} to fetch recent inbox emails.
Then use get_thread on each thread id to retrieve the From header.
Extract the sender domain from each From header (e.g. "foo@amazon.com" → "amazon.com").
After fetching, return ONLY this JSON (no explanation, no markdown, no code fences):
{"domains":{"gmail.com":["id1","id2"],"amazon.com":["id3"]},"emails":[{"id":"id1","subject":"Subject","from":"x@gmail.com","domain":"gmail.com"}]}
If you cannot find any emails, return: {"domains":{},"emails":[]}`

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
        system,
        messages: [{ role: 'user', content: 'Scan my Gmail inbox now.' }],
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
    if (!match) return NextResponse.json(
      { error: `No JSON in Claude response (stop_reason: ${data.stop_reason}). Raw: ${text.slice(0, 500)}` },
      { status: 500 }
    )

    return NextResponse.json(JSON.parse(match[0]))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
