/**
 * Planning pre-pass: turns the model's free-text plan into structured steps
 * the UI can render and later parts (TaskGraph, checkpoint/resume) can consume.
 * Pure module — no vscode, no network — so it stays fully unit-testable.
 */

export interface PlanStep {
  /** 1-based step number as the model wrote it. */
  index: number;
  text: string;
}

export interface Plan {
  steps: PlanStep[];
}

/** Matches a numbered list line: "1. text", "2) text", with optional leading spaces. */
const NUMBERED_LINE = /^\s*(\d+)[.)]\s+(.*\S)\s*$/;

/** Parse a model's text response into a structured plan of numbered steps. */
export function parsePlan(text: string): Plan {
  const steps: PlanStep[] = [];
  for (const line of text.split("\n")) {
    const match = NUMBERED_LINE.exec(line);
    if (match) {
      steps.push({ index: Number(match[1]), text: match[2] });
    }
  }
  return { steps };
}
