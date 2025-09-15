import * as vscode from 'vscode';
import { FreeMarkerStaticAnalyzer } from './static-analyzer';

let diagnosticCollection: vscode.DiagnosticCollection;
let analyzer: FreeMarkerStaticAnalyzer;

export function activate(context: vscode.ExtensionContext): void {
  analyzer = new FreeMarkerStaticAnalyzer();
  diagnosticCollection = vscode.languages.createDiagnosticCollection('freemarker');
  context.subscriptions.push(diagnosticCollection);

  if (vscode.window.activeTextEditor) {
    refreshDiagnostics(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        refreshDiagnostics(editor.document);
      }
    }),
    vscode.workspace.onDidOpenTextDocument(refreshDiagnostics),
    vscode.workspace.onDidChangeTextDocument(e => refreshDiagnostics(e.document)),
    vscode.workspace.onDidCloseTextDocument(doc => diagnosticCollection.delete(doc.uri))
  );
}

function refreshDiagnostics(document: vscode.TextDocument): void {
  if (document.languageId !== 'ftl') {
    return;
  }

  const result = analyzer.analyze(document.getText(), document.uri.fsPath);
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
}
