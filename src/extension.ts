import * as path from 'path';
import * as vscode from 'vscode';
import { FreeMarkerStaticAnalyzer, Range as AnalyzerRange } from './static-analyzer';
import { ImportResolver, ResolverOptions } from './static-analyzer/import-resolver';

let diagnosticCollection: vscode.DiagnosticCollection;
let analyzer: FreeMarkerStaticAnalyzer;
let importResolver: ImportResolver;

export function activate(context: vscode.ExtensionContext): void {
  analyzer = new FreeMarkerStaticAnalyzer();
  importResolver = createImportResolver();
  diagnosticCollection = vscode.languages.createDiagnosticCollection('freemarker');
  context.subscriptions.push(diagnosticCollection);

  context.subscriptions.push(
    vscode.commands.registerCommand('freemarker.clearImportCache', () => {
      importResolver?.invalidateCache();
      refreshOpenDocuments();
      void vscode.window.showInformationMessage('FreeMarker template cache cleared.');
    })
  );

  if (vscode.window.activeTextEditor) {
    void refreshDiagnostics(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(document => void refreshDiagnostics(document)),
    vscode.workspace.onDidChangeTextDocument(e => void refreshDiagnostics(e.document)),
    vscode.workspace.onDidCloseTextDocument(doc => diagnosticCollection.delete(doc.uri)),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (affectsImportResolverConfiguration(event)) {
        updateImportResolverConfiguration();
        refreshOpenDocuments();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      updateImportResolverConfiguration();
      refreshOpenDocuments();
    })
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
  const options = getImportResolverOptions();
  applyTemplateRoots(options);
  return new ImportResolver(analyzer, options);
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

function getImportResolverOptions(): ResolverOptions {
  const config = vscode.workspace.getConfiguration('freemarker');
  const workspacePaths = getWorkspacePaths();
  const configuredBase = config.get<string>('importResolver.basePath')?.trim();
  const basePath = resolveBasePath(configuredBase, workspacePaths[0]);

  const templateDirectories = (config.get<string[]>(
    'importResolver.templateDirectories',
    ['templates', 'views', 'src']
  ) || [])
    .map(dir => dir?.trim())
    .filter((dir): dir is string => Boolean(dir));

  const extensions = (config.get<string[]>(
    'importResolver.extensions',
    ['.ftl', '.ftlh', '.ftlx']
  ) || [])
    .map(ext => ext?.trim())
    .filter((ext): ext is string => Boolean(ext));

  const maxDepth = config.get<number>('importResolver.maxDepth', 10);
  const followSymlinks = config.get<boolean>('importResolver.followSymlinks', false);
  const cacheEnabled = config.get<boolean>('importResolver.cacheEnabled', true);
  const maxCacheSize = Math.max(0, config.get<number>('importResolver.maxCacheSize', 200));

  return {
    basePath,
    templateDirectories,
    extensions,
    maxDepth,
    followSymlinks,
    cacheEnabled,
    maxCacheSize
  };
}

function resolveBasePath(configuredBase: string | undefined, workspaceBase?: string): string {
  const fallback = workspaceBase ? path.resolve(workspaceBase) : process.cwd();

  if (!configuredBase) {
    return fallback;
  }

  if (path.isAbsolute(configuredBase)) {
    return path.resolve(configuredBase);
  }

  return path.resolve(fallback, configuredBase);
}

function applyTemplateRoots(options: ResolverOptions): void {
  const workspacePaths = getWorkspacePaths();
  const roots = new Set<string>();

  roots.add(path.resolve(options.basePath));

  workspacePaths.forEach(folderPath => {
    roots.add(path.resolve(folderPath));
  });

  options.templateDirectories.forEach(dir => {
    const normalized = dir.trim();
    if (!normalized) {
      return;
    }

    if (path.isAbsolute(normalized)) {
      roots.add(path.resolve(normalized));
    } else {
      roots.add(path.resolve(options.basePath, normalized));
      workspacePaths.forEach(folderPath => {
        roots.add(path.resolve(folderPath, normalized));
      });
    }
  });

  analyzer.setTemplateRoots(Array.from(roots));
}

function getWorkspacePaths(): string[] {
  return (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath);
}

function updateImportResolverConfiguration(): void {
  if (!importResolver) {
    return;
  }

  const options = getImportResolverOptions();
  applyTemplateRoots(options);
  importResolver.updateOptions(options);
  importResolver.invalidateCache();
}

function refreshOpenDocuments(): void {
  vscode.workspace.textDocuments
    .filter(doc => doc.languageId === 'ftl')
    .forEach(doc => void refreshDiagnostics(doc));
}
