import * as vscode from 'vscode';
import { FreeMarkerStaticAnalyzer, Range as AnalyzerRange } from './static-analyzer';
import { ImportResolver } from './static-analyzer/import-resolver';

let diagnosticCollection: vscode.DiagnosticCollection;
let analyzer: FreeMarkerStaticAnalyzer;
let importResolver: ImportResolver;

export function activate(context: vscode.ExtensionContext): void {
  analyzer = new FreeMarkerStaticAnalyzer();
  importResolver = createImportResolver();
  diagnosticCollection = vscode.languages.createDiagnosticCollection('freemarker');
  context.subscriptions.push(diagnosticCollection);

  if (vscode.window.activeTextEditor) {
    void refreshDiagnostics(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(document => void refreshDiagnostics(document)),
    vscode.workspace.onDidChangeTextDocument(e => void refreshDiagnostics(e.document)),
    vscode.workspace.onDidCloseTextDocument(doc => diagnosticCollection.delete(doc.uri))
  );
}

async function refreshDiagnostics(document: vscode.TextDocument): Promise<void> {

  if (document.languageId !== 'ftl') {
    return;
  }

  try {
    const result = await analyzer.analyze(document.getText(), document.uri.fsPath);
    const diagnostics = result.diagnostics.map(d => {
      const start = new vscode.Position(d.range.start.line - 1, d.range.start.character - 1);
      const end = new vscode.Position(d.range.end.line - 1, d.range.end.character - 1);
      const range = new vscode.Range(start, end);

      let severity: vscode.DiagnosticSeverity;
      switch (d.severity) {
        case 'warning':
          severity = vscode.DiagnosticSeverity.Warning;
          break;
        case 'info':
          severity = vscode.DiagnosticSeverity.Information;
          break;
        default:
          severity = vscode.DiagnosticSeverity.Error;
      }


      const diag = new vscode.Diagnostic(range, d.message, severity);
      if (d.code) {
        diag.code = d.code;
      }
      diag.source = d.source;
      return diag;

    });

    diagnosticCollection.set(document.uri, diagnostics);
  } catch (error) {
    console.error('Failed to analyze FreeMarker template', error);
  }
}

export function deactivate(): void {
  diagnosticCollection?.dispose();
  importResolver?.invalidateCache();
}

function createImportResolver(): ImportResolver {
  const config = vscode.workspace.getConfiguration('freemarker');
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const basePath =
    config.get<string>('importResolver.basePath')?.trim() || workspaceFolder?.uri.fsPath || process.cwd();

  const templateDirectories = config.get<string[]>(
    'importResolver.templateDirectories',
    ['templates', 'views', 'src']
  );
  const extensions = config.get<string[]>(
    'importResolver.extensions',
    ['.ftl', '.ftlh', '.ftlx']
  );
  const maxDepth = config.get<number>('importResolver.maxDepth', 10);
  const followSymlinks = config.get<boolean>('importResolver.followSymlinks', false);
  const cacheEnabled = config.get<boolean>('importResolver.cacheEnabled', true);
  const maxCacheSize = Math.max(0, config.get<number>('importResolver.maxCacheSize', 200));

  return new ImportResolver(analyzer, {
    basePath,
    templateDirectories,
    extensions,
    maxDepth,
    followSymlinks,
    cacheEnabled,
    maxCacheSize
  });
}

function affectsImportResolverConfiguration(event: vscode.ConfigurationChangeEvent): boolean {
  return (
    event.affectsConfiguration('freemarker.importResolver.templateDirectories') ||
    event.affectsConfiguration('freemarker.importResolver.basePath') ||
    event.affectsConfiguration('freemarker.importResolver.extensions') ||
    event.affectsConfiguration('freemarker.importResolver.maxDepth') ||
    event.affectsConfiguration('freemarker.importResolver.followSymlinks') ||
    event.affectsConfiguration('freemarker.importResolver.cacheEnabled') ||
    event.affectsConfiguration('freemarker.importResolver.maxCacheSize')
  );
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
