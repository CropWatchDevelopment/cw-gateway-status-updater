import type { LogLevel } from "../config/AppConfig";

export interface Logger {
  debug(message: string, details?: unknown): void;
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export class ConsoleLogger implements Logger {
  public constructor(private readonly minimumLevel: LogLevel) {}

  public debug(message: string, details?: unknown): void {
    this.write("debug", message, details);
  }

  public info(message: string, details?: unknown): void {
    this.write("info", message, details);
  }

  public warn(message: string, details?: unknown): void {
    this.write("warn", message, details);
  }

  public error(message: string, details?: unknown): void {
    this.write("error", message, details);
  }

  private write(level: LogLevel, message: string, details?: unknown): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.minimumLevel]) {
      return;
    }

    const line = details === undefined ? message : `${message} ${safeJson(details)}`;
    const output = `[${new Date().toISOString()}] ${level.toUpperCase()} ${line}`;

    if (level === "error") {
      console.error(output);
      return;
    }

    if (level === "warn") {
      console.warn(output);
      return;
    }

    console.log(output);
  }
}

export class NullLogger implements Logger {
  public debug(): void {}
  public info(): void {}
  public warn(): void {}
  public error(): void {}
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
