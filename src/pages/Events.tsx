import { Link } from 'react-router-dom'
import eventsData from '../../content/events.json'
import { GITHUB_OPEN_DATA } from '../lib/assets'
import { safeUrl, safeHostname } from '../lib/safeUrl'
import PageHeader from '../components/PageHeader'

interface Ev { year: string; date: string; title: string; host: string; blurb: string; url: string }
const events = eventsData.events as Ev[]
const DISCUSSIONS = `${GITHUB_OPEN_DATA}/discussions`

export default function Events() {
  return (
    <main className="page section">
      <div className="container">
        <div className="prose">
          <PageHeader
            eyebrow="Events"
            title="Geo4Dev convenings & workshops"
            image="/images/hands-globe.jpg"
          />
          <p>
            The Geo4Dev Initiative has brought researchers, practitioners, and agencies together
            through annual symposia and hands-on workshops on applying geospatial and
            remote-sensing methods to global development.
          </p>
        </div>

        <div className="callout" style={{ marginTop: '1.6rem' }}>
          <h3>Propose or contribute an event</h3>
          <p style={{ marginBottom: '0.8rem' }}>
            Planning a workshop, session, or symposium — or know of a Geo4Dev-aligned event the
            community should see? Propose it for the calendar, or volunteer to help host a future
            Geo4Dev convening.
          </p>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <a className="btn" href={DISCUSSIONS} target="_blank" rel="noreferrer">Submit an event ↗</a>
            <Link className="btn ghost" to="/contact">Contact us</Link>
          </div>
        </div>

        <h3 style={{ marginTop: '2.4rem' }}>Past events</h3>
        <div className="event-list">
          {events.map((e) => (
            <a className="event-item" href={safeUrl(e.url)} target="_blank" rel="noreferrer" key={e.title}>
              <div className="event-year">{e.date}</div>
              <div className="event-body">
                <h4>{e.title}</h4>
                <p>{e.blurb}</p>
                <div className="event-meta">
                  <span className="event-host">{e.host}</span>
                  <span className="event-link">{safeHostname(e.url)} ↗</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  )
}
