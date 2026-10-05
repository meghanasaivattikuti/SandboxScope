type CommandLog = { stream: "stdout" | "stderr"; data: string };

type StreamedCommand = {
  logs: () => AsyncGenerator<CommandLog, void, void> & { close: () => void };
  kill: () => Promise<void>;
  wait: () => Promise<{ exitCode: number; durationMs?: number }>;
};

export class CommandOutputLimitError extends Error {
  constructor(readonly stream: "stdout" | "stderr", readonly maximumBytes: number) {
    super(`The program exceeded the ${stream} limit of ${maximumBytes} bytes.`);
  }
}

export async function collectBoundedCommandOutput(
  command: StreamedCommand,
  limits: { stdoutBytes: number; stderrBytes: number },
) {
  let stdout = "";
  let stderr = "";
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let limitError: CommandOutputLimitError | undefined;
  const logs = command.logs();

  try {
    for await (const log of logs) {
      const bytes = Buffer.byteLength(log.data, "utf8");

      if (log.stream === "stdout") {
        stdoutBytes += bytes;
        if (stdoutBytes > limits.stdoutBytes) {
          limitError = new CommandOutputLimitError("stdout", limits.stdoutBytes);
          break;
        }
        stdout += log.data;
      } else {
        stderrBytes += bytes;
        if (stderrBytes > limits.stderrBytes) {
          limitError = new CommandOutputLimitError("stderr", limits.stderrBytes);
          break;
        }
        stderr += log.data;
      }
    }
  } finally {
    logs.close();
  }

  if (limitError) {
    await command.kill().catch(() => undefined);
    throw limitError;
  }

  const finished = await command.wait();
  return {
    stdout,
    stderr,
    stdoutBytes,
    stderrBytes,
    exitCode: finished.exitCode,
    durationMs: finished.durationMs ?? null,
  };
}
