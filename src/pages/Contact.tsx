import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

// Paste your Cloudflare Turnstile SITE key here to turn on bot protection.
// Leave empty to disable the widget (the server also enforces it only when its secret is set).
const TURNSTILE_SITE_KEY = ''

type Interest = 'contribute-data' | 'contribute-publication' | 'contribute-training' | 'feedback' | 'general'
function typeFor(interest: string): 'contact' | 'submission' {
  return interest.startsWith('contribute') ? 'submission' : 'contact'
}

interface TurnstileApi {
  render: (
    el: HTMLElement,
    options: { sitekey: string; callback: (token: string) => void },
  ) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export default function Contact() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [form, setForm] = useState({ name: '', email: '', organization: '', interest: 'general' as Interest, message: '', link: '' })
  const [company, setCompany] = useState('') // honeypot
  const [token, setToken] = useState('')
  const tsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.defer = true
    s.onload = () => {
      if (window.turnstile && tsRef.current) {
        window.turnstile.render(tsRef.current, { sitekey: TURNSTILE_SITE_KEY, callback: setToken })
      }
    }
    document.body.appendChild(s)
    return () => { s.remove() }
  }, [])

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const isContribute = form.interest.startsWith('contribute')
  const blocked = !!TURNSTILE_SITE_KEY && !token

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, company, turnstileToken: token, type: typeFor(form.interest) }),
      })
      setStatus(res.ok ? 'ok' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'ok') {
    return (
      <main className="page section">
        <div className="container prose">
          <span className="eyebrow">Thanks</span>
          <h2>Got it — message received.</h2>
          <p>Thanks for reaching out. A member of the Geo4Dev team will follow up. For ongoing news, follow the CEGA, 3ie, and NLT channels.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="page section">
      <div className="container prose">
        <span className="eyebrow">Contact &amp; contribute</span>
        <h2>Get in touch</h2>
        <p className="muted">
          Have a resource to contribute, a question, or feedback? Send it here and the team will
          follow up. For news and announcements, the partner organizations (CEGA, 3ie, NLT) share
          updates through their own channels.
        </p>
        <form onSubmit={submit} style={{ maxWidth: 480, marginTop: '1.2rem' }}>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="email">Email *</label>
            <input id="email" type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="org">Organization</label>
            <input id="org" value={form.organization} onChange={(e) => set('organization', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="interest">Reason</label>
            <select id="interest" value={form.interest} onChange={(e) => set('interest', e.target.value)}>
              <option value="general">General inquiry</option>
              <option value="contribute-data">Contributing data</option>
              <option value="contribute-publication">Contributing a publication</option>
              <option value="contribute-training">Contributing training</option>
              <option value="feedback">Giving feedback</option>
            </select>
          </div>
          {isContribute && (
            <div className="field">
              <label htmlFor="link">Link to the resource</label>
              <input id="link" type="url" placeholder="https://…" value={form.link} onChange={(e) => set('link', e.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="msg">Message</label>
            <textarea id="msg" rows={3} value={form.message} onChange={(e) => set('message', e.target.value)} />
          </div>

          {/* honeypot: hidden from humans, bots tend to fill it */}
          <input
            type="text" name="company" tabIndex={-1} autoComplete="off"
            value={company} onChange={(e) => setCompany(e.target.value)}
            aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
          />

          {TURNSTILE_SITE_KEY && <div ref={tsRef} className="field" />}

          <p className="muted" style={{ fontSize: '0.82rem' }}>
            We use your details only to respond to this request. See our{' '}
            <Link to="/privacy">Privacy Notice</Link>.
          </p>
          <button className="btn" type="submit" disabled={status === 'sending' || blocked}>
            {status === 'sending' ? 'Sending…' : 'Send'}
          </button>
          {status === 'error' && (
            <p style={{ color: '#ef4444', fontSize: '0.88rem', marginTop: '0.7rem' }}>
              Something went wrong sending your message. Please try again shortly.
            </p>
          )}
        </form>
      </div>
    </main>
  )
}
