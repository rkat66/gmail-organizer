import { NextRequest, NextResponse } from 'next/server'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'

export async function POST(req: NextRequest) {
  try {
    const { gmailToken, messageIds, labelName } = await req.json()
    if (!gmailToken) return NextResponse.json({ error: 'Gmail OAuth token required' }, { status: 400 })
    if (!messageIds?.length || !labelName) {
      return NextResponse.json({ error: 'messageIds and labelName required' }, { status: 400 })
    }

    const headers = { Authorization: `Bearer ${gmailToken}`, 'Content-Type': 'application/json' }

    // 1. Get or create label
    const labelsRes = await fetch(`${GMAIL}/labels`, { headers })
    if (!labelsRes.ok) {
      const err = await labelsRes.json().catch(() => ({}))
      return NextResponse.json({ error: err.error?.message || `Gmail API error ${labelsRes.status}` }, { status: labelsRes.status })
    }
    const { labels = [] } = await labelsRes.json()
    let label = (labels as { id: string; name: string }[]).find(l => l.name === labelName)

    if (!label) {
      const createRes = await fetch(`${GMAIL}/labels`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: labelName,
          labelListVisibility: 'labelShowIfUnread',
          messageListVisibility: 'show',
        }),
      })
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}))
        return NextResponse.json({ error: err.error?.message || 'Failed to create label' }, { status: createRes.status })
      }
      label = await createRes.json()
    } else {
      // Ensure existing label has correct visibility for IMAP (Outlook)
      await fetch(`${GMAIL}/labels/${label.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          labelListVisibility: 'labelShowIfUnread',
          messageListVisibility: 'show',
        }),
      })
    }

    // 2. Apply label + remove INBOX for each message
    const results = await Promise.allSettled(
      (messageIds as string[]).map(id =>
        fetch(`${GMAIL}/messages/${id}/modify`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ addLabelIds: [label!.id], removeLabelIds: ['INBOX'] }),
        })
      )
    )

    const errors = results
      .map((r, i) => r.status === 'rejected' ? messageIds[i] : null)
      .filter(Boolean)

    return NextResponse.json({ moved: messageIds.length - errors.length, label: labelName, errors })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
