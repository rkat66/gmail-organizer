'use client'

import { useState, useRef, useCallback } from 'react'
import styles from './page.module.css'

// ── Types ──────────────────────────────────────────────────────
interface EmailItem {
  id: string
  subject: string
  from: string
  domain: string
}

interface MovedItem extends EmailItem {
  label: string
}

interface LogLine {
  type: 'info' | 'success' | 'warn' | 'error' | 'dim'
  msg: string
  time: string
}

type StatusState = 'idle' | 'running' | 'done' | 'error'

// ── Component ──────────────────────────────────────────────────
export default function GmailOrganizerPage() {
  const [apiKey, setApiKey]         = useState('')
  const [gmailToken, setGmailToken] = useState('')
  const [labelPrefix, setLabelPrefix] = useState('Domain')
  const [maxEmails, setMaxEmails]   = useState('30')
  const [running, setRunning]       = useState(false)
  const [status, setStatus]         = useState<{ state: StatusState; text: string }>
                                        ({ state: 'idle', text: 'Ready — enter API key and scan inbox' })
  const [progress, setProgress]     = useState(0)
  const [logs, setLogs]             = useState<LogLine[]>([])
  const [domains, setDomains]       = useState<Record<string, string[]>>({})
  const [emails, setEmails]         = useState<EmailItem[]>([])
  const [movedItems, setMovedItems] = useState<MovedItem[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  // ── Helpers ──
  const ts = () =>
    new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const addLog = useCallback((type: LogLine['type'], msg: string) => {
    setLogs(prev => [...prev.slice(-100), { type, msg, time: ts() }])
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, 50)
  }, [])

  // ── Scan ──
  async function scanInbox() {
    if (!apiKey.trim()) { addLog('error', 'API key required — enter it above'); return }
    if (!gmailToken.trim()) { addLog('error', 'Gmail OAuth token required — enter it above'); return }
    setRunning(true)
    setDomains({}); setEmails([]); setMovedItems([])
    setProgress(10)
    setStatus({ state: 'running', text: 'Scanning inbox via Gmail MCP...' })
    addLog('info', 'Initiating Gmail MCP connection...')

    try {
      addLog('info', `Fetching up to ${maxEmails} messages from INBOX...`)
      setProgress(35)
      const res = await fetch('/api/gmail-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, gmailToken, maxEmails }),
      })
      const result = await res.json()
      if (!res.ok || result.error) throw new Error(result.error || 'Scan failed')
      if (!result.domains) throw new Error('Invalid scan response')

      setProgress(80)
      setDomains(result.domains)
      setEmails(result.emails || [])

      const dc = Object.keys(result.domains).length
      const ec = (result.emails || []).length
      addLog('success', `Found ${ec} emails across ${dc} domain${dc !== 1 ? 's' : ''}`)
      Object.entries(result.domains as Record<string, string[]>)
        .sort((a, b) => b[1].length - a[1].length)
        .forEach(([d, ids]) => addLog('dim', `  ${d}: ${ids.length} message${ids.length !== 1 ? 's' : ''}`))
      setProgress(100)
      setStatus({ state: 'done', text: `Scan complete — ${ec} emails, ${dc} domains` })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      addLog('error', 'Scan failed: ' + msg)
      setStatus({ state: 'error', text: 'Error: ' + msg })
    } finally {
      setRunning(false)
      setTimeout(() => setProgress(0), 1500)
    }
  }

  // ── Move ──
  async function moveAll() {
    const domainList = Object.entries(domains)
    if (!domainList.length) { addLog('warn', 'No domains found — run scan first'); return }
    setRunning(true)
    setStatus({ state: 'running', text: 'Creating labels and moving emails...' })
    addLog('info', `Starting move for ${domainList.length} domain${domainList.length !== 1 ? 's' : ''}...`)
    const prefix = labelPrefix.trim() || 'Domain'
    let total = 0

    for (let i = 0; i < domainList.length; i++) {
      const [domain, ids] = domainList[i]
      const labelName = `${prefix}/${domain}`
      setProgress(Math.round(((i + 0.5) / domainList.length) * 100))
      addLog('info', `Processing: ${labelName} (${ids.length} email${ids.length !== 1 ? 's' : ''})`)

      try {
        const res = await fetch('/api/gmail-move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey, gmailToken, domain, messageIds: ids, labelName }),
        })
        const result = await res.json()
        if (!res.ok || result.error) throw new Error(result.error)
        const moved = result.moved || ids.length
        total += moved
        const domEmails = emails.filter(e => e.domain === domain)
        setMovedItems(prev => [...prev, ...domEmails.map(e => ({ ...e, label: labelName }))])
        addLog('success', `✓ ${labelName} — moved ${moved} email${moved !== 1 ? 's' : ''}`)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        addLog('error', `✗ ${domain}: ${msg}`)
      }
    }

    setProgress(100)
    setStatus({ state: 'done', text: `Done — ${total} emails organized into domain labels` })
    addLog('success', `Workflow complete. ${total} total emails moved.`)
    setRunning(false)
    setTimeout(() => setProgress(0), 1500)
  }

  // ── Reset ──
  function resetAll() {
    setDomains({}); setEmails([]); setMovedItems([]); setLogs([])
    setProgress(0)
    setStatus({ state: 'idle', text: 'Ready — enter API key and scan inbox' })
  }

  const domainList = Object.entries(domains).sort((a, b) => b[1].length - a[1].length)
  const totalEmails = Object.values(domains).reduce((s, v) => s + v.length, 0)

  return (
    <div className={styles.page}>
      <div className={styles.container}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerIcon}>📬</div>
          <div>
            <h1 className={styles.h1}>Gmail Domain Organizer</h1>
            <p className={styles.headerSub}>next.js · gmail mcp · label automation</p>
          </div>
        </div>

        {/* API Key */}
        <div className={styles.setupCard}>
          <div className={styles.ctrlLabel}>Anthropic API Key</div>
          <div className={styles.setupRow}>
            <input
              type="password"
              className={styles.input}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              autoComplete="off"
            />
          </div>
          <p className={styles.setupNote}>
            Used only server-side in API routes — never exposed to the browser.{' '}
            Or set <code>ANTHROPIC_API_KEY</code> in <code>.env.local</code> to skip this field.
          </p>
        </div>

        {/* Gmail OAuth Token */}
        <div className={styles.setupCard}>
          <div className={styles.ctrlLabel}>Gmail OAuth Token</div>
          <div className={styles.setupRow}>
            <input
              type="password"
              className={styles.input}
              value={gmailToken}
              onChange={e => setGmailToken(e.target.value)}
              placeholder="ya29...."
              autoComplete="off"
            />
          </div>
          <p className={styles.setupNote}>
            Google OAuth access token with Gmail scopes. Get one via{' '}
            <code>npx @modelcontextprotocol/inspector</code> → Quick OAuth Flow.
          </p>
        </div>

        {/* Status */}
        <div className={styles.statusBar}>
          <div className={`${styles.dot} ${styles['dot_' + status.state]}`} />
          <span className={styles.statusText}>{status.text}</span>
          {totalEmails > 0 && <span className={`${styles.badge} ${styles.badgeBlue}`}>{totalEmails} emails</span>}
        </div>

        {/* Progress */}
        <div className={styles.progressWrap}>
          <div className={styles.progressFill} style={{ width: progress + '%' }} />
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <div className={styles.ctrlCard}>
            <div className={styles.ctrlLabel}>Label Prefix</div>
            <input
              type="text"
              className={styles.input}
              value={labelPrefix}
              onChange={e => setLabelPrefix(e.target.value)}
              disabled={running}
            />
          </div>
          <div className={styles.ctrlCard}>
            <div className={styles.ctrlLabel}>Max Emails to Scan</div>
            <select
              className={styles.input}
              value={maxEmails}
              onChange={e => setMaxEmails(e.target.value)}
              disabled={running}
            >
              <option value="3">3 emails</option>
              <option value="20">20 emails</option>
              <option value="30">30 emails</option>
              <option value="50">50 emails</option>
              <option value="100">100 emails</option>
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={scanInbox} disabled={running}>
            {running && status.state === 'running' && !domainList.length ? '⏳ Scanning...' : '🔍 Scan Inbox'}
          </button>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={moveAll}
            disabled={running || !domainList.length}
          >
            {running && domainList.length > 0 ? '⏳ Moving...' : '📁 Move to Domain Labels'}
          </button>
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={resetAll} disabled={running}>
            ↺ Reset
          </button>
        </div>

        {/* Log */}
        <div className={styles.sectionTitle}>
          <span>Activity Log</span>
          <span className={styles.badge}>{logs.length} lines</span>
        </div>
        <div className={styles.logBox} ref={logRef}>
          {logs.length === 0
            ? <span className={styles.cDim}>// awaiting first run...</span>
            : logs.map((l, i) => (
                <div key={i} className={styles.logLine}>
                  <span className={styles.logTime}>{l.time}</span>
                  <span className={styles['c_' + l.type]}>{l.msg}</span>
                </div>
              ))
          }
        </div>

        {/* Domains */}
        {domainList.length > 0 && (
          <>
            <div className={styles.sectionTitle}>
              <span>Domains Found</span>
              <span className={`${styles.badge} ${styles.badgeBlue}`}>{domainList.length} domains</span>
            </div>
            <div className={styles.domainGrid}>
              {domainList.map(([domain, ids]) => (
                <div key={domain} className={styles.domainCard}>
                  <span className={styles.domainName} title={domain}>{domain}</span>
                  <span className={styles.domainCount}>{ids.length}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Moved */}
        {movedItems.length > 0 && (
          <>
            <div className={styles.sectionTitle}>
              <span>Moved Emails</span>
              <span className={`${styles.badge} ${styles.badgeGreen}`}>{movedItems.length} moved</span>
            </div>
            <div className={styles.movedList}>
              {movedItems.slice(0, 50).map((item, i) => (
                <div key={i} className={styles.movedItem}>
                  <span className={styles.movedSubject}>{item.subject || '(no subject)'}</span>
                  <span className={styles.movedDomain}>{item.domain}</span>
                  <span className={styles.movedLabel}>{item.label}</span>
                </div>
              ))}
              {movedItems.length > 50 && (
                <div className={styles.empty}>+ {movedItems.length - 50} more</div>
              )}
            </div>
          </>
        )}

        {!domainList.length && !movedItems.length && (
          <div className={styles.empty}>// scan inbox to discover domains → then move to labels</div>
        )}
      </div>
    </div>
  )
}
