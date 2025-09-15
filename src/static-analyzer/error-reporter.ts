import { Diagnostic, Range, Position } from './index';

export interface ErrorContext {
  file?: string;
  line: number;
  column: number;
  source?: string;
  suggestion?: string;
  relatedInformation?: DiagnosticRelatedInformation[];
}

export interface DiagnosticRelatedInformation {
  location: Location;
  message: string;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface ErrorCode {
  code: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  category: ErrorCategory;
}

export enum ErrorCategory {
  SYNTAX = 'syntax',
  SEMANTIC = 'semantic',
  TYPE = 'type',
  IMPORT = 'import',
  REFERENCE = 'reference',
  DEPRECATED = 'deprecated',
  STYLE = 'style',
  PERFORMANCE = 'performance'
}

export class ErrorReporter {
  private diagnostics: Diagnostic[] = [];
  private errorCodes: Map<string, ErrorCode> = new Map();
  private suppressedCodes: Set<string> = new Set();

  constructor() {
    this.initializeErrorCodes();
  }

  private initializeErrorCodes(): void {
    const codes: ErrorCode[] = [
      // Syntax Errors
      { code: 'FTL1001', description: 'Unexpected token', severity: 'error', category: ErrorCategory.SYNTAX },
      { code: 'FTL1002', description: 'Missing closing tag', severity: 'error', category: ErrorCategory.SYNTAX },
      { code: 'FTL1003', description: 'Invalid directive name', severity: 'error', category: ErrorCategory.SYNTAX },
      { code: 'FTL1004', description: 'Malformed expression', severity: 'error', category: ErrorCategory.SYNTAX },
      { code: 'FTL1005', description: 'Unclosed string literal', severity: 'error', category: ErrorCategory.SYNTAX },
      { code: 'FTL1006', description: 'Invalid character in identifier', severity: 'error', category: ErrorCategory.SYNTAX },

      // Semantic Errors
      { code: 'FTL2001', description: 'Undefined variable', severity: 'error', category: ErrorCategory.SEMANTIC },
      { code: 'FTL2002', description: 'Undefined macro', severity: 'error', category: ErrorCategory.SEMANTIC },
      { code: 'FTL2003', description: 'Undefined function', severity: 'error', category: ErrorCategory.SEMANTIC },
      { code: 'FTL2004', description: 'Variable redefinition', severity: 'warning', category: ErrorCategory.SEMANTIC },
      { code: 'FTL2005', description: 'Macro redefinition', severity: 'warning', category: ErrorCategory.SEMANTIC },
      { code: 'FTL2006', description: 'Function redefinition', severity: 'warning', category: ErrorCategory.SEMANTIC },
      { code: 'FTL2007', description: 'Unreachable code', severity: 'warning', category: ErrorCategory.SEMANTIC },

      // Type Errors
      { code: 'FTL3001', description: 'Type mismatch', severity: 'error', category: ErrorCategory.TYPE },
      { code: 'FTL3002', description: 'Invalid operation on type', severity: 'error', category: ErrorCategory.TYPE },
      { code: 'FTL3003', description: 'Cannot convert type', severity: 'error', category: ErrorCategory.TYPE },
      { code: 'FTL3004', description: 'Null pointer access', severity: 'warning', category: ErrorCategory.TYPE },

      // Import/Include Errors
      { code: 'FTL4001', description: 'File not found', severity: 'error', category: ErrorCategory.IMPORT },
      { code: 'FTL4002', description: 'Circular dependency', severity: 'error', category: ErrorCategory.IMPORT },
      { code: 'FTL4003', description: 'Invalid import path', severity: 'error', category: ErrorCategory.IMPORT },
      { code: 'FTL4004', description: 'Import alias conflict', severity: 'warning', category: ErrorCategory.IMPORT },

      // Reference Errors
      { code: 'FTL5001', description: 'Unused variable', severity: 'warning', category: ErrorCategory.REFERENCE },
      { code: 'FTL5002', description: 'Unused macro', severity: 'warning', category: ErrorCategory.REFERENCE },
      { code: 'FTL5003', description: 'Unused function', severity: 'warning', category: ErrorCategory.REFERENCE },
      { code: 'FTL5004', description: 'Unused import', severity: 'warning', category: ErrorCategory.REFERENCE },

      // Deprecated Features
      { code: 'FTL6001', description: 'Deprecated syntax', severity: 'warning', category: ErrorCategory.DEPRECATED },
      { code: 'FTL6002', description: 'Deprecated directive', severity: 'warning', category: ErrorCategory.DEPRECATED },
      { code: 'FTL6003', description: 'Deprecated built-in', severity: 'warning', category: ErrorCategory.DEPRECATED },

      // Style Issues
      { code: 'FTL7001', description: 'Inconsistent indentation', severity: 'info', category: ErrorCategory.STYLE },
      { code: 'FTL7002', description: 'Line too long', severity: 'info', category: ErrorCategory.STYLE },
      { code: 'FTL7003', description: 'Trailing whitespace', severity: 'info', category: ErrorCategory.STYLE },
      { code: 'FTL7004', description: 'Missing documentation', severity: 'info', category: ErrorCategory.STYLE },

      // Performance Issues
      { code: 'FTL8001', description: 'Expensive operation in loop', severity: 'warning', category: ErrorCategory.PERFORMANCE },
      { code: 'FTL8002', description: 'Deep nesting detected', severity: 'info', category: ErrorCategory.PERFORMANCE },
      { code: 'FTL8003', description: 'Large template size', severity: 'info', category: ErrorCategory.PERFORMANCE }
    ];

    for (const code of codes) {
      this.errorCodes.set(code.code, code);
    }
  }

