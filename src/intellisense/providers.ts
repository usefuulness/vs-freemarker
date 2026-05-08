import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  CompletionItem as HtmlCompletionItem,
  CompletionItemKind as HtmlCompletionItemKind,
  getLanguageService,
  TextDocument
} from 'vscode-html-languageservice';

import { Range as AnalyzerRange } from '../static-analyzer';
import { DocumentAnalysisService } from './document-analysis-service';
import {
  getCompletionContext,
  findSymbolAtOffset,
  IndexedSymbol,
  SymbolIndex,
  TemplateLink
} from './symbol-index';

interface ProviderOptions {
  htmlEnabled: () => boolean;
  templateRoots: () => string[];
}

const htmlLanguageService = getLanguageService();

export function registerFreeMarkerProviders(
  context: vscode.ExtensionContext,
  analysisService: DocumentAnalysisService,
  options: ProviderOptions
): void {
  const selector: vscode.DocumentSelector = { language: 'ftl' };

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      selector,
      new FreeMarkerCompletionProvider(analysisService, options),
      '?',
      '.',
      '<',
      '@',
      '#',
      '"',
      "'"
    ),
    vscode.languages.registerHoverProvider(selector, new FreeMarkerHoverProvider(analysisService, options)),
    vscode.languages.registerDefinitionProvider(selector, new FreeMarkerDefinitionProvider(analysisService)),
    vscode.languages.registerReferenceProvider(selector, new FreeMarkerReferenceProvider(analysisService)),
    vscode.languages.registerDocumentSymbolProvider(selector, new FreeMarkerDocumentSymbolProvider(analysisService)),
    vscode.languages.registerDocumentLinkProvider(selector, new FreeMarkerDocumentLinkProvider(analysisService)),
    vscode.languages.registerSignatureHelpProvider(
      selector,
      new FreeMarkerSignatureHelpProvider(analysisService),
      '(',
      ',',
      ' ',
      '='
    )
  );
}

class FreeMarkerCompletionProvider implements vscode.CompletionItemProvider {
  constructor(
    private readonly analysisService: DocumentAnalysisService,
    private readonly options: ProviderOptions
  ) {}

  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[]> {
    const analysis = await this.analysisService.analyzeNow(document);
    const offset = document.offsetAt(position);
    const context = getCompletionContext(document.getText(), offset);
    const items: vscode.CompletionItem[] = [];

    if (analysis) {
      switch (context.kind) {
        case 'directive':
          items.push(...analysis.index.directives.map(name => createCompletion(name, vscode.CompletionItemKind.Keyword, `#${name}`)));
          break;
        case 'builtin':
          items.push(...analysis.index.builtins.map(name => createCompletion(name, vscode.CompletionItemKind.Function, `?${name}`)));
          break;
        case 'property':
          items.push(...propertyCompletions(analysis.index, context.receiver));
          break;
        case 'macro':
          items.push(...symbolCompletions(analysis.index, ['macro']));
          break;
        case 'path':
          items.push(...await pathCompletions(document, offset, this.options.templateRoots()));
          break;
        default:
          items.push(...symbolCompletions(analysis.index, ['variable', 'parameter', 'function', 'macro', 'import']));
          items.push(...analysis.index.directives.map(name => createCompletion(name, vscode.CompletionItemKind.Keyword, `#${name}`)));
          items.push(...analysis.index.builtins.map(name => createCompletion(name, vscode.CompletionItemKind.Function, `?${name}`)));
          break;
      }
    }

    if (this.options.htmlEnabled() && context.kind === 'default') {
      items.push(...htmlCompletions(document, position));
    }

    return dedupeCompletions(items, context.prefix);
  }
}

class FreeMarkerHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly analysisService: DocumentAnalysisService,
    private readonly options: ProviderOptions
  ) {}

  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    const analysis = await this.analysisService.analyzeNow(document);
    if (analysis) {
      const offset = document.offsetAt(position);
      const link = findLinkAtPosition(analysis.index.links, position);
      if (link) {
        const target = link.resolvedPath ? `\n\nResolved: \`${link.resolvedPath}\`` : '';
        return new vscode.Hover(`FreeMarker ${link.kind}: \`${link.path}\`${target}`, toVsCodeRange(document, link.range));
      }

      const symbol = findSymbolAtOffset(analysis.index, document.getText(), offset);
      if (symbol) {
        return new vscode.Hover(symbolHoverMarkdown(symbol), symbol.range ? toVsCodeRange(document, symbol.range) : undefined);
      }
    }

    if (this.options.htmlEnabled()) {
      return htmlHover(document, position);
    }

    return undefined;
  }
}

class FreeMarkerDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly analysisService: DocumentAnalysisService) {}

  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Definition | undefined> {
    const analysis = await this.analysisService.analyzeNow(document);
    if (!analysis) {
      return undefined;
    }

    const link = findLinkAtPosition(analysis.index.links, position);
    if (link?.resolvedPath) {
      return new vscode.Location(vscode.Uri.file(link.resolvedPath), new vscode.Position(0, 0));
    }

    const symbol = findSymbolAtOffset(analysis.index, document.getText(), document.offsetAt(position));
    if (!symbol?.range) {
      return undefined;
    }

    return new vscode.Location(document.uri, toVsCodeRange(document, symbol.range));
  }
}

class FreeMarkerReferenceProvider implements vscode.ReferenceProvider {
  constructor(private readonly analysisService: DocumentAnalysisService) {}

  public async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext
  ): Promise<vscode.Location[]> {
    const analysis = await this.analysisService.analyzeNow(document);
    if (!analysis) {
      return [];
    }

    const symbol = findSymbolAtOffset(analysis.index, document.getText(), document.offsetAt(position));
    if (!symbol) {
      return [];
    }

    const ranges = context.includeDeclaration && symbol.range
      ? [symbol.range, ...symbol.usages]
      : symbol.usages;

    return ranges.map(range => new vscode.Location(document.uri, toVsCodeRange(document, range)));
  }
}

class FreeMarkerDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  constructor(private readonly analysisService: DocumentAnalysisService) {}

  public async provideDocumentSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
    const analysis = await this.analysisService.analyzeNow(document);
    if (!analysis) {
      return [];
    }

    const symbols = analysis.index.documentSymbols.flatMap(symbol => {
      if (!symbol.range) {
        return [];
      }
      return [new vscode.DocumentSymbol(
        symbol.name,
        symbol.detail ?? symbol.kind,
        symbolKind(symbol),
        toVsCodeRange(document, symbol.range),
        toVsCodeRange(document, symbol.selectionRange ?? symbol.range)
      )];
    });

    analysis.index.links.forEach(link => {
      symbols.push(new vscode.DocumentSymbol(
        link.path,
        link.kind,
        link.kind === 'import' ? vscode.SymbolKind.Namespace : vscode.SymbolKind.File,
        toVsCodeRange(document, link.range),
        toVsCodeRange(document, link.range)
      ));
    });

    return symbols;
  }
}

class FreeMarkerDocumentLinkProvider implements vscode.DocumentLinkProvider {
  constructor(private readonly analysisService: DocumentAnalysisService) {}

  public async provideDocumentLinks(document: vscode.TextDocument): Promise<vscode.DocumentLink[]> {
    const analysis = await this.analysisService.analyzeNow(document);
    if (!analysis) {
      return [];
    }

    return analysis.index.links
      .filter((link): link is TemplateLink & { resolvedPath: string } => Boolean(link.resolvedPath))
      .map(link => new vscode.DocumentLink(
        toVsCodeRange(document, link.range),
        vscode.Uri.file(link.resolvedPath)
      ));
  }
}

class FreeMarkerSignatureHelpProvider implements vscode.SignatureHelpProvider {
  constructor(private readonly analysisService: DocumentAnalysisService) {}

  public async provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.SignatureHelp | undefined> {
    const analysis = await this.analysisService.analyzeNow(document);
    if (!analysis) {
      return undefined;
    }

    const before = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
    const call = findOpenCall(before);
    if (!call) {
      return undefined;
    }

    const symbol = analysis.index.symbols.get(call.name);
    if (!symbol?.parameters?.length) {
      return undefined;
    }

    const signature = new vscode.SignatureInformation(
      signatureLabel(symbol),
      symbol.detail
    );
    signature.parameters = symbol.parameters.map(parameter => new vscode.ParameterInformation(parameter));

    const help = new vscode.SignatureHelp();
    help.signatures = [signature];
    help.activeSignature = 0;
    help.activeParameter = Math.min(call.argumentIndex, signature.parameters.length - 1);
    return help;
  }
}

function symbolCompletions(index: SymbolIndex, kinds: string[]): vscode.CompletionItem[] {
  return Array.from(index.symbols.values())
    .filter(symbol => kinds.includes(symbol.kind))
    .map(symbol => {
      const item = createCompletion(symbol.name, completionKind(symbol), symbol.detail);
      if (symbol.parameters?.length) {
        item.insertText = new vscode.SnippetString(`${symbol.name} ${symbol.parameters.map((param, index) => `${param}=\${${index + 1}}`).join(' ')}`);
      }
      item.documentation = symbol.documentation;
      return item;
    });
}

