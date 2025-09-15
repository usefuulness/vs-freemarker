import { FreeMarkerLexer } from './lexer';
import { FreeMarkerParser } from './parser';
import { SemanticAnalyzer } from './semantic-analyzer';
import { ErrorReporter } from './error-reporter';
import { PerformanceProfiler } from './performance-profiler';

export interface AnalysisResult {
  ast: any;
  diagnostics: Diagnostic[];
  semanticInfo: SemanticInfo;
  performance: PerformanceMetrics;
}

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  range: Range;
  code?: string;
  source: string;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Position {
  line: number;
  character: number;
  offset: number;
}

export interface SemanticInfo {
  variables: Map<string, VariableInfo>;
  macros: Map<string, MacroInfo>;
  functions: Map<string, FunctionInfo>;
  includes: string[];
  imports: ImportInfo[];
}

export interface VariableInfo {
  name: string;
  type: string;
  scope: 'global' | 'local' | 'loop';
  definedAt: Position;
  usages: Position[];
}

export interface MacroInfo {
  name: string;
  parameters: string[];
  definedAt: Position;
  usages: Position[];
}

export interface FunctionInfo {
  name: string;
  parameters: string[];
  returnType: string;
  definedAt: Position;
  usages: Position[];
}

export interface ImportInfo {
  path: string;
  alias: string;
  resolvedPath?: string;
}

export interface PerformanceMetrics {
  totalTime: number;
  lexingTime: number;
  parsingTime: number;
  semanticAnalysisTime: number;
  memoryUsage: number;
  tokenCount: number;
  nodeCount: number;
}

export class FreeMarkerStaticAnalyzer {
  private lexer: FreeMarkerLexer = new FreeMarkerLexer();
  private parser: FreeMarkerParser;
  private semanticAnalyzer: SemanticAnalyzer = new SemanticAnalyzer();
  private errorReporter: ErrorReporter = new ErrorReporter();
  private profiler: PerformanceProfiler = new PerformanceProfiler();

  constructor() {
    this.parser = new FreeMarkerParser([]);
  }

  public analyze(template: string, _filePath?: string): AnalysisResult {
    this.profiler.start();
    
    try {
      // Tokenize
      this.profiler.startPhase('lexing');
      const tokens = this.lexer.tokenize(template);
      this.profiler.endPhase('lexing');

      // Parse
      this.profiler.startPhase('parsing');
      this.parser = new FreeMarkerParser(tokens);
      const ast = this.parser.parse();
      this.profiler.endPhase('parsing');

      // Semantic analysis
      this.profiler.startPhase('semanticAnalysis');
      const semanticInfo = this.semanticAnalyzer.analyze(ast);
      this.profiler.endPhase('semanticAnalysis');

      // Collect diagnostics
      const diagnostics = this.errorReporter.getDiagnostics();
      
      // Performance metrics
      const performance = this.generatePerformanceMetrics();

      return {
        ast,
        diagnostics,
        semanticInfo,
        performance
      };
    } catch (error) {
      this.errorReporter.addError(`Analysis failed: ${error}`, {
        start: { line: 1, character: 1, offset: 0 },
        end: { line: 1, character: 1, offset: 0 }
      });
      
      return {
        ast: null,
        diagnostics: this.errorReporter.getDiagnostics(),
        semanticInfo: {
          variables: new Map(),
          macros: new Map(),
          functions: new Map(),
          includes: [],
          imports: []
        },
        performance: this.generatePerformanceMetrics()
      };
    }
  }

  public analyzeIncremental(
    template: string,
    _changes: any[],
    _previousResult: AnalysisResult
  ): AnalysisResult {
    // For now, perform full analysis
    // In the future, this could be optimized for incremental updates
    return this.analyze(template);
  }

  public getDiagnostics(): Diagnostic[] {
    return this.errorReporter.getDiagnostics();
  }

  public clearDiagnostics(): void {
    this.errorReporter.clear();
  }

  private generatePerformanceMetrics(): PerformanceMetrics {
    const totalTime = this.profiler.end();
    const lexingPhase = this.profiler.getPhaseMetrics('lexing');
    const parsingPhase = this.profiler.getPhaseMetrics('parsing');
    const semanticPhase = this.profiler.getPhaseMetrics('semanticAnalysis');
    
    return {
      totalTime,
      lexingTime: lexingPhase?.duration || 0,
      parsingTime: parsingPhase?.duration || 0,
      semanticAnalysisTime: semanticPhase?.duration || 0,
      memoryUsage: 0,
      tokenCount: 0,
      nodeCount: 0
    };
  }
}