  public addError(message: string, range: Range, code?: string, source: string = 'FreeMarker'): void {
    this.addDiagnostic('error', message, range, code, source);
  }

  public addWarning(message: string, range: Range, code?: string, source: string = 'FreeMarker'): void {
    this.addDiagnostic('warning', message, range, code, source);
  }

  public addInfo(message: string, range: Range, code?: string, source: string = 'FreeMarker'): void {
    this.addDiagnostic('info', message, range, code, source);
  }

  public addDiagnostic(
    severity: 'error' | 'warning' | 'info',
    message: string,
    range?: Range,
    code?: string,
    source: string = 'FreeMarker'
  ): void {
    if (code && this.suppressedCodes.has(code)) {
      return; // Skip suppressed diagnostics
    }

    const safeRange = this.normalizeRange(range);

    const diagnostic: Diagnostic = {
      severity,
      message,
      range: safeRange,
      code,
      source
    };

    this.diagnostics.push(diagnostic);
  }

  public addSyntaxError(message: string, position: Position, suggestion?: string): void {
    const range: Range = {
      start: position,
      end: { line: position.line, character: position.character + 1, offset: position.offset + 1 }
    };

    let fullMessage = message;
    if (suggestion) {
      fullMessage += `. ${suggestion}`;
    }

    this.addError(fullMessage, range, 'FTL1001');
  }

  public addUndefinedVariableError(variableName: string, position: Position, suggestions?: string[]): void {
    const range: Range = {
      start: position,
      end: { line: position.line, character: position.character + variableName.length, offset: position.offset + variableName.length }
    };

    let message = `Undefined variable: '${variableName}'`;
    if (suggestions && suggestions.length > 0) {
      message += `. Did you mean: ${suggestions.slice(0, 3).map(s => `'${s}'`).join(', ')}?`;
    }

    this.addError(message, range, 'FTL2001');
  }

  public addUndefinedMacroError(macroName: string, position: Position): void {
    const range: Range = {
      start: position,
      end: { line: position.line, character: position.character + macroName.length, offset: position.offset + macroName.length }
    };

    this.addError(`Undefined macro: '${macroName}'`, range, 'FTL2002');
  }

  public addUndefinedFunctionError(functionName: string, position: Position): void {
    const range: Range = {
      start: position,
      end: { line: position.line, character: position.character + functionName.length, offset: position.offset + functionName.length }
    };

    this.addError(`Undefined function: '${functionName}'`, range, 'FTL2003');
  }

  public addTypeError(expected: string, actual: string, position: Position): void {
    const range: Range = {
      start: position,
      end: { line: position.line, character: position.character + 1, offset: position.offset + 1 }
    };

    this.addError(`Type mismatch: expected '${expected}', got '${actual}'`, range, 'FTL3001');
  }

  public addImportError(importPath: string, position: Position, reason: string): void {
    const range: Range = {
      start: position,
      end: { line: position.line, character: position.character + importPath.length, offset: position.offset + importPath.length }
    };

    this.addError(`Failed to import '${importPath}': ${reason}`, range, 'FTL4001');
  }

  public addCircularDependencyError(cycle: string[], position: Position): void {
    const range: Range = {
      start: position,
      end: { line: position.line, character: position.character + 1, offset: position.offset + 1 }
    };

    const cycleString = cycle.join(' → ');
    this.addError(`Circular dependency detected: ${cycleString}`, range, 'FTL4002');
  }

  public addUnusedVariableWarning(variableName: string, position: Position): void {
    const range: Range = {
      start: position,
      end: { line: position.line, character: position.character + variableName.length, offset: position.offset + variableName.length }
    };

    this.addWarning(`Unused variable: '${variableName}'`, range, 'FTL5001');
  }

  public addDeprecationWarning(feature: string, position: Position, alternative?: string): void {
    const range: Range = {
      start: position,
      end: { line: position.line, character: position.character + feature.length, offset: position.offset + feature.length }
    };

    let message = `Deprecated: '${feature}'`;
    if (alternative) {
      message += `. Use '${alternative}' instead`;
    }

    this.addWarning(message, range, 'FTL6001');
  }

  public addPerformanceWarning(message: string, position: Position): void {
    const range: Range = {
      start: position,
      end: { line: position.line, character: position.character + 1, offset: position.offset + 1 }
    };

    this.addWarning(`Performance: ${message}`, range, 'FTL8001');
  }

  public addStyleInfo(message: string, range: Range): void {
    this.addInfo(`Style: ${message}`, range, 'FTL7001');
  }

  public getDiagnostics(): Diagnostic[] {
    return [...this.diagnostics];
  }