function propertyCompletions(index: SymbolIndex, receiver: string | undefined): vscode.CompletionItem[] {
  if (!receiver) {
    return [];
  }

  const root = receiver.split('.')[0];
  const symbol = index.symbols.get(root);
  if (!symbol) {
    return [];
  }

  let properties = symbol.properties;
  const parts = receiver.split('.').slice(1);
  for (const part of parts) {
    const property = properties.get(part);
    if (!property) {
      return [];
    }
    properties = property.properties;
  }

  return Array.from(properties.values()).map(property => {
    const item = createCompletion(property.name, vscode.CompletionItemKind.Property, property.type);
    item.detail = property.type;
    return item;
  });
}

function createCompletion(label: string, kind: vscode.CompletionItemKind, detail?: string): vscode.CompletionItem {
  const item = new vscode.CompletionItem(label, kind);
  item.detail = detail;
  return item;
}

function completionKind(symbol: IndexedSymbol): vscode.CompletionItemKind {
  switch (symbol.kind) {
    case 'macro':
      return vscode.CompletionItemKind.Method;
    case 'function':
      return vscode.CompletionItemKind.Function;
    case 'import':
      return vscode.CompletionItemKind.Module;
    case 'parameter':
      return vscode.CompletionItemKind.Variable;
    default:
      return vscode.CompletionItemKind.Variable;
  }
}

function symbolKind(symbol: IndexedSymbol): vscode.SymbolKind {
  switch (symbol.kind) {
    case 'macro':
      return vscode.SymbolKind.Method;
    case 'function':
      return vscode.SymbolKind.Function;
    case 'import':
      return vscode.SymbolKind.Namespace;
    case 'parameter':
      return vscode.SymbolKind.Variable;
    default:
      return vscode.SymbolKind.Variable;
  }
}

function dedupeCompletions(items: vscode.CompletionItem[], prefix: string): vscode.CompletionItem[] {
  const seen = new Set<string>();
  const lowerPrefix = prefix.toLowerCase();
  return items.filter(item => {
    const label = typeof item.label === 'string' ? item.label : item.label.label;
    if (lowerPrefix && !label.toLowerCase().startsWith(lowerPrefix)) {
      return false;
    }
    if (seen.has(label)) {
      return false;
    }
    seen.add(label);
    return true;
  });
}

async function pathCompletions(
  document: vscode.TextDocument,
  offset: number,
  templateRoots: string[]
): Promise<vscode.CompletionItem[]> {
  const pathPrefix = readPathPrefix(document.getText(), offset);
  const bases = new Set<string>();
  if (document.uri.scheme === 'file') {
    bases.add(path.dirname(document.uri.fsPath));
  }
  templateRoots.forEach(root => bases.add(root));

  const directoryPart = pathPrefix.includes('/') ? path.dirname(pathPrefix) : '';
  const filenamePrefix = pathPrefix.includes('/') ? path.basename(pathPrefix) : pathPrefix;
  const completions: vscode.CompletionItem[] = [];

  for (const base of bases) {
    const directory = path.resolve(base, directoryPart);
    try {
      const entries = await fs.promises.readdir(directory, { withFileTypes: true });
      entries.forEach(entry => {
        if (filenamePrefix && !entry.name.startsWith(filenamePrefix)) {
          return;
        }
        const item = createCompletion(
          entry.isDirectory() ? `${entry.name}/` : entry.name,
          entry.isDirectory() ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File
        );
        completions.push(item);
      });
    } catch {
      // Ignore roots that do not exist.
    }
  }

  return completions;
}

function htmlCompletions(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
  const virtual = createVirtualHtmlDocument(document);
  const htmlDocument = htmlLanguageService.parseHTMLDocument(virtual);
  const result = htmlLanguageService.doComplete(virtual, position, htmlDocument);
  return (result.items ?? []).map(convertHtmlCompletion);
}

function htmlHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
  const virtual = createVirtualHtmlDocument(document);
  const htmlDocument = htmlLanguageService.parseHTMLDocument(virtual);
  const hover = htmlLanguageService.doHover(virtual, position, htmlDocument);
  if (!hover?.contents) {
    return undefined;
  }

  const markdown = new vscode.MarkdownString();
  if (typeof hover.contents === 'string') {
    markdown.appendMarkdown(hover.contents);
  } else if (Array.isArray(hover.contents)) {
    hover.contents.forEach(part => {
      markdown.appendMarkdown(typeof part === 'string' ? part : part.value);
      markdown.appendMarkdown('\n');
    });
  } else {
    markdown.appendMarkdown(hover.contents.value);
  }

  return new vscode.Hover(markdown, hover.range ? new vscode.Range(
    new vscode.Position(hover.range.start.line, hover.range.start.character),
    new vscode.Position(hover.range.end.line, hover.range.end.character)
  ) : undefined);
}

