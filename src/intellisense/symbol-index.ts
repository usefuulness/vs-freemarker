import {
  AnalysisResult,
  FunctionInfo,
  MacroInfo,
  Range,
  VariableInfo
} from '../static-analyzer';
import {
  ASTNode,
  AssignmentNode,
  BinaryExpressionNode,
  BuiltInNode,
  ExpressionNode,
  FallbackNode,
  FunctionCallNode,
  FunctionNode,
  HashLiteralNode,
  IfNode,
  ImportNode,
  IncludeNode,
  InterpolationNode,
  LiteralNode,
  ListLiteralNode,
  ListNode,
  MacroCallNode,
  MacroNode,
  ParameterNode,
  PropertyAccessNode,
  SwitchNode,
  TemplateNode,
  UnaryExpressionNode,
  VariableNode
} from '../static-analyzer/parser';

export type IndexedSymbolKind =
  | 'variable'
  | 'macro'
  | 'function'
  | 'parameter'
  | 'builtin'
  | 'import'
  | 'include'
  | 'property';

export interface IndexedProperty {
  name: string;
  type: string;
  range?: Range;
  properties: Map<string, IndexedProperty>;
  itemProperties?: Map<string, IndexedProperty>;
}

export interface IndexedSymbol {
  name: string;
  kind: IndexedSymbolKind;
  type?: string;
  scope?: string;
  detail?: string;
  documentation?: string;
  parameters?: string[];
  range?: Range;
  selectionRange?: Range;
  usages: Range[];
  properties: Map<string, IndexedProperty>;
  itemProperties?: Map<string, IndexedProperty>;
}

export interface TemplateLink {
  path: string;
  resolvedPath?: string;
  range: Range;
  kind: 'import' | 'include';
}

export interface SymbolIndex {
  symbols: Map<string, IndexedSymbol>;
  links: TemplateLink[];
  documentSymbols: IndexedSymbol[];
  builtins: string[];
  directives: string[];
}

const identifierPattern = '[A-Za-z_.$][A-Za-z0-9_.$-]*';

export const freeMarkerDirectiveNames = [
  'assign',
  'attempt',
  'break',
  'case',
  'compress',
  'default',
  'else',
  'elseif',
  'escape',
  'function',
  'global',
  'if',
  'include',
  'import',
  'list',
  'local',
  'macro',
  'nested',
  'noescape',
  'noparse',
  'recover',
  'return',
  'setting',
  'switch'
];

export const freeMarkerBuiltins = [
  'abs',
  'ancestors',
  'api',
  'boolean',
  'byte',
  'c',
  'cap_first',
  'capitalize',
  'children',
  'chop_linebreak',
  'contains',
  'date',
  'datetime',
  'double',
  'ends_with',
  'ensure_ends_with',
  'ensure_starts_with',
  'eval',
  'exists',
  'filter',
  'first',
  'float',
  'floor',
  'groups',
  'has_api',
  'has_content',
  'html',
  'if_exists',
  'index',
  'index_of',
  'int',
  'interpret',
  'is_boolean',
  'is_collection',
  'is_collection_ex',
  'is_date',
  'is_date_like',
  'is_directive',
  'is_enumerable',
  'is_even_item',
  'is_first',
  'is_hash',
  'is_hash_ex',
  'is_indexable',
  'is_infinite',
  'is_last',
  'is_macro',
  'is_method',
  'is_nan',
  'is_node',
  'is_number',
  'is_odd_item',
  'is_sequence',
  'is_string',
  'item_cycle',
  'item_parity',
  'item_parity_cap',
  'j_string',
  'join',
  'js_string',
  'json_string',
  'keep_after',
  'keep_after_last',
  'keep_before',
  'keep_before_last',
  'keys',
  'last',
  'last_index_of',
  'left_pad',
  'length',
  'long',
  'lower_abc',
  'lower_case',
  'map',
  'matches',
  'namespace',
  'new',
  'node_name',
  'node_namespace',
  'node_type',
  'number',
  'number_to_date',
  'number_to_datetime',
  'number_to_time',
  'parent',
  'reverse',
  'right_pad',
  'root',
  'round',
  'rtf',
  'seq_contains',
  'seq_index_of',
  'seq_last_index_of',
  'short',
  'size',
  'sort',
  'sort_by',
  'split',
  'starts_with',
  'string',
  'substring',
  'then',
  'time',
  'trim',
  'uncap_first',
  'upper_abc',
  'upper_case',
  'url',
  'url_path',
  'values',
  'web_safe',
  'word_list',
  'xhtml',
  'xml'
];

