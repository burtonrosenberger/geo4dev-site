import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import GeoMap, { BASEMAPS, type GeoDataset } from '../map/GeoMap'
import { search, taxonomy, CONTENT_TYPES, bySlug, byId } from '../lib/catalog'
import { safeUrl } from '../lib/safeUrl'

interface SectionProps { title: string; defaultOpen?: boolean; children: React.ReactNode }
function Section({ title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`mp-section ${open ? 'open' : ''}`}>
      <button className="mp-section-head" onClick={() => setOpen((v) => !v)}>
        <span>{title}</span>
        <span className="mp-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="mp-section-body">{children}</div>}
    </div>
  )
}

export default function MapPage() {
  const [params] = useSearchParams()
  const [q, setQ] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [contentTypes, setContentTypes] = useState<string[]>([])
  const [basemap, setBasemap] = useState('dark')
  const [showPoints, setShowPoints] = useState(true)
  const [pointSize, setPointSize] = useState(6)
  const [outline, setOutline] = useState(1.4)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [flyTo, setFlyTo] = useState<{ lng: number; lat: number; key: number } | null>(null)
  const [initView, setInitView] = useState<{ center: [number, number]; zoom: number } | null>(null)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  const results = useMemo(() => search({ q, categories, contentTypes }), [q, categories, contentTypes])
  const geoResults = useMemo(
    () => results.filter((d) => d.lat != null && d.lng != null) as GeoDataset[],
    [results],
  )
  const selected = selectedId ? byId.get(selectedId) : undefined

  function focus(d: { id: string; lat: number | null; lng: number | null }) {
    setSelectedId(d.id)
    setRightOpen(true)
    if (d.lat != null && d.lng != null) {
      setFlyTo({ lng: d.lng, lat: d.lat, key: Date.now() })
    }
  }

  // honor ?focus=<slug> from a library "Map it"
  useEffect(() => {
    const slug = params.get('focus')
    if (!slug) return
    const d = bySlug.get(slug)
    if (!d) return
    setSelectedId(d.id)
    if (d.category) setCategories([d.category])
    if (d.lat != null && d.lng != null) {
      setInitView({ center: [d.lng, d.lat], zoom: 5 })
      setFlyTo({ lng: d.lng, lat: d.lat, key: Date.now() })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const cols = `${leftOpen ? 'minmax(240px, 300px)' : '38px'} minmax(0, 1fr) ${rightOpen ? 'minmax(240px, 320px)' : '38px'}`

  return (
    <main className="map-page">
      <div className="map-shell" style={{ gridTemplateColumns: cols }}>
        {leftOpen ? (
          <aside className="map-pane left">
            <div className="pane-bar">
              <h3>Library &amp; controls</h3>
              <button className="pane-collapse" title="Collapse panel" onClick={() => setLeftOpen(false)}>⟨</button>
            </div>
            <Section title="Search & filter">
              <input className="mp-search" type="search" placeholder="Search the library…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="mp-sub">Category</div>
              {taxonomy.map((g) => (
                <label key={g.category} className="mc-radio">
                  <input type="checkbox" checked={categories.includes(g.category)} onChange={() => toggle(categories, setCategories, g.category)} />
                  {g.category}
                </label>
              ))}
              <div className="mp-sub">Content type</div>
              {CONTENT_TYPES.map((ct) => (
                <label key={ct} className="mc-radio">
                  <input type="checkbox" checked={contentTypes.includes(ct)} onChange={() => toggle(contentTypes, setContentTypes, ct)} />
                  {ct}
                </label>
              ))}
              {(categories.length > 0 || contentTypes.length > 0 || q) && (
                <button className="mp-clear" onClick={() => { setQ(''); setCategories([]); setContentTypes([]) }}>Clear filters</button>
              )}
            </Section>

            <Section title={`Results — ${results.length} (${geoResults.length} on map)`}>
              <div className="mp-list">
                {results.map((d) => {
                  const geo = d.lat != null && d.lng != null
                  return (
                    <button key={d.id} className={`mp-item ${selectedId === d.id ? 'active' : ''}`} onClick={() => focus(d)}>
                      <span className={`mp-pin ${geo ? '' : 'off'}`} title={geo ? 'On the map' : 'No coordinates'}>◉</span>
                      <span className="mp-item-title">{d.title}</span>
                    </button>
                  )
                })}
                {results.length === 0 && <p className="muted" style={{ padding: '0.4rem' }}>No matches. Try clearing filters.</p>}
              </div>
            </Section>

            <Section title="Map style" defaultOpen={false}>
              <div className="mp-sub">Base layer</div>
              {Object.entries(BASEMAPS).map(([k, v]) => (
                <label key={k} className="mc-radio">
                  <input type="radio" name="basemap" checked={basemap === k} onChange={() => setBasemap(k)} />
                  {v.label}
                </label>
              ))}
              <div className="mp-sub">Data</div>
              <label className="mc-radio"><input type="checkbox" checked={showPoints} onChange={(e) => setShowPoints(e.target.checked)} /> Show points</label>
              <div className="mp-sub">Point size <span className="mp-val">{pointSize}px</span></div>
              <input type="range" min={2} max={16} value={pointSize} onChange={(e) => setPointSize(+e.target.value)} />
              <div className="mp-sub">Outline width <span className="mp-val">{outline.toFixed(1)}px</span></div>
              <input type="range" min={0} max={5} step={0.2} value={outline} onChange={(e) => setOutline(+e.target.value)} />
            </Section>
          </aside>
        ) : (
          <aside className="map-pane collapsed">
            <button className="pane-expand" title="Expand panel" onClick={() => setLeftOpen(true)}>⟩<span>Library &amp; controls</span></button>
          </aside>
        )}

        <div className="map-center">
          <GeoMap
            points={geoResults}
            basemap={basemap}
            showPoints={showPoints}
            pointSize={pointSize}
            outlineWidth={outline}
            selectedId={selectedId}
            onSelect={(d) => (d ? focus(d) : setSelectedId(null))}
            flyTo={flyTo}
            initialCenter={initView?.center}
            initialZoom={initView?.zoom}
          />
        </div>

        {rightOpen ? (
          <aside className="map-pane right">
            <div className="pane-bar">
              <h3>Details</h3>
              <button className="pane-collapse" title="Collapse panel" onClick={() => setRightOpen(false)}>⟩</button>
            </div>
            {selected ? (
              <div className="mp-detail">
                <div className="tags-row">
                  {selected.content_type && <span className="pill">{selected.content_type}</span>}
                  {selected.category && <span className="pill cat">{selected.category}</span>}
                </div>
                <h3 className="mp-title">{selected.title}</h3>
                {selected.description && <p className="mp-desc">{selected.description}</p>}
                <dl className="mp-kv">
                  {selected.author && (<><dt>Author</dt><dd>{selected.author}</dd></>)}
                  {selected.publishing_org && (<><dt>Org</dt><dd>{selected.publishing_org}</dd></>)}
                  {selected.country && (<><dt>Location</dt><dd>{selected.country}{selected.region_city ? ` · ${selected.region_city}` : ''}</dd></>)}
                  {selected.lat != null && selected.lng != null && (<><dt>Coords</dt><dd>{selected.lat.toFixed(3)}, {selected.lng.toFixed(3)}</dd></>)}
                  {selected.tags.length > 0 && (<><dt>Tags</dt><dd>{selected.tags.slice(0, 8).join(', ')}</dd></>)}
                </dl>
                <div className="mp-actions">
                  {(selected.stable_link || selected.source_url) && (
                    <a className="btn" href={safeUrl(selected.stable_link || selected.source_url)} target="_blank" rel="noreferrer">Open source ↗</a>
                  )}
                  <Link className="btn ghost" to={`/dataset/${selected.slug}`}>Full details →</Link>
                </div>
              </div>
            ) : (
              <div className="mp-empty"><p className="muted">Select a point on the map or a result on the left to see its details here.</p></div>
            )}
          </aside>
        ) : (
          <aside className="map-pane collapsed">
            <button className="pane-expand" title="Expand panel" onClick={() => setRightOpen(true)}>⟨<span>Details</span></button>
          </aside>
        )}
      </div>
    </main>
  )
}
