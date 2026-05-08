import * as path from 'path';
import * as vscode from 'vscode';
import { FreeMarkerStaticAnalyzer } from './static-analyzer';
import { ImportResolver, ResolverOptions } from './static-analyzer/import-resolver';
import { DocumentAnalysisService } from './intellisense/document-analysis-service';
import { registerFreeMarkerProviders } from './intellisense/providers';

let diagnosticCollection: vscode.DiagnosticCollection;
let analyzer: FreeMarkerStaticAnalyzer;
let importResolver: ImportResolver;
let analysisService: DocumentAnalysisService;

export function activate(context: vscode.ExtensionContext): void {
  analyzer = new FreeMarkerStaticAnalyzer();
  importResolver = createImportResolver();
  analysisService = new DocumentAnalysisService(analyzer, getAnalysisDebounceMs(), getMaxCachedDocuments());
  diagnosticCollection = vscode.languages.createDiagnosticCollection('freemarker');
  context.subscriptions.push(diagnosticCollection);
  context.subscriptions.push({ dispose: () => analysisService.dispose() });

  registerFreeMarkerProviders(context, analysisService, {
    htmlEnabled: () => vscode.workspace.getConfiguration('freemarker').get<boolean>('intellisense.html.enabled', true),
    templateRoots: () => getTemplateRoots(getImportResolverOptions())
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('freemarker.clearImportCache', () => {
      importResolver?.invalidateCache();
      analysisService?.invalidate();
      refreshOpenDocuments();
      void vscode.window.showInformationMessage('FreeMarker template cache cleared.');
    })
  );

  if (vscode.window.activeTextEditor) {
    void refreshDiagnostics(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(document => void refreshDiagnostics(document)),
    vscode.workspace.onDidChangeTextDocument(e => {
      analysisService.schedule({
        document: e.document,
        onComplete: analysis => {
          if (analysis) {
            updateDiagnostics(e.document, analysis.result.diagnostics);
          }
        }
      });
    }),
    vscode.workspace.onDidCloseTextDocument(doc => {
      diagnosticCollection.delete(doc.uri);
      analysisService.invalidate(doc.uri);
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (affectsImportResolverConfiguration(event)) {
        updateImportResolverConfiguration();
        refreshOpenDocuments();
      }
      if (affectsAnalysisConfiguration(event)) {
        analysisService.configure({
          debounceMs: getAnalysisDebounceMs(),
          maxCachedDocuments: getMaxCachedDocuments()
        });
      }
      if (event.affectsConfiguration('freemarker.intellisense.html.enabled')) {
        analysisService.invalidate();
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
    const analysis = await analysisService.analyzeNow(document);
    if (!analysis) {
      return;
    }
    updateDiagnostics(document, analysis.result.diagnostics);
  } catch (error) {
    console.error('Failed to analyze FreeMarker template', error);
  }
}

function updateDiagnostics(document: vscode.TextDocument, analyzerDiagnostics: ReturnType<FreeMarkerStaticAnalyzer['getDiagnostics']>): void {
  if (document.languageId !== 'ftl') {
    return;
  }

  const diagnostics = analyzerDiagnostics.map(d => {
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
  diagnosticCollection?.dispose();
  importResolver?.invalidateCache();
  analysisService?.dispose();
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

function affectsAnalysisConfiguration(event: vscode.ConfigurationChangeEvent): boolean {
  return (
    event.affectsConfiguration('freemarker.analysis.debounceMs') ||
    event.affectsConfiguration('freemarker.analysis.maxCachedDocuments')
  );
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
  analyzer.setTemplateRoots(getTemplateRoots(options));
}

function getTemplateRoots(options: ResolverOptions): string[] {
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

  return Array.from(roots);
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
  analysisService?.invalidate();
}

function refreshOpenDocuments(): void {
  vscode.workspace.textDocuments
    .filter(doc => doc.languageId === 'ftl')
    .forEach(doc => void refreshDiagnostics(doc));
}

function getAnalysisDebounceMs(): number {
  return Math.max(0, vscode.workspace.getConfiguration('freemarker').get<number>('analysis.debounceMs', 150));
}

function getMaxCachedDocuments(): number {
  return Math.max(0, vscode.workspace.getConfiguration('freemarker').get<number>('analysis.maxCachedDocuments', 100));
}
