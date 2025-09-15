import { ErrorReporter } from '../error-reporter';
import { Range } from '../index';

describe('ErrorReporter range normalization', () => {
  it('provides a fallback range when none is supplied', () => {
    const reporter = new ErrorReporter();
    reporter.addError('fallback', undefined as unknown as Range, 'FTL2001');

    const diagnostics = reporter.getDiagnostics();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].range.start.line).toBe(1);
    expect(diagnostics[0].range.start.character).toBe(1);
    expect(diagnostics[0].range.start.offset).toBe(0);
    expect(diagnostics[0].range.end.line).toBe(1);
    expect(diagnostics[0].range.end.character).toBe(1);
    expect(diagnostics[0].range.end.offset).toBe(0);
  });

  it('normalizes invalid range values to safe defaults', () => {
    const reporter = new ErrorReporter();
    const invalidRange = {
      start: { line: 0, character: -5, offset: -10 },
      end: { line: Number.NaN, character: Number.POSITIVE_INFINITY, offset: -1 }
    } as unknown as Range;

    reporter.addWarning('normalize', invalidRange, 'FTL2001');

    const [diagnostic] = reporter.getDiagnostics();
    expect(diagnostic.range.start.line).toBe(1);
    expect(diagnostic.range.start.character).toBe(1);
    expect(diagnostic.range.start.offset).toBe(0);
    expect(diagnostic.range.end.line).toBeGreaterThanOrEqual(diagnostic.range.start.line);
    expect(diagnostic.range.end.character).toBeGreaterThanOrEqual(1);
    expect(diagnostic.range.end.offset).toBeGreaterThanOrEqual(diagnostic.range.start.offset);
  });
});
