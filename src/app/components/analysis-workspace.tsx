"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { Dataset, MAX_FILE_BYTES, validateCsv } from "@/lib/csv";

const DEFAULT_QUESTION =
  "Revenue increased last quarter. Which categories became less profitable, and why?";

const SUGGESTIONS = [
  "Which category has the highest return rate?",
  "Where did discounts grow fastest?",
  "Summarize the biggest quarter-over-quarter change.",
] as const;

type DatasetStatus = "idle" | "validating" | "ready" | "failed";
type GenerationStatus = "idle" | "generating" | "generated" | "failed";
type ExecutionStatus = "idle" | "executing" | "completed" | "failed";
type GeneratedPlan = {
  analysisPlan: string;
  code: string;
  requiredColumns: string[];
  assumptions: string[];
  signature: string;
  model: string;
  executed: false;
  policyChecked: true;
};

type AnalysisResult = {
  summary: string;
  metrics: { label: string; value: string | number }[];
  chart: {
    type: "bar";
    title: string;
    labels: string[];
    series: { name: string; data: number[] }[];
  };
  notes: string[];
};

type ExecutionReceipt = {
  runtime: string;
  network: string;
  persistent: false;
  timeoutMs: number;
  durationMs: number;
  commandDurationMs: number | null;
  exitCode: number | null;
  stdoutBytes: number;
  stopped: boolean;
};

