import * as vscode from 'vscode';
import { FreeMarkerStaticAnalyzer, Range as AnalyzerRange } from './static-analyzer';

const ANALYSIS_DEBOUNCE_MS = 300;

let diagnosticCollection: vscode.DiagnosticCollection;
let analyzer: FreeMarkerStaticAnalyzer;
const pendingAnalyses = new Map<string, NodeJS.Timeout>();

export function activate(context: vscode.ExtensionContext): void {
  analyzer = new FreeMarkerStaticAnalyzer();
  updateTemplateRoots();
  diagnosticCollection = vscode.languages.createDiagnosticCollection('freemarker');
  context.subscriptions.push(diagnosticCollection);

  if (vscode.window.activeTextEditor) {
    scheduleDiagnostics(vscode.window.activeTextEditor.document, 0);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        scheduleDiagnostics(editor.document, 0);
      }
    }),
    vscode.workspace.onDidOpenTextDocument(scheduleDiagnostics),
    vscode.workspace.onDidChangeTextDocument(event => scheduleDiagnostics(event.document)),
    vscode.workspace.onDidCloseTextDocument(doc => {
      cancelScheduledDiagnostics(doc.uri);
      diagnosticCollection.delete(doc.uri);
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(updateTemplateRoots)
  );
}

function updateTemplateRoots(): void {
  const roots = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath) ?? [];
  analyzer.setTemplateRoots(roots);
}

function scheduleDiagnostics(document: vscode.TextDocument, delay = ANALYSIS_DEBOUNCE_MS): void {
  if (document.languageId !== 'ftl') {
    return;
  }

  const key = document.uri.toString();
  const existing = pendingAnalyses.get(key);
  if (existing) {
    clearTimeout(existing);
  }

  const handle = setTimeout(() => {
    pendingAnalyses.delete(key);

    if (document.isClosed) {
      diagnosticCollection.delete(document.uri);
      return;
    }

    refreshDiagnostics(document);
  }, Math.max(delay, 0));

  pendingAnalyses.set(key, handle);
}

function cancelScheduledDiagnostics(uri: vscode.Uri): void {
  const key = uri.toString();
  const existing = pendingAnalyses.get(key);
  if (existing) {
    clearTimeout(existing);
    pendingAnalyses.delete(key);
  }
}

function refreshDiagnostics(document: vscode.TextDocument): void {
  try {
    const result = analyzer.analyze(document.getText(), document.uri.fsPath);
    const diagnostics = result.diagnostics.flatMap(diagnostic => {
      const range = toVsCodeRange(diagnostic.range);
      if (!range) {
        console.warn('[FreeMarker] Dropping diagnostic with invalid range', diagnostic);
        return [] as vscode.Diagnostic[];
      }

      let severity: vscode.DiagnosticSeverity;
      switch (diagnostic.severity) {
        case 'warning':
          severity = vscode.DiagnosticSeverity.Warning;
          break;
        case 'info':
          severity = vscode.DiagnosticSeverity.Information;
          break;
        default:
          severity = vscode.DiagnosticSeverity.Error;
      }

      const vscodeDiagnostic = new vscode.Diagnostic(range, diagnostic.message, severity);
      if (diagnostic.code) {
        vscodeDiagnostic.code = diagnostic.code;
      }
      vscodeDiagnostic.source = diagnostic.source;
      return [vscodeDiagnostic];
    });

    diagnosticCollection.set(document.uri, diagnostics);
  } catch (error) {
    console.error('[FreeMarker] Failed to analyze document', error);
    diagnosticCollection.delete(document.uri);
  }
}

export function deactivate(): void {
  pendingAnalyses.forEach(timeout => clearTimeout(timeout));
  pendingAnalyses.clear();
  diagnosticCollection.dispose();
}

interface ZeroBasedPosition {
  line: number;
  character: number;
}

function toVsCodeRange(range?: AnalyzerRange): vscode.Range | undefined {
  const start = toZeroBasedPosition(range?.start);
  const end = toZeroBasedPosition(range?.end);

  if (!start || !end) {
    return undefined;
  }

  const finalEnd = adjustEndPosition(start, end);

  try {
    return new vscode.Range(
      new vscode.Position(start.line, start.character),
      new vscode.Position(finalEnd.line, finalEnd.character)
    );
  } catch (error) {
    console.warn('[FreeMarker] Unable to create VS Code range', error, range);
    return undefined;
  }
}

function toZeroBasedPosition(position?: AnalyzerRange['start']): ZeroBasedPosition | undefined {
  if (!position) {
    return undefined;
  }

  const line = toZeroBased(position.line);
  const character = toZeroBased(position.character);

  if (line === undefined || character === undefined) {
    return undefined;
  }

  return { line, character };
}

function toZeroBased(value?: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.floor(value) - 1;
  return normalized < 0 ? 0 : normalized;
}

function adjustEndPosition(start: ZeroBasedPosition, end: ZeroBasedPosition): ZeroBasedPosition {
  if (end.line < start.line) {
    return { ...start };
  }

  if (end.line === start.line && end.character < start.character) {
    return { ...start };
  }

  return end;
}
