import { Sandbox } from "@vercel/sandbox";
import { z } from "zod";
import { MAX_FILE_BYTES, validateCsv } from "@/lib/csv";
import { validateGeneratedPython } from "@/lib/python-policy";
import { SignatureError, verifyGeneratedCode } from "@/lib/code-signature";

export const runtime = "nodejs";
export const maxDuration = 45;

const MAX_STDOUT_BYTES = 100 * 1024;
const MAX_STDERR_BYTES = 50 * 1024;

const requestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  csv: z.string().min(1).max(MAX_FILE_BYTES),
  code: z.string().min(1).max(12_000),
  signature: z.string().min(1).max(200),
});

const analysisResultSchema = z.object({
  summary: z.string().min(1).max(2_000),
  metrics: z.array(z.object({
    label: z.string().min(1).max(100),
    value: z.union([z.string().max(200), z.number().finite(), z.boolean()])
      .transform((value) => typeof value === "boolean" ? String(value) : value),
  })).max(20),
  chart: z.object({
    type: z.string().min(1).max(30).transform(() => "bar" as const),
    title: z.string().min(1).max(200),
    labels: z.array(z.string().max(100)).min(1).max(30),
    series: z.array(z.object({
      name: z.string().min(1).max(100),
      data: z.array(z.preprocess(
        (value) => typeof value === "string" && value.trim() !== "" ? Number(value) : value,
        z.number().finite(),
      )).min(1).max(30),
    })).min(1).max(6),
  }).superRefine((chart, context) => {
    chart.series.forEach((series, index) => {
      if (series.data.length !== chart.labels.length) {
        context.addIssue({
          code: "custom",
          path: ["series", index, "data"],
          message: "Chart series must match the number of labels.",
        });
      }
    });
  }),
  notes: z.array(z.string().min(1).max(500)).max(12).default([]),
});

class ExecutionError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message);
  }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_FILE_BYTES + 30_000) {
    return Response.json({ error: "Request payload is too large." }, { status: 413 });
  }

  let sandbox: Sandbox | undefined;
  let result: z.infer<typeof analysisResultSchema> | undefined;
  let failure: { message: string; status: number } | undefined;
  let exitCode: number | null = null;
  let commandDurationMs: number | null = null;
  let stdoutBytes = 0;
  let stopped = false;
  const startedAt = Date.now();
  const lifecycle: string[] = [];

  try {
    const input = requestSchema.parse(await request.json());

    // Only programs this server generated may run, so an edited or
    // hand-written payload is rejected before a Sandbox is created.
    verifyGeneratedCode(input.code, input.signature);

    const csvBytes = Buffer.byteLength(input.csv, "utf8");
    try {
      validateCsv(input.csv, input.name, csvBytes, "upload");
      validateGeneratedPython(input.code);
    } catch (validationError) {
      throw new ExecutionError(
        validationError instanceof Error ? validationError.message : "The execution request failed validation.",
        400,
      );
    }
    lifecycle.push("Request and code checked");

    sandbox = await Sandbox.create({
      runtime: "python3.13",
      timeout: 30_000,
      persistent: false,
      networkPolicy: "deny-all",
    });
    lifecycle.push("Isolated Python 3.13 environment started");

    await sandbox.writeFiles([
      { path: "/vercel/sandbox/input.csv", content: input.csv },
      { path: "/vercel/sandbox/analysis.py", content: input.code },
    ]);
    lifecycle.push("CSV and reviewed program added");

    const command = await sandbox.runCommand(
      "python3",
      ["/vercel/sandbox/analysis.py"],
      { timeoutMs: 20_000 },
    );
    exitCode = command.exitCode;
    commandDurationMs = command.durationMs ?? null;
    const [stdout, stderr] = await Promise.all([command.stdout(), command.stderr()]);
    stdoutBytes = Buffer.byteLength(stdout, "utf8");

    if (stdoutBytes > MAX_STDOUT_BYTES || Buffer.byteLength(stderr, "utf8") > MAX_STDERR_BYTES) {
      throw new ExecutionError("The program produced more output than the safety limit allows.");
    }
    if (command.exitCode !== 0) {
      const detail = stderr.trim().slice(0, 500);
      throw new ExecutionError(detail ? `Python exited with an error: ${detail}` : "Python exited with an error.");
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(stdout.trim());
    } catch {
      throw new ExecutionError("The program did not return the required JSON result.");
    }
    const parsedResult = analysisResultSchema.safeParse(decoded);
    if (!parsedResult.success) {
      console.warn("Sandbox result contract mismatch", parsedResult.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
      })));
      const firstPath = parsedResult.error.issues[0]?.path.join(".") || "result";
      throw new ExecutionError(`The program ran, but ${firstPath} could not be displayed. Generate a new program and try again.`);
    }
    result = parsedResult.data;
    lifecycle.push("Program finished and result checked");
  } catch (error) {
    if (error instanceof z.ZodError) {
      failure = { message: "The CSV or generated program did not pass validation.", status: 400 };
    } else if (error instanceof SignatureError) {
      failure = { message: error.message, status: 403 };
    } else if (error instanceof ExecutionError) {
      failure = { message: error.message, status: error.status };
    } else {
      console.error("Sandbox execution failed", error instanceof Error ? error.name : "UnknownError");
      failure = { message: "Sandbox execution failed. Please try again.", status: 502 };
    }
  } finally {
    if (sandbox) {
      try {
        await sandbox.stop();
        stopped = true;
        lifecycle.push("Sandbox stopped and temporary files removed");
      } catch (stopError) {
        console.error("Sandbox cleanup failed", stopError instanceof Error ? stopError.name : "UnknownError");
        lifecycle.push("Sandbox cleanup could not be confirmed");
      }
    }
  }

  const receipt = {
    runtime: "Python 3.13",
    network: "Outbound denied",
    persistent: false,
    timeoutMs: 30_000,
    durationMs: Date.now() - startedAt,
    commandDurationMs,
    exitCode,
    stdoutBytes,
    stopped,
  };

  if (failure) return Response.json({ error: failure.message, lifecycle, receipt }, { status: failure.status });
  return Response.json({ result, lifecycle, receipt });
}
