import { useState } from 'react'
import newsData from '../../content/news.json'
import { safeUrl, safeHostname } from '../lib/safeUrl'
import PageHeader from '../components/PageHeader'

interface Source { id: string; name: string; site: string | null; searchMore?: string }
interface Item { source: string; kind?: string; date?: string; title: string; url: string; description: string }

const sources = newsData.sources as Source[]
const items = newsData.items as Item[]

export default function News() {
  const [filter, setFilter] = useState<string>('all')
  const shown = filter === 'all' ? items : items.filter((i) => i.source === filter)
  const byId = (id: string) => sources.find((s) => s.id === id)

  return (
    <main className="page section">
      <div className="container">
        <div className="prose">
          <PageHeader
            eyebrow="News & Publications"
            title="Geo4Dev in the literature and the field"
            image="/images/earth-asia.jpg"
          />
          <p>
            A curated record of articles, events, workshops, talks, and coverage from across the
            Geo4Dev Initiative and its members — CEGA, 3ie, and New Light Technologies — plus
            independent press. Entries link out to the original source.
          </p>
        </div>

        <div className="filter-row">
          <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All ({items.length})
          </button>
          {sources.map((s) => {
            const n = items.filter((i) => i.source === s.id).length
            return (
              <button key={s.id} className={`chip ${filter === s.id ? 'active' : ''}`} onClick={() => setFilter(s.id)}>
                {s.id === 'press' ? 'Press' : s.id.toUpperCase()} ({n})
              </button>
            )
          })}
        </div>

        <div className="news-list">
          {shown.map((it) => (
            <a className="news-item" href={safeUrl(it.url)} target="_blank" rel="noreferrer" key={it.url}>
              <div className="news-head">
                {it.kind && <span className="pill">{it.kind}</span>}
                <span className="news-src">{byId(it.source)?.name.split(' — ')[0]}</span>
                {it.date && <span className="news-date">{it.date}</span>}
              </div>
              <h3>{it.title}</h3>
              <p>{it.description}</p>
              <span className="news-link">{safeHostname(it.url)} ↗</span>
            </a>
          ))}
        </div>

        <div className="callout" style={{ marginTop: '2rem' }}>
          <h3>Find more</h3>
          <p style={{ marginBottom: '0.6rem' }}>
            Both member organizations keep growing archives of Geo4Dev material:
          </p>
          <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap' }}>
            <a href="https://cega.berkeley.edu/search/?keyword=Geo4dev" target="_blank" rel="noreferrer">
              Search CEGA ↗
            </a>
            <a
              href="https://www.3ieimpact.org/sitewide-search?search_api_fulltext=Geo4Dev&sort_by=search_api_relevance"
              target="_blank"
              rel="noreferrer"
            >
              Search 3ie ↗
            </a>
            <a href="https://newlighttechnologies.com/blog/all" target="_blank" rel="noreferrer">
              Search NLT ↗
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}
