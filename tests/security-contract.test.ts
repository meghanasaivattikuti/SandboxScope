import { afterEach, describe, expect, it, vi } from "vitest";
import { analysisResultSchema } from "@/lib/analysis-result";
import {
  SignatureError,
  signGeneratedCode,
  verifyGeneratedCode,
} from "@/lib/code-signature";
import { validateGeneratedPython } from "@/lib/python-policy";
import { enforceBotProtection } from "@/lib/abuse-protection";
import {
  collectBoundedCommandOutput,
  CommandOutputLimitError,
} from "@/lib/bounded-command-output";

const VALID_CODE = `import csv, json
with open("/vercel/sandbox/input.csv", newline="", encoding="utf-8-sig") as source:
    rows = list(csv.DictReader(source))
print(json.dumps({"summary": "Done", "metrics": [], "chart": {"type": "bar", "title": "Rows", "labels": ["Rows"], "series": [{"name": "Count", "data": [len(rows)]}]}, "notes": []}))`;

describe("execution security contract", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("accepts an unchanged program signed by the server", () => {
    vi.stubEnv("CODE_SIGNING_SECRET", "test-secret-that-is-longer-than-thirty-two-characters");
    const signature = signGeneratedCode(VALID_CODE);

    expect(() => verifyGeneratedCode(VALID_CODE, signature)).not.toThrow();
  });

  it("rejects a program changed after it was signed", () => {
    vi.stubEnv("CODE_SIGNING_SECRET", "test-secret-that-is-longer-than-thirty-two-characters");
    const signature = signGeneratedCode(VALID_CODE);

    expect(() => verifyGeneratedCode(`${VALID_CODE}\n# changed`, signature)).toThrow(SignatureError);
  });

  it("rejects a valid signature after its 30-minute lifetime", () => {
    vi.stubEnv("CODE_SIGNING_SECRET", "test-secret-that-is-longer-than-thirty-two-characters");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const signature = signGeneratedCode(VALID_CODE);
    vi.advanceTimersByTime(30 * 60 * 1_000 + 1);

    expect(() => verifyGeneratedCode(VALID_CODE, signature)).toThrow(/expired/i);
  });

  it("rejects a disallowed import hidden in a compound statement", () => {
    const bypassAttempt = VALID_CODE.replace("import csv, json", "import csv, json\nif True: import os");

    expect(() => validateGeneratedPython(bypassAttempt)).toThrow(/outside the allowlist/i);
  });

  it("rejects result series that do not match the chart labels", () => {
    const result = analysisResultSchema.safeParse({
      summary: "Example",
      metrics: [],
      chart: {
        type: "bar",
        title: "Example chart",
        labels: ["Q1", "Q2"],
        series: [{ name: "Revenue", data: [100] }],
      },
      notes: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["chart", "series", 0, "data"]);
    }
  });

  it("rejects a request classified as automated before protected work begins", async () => {
    const response = await enforceBotProtection(async () => ({ isBot: true }));

    expect(response?.status).toBe(403);
  });

  it("collects command output while it remains within the byte limits", async () => {
    const command = fakeCommand([
      { stream: "stdout", data: "result" },
      { stream: "stderr", data: "warning" },
    ]);

    const output = await collectBoundedCommandOutput(command, {
      stdoutBytes: 10,
      stderrBytes: 10,
    });

    expect(output).toMatchObject({ stdout: "result", stderr: "warning", stdoutBytes: 6, stderrBytes: 7 });
    expect(command.kill).not.toHaveBeenCalled();
  });

  it("terminates a command as soon as streamed output exceeds its limit", async () => {
    const command = fakeCommand([
      { stream: "stdout", data: "1234" },
      { stream: "stdout", data: "5678" },
    ]);

    await expect(collectBoundedCommandOutput(command, {
      stdoutBytes: 6,
      stderrBytes: 10,
    })).rejects.toBeInstanceOf(CommandOutputLimitError);
    expect(command.kill).toHaveBeenCalledOnce();
    expect(command.wait).not.toHaveBeenCalled();
  });
});

function fakeCommand(entries: Array<{ stream: "stdout" | "stderr"; data: string }>) {
  const close = vi.fn();
  const logs = () => {
    const generator = (async function* () {
      for (const entry of entries) yield entry;
    })();
    return Object.assign(generator, { close });
  };

  return {
    logs,
    close,
    kill: vi.fn(async () => undefined),
    wait: vi.fn(async () => ({ exitCode: 0, durationMs: 12 })),
  };
}
