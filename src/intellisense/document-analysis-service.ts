import * as vscode from 'vscode';

import { AnalysisResult, FreeMarkerStaticAnalyzer } from '../static-analyzer';
import { createSymbolIndex, SymbolIndex } from './symbol-index';

export interface CachedDocumentAnalysis {
  uri: string;
  version: number;
  content: string;
  result: AnalysisResult;
  index: SymbolIndex;
  analyzedAt: number;
}

interface AnalyzeRequest {
  document: vscode.TextDocument;
  onComplete?: (analysis: CachedDocumentAnalysis | undefined) => void;
}

export class DocumentAnalysisService {
  private cache = new Map<string, CachedDocumentAnalysis>();
  private timers = new Map<string, NodeJS.Timeout>();
  private inFlight = new Map<string, { version: number; promise: Promise<CachedDocumentAnalysis | undefined> }>();
  private generation = 0;

  constructor(
    private readonly analyzer: FreeMarkerStaticAnalyzer,
    private debounceMs: number,
    private maxCachedDocuments: number
  ) {}

  public configure(options: { debounceMs: number; maxCachedDocuments: number }): void {
    this.debounceMs = options.debounceMs;
    this.maxCachedDocuments = options.maxCachedDocuments;
    this.evictIfNeeded();
  }

  public getCached(document: vscode.TextDocument): CachedDocumentAnalysis | undefined {
    const cached = this.cache.get(document.uri.toString());
    if (!cached || cached.version !== document.version) {
      return undefined;
    }

    this.cache.delete(document.uri.toString());
    this.cache.set(document.uri.toString(), cached);
    return cached;
  }

  public async analyzeNow(document: vscode.TextDocument): Promise<CachedDocumentAnalysis | undefined> {
    if (document.languageId !== 'ftl') {
      return undefined;
    }

    const cached = this.getCached(document);
    if (cached) {
      return cached;
    }

    const key = document.uri.toString();
    const version = document.version;
    const generation = this.generation;
    const existing = this.inFlight.get(key);
    if (existing?.version === version) {
      return existing.promise;
    }

    const content = document.getText();
    const fsPath = document.uri.scheme === 'file' ? document.uri.fsPath : undefined;

    const promise = this.analyzer.analyze(content, fsPath).then(result => {
      if (document.version !== version || this.generation !== generation) {
        return undefined;
      }

      const analysis: CachedDocumentAnalysis = {
        uri: key,
        version,
        content,
        result,
        index: createSymbolIndex(content, result),
        analyzedAt: Date.now()
      };

      this.cache.set(key, analysis);
      this.evictIfNeeded();
      return analysis;
    }).finally(() => {
      if (this.inFlight.get(key)?.promise === promise) {
        this.inFlight.delete(key);
      }
    });

    this.inFlight.set(key, { version, promise });
    return promise;
  }

  public schedule(request: AnalyzeRequest): void {
    if (request.document.languageId !== 'ftl') {
      return;
    }

    const key = request.document.uri.toString();
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.timers.delete(key);
      void this.analyzeNow(request.document).then(request.onComplete);
    }, Math.max(0, this.debounceMs));

    this.timers.set(key, timer);
  }

  public invalidate(uri?: vscode.Uri): void {
    this.generation++;
    if (uri) {
      const key = uri.toString();
      this.cache.delete(key);
      const timer = this.timers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(key);
      }
      return;
    }

    this.cache.clear();
    this.inFlight.clear();
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }

  public dispose(): void {
    this.invalidate();
  }

  private evictIfNeeded(): void {
    if (this.maxCachedDocuments <= 0) {
      this.cache.clear();
      return;
    }

    while (this.cache.size > this.maxCachedDocuments) {
      const oldest = this.cache.keys().next().value;
      if (!oldest) {
        return;
      }
      this.cache.delete(oldest);
    }
  }
}