type ExecutionResponse = {
  result: AnalysisResult;
  lifecycle: string[];
  receipt: ExecutionReceipt;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function planSteps(plan: string) {
  const steps = plan
    .split(/(?=\d+[.)]\s+)/)
    .map((step) => step.replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  return steps.length > 1 ? steps : [plan];
}

export default function AnalysisWorkspace() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [status, setStatus] = useState<DatasetStatus>("idle");
  const [error, setError] = useState("");
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [dragging, setDragging] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);
  const [generationError, setGenerationError] = useState("");
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>("idle");
  const [execution, setExecution] = useState<ExecutionResponse | null>(null);
  const [executionError, setExecutionError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function resetGeneration() {
    setGenerationStatus("idle");
    setGeneratedPlan(null);
    setGenerationError("");
    setExecutionStatus("idle");
    setExecution(null);
    setExecutionError("");
  }

  async function loadSample() {
    setStatus("validating");
    setError("");
    resetGeneration();
    try {
      const response = await fetch("/retail-performance.csv");
      if (!response.ok) throw new Error("The sample dataset could not be loaded.");
      const text = await response.text();
      const size = new Blob([text]).size;
      setDataset(validateCsv(text, "retail-performance.csv", size, "sample"));
      setStatus("ready");
    } catch (reason) {
      setDataset(null);
      setError(reason instanceof Error ? reason.message : "The sample dataset could not be loaded.");
      setStatus("failed");
    }
  }

  async function acceptFile(file: File) {
    setStatus("validating");
    setError("");
    resetGeneration();

    try {
      if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Choose a file with a .csv extension.");
      if (file.size === 0) throw new Error("The selected CSV is empty.");
      if (file.size > MAX_FILE_BYTES) throw new Error("CSV files must be 2 MB or smaller.");
      const text = await file.text();
      setDataset(validateCsv(text, file.name, file.size, "upload"));
      setStatus("ready");
    } catch (reason) {
      setDataset(null);
      setError(reason instanceof Error ? reason.message : "The CSV could not be validated.");
      setStatus("failed");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void acceptFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void acceptFile(file);
  }

  function clearDataset() {
    setDataset(null);
    setStatus("idle");
    setError("");
    resetGeneration();
  }

  async function generatePython() {
    if (!dataset || !question.trim()) return;
    setGenerationStatus("generating");
    setGeneratedPlan(null);
    setGenerationError("");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          dataset: {
            name: dataset.name,
            rows: dataset.rows,
            columns: dataset.columns,
            headers: dataset.headers,
            types: dataset.types,
            preview: dataset.preview,
          },
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = typeof body === "object" && body && "error" in body && typeof body.error === "string"
          ? body.error
          : "Python generation failed.";
        throw new Error(message);
      }
      setGeneratedPlan(body as GeneratedPlan);
      setGenerationStatus("generated");
    } catch (reason) {
      setGenerationError(reason instanceof Error ? reason.message : "Python generation failed.");
      setGenerationStatus("failed");
    }
  }

  async function executePython() {
    if (!dataset || !generatedPlan) return;
    setExecutionStatus("executing");
    setExecution(null);
    setExecutionError("");

    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: dataset.name,
          csv: dataset.content,
          code: generatedPlan.code,
          signature: generatedPlan.signature,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = typeof body === "object" && body && "error" in body && typeof body.error === "string"
          ? body.error
          : "Sandbox execution failed.";
        throw new Error(message);
      }
      setExecution(body as ExecutionResponse);
      setExecutionStatus("completed");
    } catch (reason) {
      setExecutionError(reason instanceof Error ? reason.message : "Sandbox execution failed.");
      setExecutionStatus("failed");
    }
  }

  const canRun = status === "ready" && Boolean(dataset) && question.trim().length >= 5 && generationStatus !== "generating";

  return (
    <section className="primary-workspace">
      <aside className="setup-card">
        <div className="card-heading">
          <span className="step-number">1</span>
          <div><p>Start here</p><h2>Choose your dataset</h2></div>
        </div>

        {dataset && status === "ready" ? (
          <>
            <div className="selected-file">
              <span className="file-icon">CSV</span>
              <div>
                <strong>{dataset.name}</strong>
                <span>{dataset.source === "sample" ? "Sample data" : formatBytes(dataset.size)} · {dataset.rows.toLocaleString()} rows · {dataset.columns} columns</span>
              </div>
              <span className="selected-check">✓</span>
            </div>
            <div className="file-actions">
              <label htmlFor="csv-upload">Replace file</label>
              <button type="button" onClick={clearDataset}>Remove</button>
            </div>
          </>
        ) : (
          <div
            className={`upload-zone${dragging ? " dragging" : ""}`}
            onDragEnter={() => setDragging(true)}
            onDragLeave={() => setDragging(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <span className="upload-icon" aria-hidden="true">↑</span>
            <strong>{status === "validating" ? "Validating dataset..." : "Drop a CSV here"}</strong>
            <span>Up to 2 MB, 10,000 rows, and 50 columns</span>
            <label htmlFor="csv-upload">Choose file</label>
            {status !== "validating" && <button type="button" onClick={() => void loadSample()}>Use sample data</button>}
          </div>
        )}

        <input ref={fileInput} id="csv-upload" className="visually-hidden" type="file" accept=".csv,text/csv" onChange={handleFileChange} />

        {error && <div className="validation-error" role="alert"><b>Couldn’t use this file</b><span>{error}</span></div>}

        {dataset && status === "ready" && (
          <details className="disclosure">
            <summary>Preview validated data <span>+</span></summary>
            <div className="dataset-details">
              <div className="schema-chips">
                {dataset.headers.map((header, index) => <span key={header}>{header}<i>{dataset.types[index]}</i></span>)}
              </div>
              <div className="preview-table-wrap">
                <table className="preview-table">
                  <thead><tr>{dataset.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
                  <tbody>{dataset.preview.map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, columnIndex) => <td key={`${rowIndex}-${columnIndex}`}>{value || "No value"}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          </details>
        )}

        {dataset && status === "ready" ? (
          <div className="question-section">
            <div className="question-title"><span className="step-number">2</span><label htmlFor="analysis-question">Ask a question</label></div>
            <textarea id="analysis-question" value={question} onChange={(event) => { setQuestion(event.target.value); resetGeneration(); }} maxLength={500} placeholder="What would you like to learn from this data?" />
            <div className="question-meta"><span>{question.length}/500</span><span>Plain English is fine</span></div>
            <div className="suggestions" aria-label="Suggested questions">
              {SUGGESTIONS.map((suggestion) => <button type="button" key={suggestion} onClick={() => { setQuestion(suggestion); resetGeneration(); }}>{suggestion}</button>)}
            </div>
            <button className="run-button" type="button" disabled={!canRun} onClick={() => void generatePython()}>
              <span>{generationStatus === "generating" ? "Preparing Python..." : "Generate Python"}</span><small>{canRun ? "AI Gateway" : generationStatus === "generating" ? "Please wait" : "Enter a question"}</small>
            </button>
          </div>
        ) : (
          <div className="question-locked" aria-disabled="true">
            <span className="step-number">2</span>
            <div><strong>Ask a question</strong><p>Available after your CSV passes validation.</p></div>
          </div>
        )}
      </aside>

      <section className="result-card" aria-live="polite">
        <div className="result-topline">
          <div><p>{executionStatus === "completed" ? "Results" : "Analysis workspace"}</p><h2>{executionStatus === "completed" ? "Analysis complete" : executionStatus === "executing" ? "Running in an isolated Sandbox" : generationStatus === "generated" ? "Python ready for review" : generationStatus === "generating" ? "Preparing the analysis" : generationStatus === "failed" ? "Could not prepare the analysis" : status === "ready" ? "Ready to generate" : "Start with a CSV"}</h2></div>
          <span className={generationStatus === "generated" ? "next-step-label" : "waiting-label"}>{executionStatus === "completed" ? "Executed" : executionStatus === "executing" ? "Running" : generationStatus === "generated" ? "Review first" : generationStatus === "generating" ? "AI Gateway" : status === "ready" ? "Ready" : "Not started"}</span>
        </div>

        {generationStatus === "generated" && generatedPlan ? (
          <div className="generated-program">
            <div className="policy-banner"><span>✓</span><div><strong>Static checks passed</strong><p>The program declares only allowed modules and reads the approved CSV path. These checks catch mistakes; the Sandbox is what contains the code.</p></div></div>
            <details className="plan-summary">
              <summary><span>Review analysis plan</span><small>{planSteps(generatedPlan.analysisPlan).length} steps</small></summary>
              <ol className="plan-steps">
                {planSteps(generatedPlan.analysisPlan).map((step, index) => <li key={`${index}-${step}`}><b>{index + 1}</b><p>{step}</p></li>)}
              </ol>
            </details>
            <details className="code-review">
              <summary><span>Review generated Python</span><small>{generatedPlan.code.split("\n").length} lines</small></summary>
              <pre><code>{generatedPlan.code}</code></pre>
            </details>
            <div className="review-data">
              <div className="required-columns">
                <span>Columns used</span>
                <div>{generatedPlan.requiredColumns.length ? generatedPlan.requiredColumns.map((column) => <code key={column}>{column}</code>) : <p>None declared</p>}</div>
              </div>
              <details className="assumption-review">
                <summary><span>Review assumptions</span><small>{generatedPlan.assumptions.length}</small></summary>
                {generatedPlan.assumptions.length ? <ul>{generatedPlan.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul> : <p>No assumptions declared.</p>}
              </details>
            </div>
            <div className="sandbox-explainer">
              <div className="sandbox-explainer-heading">
                <span aria-hidden="true">›_</span>
                <div>
                  <strong>What happens when you run this</strong>
                  <p>Your CSV and the reviewed Python program are copied into a temporary Vercel Sandbox. The program runs there, separate from the application, and the Sandbox is stopped after the result is returned.</p>
                </div>
              </div>
              <div className="sandbox-flow" aria-label="Sandbox execution flow">
                <span>Reviewed program + CSV</span><i aria-hidden="true">→</i><span>Temporary Sandbox</span><i aria-hidden="true">→</i><span>Checked result</span>
              </div>
              <ul className="sandbox-controls" aria-label="Sandbox controls">
                <li>Isolated runtime</li>
                <li>Network blocked</li>
                <li>20-second limit</li>
                <li>Automatic cleanup</li>
              </ul>
            </div>
            <button className="execute-button" type="button" disabled={executionStatus === "executing"} onClick={() => void executePython()}>
              <span>{executionStatus === "executing" ? "Running in Sandbox..." : executionStatus === "completed" ? "Run again" : "Run in isolated Vercel Sandbox"}</span>
              <small>Network blocked · 20-second limit</small>
            </button>

            {executionStatus === "failed" && (
              <div className="execution-error" role="alert"><b>Execution didn’t complete</b><span>{executionError}</span></div>
            )}

            {executionStatus === "completed" && execution && (
              <div className="live-result">
                <div className="live-finding"><span>Result</span><h3>{execution.result.summary}</h3></div>
                {execution.result.metrics.length > 0 && (
                  <>
                    <div className="metric-grid">
                      {execution.result.metrics.slice(0, 6).map((metric) => <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></article>)}
                    </div>
                    {execution.result.metrics.length > 6 && (
                      <details className="extra-metrics">
                        <summary>View {execution.result.metrics.length - 6} additional metrics <span>+</span></summary>
                        <div className="metric-grid">
                          {execution.result.metrics.slice(6).map((metric) => <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></article>)}
                        </div>
                      </details>
                    )}
                  </>
                )}
                <div className="live-chart-header">
                  <div><span>Chart</span><h3>{execution.result.chart.title}</h3></div>
                  <div>{execution.result.chart.series.map((series, index) => <span key={series.name}><i className={`series-${index % 4}`} />{series.name}</span>)}</div>
                </div>
                <div className="live-bar-chart" style={{ gridTemplateColumns: `repeat(${execution.result.chart.labels.length}, minmax(34px, 1fr))` }}>
                  {execution.result.chart.labels.map((label, labelIndex) => {
                    const maximum = Math.max(1, ...execution.result.chart.series.flatMap((series) => series.data.map((value) => Math.abs(value))));
                    return <div className="live-category" key={`${label}-${labelIndex}`}>
                      <div className="live-bars">{execution.result.chart.series.map((series, seriesIndex) => <i key={series.name} className={`series-${seriesIndex % 4}`} title={`${series.name}: ${series.data[labelIndex]}`} style={{ height: `${Math.max(3, Math.abs(series.data[labelIndex]) / maximum * 100)}%` }} />)}</div>
                      <span title={label}>{label}</span>
                    </div>;
                  })}
                </div>
                {execution.result.notes.length > 0 && <ul className="result-notes">{execution.result.notes.map((note) => <li key={note}>{note}</li>)}</ul>}
                <details className="execution-receipt">
                  <summary><span>View execution details</span><i>{execution.receipt.durationMs} ms</i></summary>
                  <div className="receipt-grid">
                    <span><b>Runtime</b>{execution.receipt.runtime}</span>
                    <span><b>Network</b>{execution.receipt.network}</span>
                    <span><b>Program status</b>{execution.receipt.exitCode === 0 ? "Completed" : `Exit code ${execution.receipt.exitCode}`}</span>
                    <span><b>Cleanup</b>{execution.receipt.stopped ? "Sandbox stopped" : "Unconfirmed"}</span>
                  </div>
                  <ol>{execution.lifecycle.map((event, index) => <li key={event}><b>{String(index + 1).padStart(2, "0")}</b>{event}</li>)}</ol>
                </details>
              </div>
            )}
          </div>
        ) : generationStatus === "generating" ? (
          <div className="generation-loading">
            <div className="loading-command">
              <span aria-hidden="true">›_</span>
              <div><small>AI Gateway</small><h3>Preparing Python for review</h3></div>
            </div>
            <div className="loading-progress" aria-hidden="true"><i /></div>
            <ol aria-label="Analysis preparation steps">
              <li><b>01</b><span><strong>Verify request</strong><small>BotID and input limits</small></span></li>
              <li><b>02</b><span><strong>Generate program</strong><small>Plan and Python through AI Gateway</small></span></li>
              <li><b>03</b><span><strong>Check before review</strong><small>Policy validation and signature</small></span></li>
            </ol>
            <p>Only the column names and three sample rows are used here. The full CSV is sent only after you approve execution.</p>
          </div>
        ) : generationStatus === "failed" ? (
          <div className="generation-failure"><span aria-hidden="true">!</span><h3>Python was not generated</h3><p>{generationError}</p><button type="button" onClick={() => void generatePython()}>Try again</button></div>
        ) : (
          <div className="empty-result">
            <span className="empty-result-icon" aria-hidden="true">{status === "ready" ? "→" : "CSV"}</span>
            <h3>{status === "validating" ? "Checking your data" : status === "ready" ? "Ready to generate" : "Choose a CSV to begin"}</h3>
            <p>{status === "ready" ? "Ask a question and generate a Python program for review. Nothing runs until you approve it." : "Upload your own data or use the sample file. The CSV is validated before the next step becomes available."}</p>
            <div className="empty-outcomes" aria-label="What the analysis provides">
              <article><b>1</b><span><strong>Review the program</strong><small>See the Python before it runs.</small></span></article>
              <article><b>2</b><span><strong>Run it in isolation</strong><small>Network access is blocked.</small></span></article>
              <article><b>3</b><span><strong>Verify the result</strong><small>Get the answer and run details.</small></span></article>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
