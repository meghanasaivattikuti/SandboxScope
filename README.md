# SandboxScope

SandboxScope is a CSV analysis demo that makes generated code visible before it runs. A user uploads data, asks a question, reviews the generated Python, and chooses when to execute it inside Vercel Sandbox.

The project demonstrates a clear pattern for model-generated code:

1. Keep generation transparent.
2. Validate the code before execution.
3. Run it in an isolated, temporary environment.
4. Show the result and the controls applied during the run.

## What the project demonstrates

SandboxScope is not primarily a CSV dashboard. CSV analysis provides a simple way to show the complete lifecycle of generated code.

The application demonstrates:

- A review step between code generation and execution
- Server-side validation that cannot be bypassed by the browser
- Signed programs, so only server-generated code can be executed
- Isolated Python execution with outbound network access blocked
- Short execution limits and bounded output
- Cleanup after successful and failed runs
- A visible execution record showing runtime, network policy, program status, duration, and cleanup status

## User flow

1. **Choose data**
   - Upload a CSV or use the included sample file.
   - The browser validates file size, row count, column count, headers, and row shape.

2. **Ask a question**
   - Enter a plain-language question about the data.
   - Only the column names, inferred types, three sample rows, and the question are sent for generation.

3. **Review the program**
   - The AI SDK returns a structured plan, required columns, assumptions, and Python code.
   - The server checks imports, file access, code size, blocked operations, and the required JSON output pattern.

4. **Run in Vercel Sandbox**
   - The user explicitly starts execution.
   - The server verifies the program's signature, so code edited in the browser is rejected before a Sandbox is created.
   - The server validates the CSV and Python again.
   - A temporary Python 3.13 Sandbox is created with outbound network access denied.

5. **Inspect the result**
   - The result is validated before it is displayed.
   - The Sandbox is stopped in a `finally` block.
   - The UI displays the answer, metrics, chart, notes, and execution details.

## Architecture

```text
Browser
  |
  | CSV schema, three sample rows, and question
  v
POST /api/generate
  |
  | AI SDK structured output through AI Gateway
  v
Signed plan and Python
  |
  | User reviews and approves execution
  v
POST /api/execute
  |
  | Server verifies the signature, then validates the full CSV and Python again
  v
Vercel Sandbox
  | Python 3.13
  | Outbound network denied
  | Temporary filesystem
  | 20-second command limit
  v
Validated JSON result
  |
  | Sandbox stopped and temporary files removed
  v
Result and execution details shown in the browser
```

## Vercel products used

| Product | Responsibility |
| --- | --- |
| Vercel Sandbox | Runs reviewed Python in a fresh, isolated environment. |
| Vercel OIDC | Provides short-lived access to Sandbox without storing a permanent Sandbox credential. |
| AI SDK | Produces a structured analysis plan and Python program. |
| AI Gateway | Routes the model request through one managed endpoint. |

## Execution controls

The static code check improves output quality, but it is not the primary security boundary. Runtime isolation is handled by Vercel Sandbox.

Every generated program is signed with HMAC-SHA256 before it reaches the browser. `/api/execute` verifies that signature before it creates a Sandbox, so the endpoint runs only programs this server generated, and only within 30 minutes of generation.

| Control | Current setting |
| --- | --- |
| Runtime | Python 3.13 |
| Persistence | Disabled |
| Outbound network | Denied |
| Sandbox lifetime | 30 seconds |
| Command limit | 20 seconds |
| Input path | `/vercel/sandbox/input.csv` |
| Program path | `/vercel/sandbox/analysis.py` |
| Generated code limit | 12,000 characters |
| Standard output limit | 100 KB |
| Standard error limit | 50 KB |
| Cleanup | `sandbox.stop()` in a `finally` block |
| Program signature | HMAC-SHA256, 30-minute validity |

No application secrets are passed into the execution environment.

## CSV limits

| Limit | Value |
| --- | --- |
| File size | 2 MB |
| Data rows | 10,000 |
| Columns | 50 |

Validation rejects:

- Empty files
- Missing or duplicate headers
- More than 50 columns
- More than 10,000 data rows
- Rows with inconsistent column counts
- Unclosed quoted fields
- Files larger than 2 MB

## Data handling

The generation and execution steps use different data boundaries.

### During generation

The model receives:

- File name
- Row and column counts
- Column names
- Inferred column types
- Three sample rows
- The user question

The full CSV is not sent during generation.

### During execution

The full CSV and reviewed Python program are sent to the server, validated again, and written into the temporary Sandbox. The Sandbox has no outbound network access and is stopped after the run.

## Technology

- Next.js 16
- React 19
- TypeScript
- Vercel AI SDK
- Vercel AI Gateway
- Vercel Sandbox SDK
- Zod
- Tailwind CSS

## Local development

### Requirements

- Node.js 20 or newer
- npm
- A Vercel account and linked Vercel project
- Vercel CLI access through `npx vercel`

### Setup

Install dependencies:

```bash
npm install
```

Link the local repository to a Vercel project:

```bash
npx vercel link
```

Pull the development environment, including the OIDC token used by the Sandbox SDK:

```bash
npx vercel env pull
```

Set a signing secret used to sign generated programs. Add it to `.env.local` locally and to the Vercel project environment before deploying:

```bash
echo "CODE_SIGNING_SECRET=\"$(openssl rand -hex 32)\"" >> .env.local
```

`/api/generate` fails closed if this variable is missing or shorter than 32 characters.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Do not commit `.env.local`. Environment files and the `.vercel` directory are ignored by Git.

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server. |
| `npm run build` | Create a production build. |
| `npm run start` | Start the production server after a build. |
| `npm run lint` | Run ESLint. |
| `npx tsc --noEmit` | Check TypeScript without creating output files. |

## Project structure

```text
src/
  app/
    api/
      generate/route.ts    Generate and validate the Python program
      execute/route.ts     Create, run, and stop the Sandbox
    components/
      analysis-workspace.tsx
    page.tsx
  lib/
    csv.ts                 Shared CSV parsing and validation
    python-policy.ts       Generated Python checks
    code-signature.ts      Signs and verifies generated programs
public/
  retail-performance.csv  Sample dataset
```

## Scope

SandboxScope is a portfolio prototype, not a claim of production readiness. The project reports controls that are configured and observed during execution. It does not label generated code as safe simply because it passed the static code check.
