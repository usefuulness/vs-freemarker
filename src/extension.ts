import * as vscode from 'vscode';
import { FreeMarkerStaticAnalyzer } from './static-analyzer';

let diagnosticCollection: vscode.DiagnosticCollection;
let analyzer: FreeMarkerStaticAnalyzer;

export function activate(context: vscode.ExtensionContext): void {
  analyzer = new FreeMarkerStaticAnalyzer();
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
  diagnosticCollection.dispose();
}
