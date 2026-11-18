import { Interpreter } from './interpreter';
import { parse } from './parser';
import {
  ArrayVar,
  CompileError,
  DEFAULT_MAX_MILLIS,
  DEFAULT_MAX_STEPS,
  RunOptions,
  Step,
  TraceResult,
} from './types';

/** Marks which scalars / array cells changed compared with the previous step (same call frame). */
function markChanges(steps: Step[]): void {
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const cur = steps[i];
    if (prev.depth !== cur.depth || prev.func !== cur.func) continue;
    const before = new Map(prev.variables.map((v) => [v.name, v]));
    for (const v of cur.variables) {
      const p = before.get(v.name);
      if (!p || p.kind !== v.kind) continue;
      if (v.kind === 'scalar' && p.kind === 'scalar') {
        v.changed = v.value !== p.value;
      } else if (v.kind === 'array' && p.kind === 'array') {
        let any = v.length !== (p as ArrayVar).length;
        v.rows.forEach((row, r) => {
          const prow = (p as ArrayVar).rows[r];
          row.forEach((cell, c) => {
            const changed = !prow || !prow[c] || prow[c].s !== cell.s;
            if (changed) { cell.changed = true; any = true; }
          });
        });
        v.changed = any;
      }
    }
  }
}

/**
 * Parse and execute a C++ program, returning the full step-by-step trace.
 * Never throws: compile errors, runtime errors and limit hits are reported in the result.
 */
export function generateTrace(source: string, options: Partial<RunOptions> = {}): TraceResult {
  const opts: RunOptions = {
    stdin: options.stdin ?? '',
    maxSteps: options.maxSteps ?? DEFAULT_MAX_STEPS,
    maxMillis: options.maxMillis ?? DEFAULT_MAX_MILLIS,
  };
  const t0 = Date.now();
  try {
    const program = parse(source);
    const result = new Interpreter(program, opts).run();
    markChanges(result.steps);
    return result;
  } catch (e) {
    if (e instanceof CompileError) {
      return { steps: [], status: 'error', error: { kind: 'compile', message: e.message, line: e.line }, elapsedMs: Date.now() - t0 };
    }
    return {
      steps: [],
      status: 'error',
      error: { kind: 'runtime', message: `internal error: ${(e as Error)?.message ?? String(e)}` },
      elapsedMs: Date.now() - t0,
    };
  }
}
