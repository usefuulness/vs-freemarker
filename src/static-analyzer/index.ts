import * as fs from 'fs';
import { FreeMarkerLexer } from './lexer';
import { FreeMarkerParser, TemplateNode, MacroNode } from './parser';
import { SemanticAnalyzer } from './semantic-analyzer';
import { ErrorReporter } from './error-reporter';
import { PerformanceProfiler } from './performance-profiler';
import * as path from 'path';
import { resolveTemplatePath } from './path-utils';

interface DependencyEntry {
  path: string;
  range: Range;
  optional?: boolean;
}

interface CachedTemplate {
  content: string;
  ast?: TemplateNode;
  mtimeMs: number;
  size: number;
}

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
  node?: MacroNode;
  contextMacros?: Map<string, MacroInfo>;
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
  private templateRoots: string[] = [process.cwd()];
  private dependencyCache: Map<string, CachedTemplate> = new Map();

  constructor() {
    this.parser = new FreeMarkerParser([]);
  }

  public analyze(template: string, filePath?: string): AnalysisResult {
    this.profiler.start();
    this.errorReporter.clear();

      try {
        this.checkBasicSyntax(template);
        // Tokenize
        this.profiler.startPhase('lexing');
        const tokens = this.lexer.tokenize(template);
      this.profiler.endPhase('lexing');

      // Parse
        this.profiler.startPhase('parsing');
        this.parser = new FreeMarkerParser(tokens);
        let ast: TemplateNode;
        try {
          ast = this.parser.parse();
          this.profiler.endPhase('parsing');
        } catch (parseError) {
          this.profiler.endPhase('parsing');
          const range = ErrorReporter.createRangeFromOffsets(template, 0, template.length);
          this.errorReporter.addError(`Syntax error: ${parseError}`, range, 'FTL1001');
          const performance = this.generatePerformanceMetrics();
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
            performance
          };
        }

      // Semantic analysis
      this.profiler.startPhase('semanticAnalysis');
      const semanticInfo = this.semanticAnalyzer.analyze(ast, filePath);
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

  private checkBasicSyntax(content: string): void {
    const interpolationRegex = /\$\{/g;
    let match: RegExpExecArray | null;
    while ((match = interpolationRegex.exec(content)) !== null) {
      if (content.indexOf('}', match.index) === -1) {
        const range = ErrorReporter.createRangeFromOffsets(content, match.index, content.length);
        this.errorReporter.addError('Unclosed interpolation', range, 'FTL1005');
      }
    }
  }

  private validateDependencies(content: string, ast: TemplateNode, filePath?: string): void {
    if (!filePath) {
      return;
    }

    const normalizedFile = path.normalize(filePath);
    const visited = new Set<string>();
    const reported = new Set<string>();
    const cache = new Map<string, CachedTemplate | undefined>();

    const importEntries = this.extractDependencyEntries(
      ast.imports.map(imp => ({ path: imp.path, range: imp.range })),
      content,
      [/<#import\s+['"]([^'"<>]+)['"]/g, /<@import\s+[^>]*path=['"]([^'"<>]+)['"][^>]*>/g]
    );

    importEntries.forEach(entry => {
      this.evaluateDependency(entry, filePath, normalizedFile, content, visited, reported, cache);
    });

    const includeEntries = this.extractDependencyEntries(
      ast.includes.map(inc => ({ path: inc.path, range: inc.range, optional: inc.optional })),
      content,
      [/<#include\s+['"]([^'"<>]+)['"]/g, /<@include\s+[^>]*path=['"]([^'"<>]+)['"][^>]*>/g]
    );

    includeEntries.forEach(entry => {
      this.evaluateDependency(entry, filePath, normalizedFile, content, visited, reported, cache);
    });
  }

  private evaluateDependency(
    entry: DependencyEntry,
    importerPath: string,
    normalizedImporter: string,
    content: string,
    visited: Set<string>,
    reported: Set<string>,
    cache: Map<string, CachedTemplate | undefined>
  ): void {
    if (!entry.path) {
      return;
    }

    const range = this.ensureRange(entry.range, content);
    const resolved = resolveTemplatePath(entry.path, {
      currentFile: importerPath,
      templateRoots: this.templateRoots
    });

    if (!resolved) {
      if (entry.optional) {
        return;
      }
      this.errorReporter.addError(`File not found: ${entry.path}`, range, 'FTL4001');
      return;
    }

    this.collectTransitiveDependencies(
      resolved,
      range,
      [normalizedImporter],
      visited,
      reported,
      cache
    );
  }

  private extractDependencyEntries(
    nodes: { path: string; range?: Range; optional?: boolean }[],
    content: string,
    regexes: RegExp[]
  ): DependencyEntry[] {
    const entries: DependencyEntry[] = [];

    nodes.forEach(node => {
      if (!node.path) {
        return;
      }

      entries.push({
        path: node.path,
        range: this.ensureRange(node.range, content),
        optional: node.optional
      });
    });

    if (entries.length > 0) {
      return entries;
    }

    const fallbackEntries: DependencyEntry[] = [];
    const seen = new Set<string>();

    regexes.forEach(regex => {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const literal = match[1];
        if (!literal) {
          continue;
        }

        const key = `${match.index}:${literal}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        fallbackEntries.push({
          path: literal,
          range: ErrorReporter.createRangeFromOffsets(content, match.index, match.index + match[0].length)
        });
      }
    });

    return fallbackEntries;
  }

  private collectTransitiveDependencies(
    resolvedPath: string,
    originRange: Range,
    chain: string[],
    visited: Set<string>,
    reported: Set<string>,
    cache: Map<string, CachedTemplate | undefined>
  ): void {
    const normalized = path.normalize(resolvedPath);
    if (visited.has(normalized)) {
      return;
    }

    visited.add(normalized);

    try {
      const template = this.loadTemplate(normalized, cache);
      if (!template) {
        return;
      }

      const nextChain = [...chain, normalized];
      const dependencyPaths = this.extractDependencyPaths(template);

      dependencyPaths.forEach(depPath => {
        const resolved = resolveTemplatePath(depPath, {
          currentFile: normalized,
          templateRoots: this.templateRoots
        });

        if (!resolved) {
          this.reportMissingTransitiveDependency(depPath, normalized, nextChain, originRange, reported);
        } else {
          this.collectTransitiveDependencies(resolved, originRange, nextChain, visited, reported, cache);
        }
      });
    } finally {
      visited.delete(normalized);
    }
  }

  private loadTemplate(
    filePath: string,
    cache: Map<string, CachedTemplate | undefined>
  ): CachedTemplate | undefined {
    const normalized = path.normalize(filePath);

    if (cache.has(normalized)) {
      return cache.get(normalized);
    }

    let stats: fs.Stats;
    try {
      stats = fs.statSync(normalized);
    } catch {
      cache.set(normalized, undefined);
      this.dependencyCache.delete(normalized);
      return undefined;
    }

    const cached = this.dependencyCache.get(normalized);
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
      cache.set(normalized, cached);
      return cached;
    }

    try {
      const content = fs.readFileSync(normalized, 'utf8');
      let ast: TemplateNode | undefined;

      try {
        const lexer = new FreeMarkerLexer();
        const tokens = lexer.tokenize(content);
        const parser = new FreeMarkerParser(tokens);
        ast = parser.parse();
      } catch {
        ast = undefined;
      }

      const updated: CachedTemplate = {
        content,
        ast,
        mtimeMs: stats.mtimeMs,
        size: stats.size
      };
      cache.set(normalized, updated);
      this.dependencyCache.set(normalized, updated);
      return updated;
    } catch {
      cache.set(normalized, undefined);
      this.dependencyCache.delete(normalized);
      return undefined;
    }
  }

  private extractDependencyPaths(template: CachedTemplate): string[] {
    const dependencies = new Set<string>();
    const optionalDependencies = new Set<string>();

    if (template.ast) {
      template.ast.imports.forEach(imp => {
        if (imp.path) {
          dependencies.add(imp.path);
        }
      });

      template.ast.includes.forEach(inc => {
        if (inc.path) {
          if (inc.optional) {
            optionalDependencies.add(inc.path);
          } else {
            dependencies.add(inc.path);
          }
        }
      });
    }

    const regexes = [
      /<#import\s+['"]([^'"<>]+)['"]/g,
      /<@import\s+[^>]*path=['"]([^'"<>]+)['"][^>]*>/g,
      /<#include\s+['"]([^'"<>]+)['"]/g,
      /<@include\s+[^>]*path=['"]([^'"<>]+)['"][^>]*>/g
    ];

    regexes.forEach(regex => {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(template.content)) !== null) {
        const literal = match[1];
        if (literal && !optionalDependencies.has(literal)) {
          dependencies.add(literal);
        }
      }
    });

    return Array.from(dependencies);
  }

  private reportMissingTransitiveDependency(
    missingPath: string,
    currentFile: string,
    chain: string[],
    originRange: Range,
    reported: Set<string>
  ): void {
    const startOffset = originRange.start?.offset ?? 0;
    const endOffset = originRange.end?.offset ?? startOffset;
    const key = `${startOffset}:${endOffset}:${currentFile}:${missingPath}`;

    if (reported.has(key)) {
      return;
    }
    reported.add(key);

    const displayCurrent = this.formatDisplayPath(currentFile);
    const chainDisplay = chain.map(p => this.formatDisplayPath(p)).join(' -> ');
    const suffix = chain.length > 0 ? `; import chain: ${chainDisplay}` : '';

    this.errorReporter.addError(
      `File not found: ${missingPath} (referenced from ${displayCurrent}${suffix})`,
      originRange,
      'FTL4001'
    );
  }

  private formatDisplayPath(filePath: string): string {
    const normalized = path.normalize(filePath);
    let best = normalized;

    this.templateRoots.forEach(root => {
      const normalizedRoot = path.normalize(root);
      const relative = path.relative(normalizedRoot, normalized);

      if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
        const candidate = relative.length === 0 ? path.basename(normalized) : relative;
        if (candidate.length < best.length) {
          best = candidate;
        }
      }
    });

    return best;
  }

  private ensureRange(range: Range | undefined, content: string): Range {
    if (range) {
      return range;
    }

    return ErrorReporter.createRangeFromOffsets(content, 0, 0);
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