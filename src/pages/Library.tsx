import { useMemo, useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import SearchBar from '../components/SearchBar'
import Filters from '../components/Filters'
import DatasetCard from '../components/DatasetCard'
import { search } from '../lib/catalog'

export default function Library() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [categories, setCategories] = useState<string[]>(
    params.get('cat') ? [params.get('cat')!] : [],
  )
  const [contentTypes, setContentTypes] = useState<string[]>(params.getAll('ct'))

  useEffect(() => {
    const next = new URLSearchParams()
    if (q) next.set('q', q)
    categories.forEach((c) => next.append('cat', c))
    contentTypes.forEach((c) => next.append('ct', c))
    setParams(next, { replace: true })
  }, [q, categories, contentTypes, setParams])

  const results = useMemo(
    () => search({ q, categories, contentTypes }),
    [q, categories, contentTypes],
  )

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <main className="page section">
      <div className="container">
        <div className="section-head">
          <div>
            <span className="eyebrow">Library</span>
            <h2>Explore the catalog</h2>
          </div>
        </div>

        <div style={{ marginBottom: '1.6rem', maxWidth: 560 }}>
          <SearchBar value={q} onChange={setQ} />
        </div>

        <div className="lib">
          <Filters
            categories={categories}
            contentTypes={contentTypes}
            onToggleCategory={(c) => toggle(categories, setCategories, c)}
            onToggleContentType={(c) => toggle(contentTypes, setContentTypes, c)}
            onClear={() => {
              setCategories([])
              setContentTypes([])
            }}
          />
          <div>
            <div className="results-meta results-meta-row">
              <span>{results.length} {results.length === 1 ? 'entry' : 'entries'}</span>
              <Link to="/map" className="btn ghost" style={{ fontSize: '0.82rem' }}>Map view →</Link>
            </div>
            <div className="card-list">
              {results.map((d) => (
                <DatasetCard key={d.id} d={d} />
              ))}
              {results.length === 0 && (
                <p className="muted">No entries match those filters. Try clearing some.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