export function createSymbolIndex(content: string, result: AnalysisResult): SymbolIndex {
  const index: SymbolIndex = {
    symbols: new Map(),
    links: [],
    documentSymbols: [],
    builtins: freeMarkerBuiltins,
    directives: freeMarkerDirectiveNames
  };

  seedSemanticSymbols(index, result);

  if (result.ast) {
    visitNode(result.ast as TemplateNode, index, content);
  }

  return index;
}

export function getCompletionContext(content: string, offset: number): {
  kind: 'directive' | 'builtin' | 'property' | 'macro' | 'path' | 'default';
  receiver?: string;
  prefix: string;
} {
  const before = content.slice(Math.max(0, offset - 300), offset);
  const stringPathMatch = before.match(/<#(?:import|include)\s+["'][^"']*$/) ||
    before.match(/<#(?:import|include)\s+[^>]*(?:path|from)\s*=\s*["'][^"']*$/) ||
    before.match(/<@(?:import|include)\s+(?:path\s*=\s*)?["'][^"']*$/);
  if (stringPathMatch) {
    return { kind: 'path', prefix: readIdentifierPrefix(before) };
  }

  const directiveMatch = before.match(/(?:<#|\[#)([A-Za-z_]*)$/);
  if (directiveMatch) {
    return { kind: 'directive', prefix: directiveMatch[1] };
  }

  const macroMatch = before.match(/(?:<@|\[@)([A-Za-z_.$]*)$/);
  if (macroMatch) {
    return { kind: 'macro', prefix: macroMatch[1] };
  }

  const builtinMatch = before.match(/\?([A-Za-z_]*)$/);
  if (builtinMatch) {
    return { kind: 'builtin', prefix: builtinMatch[1] };
  }

  const propertyMatch = before.match(new RegExp(`(${identifierPattern})\\.([A-Za-z_$][A-Za-z0-9_$-]*)?$`));
  if (propertyMatch) {
    return {
      kind: 'property',
      receiver: propertyMatch[1],
      prefix: propertyMatch[2] ?? ''
    };
  }

  return { kind: 'default', prefix: readIdentifierPrefix(before) };
}

export function findSymbolAtOffset(index: SymbolIndex, content: string, offset: number): IndexedSymbol | undefined {
  const word = getWordAtOffset(content, offset);
  if (!word) {
    return undefined;
  }

  return index.symbols.get(word.text);
}

export function getWordAtOffset(content: string, offset: number): { text: string; start: number; end: number } | undefined {
  if (offset < 0 || offset > content.length) {
    return undefined;
  }

  const isWordChar = (value: string): boolean => /[A-Za-z0-9_.$-]/.test(value);
  let start = offset;
  let end = offset;

  if (start === content.length || !isWordChar(content[start])) {
    start--;
  }

  while (start >= 0 && isWordChar(content[start])) {
    start--;
  }
  start++;

  while (end < content.length && isWordChar(content[end])) {
    end++;
  }

  if (start >= end) {
    return undefined;
  }

  return { text: content.slice(start, end), start, end };
}

export function rangeFromOffset(content: string, offset: number, length: number): Range {
  const start = positionFromOffset(content, offset);
  const end = positionFromOffset(content, offset + length);
  return { start, end };
}

function seedSemanticSymbols(index: SymbolIndex, result: AnalysisResult): void {
  result.semanticInfo.variables.forEach((info, name) => {
    addOrUpdateSymbol(index, name, 'variable', {
      type: info.type,
      scope: info.scope,
      detail: `${info.scope} ${info.type}`,
      range: rangeFromPosition(info.definedAt, name.length),
      usages: info.usages.map(usage => rangeFromPosition(usage, name.length))
    });
  });

  result.semanticInfo.macros.forEach((info, name) => {
    addMacroInfo(index, name, info);
  });

  result.semanticInfo.functions.forEach((info, name) => {
    addFunctionInfo(index, name, info);
  });

  result.semanticInfo.imports.forEach(info => {
    if (info.alias) {
      addOrUpdateSymbol(index, info.alias, 'import', {
        detail: info.path,
        usages: []
      });
    }
  });
}

function addMacroInfo(index: SymbolIndex, name: string, info: MacroInfo): void {
  addOrUpdateSymbol(index, name, 'macro', {
    detail: `<@${name} ${info.parameters.join(' ')}>`,
    parameters: info.parameters,
    range: rangeFromPosition(info.definedAt, name.length),
    usages: info.usages.map(usage => rangeFromPosition(usage, name.length))
  });
}

function addFunctionInfo(index: SymbolIndex, name: string, info: FunctionInfo): void {
  addOrUpdateSymbol(index, name, 'function', {
    type: info.returnType,
    detail: `${name}(${info.parameters.join(', ')})`,
    parameters: info.parameters,
    range: rangeFromPosition(info.definedAt, name.length),
    usages: info.usages.map(usage => rangeFromPosition(usage, name.length))
  });
}

function addOrUpdateSymbol(
  index: SymbolIndex,
  name: string,
  kind: IndexedSymbolKind,
  updates: Partial<IndexedSymbol>
): IndexedSymbol {
  const existing = index.symbols.get(name);
  const symbol: IndexedSymbol = existing ?? {
    name,
    kind,
    usages: [],
    properties: new Map()
  };

  symbol.kind = kind;
  Object.assign(symbol, updates);
  symbol.usages = mergeRanges(existing?.usages ?? [], updates.usages ?? []);
  if (!symbol.properties) {
    symbol.properties = new Map();
  }

  index.symbols.set(name, symbol);
  return symbol;
}

function visitNode(node: ASTNode, index: SymbolIndex, content: string): void {
  switch (node.type) {
    case 'Template': {
      const template = node as TemplateNode;
      template.imports.forEach(importNode => visitNode(importNode, index, content));
      template.includes.forEach(includeNode => visitNode(includeNode, index, content));
      template.body.forEach(child => visitNode(child, index, content));
      break;
    }
    case 'Assignment':
      visitAssignment(node as AssignmentNode, index, content);
      break;
    case 'Macro':
      visitMacro(node as MacroNode, index, content);
      break;
    case 'Function':
      visitFunction(node as FunctionNode, index, content);
      break;
    case 'MacroCall':
      visitMacroCall(node as MacroCallNode, index, content);
      break;
    case 'Import':
      visitImport(node as ImportNode, index);
      break;
    case 'Include':
      visitInclude(node as IncludeNode, index);
      break;
    case 'Interpolation':
      visitExpression((node as InterpolationNode).expression, index, content);
      break;
    case 'If': {
      const ifNode = node as IfNode;
      visitExpression(ifNode.condition, index, content);
      ifNode.thenBody.forEach(child => visitNode(child, index, content));
      ifNode.elseBody?.forEach(child => visitNode(child, index, content));
      break;
    }
    case 'List':
      visitList(node as ListNode, index, content);
      break;
    case 'Switch': {
      const switchNode = node as SwitchNode;
      visitExpression(switchNode.expression, index, content);
      switchNode.cases.forEach(caseNode => {
        visitExpression(caseNode.value, index, content);
        caseNode.body.forEach(child => visitNode(child, index, content));
      });
      switchNode.defaultCase?.forEach(child => visitNode(child, index, content));
      break;
    }
    default:
      break;
  }
}

function visitAssignment(node: AssignmentNode, index: SymbolIndex, content: string): void {
  const variableRange = findNearestDeclarationRange(content, 'assign', node.variable, node.value?.range?.start?.offset);
  const symbol = addOrUpdateSymbol(index, node.variable, 'variable', {
    type: inferExpressionType(node.value),
    scope: node.scope === 'local' ? 'local' : 'global',
    detail: `${node.variable}: ${inferExpressionType(node.value)}`,
    range: variableRange,
    selectionRange: variableRange,
    usages: []
  });

  const shape = inferPropertyShape(node.value);
  if (shape) {
    symbol.properties = shape.properties;
    symbol.itemProperties = shape.itemProperties;
  }

  index.documentSymbols.push(symbol);
  visitExpression(node.value, index, content);
}

function visitMacro(node: MacroNode, index: SymbolIndex, content: string): void {
  const macroRange = findNamedDirectiveRange(content, 'macro', node.name);
  const symbol = addOrUpdateSymbol(index, node.name, 'macro', {
    detail: `<@${node.name} ${node.parameters.join(' ')}>`,
    parameters: node.parameters,
    range: macroRange,
    selectionRange: macroRange,
    usages: []
  });

  index.documentSymbols.push(symbol);
  node.parameters.forEach(parameter => {
    const parameterRange = macroRange
      ? findRangeAfterOffset(content, parameter, macroRange.end.offset)
      : findNamedDirectiveRange(content, 'macro', parameter);
    addOrUpdateSymbol(index, parameter, 'parameter', {
      type: 'any',
      scope: 'local',
      detail: `${node.name} parameter`,
      range: parameterRange,
      selectionRange: parameterRange,
      usages: []
    });
  });

  node.body.forEach(child => visitNode(child, index, content));
}

function visitFunction(node: FunctionNode, index: SymbolIndex, content: string): void {
  const functionRange = findNamedDirectiveRange(content, 'function', node.name);
  const symbol = addOrUpdateSymbol(index, node.name, 'function', {
    type: node.returnType ?? 'any',
    detail: `${node.name}(${node.parameters.join(', ')})`,
    parameters: node.parameters,
    range: functionRange,
    selectionRange: functionRange,
    usages: []
  });

  index.documentSymbols.push(symbol);
  node.parameters.forEach(parameter => {
    const parameterRange = functionRange
      ? findRangeAfterOffset(content, parameter, functionRange.end.offset)
      : undefined;
    addOrUpdateSymbol(index, parameter, 'parameter', {
      type: 'any',
      scope: 'local',
      detail: `${node.name} parameter`,
      range: parameterRange,
      selectionRange: parameterRange,
      usages: []
    });
  });

  node.body.forEach(child => visitNode(child, index, content));
}

function visitList(node: ListNode, index: SymbolIndex, content: string): void {
  visitExpression(node.iterable, index, content);
  const itemRange = findRangeAfterOffset(content, node.item, node.iterable.range?.end?.offset ?? 0);
  const itemSymbol = addOrUpdateSymbol(index, node.item, 'variable', {
    type: 'any',
    scope: 'loop',
    detail: 'loop item',
    range: itemRange,
    selectionRange: itemRange,
    usages: []
  });

  const iterableShape = getExpressionShape(node.iterable, index);
  if (iterableShape?.itemProperties) {
    itemSymbol.properties = iterableShape.itemProperties;
  }

  if (node.key) {
    const keyRange = findRangeAfterOffset(content, node.key, node.iterable.range?.end?.offset ?? 0);
    addOrUpdateSymbol(index, node.key, 'variable', {
      type: 'any',
      scope: 'loop',
      detail: 'loop key',
      range: keyRange,
      selectionRange: keyRange,
      usages: []
    });
  }

  node.body.forEach(child => visitNode(child, index, content));
}

function visitMacroCall(node: MacroCallNode, index: SymbolIndex, content: string): void {
  const usageRange = rangeFromPosition(node.position, node.name.length);
  const symbol = index.symbols.get(node.name);
  if (symbol) {
    symbol.usages = mergeRanges(symbol.usages, [usageRange]);
  }

  node.parameters.forEach(parameter => visitParameter(parameter, index, content));
  node.body?.forEach(child => visitNode(child, index, content));
}

function visitImport(node: ImportNode, index: SymbolIndex): void {
  index.links.push({
    path: node.path,
    resolvedPath: node.resolvedPath,
    range: node.range,
    kind: 'import'
  });

  if (node.alias) {
    addOrUpdateSymbol(index, node.alias, 'import', {
      detail: node.path,
      range: node.range,
      selectionRange: node.range,
      usages: []
    });
  }
}

function visitInclude(node: IncludeNode, index: SymbolIndex): void {
  index.links.push({
    path: node.path,
    resolvedPath: node.resolvedPath,
    range: node.range,
    kind: 'include'
  });
}

function visitParameter(parameter: ParameterNode, index: SymbolIndex, content: string): void {
  if (parameter.value) {
    visitExpression(parameter.value, index, content);
  }
}

function visitExpression(expr: ExpressionNode | undefined, index: SymbolIndex, content: string): void {
  if (!expr) {
    return;
  }

  switch (expr.type) {
    case 'Variable': {
      const variable = expr as VariableNode;
      const symbol = index.symbols.get(variable.name);
      if (symbol) {
        symbol.usages = mergeRanges(symbol.usages, [variable.range]);
      }
      break;
    }
    case 'FunctionCall': {
      const call = expr as FunctionCallNode;
      const symbol = index.symbols.get(call.name);
      if (symbol) {
        symbol.usages = mergeRanges(symbol.usages, [rangeFromPosition(call.position, call.name.length)]);
      }
      call.arguments.forEach(argument => visitExpression(argument, index, content));
      break;
    }
    case 'PropertyAccess':
      visitExpression((expr as PropertyAccessNode).object, index, content);
      break;
    case 'BuiltIn': {
      const builtIn = expr as BuiltInNode;
      visitExpression(builtIn.target, index, content);
      builtIn.arguments?.forEach(argument => visitExpression(argument, index, content));
      break;
    }
    case 'BinaryExpression': {
      const binary = expr as BinaryExpressionNode;
      visitExpression(binary.left, index, content);
      visitExpression(binary.right, index, content);
      break;
    }
    case 'UnaryExpression':
      visitExpression((expr as UnaryExpressionNode).operand, index, content);
      break;
    case 'Fallback': {
      const fallback = expr as FallbackNode;
      visitExpression(fallback.target, index, content);
      visitExpression(fallback.fallback, index, content);
      break;
    }
    case 'ListLiteral':
      (expr as ListLiteralNode).items.forEach(item => visitExpression(item, index, content));
      break;
    case 'HashLiteral':
      (expr as HashLiteralNode).entries.forEach(entry => {
        visitExpression(entry.keyExpression, index, content);
        visitExpression(entry.value, index, content);
      });
      break;
    default:
      break;
  }
}

function inferExpressionType(expr: ExpressionNode | undefined): string {
  if (!expr) {
    return 'any';
  }

  switch (expr.type) {
    case 'Literal':
      return (expr as LiteralNode).dataType ?? 'any';
    case 'HashLiteral':
      return 'hash';
    case 'ListLiteral':
      return 'sequence';
    case 'FunctionCall':
      return 'function-result';
    default:
      return 'any';
  }
}

function inferPropertyShape(expr: ExpressionNode | undefined): IndexedProperty | undefined {
  if (!expr) {
    return undefined;
  }

  if (expr.type === 'HashLiteral') {
    const root = createProperty('(hash)', 'hash', expr.range);
    (expr as HashLiteralNode).entries.forEach(entry => {
      if (!entry.key) {
        return;
      }
      const nested = inferPropertyShape(entry.value);
      const prop = nested ?? createProperty(entry.key, inferExpressionType(entry.value), entry.range);
      prop.name = entry.key;
      prop.range = entry.range;
      root.properties.set(entry.key, prop);
    });
    return root;
  }

  if (expr.type === 'ListLiteral') {
    const root = createProperty('(sequence)', 'sequence', expr.range);
    const firstHash = (expr as ListLiteralNode).items.find(item => item.type === 'HashLiteral');
    const itemShape = inferPropertyShape(firstHash);
    if (itemShape) {
      root.itemProperties = itemShape.properties;
    }
    return root;
  }

  return undefined;
}

function getExpressionShape(expr: ExpressionNode, index: SymbolIndex): IndexedSymbol | undefined {
  if (expr.type === 'Variable') {
    return index.symbols.get((expr as VariableNode).name);
  }

  return undefined;
}

function createProperty(name: string, type: string, range?: Range): IndexedProperty {
  return {
    name,
    type,
    range,
    properties: new Map()
  };
}

function findNamedDirectiveRange(content: string, directive: string, name: string): Range | undefined {
  const regex = new RegExp(`<#\\s*${escapeRegExp(directive)}\\s+(${escapeRegExp(name)})(?=\\s|>|/)`, 'g');
  const match = regex.exec(content);
  if (!match || match.index === undefined) {
    return undefined;
  }

  const offset = match.index + match[0].lastIndexOf(name);
  return rangeFromOffset(content, offset, name.length);
}

function findNearestDeclarationRange(
  content: string,
  directive: string,
  name: string,
  beforeOffset?: number
): Range | undefined {
  const regex = new RegExp(`<#\\s*${escapeRegExp(directive)}\\s+(${escapeRegExp(name)})(?=\\s*=|=|\\s)`, 'g');
  let selected: RegExpExecArray | undefined;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content))) {
    if (beforeOffset === undefined || match.index < beforeOffset) {
      selected = match;
    } else {
      break;
    }
  }

  if (!selected) {
    return undefined;
  }

  const offset = selected.index + selected[0].lastIndexOf(name);
  return rangeFromOffset(content, offset, name.length);
}

function findRangeAfterOffset(content: string, name: string, offset: number): Range | undefined {
  const regex = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g');
  regex.lastIndex = Math.max(0, offset);
  const match = regex.exec(content);
  if (!match) {
    return undefined;
  }

  return rangeFromOffset(content, match.index, name.length);
}

function rangeFromPosition(position: VariableInfo['definedAt'], length: number): Range {
  return {
    start: position,
    end: {
      line: position.line,
      character: position.character + length,
      offset: position.offset + length
    }
  };
}

function positionFromOffset(content: string, offset: number): Range['start'] {
  const safeOffset = Math.max(0, Math.min(offset, content.length));
  let line = 1;
  let lineStart = 0;

  for (let i = 0; i < safeOffset; i++) {
    if (content.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }

  return {
    line,
    character: safeOffset - lineStart + 1,
    offset: safeOffset
  };
}

function readIdentifierPrefix(value: string): string {
  const match = value.match(/[A-Za-z_.$-][A-Za-z0-9_.$-]*$/);
  return match?.[0] ?? '';
}

function mergeRanges(left: Range[], right: Range[]): Range[] {
  const merged = [...left];
  const seen = new Set(left.map(rangeKey));

  right.forEach(range => {
    const key = rangeKey(range);
    if (!seen.has(key)) {
      merged.push(range);
      seen.add(key);
    }
  });

  return merged;
}

function rangeKey(range: Range): string {
  return `${range.start.offset}:${range.end.offset}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
