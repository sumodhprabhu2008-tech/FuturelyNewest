import Link from 'next/link'
import Image from 'next/image'

const FEATURES = [
  { icon: '📊', title: 'Grade Viewer',   desc: 'Connect your school portal. View grades, GPA, and transcripts in one place.' },
  { icon: '🎯', title: 'GPA Simulator',  desc: 'See how grade changes would affect your GPA in real time with what-if scenarios.' },
  { icon: '📅', title: 'Smart Planner',  desc: 'AI-organized assignment planner that keeps you on top of every deadline.' },
  { icon: '🗺️', title: 'HS Roadmap',     desc: 'Track graduation requirements and get personalized college readiness guidance.' },
]

const PROBLEMS = [
  { icon: '😵', title: 'Scattered Grades',     desc: 'Grades live in outdated portals no one wants to use. NextStep brings them together.' },
  { icon: '😐', title: 'No Personalization',   desc: 'Generic planners ignore your actual schedule. NextStep adapts to your courses.' },
  { icon: '🤔', title: 'College Mystery',       desc: "How does today's grade affect your future? NextStep makes the connection clear." },
]

export default function LandingPage() {
  return (
    <div style={styles.page}>
      {/* Nav */}
      <nav style={styles.nav}>
        <div style={styles.navInner}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <Image src="/logo.svg" alt="NextStep" width={32} height={32} />
            <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>NextStep</span>
          </Link>
          <Link href="/login" style={styles.navBtn}>Log In →</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={styles.hero}>
        <div style={styles.heroBadge}>MVP Build · 2026</div>
        <h1 style={styles.heroHeading}>Your AI-Powered<br />Academic Companion</h1>
        <p style={styles.heroSub}>
          NextStep helps high school students track grades, plan assignments,
          and prepare for college — all in one app.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/login" style={styles.ctaBtn}>Get Started →</Link>
          <a href="#features" style={styles.ctaBtnGhost}>Learn More</a>
        </div>
      </section>

      {/* Problems */}
      <section style={styles.section}>
        <h2 style={styles.sectionHeading}>The Problem We Solve</h2>
        <div style={styles.grid3}>
          {PROBLEMS.map(p => (
            <div key={p.title} style={styles.card}>
              <div style={styles.cardIcon}>{p.icon}</div>
              <h3 style={styles.cardTitle}>{p.title}</h3>
              <p style={styles.cardDesc}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" style={styles.section}>
        <h2 style={styles.sectionHeading}>Everything You Need</h2>
        <div style={styles.grid4}>
          {FEATURES.map(f => (
            <div key={f.title} style={styles.featureCard}>
              <div style={styles.featureIcon}>{f.icon}</div>
              <h3 style={styles.featureTitle}>{f.title}</h3>
              <p style={styles.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={styles.ctaSection}>
        <h2 style={styles.ctaHeading}>Start your NextStep today</h2>
        <p style={styles.ctaSub}>Join thousands of students leveling up their academic game.</p>
        <Link href="/login" style={styles.ctaBtn}>Log In to Dashboard →</Link>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
          <Image src="/logo.svg" alt="NextStep" width={20} height={20} />
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>NextStep</span>
        </div>
        <p>© 2026 NextStep · Built for high school students.</p>
      </footer>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page:           { background: 'var(--bg)', minHeight: '100vh' },
  nav:            { borderBottom: '1px solid var(--border)', background: 'var(--bg)', position: 'sticky', top: 0, zIndex: 50 },
  navInner:       { maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  navBtn:         { background: 'var(--primary)', color: '#060D10', borderRadius: 8, padding: '8px 18px', fontWeight: 700, fontSize: 14, textDecoration: 'none' },
  hero:           { textAlign: 'center', padding: '80px 24px 60px', maxWidth: 1100, margin: '0 auto' },
  heroBadge:      { display: 'inline-block', background: 'rgba(0,200,150,0.15)', color: 'var(--primary)', border: '1px solid rgba(0,200,150,0.3)', borderRadius: 100, padding: '4px 14px', fontSize: 12, fontWeight: 600, marginBottom: 20 },
  heroHeading:    { fontSize: 56, fontWeight: 800, lineHeight: 1.12, marginBottom: 20, letterSpacing: '-1.5px', color: 'var(--text)' },
  heroSub:        { fontSize: 18, color: 'var(--text-secondary)', maxWidth: 560, margin: '0 auto 32px', lineHeight: 1.7 },
  ctaBtn:         { display: 'inline-block', background: 'var(--primary)', color: '#060D10', borderRadius: 10, padding: '14px 32px', fontWeight: 700, fontSize: 16, textDecoration: 'none' },
  ctaBtnGhost:    { display: 'inline-block', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 32px', fontWeight: 600, fontSize: 16, textDecoration: 'none' },
  section:        { maxWidth: 1100, margin: '0 auto', padding: '60px 24px' },
  sectionHeading: { fontSize: 32, fontWeight: 700, marginBottom: 40, textAlign: 'center', color: 'var(--text)' },
  grid3:          { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 },
  grid4:          { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 },
  card:           { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 },
  cardIcon:       { fontSize: 32, marginBottom: 12 },
  cardTitle:      { fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text)' },
  cardDesc:       { fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 },
  featureCard:    { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 },
  featureIcon:    { fontSize: 28, marginBottom: 12 },
  featureTitle:   { fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text)' },
  featureDesc:    { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 },
  ctaSection:     { textAlign: 'center', padding: '60px 24px 80px', borderTop: '1px solid var(--border)', maxWidth: 1100, margin: '0 auto' },
  ctaHeading:     { fontSize: 36, fontWeight: 800, marginBottom: 12, color: 'var(--text)' },
  ctaSub:         { color: 'var(--text-secondary)', marginBottom: 28, fontSize: 16 },
  footer:         { textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: 13, borderTop: '1px solid var(--border)' },
}
