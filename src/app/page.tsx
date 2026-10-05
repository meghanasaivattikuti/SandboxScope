import AnalysisWorkspace from "./components/analysis-workspace";

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

export default function Home() {
  return (
    <main className="site-shell">
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <div><strong>SandboxScope</strong><span>Controlled code execution</span></div>
        </div>
        <div className="header-actions">
          <span className="demo-status"><i />Live demo</span>
          <a href="https://github.com/meghanasaivattikuti/SandboxScope" target="_blank" rel="noreferrer">GitHub ↗</a>
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">Sandboxed data analysis</p>
        <h1>Ask your data. See exactly what runs.</h1>
        <p>SandboxScope turns a plain-English question into Python, executes it in an isolated Vercel Sandbox, and exposes the controls behind the result.</p>
      </section>

      <section className="closing-blurb">
        <div>
          <p>Design goal</p>
          <h2>Generated code you can inspect</h2>
        </div>
        <p>SandboxScope shows a practical way to use model-generated code without hiding how it works. Users can review the program before it runs, execution is isolated and time-limited, and every completed run returns a clear record of what happened.</p>
      </section>

      <nav className="workflow" aria-label="Analysis workflow">
        <div className="active"><b>1</b><span><small>Input</small>Choose data</span></div>
        <i aria-hidden="true" />
        <div><b>2</b><span><small>Prepare</small>Generate Python</span></div>
        <i aria-hidden="true" />
        <div><b>3</b><span><small>Execute</small>Run & inspect</span></div>
      </nav>

      <AnalysisWorkspace />

      <section className="vercel-stack">
        <div className="stack-heading">
          <div><p>Implementation</p><h2>Vercel products used</h2></div>
          <span>Live in this demo</span>
        </div>
        <p className="stack-intro">Each product has one clear job in the workflow.</p>

        <div className="primitive-grid">
          <article>
            <span className="primitive-icon">›_</span>
            <div><strong>Vercel Sandbox</strong><p>Runs reviewed Python in a fresh, isolated environment.</p></div>
          </article>
          <article>
            <span className="primitive-icon">◇</span>
            <div><strong>Vercel OIDC</strong><p>Provides short-lived access to Sandbox without storing a permanent credential.</p></div>
          </article>
          <article>
            <span className="primitive-icon">AI</span>
            <div><strong>AI SDK</strong><p>Turns the question into a structured plan and Python program.</p></div>
          </article>
          <article>
            <span className="primitive-icon">↗</span>
            <div><strong>AI Gateway</strong><p>Sends model requests through one managed endpoint.</p></div>
          </article>
          <article>
            <span className="primitive-icon">ID</span>
            <div><strong>BotID</strong><p>Checks both costly API routes before model or Sandbox work begins.</p></div>
          </article>
          <article>
            <span className="primitive-icon">WAF</span>
            <div><strong>Vercel WAF</strong><p>Limits repeated requests before they reach application code.</p></div>
          </article>
        </div>

        <div className="policy-strip" aria-label="Sandbox execution controls">
          <strong>Execution controls</strong>
          <span>Outbound network denied</span>
          <span>20-second command limit</span>
          <span>30-second Sandbox limit</span>
          <span>Automated requests checked</span>
          <span>10 requests per minute per IP</span>
          <span>Cleanup requested after every run</span>
        </div>
      </section>

      <footer><span>SandboxScope</span><p>Generated code should be inspectable, not invisible.</p></footer>
    </main>
  );
}
