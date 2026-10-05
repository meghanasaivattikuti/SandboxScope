# SandboxScope

SandboxScope turns a question about a CSV into reviewable Python, runs it in a short-lived Vercel Sandbox, and returns both the analysis and an execution receipt.

Generated-code demos often hide the most important step: what actually ran. I built SandboxScope to make that step visible. The user reviews the plan and Python before approving execution, and the result shows the runtime controls observed during the run.

## How it works

1. Upload a CSV or load the included retail dataset.
2. Ask a question in plain English.
3. Review the proposed analysis, assumptions, and generated Python.
4. Approve execution in an isolated Python 3.13 Sandbox.
5. Inspect the answer, visualization, and execution receipt.

```text
Browser
  |
  | Question, schema, and three sample rows
  v
Vercel WAF
  | 10 requests per minute per IP
  v
POST /api/generate
  | BotID verification
  | AI SDK structured output through AI Gateway
  | Static policy check and HMAC signature
  v
Reviewable plan and Python
  |
  | User approves execution
  v
POST /api/execute
  | BotID and signature verification
  | Full CSV and code validation
  v
Vercel Sandbox
  | Python 3.13
  | Outbound network denied
  | 20-second command limit
  | Streaming output limits
  v
Validated result and execution receipt
```

## Vercel stack

| Product | Role |
| --- | --- |
| Vercel Sandbox | Runs Python in a fresh, non-persistent environment. |
| Vercel OIDC | Gives the Function short-lived access to Sandbox without a stored Sandbox credential. |
| AI SDK | Produces a typed analysis plan and Python program. |
| AI Gateway | Routes the model request through a managed endpoint. |
| BotID | Checks both costly routes before model or Sandbox work begins. |
| Vercel WAF | Limits repeated requests before they reach application code. |

## Execution controls

The static policy check is a preflight control, not the isolation boundary. Vercel Sandbox provides the runtime boundary.

| Control | Setting |
| --- | --- |
| Runtime | Python 3.13 |
| Persistence | Disabled |
| Outbound network | Denied |
| Sandbox lifetime | 30 seconds |
| Command limit | 20 seconds |
| CSV limit | 2 MB, 10,000 rows, 50 columns |
| Generated code limit | 12,000 characters |
| Standard output | Command terminated above 100 KB |
| Standard error | Command terminated above 50 KB |
| Program approval | HMAC-SHA256 signature valid for 30 minutes |
| Automated abuse | BotID Basic on generation and execution |
| Request rate | Vercel WAF, 10 requests per minute per IP |
| Cleanup | `sandbox.stop()` requested in a `finally` block and reported in the receipt |

The execution route verifies the signature before creating a Sandbox. Code edited after generation is rejected before infrastructure is allocated. No application secrets are passed into the execution environment.

## Data boundaries

Generation receives only:

- File name
- Row and column counts
- Column names and inferred types
- Three sample rows
- The user's question

The full CSV is sent only after the user approves execution. The server validates it again, writes it to the temporary Sandbox, and runs the reviewed program with outbound networking disabled.

## Validation and tests

The server validates the request, generated Python, CSV structure, and returned JSON independently of the browser. The focused test suite covers:

- Valid program signatures
- Code tampering
- Signature expiration
- Disallowed imports hidden in compound statements
- Invalid visualization output
- BotID rejection
- Output collection within byte limits
- Command termination when an output limit is exceeded

Run the checks with:

```bash
npm test
npm run lint
npx tsc --noEmit
```

## Local development

Requirements:

- Node.js 20 or newer
- npm
- A Vercel account and linked project

Install dependencies and link the project:

```bash
npm install
npx vercel link
npx vercel env pull
```

Create a signing secret locally, then add the same variable to the Vercel project environment:

```bash
echo "CODE_SIGNING_SECRET=\"$(openssl rand -hex 32)\"" >> .env.local
```

`/api/generate` fails closed when `CODE_SIGNING_SECRET` is missing or shorter than 32 characters. BotID permits local development requests by default and verifies browser requests after deployment.

Start the application:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```text
src/
  app/
    api/
      generate/route.ts
      execute/route.ts
    components/
      analysis-workspace.tsx
    page.tsx
  lib/
    abuse-protection.ts
    analysis-result.ts
    bounded-command-output.ts
    code-signature.ts
    csv.ts
    python-policy.ts
  instrumentation-client.ts
tests/
  security-contract.test.ts
public/
  retail-performance.csv
```
