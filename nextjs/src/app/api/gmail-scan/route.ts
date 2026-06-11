import { NextRequest, NextResponse } from 'next/server'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'

function extractDomain(from: string): string {
  const match = from.match(/<([^>]+)>/) || from.match(/([^\s]+@[^\s]+)/)
  const email = match ? match[1] : from
  return email.split('@')[1]?.toLowerCase().trim() ?? 'unknown'
}

export async function POST(req: NextRequest) {
  try {
    const { gmailToken, maxEmails } = await req.json()
    if (!gmailToken) return NextResponse.json({ error: 'Gmail OAuth token required' }, { status: 400 })

    const headers = { Authorization: `Bearer ${gmailToken}` }

    // 1. List messages from INBOX
    const listRes = await fetch(
      `${GMAIL}/messages?labelIds=INBOX&maxResults=${maxEmails}`,
      { headers }
    )
    if (!listRes.ok) {
      const err = await listRes.json().catch(() => ({}))
      return NextResponse.json({ error: err.error?.message || `Gmail API error ${listRes.status}` }, { status: listRes.status })
    }
    const { messages = [] } = await listRes.json()

    // 2. Fetch metadata for each message in parallel
    const details = await Promise.all(
      (messages as { id: string }[]).map(m =>
        fetch(`${GMAIL}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, { headers })
          .then(r => r.json())
      )
    )

    // 3. Build domains + emails
    const domains: Record<string, string[]> = {}
    const emails: { id: string; subject: string; from: string; domain: string }[] = []

    for (const msg of details) {
      const hdrs: { name: string; value: string }[] = msg.payload?.headers ?? []
      const from    = hdrs.find(h => h.name === 'From')?.value ?? ''
      const subject = hdrs.find(h => h.name === 'Subject')?.value ?? '(no subject)'
      const domain  = extractDomain(from)

      if (!domains[domain]) domains[domain] = []
      domains[domain].push(msg.id)
      emails.push({ id: msg.id, subject, from, domain })
    }

    return NextResponse.json({ domains, emails })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
