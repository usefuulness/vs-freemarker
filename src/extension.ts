import * as vscode from 'vscode';
import { FreeMarkerStaticAnalyzer } from './static-analyzer';
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
    refreshDiagnostics(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refreshDiagnostics),
    vscode.workspace.onDidChangeTextDocument(e => refreshDiagnostics(e.document)),
    vscode.workspace.onDidCloseTextDocument(doc => diagnosticCollection.delete(doc.uri)),
    vscode.commands.registerCommand('freemarker.clearImportCache', () => {
      importResolver.invalidateCache();
      vscode.window.showInformationMessage('FreeMarker template cache cleared.');
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (affectsImportResolverConfiguration(event)) {
        importResolver.invalidateCache();
        importResolver = createImportResolver();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      importResolver.invalidateCache();
    })
  );
}

function refreshDiagnostics(document: vscode.TextDocument): void {
  if (document.languageId !== 'ftl') {
    return;
  }

  const result = analyzer.analyze(document.getText());
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
}

export function deactivate(): void {
  diagnosticCollection.dispose();
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