function convertHtmlCompletion(item: HtmlCompletionItem): vscode.CompletionItem {
  const completion = new vscode.CompletionItem(
    item.label,
    convertHtmlCompletionKind(item.kind)
  );
  completion.detail = item.detail;
  if (typeof item.documentation === 'string') {
    completion.documentation = item.documentation;
  } else if (item.documentation && 'value' in item.documentation) {
    completion.documentation = new vscode.MarkdownString(item.documentation.value);
  }
  if (typeof item.insertText === 'string') {
    completion.insertText = item.insertText;
  }
  return completion;
}

function convertHtmlCompletionKind(kind?: HtmlCompletionItemKind): vscode.CompletionItemKind {
  switch (kind) {
    case HtmlCompletionItemKind.Property:
      return vscode.CompletionItemKind.Property;
    case HtmlCompletionItemKind.Value:
      return vscode.CompletionItemKind.Value;
    case HtmlCompletionItemKind.Reference:
      return vscode.CompletionItemKind.Reference;
    case HtmlCompletionItemKind.Color:
      return vscode.CompletionItemKind.Color;
    case HtmlCompletionItemKind.File:
      return vscode.CompletionItemKind.File;
    case HtmlCompletionItemKind.Folder:
      return vscode.CompletionItemKind.Folder;
    default:
      return vscode.CompletionItemKind.Text;
  }
}

function createVirtualHtmlDocument(document: vscode.TextDocument): TextDocument {
  const masked = maskFreeMarker(document.getText());
  return TextDocument.create(document.uri.toString(), 'html', document.version, masked);
}

function maskFreeMarker(content: string): string {
  return content.replace(/<#--[\s\S]*?-->|<\/?[#@][^>]*>|\$\{[^}]*\}|\[[#@][^\]]*\]|\[\/[#@]?[^\]]*\]/g, match =>
    match.replace(/[^\r\n]/g, ' ')
  );
}

function symbolHoverMarkdown(symbol: IndexedSymbol): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.appendCodeblock(symbol.detail ?? `${symbol.kind} ${symbol.name}`, 'ftl');
  if (symbol.type) {
    markdown.appendMarkdown(`\nType: \`${symbol.type}\``);
  }
  if (symbol.scope) {
    markdown.appendMarkdown(`\nScope: \`${symbol.scope}\``);
  }
  return markdown;
}

function findLinkAtPosition(links: TemplateLink[], position: vscode.Position): TemplateLink | undefined {
  return links.find(link => toSimpleRange(link.range).contains(position));
}

function toVsCodeRange(document: vscode.TextDocument, range: AnalyzerRange): vscode.Range {
  return document.validateRange(toSimpleRange(range));
}

function toSimpleRange(range: AnalyzerRange): vscode.Range {
  return new vscode.Range(
    new vscode.Position(Math.max(0, range.start.line - 1), Math.max(0, range.start.character - 1)),
    new vscode.Position(Math.max(0, range.end.line - 1), Math.max(0, range.end.character - 1))
  );
}

function readPathPrefix(content: string, offset: number): string {
  const before = content.slice(Math.max(0, offset - 300), offset);
  const match = before.match(/["']([^"']*)$/);
  return match?.[1] ?? '';
}

function findOpenCall(contentBeforeCursor: string): { name: string; argumentIndex: number } | undefined {
  const macroMatch = contentBeforeCursor.match(/<@([A-Za-z_.$][A-Za-z0-9_.$-]*)[^>]*$/);
  if (macroMatch) {
    return {
      name: macroMatch[1],
      argumentIndex: countArguments(contentBeforeCursor.slice(contentBeforeCursor.lastIndexOf(macroMatch[1]) + macroMatch[1].length))
    };
  }

  const functionMatch = contentBeforeCursor.match(/([A-Za-z_.$][A-Za-z0-9_.$-]*)\([^)]*$/);
  if (functionMatch) {
    return {
      name: functionMatch[1],
      argumentIndex: countArguments(contentBeforeCursor.slice(contentBeforeCursor.lastIndexOf('(') + 1))
    };
  }

  return undefined;
}

function countArguments(value: string): number {
  const commaCount = (value.match(/,/g) ?? []).length;
  const namedCount = (value.match(/\s[A-Za-z_][A-Za-z0-9_-]*\s*=/g) ?? []).length;
  return Math.max(commaCount, namedCount);
}

function signatureLabel(symbol: IndexedSymbol): string {
  if (symbol.kind === 'macro') {
    return `<@${symbol.name} ${(symbol.parameters ?? []).join(' ')}>`;
  }
  return `${symbol.name}(${(symbol.parameters ?? []).join(', ')})`;
}