  private normalizeRange(range?: Range): Range {
    const start = this.normalizePosition(range?.start);
    const end = this.normalizePosition(range?.end);

    if (end.offset < start.offset) {
      end.offset = start.offset;
    }

    if (end.line < start.line || (end.line === start.line && end.character < start.character)) {
      end.line = start.line;
      end.character = start.character;
    }

    return {
      start,
      end
    };
  }

  private normalizePosition(position?: Position): Position {
    if (!position) {
      return { line: 1, character: 1, offset: 0 };
    }

    return {
      line: this.normalizeNumber(position.line, 1, 1),
      character: this.normalizeNumber(position.character, 1, 1),
      offset: this.normalizeNumber(position.offset, 0, 0)
    };
  }

  private normalizeNumber(value: number | undefined, fallback: number, minimum: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }

    const normalized = Math.floor(value);
    if (normalized < minimum) {
      return minimum;
    }

    return normalized;
  }

  public getDiagnosticsByCategory(category: ErrorCategory): Diagnostic[] {
    return this.diagnostics.filter(diagnostic => {
      if (!diagnostic.code) return false;
      const errorCode = this.errorCodes.get(diagnostic.code);
      return errorCode?.category === category;
    });
  }

  public getDiagnosticsBySeverity(severity: 'error' | 'warning' | 'info'): Diagnostic[] {
    return this.diagnostics.filter(diagnostic => diagnostic.severity === severity);
  }

  public getErrorCount(): number {
    return this.diagnostics.filter(d => d.severity === 'error').length;
  }

  public getWarningCount(): number {
    return this.diagnostics.filter(d => d.severity === 'warning').length;
  }

  public getInfoCount(): number {
    return this.diagnostics.filter(d => d.severity === 'info').length;
  }

  public hasErrors(): boolean {
    return this.getErrorCount() > 0;
  }

  public hasWarnings(): boolean {
    return this.getWarningCount() > 0;
  }

  public clear(): void {
    this.diagnostics = [];
  }

  public suppressCode(code: string): void {
    this.suppressedCodes.add(code);
  }

  public unsuppressCode(code: string): void {
    this.suppressedCodes.delete(code);
  }

  public isSuppressed(code: string): boolean {
    return this.suppressedCodes.has(code);
  }

  public filterDiagnostics(predicate: (diagnostic: Diagnostic) => boolean): Diagnostic[] {
    return this.diagnostics.filter(predicate);
  }

  public sortDiagnostics(compareFn?: (a: Diagnostic, b: Diagnostic) => number): Diagnostic[] {
    const sorted = [...this.diagnostics];
    
    if (compareFn) {
      return sorted.sort(compareFn);
    }

    // Default sort: by line, then by character, then by severity
    return sorted.sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return a.range.start.line - b.range.start.line;
      }
      if (a.range.start.character !== b.range.start.character) {
        return a.range.start.character - b.range.start.character;
      }
      
      const severityOrder = { 'error': 0, 'warning': 1, 'info': 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  public generateReport(): ErrorReport {
    const diagnostics = this.sortDiagnostics();
    const summary = this.generateSummary();
    
    return {
      summary,
      diagnostics,
      timestamp: new Date(),
      categories: this.generateCategoryBreakdown()
    };
  }

  private generateSummary(): ErrorSummary {
    return {
      totalCount: this.diagnostics.length,
      errorCount: this.getErrorCount(),
      warningCount: this.getWarningCount(),
      infoCount: this.getInfoCount(),
      suppressedCount: 0 // Could track this if needed
    };
  }

  private generateCategoryBreakdown(): Map<ErrorCategory, number> {
    const breakdown = new Map<ErrorCategory, number>();
    
    for (const category of Object.values(ErrorCategory)) {
      breakdown.set(category, 0);
    }

    for (const diagnostic of this.diagnostics) {
      if (diagnostic.code) {
        const errorCode = this.errorCodes.get(diagnostic.code);
        if (errorCode) {
          const current = breakdown.get(errorCode.category) || 0;
          breakdown.set(errorCode.category, current + 1);
        }
      }
    }

    return breakdown;
  }

  public static createQuickFix(title: string, range: Range, newText: string): QuickFix {
    return {
      title,
      edit: {
        range,
        newText
      }
    };
  }

  public static createPositionFromOffset(content: string, offset: number): Position {
    const lines = content.substring(0, offset).split('\n');
    return {
      line: lines.length,
      character: lines[lines.length - 1].length + 1,
      offset: offset
    };
  }

  public static createRangeFromOffsets(content: string, start: number, end: number): Range {
    return {
      start: ErrorReporter.createPositionFromOffset(content, start),
      end: ErrorReporter.createPositionFromOffset(content, end)
    };
  }
}

export interface ErrorReport {
  summary: ErrorSummary;
  diagnostics: Diagnostic[];
  timestamp: Date;
  categories: Map<ErrorCategory, number>;
}

export interface ErrorSummary {
  totalCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  suppressedCount: number;
}

export interface QuickFix {
  title: string;
  edit: TextEdit;
}

export interface TextEdit {
  range: Range;
  newText: string;
}