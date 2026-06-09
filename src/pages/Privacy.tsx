import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'

export default function Privacy() {
  return (
    <main className="page section">
      <div className="container">
        <div className="prose">
          <PageHeader eyebrow="Privacy" title="Privacy Notice" image="/images/earth-asia.jpg" />
          <p className="muted">Last updated: June 2026</p>

          <p>
            This notice explains how the Geo4Dev Initiative (a collaboration of New Light
            Technologies, the Center for Effective Global Action at UC Berkeley, and the
            International Initiative for Impact Evaluation) handles personal information you
            provide through this website.
          </p>

          <h3>What we collect</h3>
          <p>
            Only what you enter in the contact / contribute form: your email (required) and,
            optionally, your name, organization, a resource link, and a message. Browsing the site
            does not require an account, and we don't sell or rent your information.
          </p>

          <h3>Why we use it</h3>
          <p>
            We use your details solely to respond to your request — to reply to a question, follow
            up on feedback, or review a resource you've offered for the library. We do not use this
            form for marketing. News and announcements are shared by the partner organizations
            through their own channels, which you can choose to follow.
          </p>

          <h3>Who processes it</h3>
          <p>
            Your submission is delivered to the team through GitHub (stored in a private,
            access-controlled repository) and served via Cloudflare. These providers process the
            data on our behalf so we can receive and act on your message.
          </p>

          <h3>How long we keep it</h3>
          <p>
            We keep submissions only as long as needed to handle your request and maintain a
            reasonable record, after which they are removed.
          </p>

          <h3>Your choices</h3>
          <p>
            You can ask us what we hold about you, to correct it, or to delete it. Contact us
            through the form on the <Link to="/contact">Contact</Link> page and we'll act on your
            request.
          </p>
        </div>
      </div>
    </main>
  )
}
