import { Link } from 'react-router-dom'
import { PARTNERS, NLT_LOGO, GITHUB_OPEN_DATA } from '../lib/assets'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-partners">
          <span className="footer-partners-label">In collaboration</span>
          <div className="partner-logos">
            {PARTNERS.map((p) => (
              <a key={p.name} href={p.href} target="_blank" rel="noreferrer" title={p.name}>
                <img src={p.logo} alt={`${p.name} logo`} />
              </a>
            ))}
          </div>
        </div>

        <div className="cols">
          <div className="fcol fcol-wide">
            <h4>Geo4Dev</h4>
            <p>
              The Geospatial Analysis for Development Initiative — a collaboration of
              New Light Technologies, the Center for Effective Global Action (CEGA) at
              UC Berkeley, and 3ie. An open library connecting geospatial methods to
              development and impact evaluation.
            </p>
          </div>
          <div className="fcol">
            <h4>Explore</h4>
            <Link to="/library">Library</Link>
            <Link to="/map">Map</Link>
            <Link to="/training">Training</Link>
            <Link to="/events">Events</Link>
            <Link to="/news">News &amp; publications</Link>
            <Link to="/releases">Release notes</Link>
            <Link to="/about">About</Link>
          </div>
          <div className="fcol">
            <h4>Open science</h4>
            <Link to="/contribute">How to contribute</Link>
            <a href={GITHUB_OPEN_DATA} target="_blank" rel="noreferrer">Contribute on GitHub ↗</a>
            <a href="https://newlighttechnologies.com/blog/all" target="_blank" rel="noreferrer">Search NLT ↗</a>
            <Link to="/contact">Contact</Link>
          </div>
        </div>

        <div className="copy">
          <span>© {new Date().getFullYear()} Geo4Dev. Open data under their respective licenses. · <Link to="/privacy">Privacy</Link></span>
          <span className="powered">
            Powered by{' '}
            <a href="https://newlighttechnologies.com" target="_blank" rel="noreferrer">
              <img src={NLT_LOGO} alt="New Light Technologies" />
            </a>
          </span>
        </div>
      </div>
    </footer>
  )
}
