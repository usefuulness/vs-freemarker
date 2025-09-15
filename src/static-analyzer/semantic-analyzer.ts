import * as path from 'path';

import {
  TemplateNode,
  ASTNode,
  DirectiveNode,
  MacroNode,
  MacroCallNode,
  FunctionNode,
  VariableNode,
  AssignmentNode,
  InterpolationNode,
  ImportNode,
  IncludeNode,
  IfNode,
  ListNode,
  SwitchNode,
  ExpressionNode,
  BinaryExpressionNode,
  UnaryExpressionNode,
  LiteralNode,
  ListLiteralNode,
  HashLiteralNode,
  FunctionCallNode,
  PropertyAccessNode,
  BuiltInNode,
  ExistsNode,
  FallbackNode,
  LambdaExpressionNode
} from './parser';

import { FreeMarkerLexer } from './lexer';
import { FreeMarkerParser } from './parser';
import * as fs from 'fs';

import { SemanticInfo, VariableInfo, MacroInfo, FunctionInfo, ImportInfo } from './index';
import { ErrorReporter } from './error-reporter';
import { resolveTemplatePath } from './path-utils';

export interface Scope {
  type: 'global' | 'local' | 'macro' | 'function' | 'loop';
  name?: string;
  variables: Map<string, VariableInfo>;
  macros: Map<string, MacroInfo>;
  functions: Map<string, FunctionInfo>;
  parent?: Scope;
}

export interface SymbolTable {
  currentScope: Scope;
  globalScope: Scope;
}

export interface TypeInfo {
  type: string;
  nullable: boolean;
  enumerable?: boolean;
  properties?: Map<string, TypeInfo>;
}

interface AnalysisContext {
  filePath?: string;
  templateRoots: string[];
  visited?: Set<string>;
}

export class SemanticAnalyzer {
  private errorReporter?: ErrorReporter;
  private symbolTable: SymbolTable = {
    globalScope: {
      type: 'global',
      variables: new Map(),
      macros: new Map(),
      functions: new Map()
    },
    currentScope: {
      type: 'global',
      variables: new Map(),
      macros: new Map(),
      functions: new Map()
    }
  };
  
  private semanticInfo: SemanticInfo = {
    variables: new Map(),
    macros: new Map(),
    functions: new Map(),
    includes: [],
    imports: []
  };

  private errors: string[] = [];
  private warnings: string[] = [];

  private cache: Map<string, SemanticInfo> = new Map();
  private processing: Set<string> = new Set();
  private completed: Set<string> = new Set();
  private activeMacroNodes: Set<MacroNode> = new Set();
  private context: AnalysisContext = {
    templateRoots: [],
    visited: new Set<string>()
  };
  private unresolvedMacroCalls: { node: MacroCallNode; name: string }[] = [];

  public setErrorReporter(errorReporter: ErrorReporter): void {
    this.errorReporter = errorReporter;
  }

  public analyze(ast: TemplateNode, filePath?: string, context?: AnalysisContext): SemanticInfo {
    const previousContext = this.context;
    const activeFilePath = filePath ?? context?.filePath;
    this.context = {
      filePath: activeFilePath,
      templateRoots: context?.templateRoots ?? previousContext.templateRoots ?? [],
      visited: context?.visited ?? new Set<string>()
    };

    const normalizedPath = activeFilePath ? this.normalizePath(activeFilePath) : undefined;
    const isRootAnalysis = this.processing.size === 0;

    if (isRootAnalysis) {
      this.completed.clear();
    }

    if (normalizedPath && this.processing.has(normalizedPath)) {
      const message = `Circular dependency detected while analyzing '${normalizedPath}'`;
      this.errors = [message];
      this.warnings = [];

      const cached = this.cache.get(normalizedPath);
      if (cached) {
        this.semanticInfo = cached;
        return cached;
      }

      const emptyInfo = this.createEmptySemanticInfo();
      this.semanticInfo = emptyInfo;
      return emptyInfo;
    }

    if (normalizedPath && this.completed.has(normalizedPath)) {
      const cached = this.cache.get(normalizedPath);
      if (cached) {
        this.errors = [];
        this.warnings = [];
        this.semanticInfo = cached;
        this.completed.add(normalizedPath);
        return cached;
      }
    }

    this.initializeAnalysis();

    if (normalizedPath) {
      this.processing.add(normalizedPath);
    }

    try {
      if (ast) {
        this.analyzeNode(ast);
      }
    } finally {
      if (normalizedPath) {
        this.processing.delete(normalizedPath);
        this.completed.add(normalizedPath);
        this.cache.set(normalizedPath, this.semanticInfo);
      }
      this.context = previousContext;
    }

    this.reportUnresolvedMacros();

    return this.semanticInfo;
  }

  private initializeAnalysis(): void {
    const globalScope: Scope = {
      type: 'global',
      variables: new Map(),
      macros: new Map(),
      functions: new Map()
    };
    
    this.symbolTable = {
      globalScope,
      currentScope: globalScope
    };

    this.semanticInfo = this.createEmptySemanticInfo();

    this.errors = [];
    this.warnings = [];
    this.addBuiltinSymbols();
    this.activeMacroNodes.clear();
    this.unresolvedMacroCalls = [];
  }

  private reportUnresolvedMacros(): void {
    if (!this.unresolvedMacroCalls.length) {
      return;
    }

    this.unresolvedMacroCalls.forEach(({ node, name }) => {
      if (!this.semanticInfo.macros.has(name)) {
        const message = `Undefined macro: ${name}`;
        this.errors.push(message);
        this.errorReporter?.addError(message, node.range, 'FTL2004');
      }
    });

    this.unresolvedMacroCalls = [];
  }

  private createEmptySemanticInfo(): SemanticInfo {
    return {
      variables: new Map(),
      macros: new Map(),
      functions: new Map(),
      includes: [],
      imports: []
    };

  }

  private addBuiltinSymbols(): void {
    // Add FreeMarker built-in functions
    const builtinFunctions = [
      'c', 'cap_first', 'capitalize', 'chop_linebreak', 'date', 'datetime', 'ends_with',
      'ensure_ends_with', 'ensure_starts_with', 'html', 'index_of', 'j_string',
      'js_string', 'json_string', 'keep_after', 'keep_after_last', 'keep_before',
      'keep_before_last', 'last_index_of', 'left_pad', 'length', 'lower_case',
      'ltrim', 'matches', 'number', 'number_to_date', 'number_to_datetime',
      'number_to_time', 'remove_beginning', 'remove_ending', 'replace', 'right_pad',
      'round', 'rtrim', 'size', 'sort', 'sort_by', 'split', 'starts_with', 'string',
      'substring', 'time', 'trim', 'uncap_first', 'upper_case', 'url', 'word_list',
      'xhtml', 'xml'
    ];

    builtinFunctions.forEach(name => {
      const functionInfo: FunctionInfo = {
        name,
        parameters: [],
        returnType: 'any',
        definedAt: { line: 0, character: 0, offset: 0 },
        usages: []
      };
      this.symbolTable.globalScope.functions.set(name, functionInfo);
    });

    // Add built-in variables
    const builtinVariables = [
      '.now', '.data_model', '.globals', '.locals', '.main', '.namespace',
      '.node', '.output_encoding', '.template_name', '.url_escaping_charset',
      '.vars', '.version'
    ];

    builtinVariables.forEach(name => {
      const variableInfo: VariableInfo = {
        name,
        type: 'any',
        scope: 'global',
        definedAt: { line: 0, character: 0, offset: 0 },
        usages: []
      };
      this.symbolTable.globalScope.variables.set(name, variableInfo);
    });
  }

  private analyzeNode(node: ASTNode): void {
    if (!node) return;

    switch (node.type) {
      case 'Template':
        this.analyzeTemplate(node as TemplateNode);
        break;
      case 'Assignment':
        this.analyzeAssignment(node as AssignmentNode);
        break;
      case 'Macro':
        this.analyzeMacro(node as MacroNode);
        break;
      case 'Function':
        this.analyzeFunction(node as FunctionNode);
        break;
      case 'If':
        this.analyzeIf(node as IfNode);
        break;
      case 'List':
        this.analyzeList(node as ListNode);
        break;
      case 'Switch':
        this.analyzeSwitch(node as SwitchNode);
        break;
      case 'Interpolation':
        this.analyzeInterpolation(node as InterpolationNode);
        break;
      case 'Import':
        this.analyzeImport(node as ImportNode);
        break;
      case 'Include':
        this.analyzeInclude(node as IncludeNode);
        break;
      case 'MacroCall':
        this.analyzeMacroCall(node as MacroCallNode);
        break;
      case 'Directive':
        this.analyzeDirective(node as DirectiveNode);
        break;
      default:
        // Handle other node types or ignore
        break;
    }
  }

  private analyzeTemplate(node: TemplateNode): void {
    // Process imports first
    node.imports.forEach(importNode => this.analyzeImport(importNode));

    // Process includes
    node.includes.forEach(includeNode => this.analyzeInclude(includeNode));

    // Predeclare macros and functions so they are available regardless of order
    node.body.forEach(child => {
      switch (child.type) {
        case 'Macro':
          this.declareMacro(child as MacroNode);
          break;
        case 'Function':
          this.declareFunction(child as FunctionNode);
          break;
      }
    });

    const macroSnapshot = new Map(this.symbolTable.currentScope.macros);
    node.body.forEach(child => {
      if (child.type === 'Macro') {
        const macro = this.symbolTable.currentScope.macros.get((child as MacroNode).name);
        if (macro) {
          macro.contextMacros = new Map(macroSnapshot);
        }
      }
    });

    // Process the body
    node.body.forEach(child => this.analyzeNode(child));
  }

  private analyzeAssignment(node: AssignmentNode): void {
    const valueType = this.analyzeExpression(node.value);

    const variableInfo: VariableInfo = {
      name: node.variable,
      type: valueType.type,
      scope: node.scope === 'local' ? 'local' : 'global',
      definedAt: node.position,
      usages: []
    };

    this.symbolTable.currentScope.variables.set(node.variable, variableInfo);
    this.semanticInfo.variables.set(node.variable, variableInfo);
  }

  private declareMacro(node: MacroNode): MacroInfo {
    let macroInfo = this.symbolTable.currentScope.macros.get(node.name);
    if (!macroInfo) {
      macroInfo = {
        name: node.name,
        parameters: node.parameters,
        definedAt: node.position,
        usages: [],
        node,
        contextMacros: new Map()
      };

      this.symbolTable.currentScope.macros.set(node.name, macroInfo);
      this.semanticInfo.macros.set(node.name, macroInfo);
    } else {
      macroInfo.parameters = node.parameters;
      macroInfo.definedAt = node.position;
      macroInfo.node = node;
    }

    return macroInfo;
  }

  private analyzeMacro(node: MacroNode): void {
    const macroInfo = this.declareMacro(node);

    // Create a new scope for the macro
    const parentScope = this.symbolTable.currentScope;
    const macroScope: Scope = {
      type: 'macro',
      name: node.name,
      variables: new Map(),
      macros: new Map(),
      functions: new Map(),
      parent: parentScope
    };

    if (macroInfo.contextMacros) {
      macroInfo.contextMacros.forEach((ctxMacro, macroName) => {
        if (!macroScope.macros.has(macroName)) {
          macroScope.macros.set(macroName, ctxMacro);
        }
      });
    }

    parentScope.macros.forEach((availableMacro, macroName) => {
      if (!macroScope.macros.has(macroName)) {
        macroScope.macros.set(macroName, availableMacro);
      }
    });

    // Add parameters as local variables
    node.parameters.forEach(param => {
      const paramInfo: VariableInfo = {
        name: param,
        type: 'any',
        scope: 'local',
        definedAt: node.position,
        usages: []
      };
      macroScope.variables.set(param, paramInfo);
    });

    const previousScope = this.symbolTable.currentScope;
    this.symbolTable.currentScope = macroScope;

    // Analyze macro body
    node.body.forEach(child => this.analyzeNode(child));

    this.symbolTable.currentScope = previousScope;
  }

  private declareFunction(node: FunctionNode): FunctionInfo {
    let functionInfo = this.symbolTable.currentScope.functions.get(node.name);
    if (!functionInfo) {
      functionInfo = {
        name: node.name,
        parameters: node.parameters,
        returnType: node.returnType || 'any',
        definedAt: node.position,
        usages: []
      };

      this.symbolTable.currentScope.functions.set(node.name, functionInfo);
      this.semanticInfo.functions.set(node.name, functionInfo);
    } else {
      functionInfo.parameters = node.parameters;
      functionInfo.returnType = node.returnType || functionInfo.returnType;
      functionInfo.definedAt = node.position;
    }

    return functionInfo;
  }

  private analyzeFunction(node: FunctionNode): void {
    this.declareFunction(node);

    // Create a new scope for the function
    const functionScope: Scope = {
      type: 'function',
      name: node.name,
      variables: new Map(),
      macros: new Map(),
      functions: new Map(),
      parent: this.symbolTable.currentScope
    };

    // Add parameters as local variables
    node.parameters.forEach(param => {
      const paramInfo: VariableInfo = {
        name: param,
        type: 'any',
        scope: 'local',
        definedAt: node.position,
        usages: []
      };
      functionScope.variables.set(param, paramInfo);
    });

    const previousScope = this.symbolTable.currentScope;
    this.symbolTable.currentScope = functionScope;

    // Analyze function body
    node.body.forEach(child => this.analyzeNode(child));

    this.symbolTable.currentScope = previousScope;
  }

  private analyzeIf(node: IfNode): void {
    this.analyzeExpression(node.condition);

    const definedVars = this.extractDefinedVariables(node.condition);

    // Create new scope for then branch
    const thenScope: Scope = {
      type: 'local',
      variables: new Map(),
      macros: new Map(),
      functions: new Map(),
      parent: this.symbolTable.currentScope
    };

    definedVars.forEach(name => {
      const varInfo: VariableInfo = {
        name,
        type: 'any',
        scope: 'local',
        definedAt: node.position,
        usages: []
      };
      thenScope.variables.set(name, varInfo);
    });

    const previousScope = this.symbolTable.currentScope;
    this.symbolTable.currentScope = thenScope;
    node.thenBody.forEach(child => this.analyzeNode(child));
    this.symbolTable.currentScope = previousScope;

    // Analyze else branch if it exists
    if (node.elseBody) {
      const elseScope: Scope = {
        type: 'local',
        variables: new Map(),
        macros: new Map(),
        functions: new Map(),
        parent: this.symbolTable.currentScope
      };

      this.symbolTable.currentScope = elseScope;
      node.elseBody.forEach(child => this.analyzeNode(child));
      this.symbolTable.currentScope = previousScope;
    }
  }

  private analyzeList(node: ListNode): void {
    this.analyzeExpression(node.iterable);

    // Create new scope for list iteration
    const loopScope: Scope = {
      type: 'loop',
      variables: new Map(),
      macros: new Map(),
      functions: new Map(),
      parent: this.symbolTable.currentScope
    };

    // Add loop variables
    if (node.key) {
      const keyInfo: VariableInfo = {
        name: node.key,
        type: 'any',
        scope: 'loop',
        definedAt: node.position,
        usages: []
      };
      loopScope.variables.set(node.key, keyInfo);
    }

    const itemInfo: VariableInfo = {
      name: node.item,
      type: 'any',
      scope: 'loop',
      definedAt: node.position,
      usages: []
    };
    loopScope.variables.set(node.item, itemInfo);

    const previousScope = this.symbolTable.currentScope;
    this.symbolTable.currentScope = loopScope;
    node.body.forEach(child => this.analyzeNode(child));
    this.symbolTable.currentScope = previousScope;
  }

  private analyzeSwitch(node: SwitchNode): void {
    this.analyzeExpression(node.expression);

    // Analyze each case
    node.cases.forEach(caseNode => {
      this.analyzeExpression(caseNode.value);
      caseNode.body.forEach(child => this.analyzeNode(child));
    });

    // Analyze default case if present
    if (node.defaultCase) {
      node.defaultCase.forEach(child => this.analyzeNode(child));
    }
  }

  private analyzeInterpolation(node: InterpolationNode): void {
    this.analyzeExpression(node.expression);
  }

  private analyzeMacroCall(node: MacroCallNode): void {
    if (node.name === 'import' || node.name === 'include') {
      node.parameters.forEach(param => this.analyzeExpression(param.value));
      return;
    }

    node.parameters.forEach(param => this.analyzeExpression(param.value));

    let macro = this.findMacro(node.name);
    if (!macro) {
      macro = this.semanticInfo.macros.get(node.name);
    }
    if (macro && macro.node) {
      macro.usages.push(node.position);
      const macroNode = macro.node;

      if (this.activeMacroNodes.has(macroNode)) {
        return;
      }

      this.activeMacroNodes.add(macroNode);
      const macroScope: Scope = {
        type: 'macro',
        name: macro.name,
        variables: new Map(),
        macros: new Map(),
        functions: new Map(),
        parent: this.symbolTable.currentScope
      };

      if (macro.contextMacros) {
        macro.contextMacros.forEach((availableMacro, macroName) => {
          if (!macroScope.macros.has(macroName)) {
            macroScope.macros.set(macroName, availableMacro);
          }
        });
      }

      const positionalArgs = node.parameters.filter(param => !param.name);
      let positionalIndex = 0;

      macro.parameters.forEach(paramName => {
        const namedArg = node.parameters.find(param => param.name === paramName);
        let argument = namedArg;
        if (!argument && positionalIndex < positionalArgs.length) {
          argument = positionalArgs[positionalIndex];
          positionalIndex++;
        }

        const definedAt = argument?.value?.position ?? node.position;
        const paramInfo: VariableInfo = {
          name: paramName,
          type: 'any',
          scope: 'local',
          definedAt,
          usages: []
        };
        macroScope.variables.set(paramName, paramInfo);
      });

      const previousScope = this.symbolTable.currentScope;
      this.symbolTable.currentScope = macroScope;
      try {
        macroNode.body.forEach(child => this.analyzeNode(child));
      } finally {
        this.symbolTable.currentScope = previousScope;
        this.activeMacroNodes.delete(macroNode);
      }

      // Promote variables defined in macro scope to current scope
      macroScope.variables.forEach((info, name) => {
        if (!previousScope.variables.has(name)) {
          previousScope.variables.set(name, info);
          this.semanticInfo.variables.set(name, info);
        }
      });
    } else {
      this.unresolvedMacroCalls.push({ node, name: node.name });
    }
  }

  private analyzeImport(node: ImportNode): void {
    const resolvedPath = node.resolvedPath ?? this.resolveTemplateReference(node.path);
    const importInfo: ImportInfo = {
      path: node.path,
      alias: node.alias,
      resolvedPath
    };
    this.semanticInfo.imports.push(importInfo);

    if (!resolvedPath) {
      return;
    }

    node.resolvedPath = resolvedPath;

    const info = this.loadExternalTemplate(resolvedPath);
    if (!info) {
      return;
    }

    const importedMacros = new Map(info.macros);
    info.macros.forEach(macro => {
      macro.contextMacros?.forEach((ctxMacro, ctxName) => {
        if (!importedMacros.has(ctxName)) {
          importedMacros.set(ctxName, ctxMacro);
        }
      });
    });

    info.macros.forEach((m, name) => {
      const namespaced = node.alias ? `${node.alias}.${name}` : name;
      const macroContext = new Map(importedMacros);
      m.contextMacros?.forEach((ctxMacro, ctxName) => {
        macroContext.set(ctxName, ctxMacro);
      });
      const macroInfo: MacroInfo = { ...m, name: namespaced, contextMacros: macroContext };
      this.symbolTable.currentScope.macros.set(namespaced, macroInfo);
      this.semanticInfo.macros.set(namespaced, macroInfo);
    });
  }

  private analyzeInclude(node: IncludeNode): void {
    this.semanticInfo.includes.push(node.path);

    const resolvedPath = node.resolvedPath ?? this.resolveTemplateReference(node.path);
    if (!resolvedPath) {
      return;
    }

    node.resolvedPath = resolvedPath;

    const info = this.loadExternalTemplate(resolvedPath);
    if (!info) {
      return;
    }

    const includedMacros = new Map(info.macros);
    info.macros.forEach(macro => {
      macro.contextMacros?.forEach((ctxMacro, ctxName) => {
        if (!includedMacros.has(ctxName)) {
          includedMacros.set(ctxName, ctxMacro);
        }
      });
    });

    info.macros.forEach((macro, name) => {
      const macroContext = new Map(includedMacros);
      macro.contextMacros?.forEach((ctxMacro, ctxName) => {
        macroContext.set(ctxName, ctxMacro);
      });
      const macroInfo: MacroInfo = { ...macro, name, contextMacros: macroContext };
      this.symbolTable.currentScope.macros.set(name, macroInfo);
      this.semanticInfo.macros.set(name, macroInfo);
    });

    info.functions.forEach((fn, name) => {
      const functionInfo: FunctionInfo = { ...fn, name };
      this.symbolTable.currentScope.functions.set(name, functionInfo);
      this.semanticInfo.functions.set(name, functionInfo);
    });

    info.variables.forEach((variable, name) => {
      if (!this.symbolTable.currentScope.variables.has(name)) {
        const variableInfo: VariableInfo = { ...variable, name };
        this.symbolTable.currentScope.variables.set(name, variableInfo);
        this.semanticInfo.variables.set(name, variableInfo);
      }
    });
  }

  private analyzeDirective(node: DirectiveNode): void {
    // Analyze directive parameters
    node.parameters.forEach(param => {
      if (param.value) {
        this.analyzeExpression(param.value);
      }
    });

    // Analyze directive body if present
    if (node.body) {
      node.body.forEach(child => this.analyzeNode(child));
    }
  }

  private analyzeExpression(expr: ExpressionNode, ignoreUndefined = false): TypeInfo {
    switch (expr.type) {
      case 'Variable':
        return this.analyzeVariableReference(expr as VariableNode, ignoreUndefined);
      case 'Literal':
        return this.analyzeLiteral(expr as LiteralNode);
      case 'BinaryExpression':
        return this.analyzeBinaryExpression(expr as BinaryExpressionNode);
      case 'UnaryExpression':
        return this.analyzeUnaryExpression(expr as UnaryExpressionNode);
      case 'FunctionCall':
        return this.analyzeFunctionCall(expr as FunctionCallNode);
      case 'PropertyAccess':
        return this.analyzePropertyAccess(expr as PropertyAccessNode);
      case 'BuiltIn':
        return this.analyzeBuiltIn(expr as BuiltInNode);
      case 'Exists':
        return this.analyzeExists(expr as ExistsNode);
      case 'Fallback':
        return this.analyzeFallback(expr as FallbackNode);
      case 'ListLiteral':
        return this.analyzeListLiteral(expr as ListLiteralNode);
      case 'HashLiteral':
        return this.analyzeHashLiteral(expr as HashLiteralNode);
      case 'Lambda':
        return this.analyzeLambda(expr as LambdaExpressionNode);
      default:
        return { type: 'unknown', nullable: true };
    }
  }

  private analyzeVariableReference(node: VariableNode, ignoreUndefined: boolean): TypeInfo {
    const variable = this.findVariable(node.name);
    if (variable) {
      variable.usages.push(node.position);
      return { type: variable.type, nullable: false };
    } else {
      if (!ignoreUndefined) {
        const message = `Undefined variable: ${node.name}`;
        this.errors.push(message);
        if (this.errorReporter) {
          this.errorReporter.addError(message, node.range, 'FTL2001');
        }
      }
      return { type: 'unknown', nullable: true };
    }
  }

  private analyzeLiteral(node: LiteralNode): TypeInfo {
    return { type: node.dataType, nullable: false };
  }

  private analyzeListLiteral(node: ListLiteralNode): TypeInfo {
    node.items.forEach(item => this.analyzeExpression(item));
    return { type: 'sequence', nullable: false, enumerable: true };
  }

  private analyzeHashLiteral(node: HashLiteralNode): TypeInfo {
    node.entries.forEach(entry => {
      if (entry.keyExpression) {
        this.analyzeExpression(entry.keyExpression);
      }
      this.analyzeExpression(entry.value);
    });

    return { type: 'hash', nullable: false };
  }

  private analyzeBinaryExpression(node: BinaryExpressionNode): TypeInfo {
    const leftType = this.analyzeExpression(node.left);
    const rightType = this.analyzeExpression(node.right);
    
    // Simple type inference based on operators
    switch (node.operator) {
      case '+':
      case '-':
      case '*':
      case '/':
      case '%':
        if (leftType.type === 'number' && rightType.type === 'number') {
          return { type: 'number', nullable: false };
        }
        if (node.operator === '+' && (leftType.type === 'string' || rightType.type === 'string')) {
          return { type: 'string', nullable: false };
        }
        return { type: 'unknown', nullable: true };
      case '==':
      case '!=':
      case '<':
      case '>':
      case '<=':
      case '>=':
      case '&&':
      case '||':
        return { type: 'boolean', nullable: false };
      default:
        return { type: 'unknown', nullable: true };
    }
  }

  private analyzeUnaryExpression(node: UnaryExpressionNode): TypeInfo {
    const operandType = this.analyzeExpression(node.operand);
    
    switch (node.operator) {
      case '!':
        return { type: 'boolean', nullable: false };
      case '-':
      case '+':
        return { type: 'number', nullable: operandType.nullable };
      default:
        return operandType;
    }
  }

  private analyzeFunctionCall(node: FunctionCallNode): TypeInfo {
    const functionInfo = this.findFunction(node.name);
    if (functionInfo) {
      functionInfo.usages.push(node.position);
      
      // Analyze arguments
      node.arguments.forEach(arg => this.analyzeExpression(arg));

      return { type: functionInfo.returnType, nullable: false };
    } else {
      const message = `Undefined function: ${node.name}`;
      this.errors.push(message);
      if (this.errorReporter) {
        this.errorReporter.addError(message, node.range, 'FTL2003');
      }
      return { type: 'unknown', nullable: true };
    }
  }

  private analyzePropertyAccess(node: PropertyAccessNode): TypeInfo {
    this.analyzeExpression(node.object);
    // Simple property access - could be enhanced with more sophisticated type checking
    return { type: 'unknown', nullable: true };
  }

  private analyzeBuiltIn(node: BuiltInNode): TypeInfo {
    this.analyzeExpression(node.target, true);
    node.arguments?.forEach(arg => this.analyzeExpression(arg));

    switch (node.name) {
      case 'has_content':
        return { type: 'boolean', nullable: false };
      case 'string':
      case 'default':
        return { type: 'string', nullable: false };
      default:
        return { type: 'unknown', nullable: true };
    }
  }

  private analyzeExists(node: ExistsNode): TypeInfo {
    this.analyzeExpression(node.target, true);
    return { type: 'boolean', nullable: false };
  }

  private analyzeFallback(node: FallbackNode): TypeInfo {
    this.analyzeExpression(node.target, true);
    return this.analyzeExpression(node.fallback);
  }

  private analyzeLambda(node: LambdaExpressionNode): TypeInfo {
    const lambdaScope: Scope = {
      type: 'function',
      name: 'lambda',
      variables: new Map(),
      macros: new Map(),
      functions: new Map(),
      parent: this.symbolTable.currentScope
    };

    node.parameters.forEach(param => {
      if (!param) {
        return;
      }

      const paramInfo: VariableInfo = {
        name: param,
        type: 'any',
        scope: 'local',
        definedAt: node.position,
        usages: []
      };

      lambdaScope.variables.set(param, paramInfo);
    });

    const previousScope = this.symbolTable.currentScope;
    this.symbolTable.currentScope = lambdaScope;
    this.analyzeExpression(node.body);
    this.symbolTable.currentScope = previousScope;

    return { type: 'lambda', nullable: false };
  }

  private resolveTemplateReference(templatePath: string): string | undefined {
    return resolveTemplatePath(templatePath, {
      currentFile: this.context.filePath,
      templateRoots: this.context.templateRoots
    });
  }

  private loadExternalTemplate(filePath: string): SemanticInfo | undefined {
    const normalizedPath = path.normalize(filePath);

    if (this.context.visited?.has(normalizedPath)) {
      return undefined;
    }

    const visitedSet = this.context.visited;
    visitedSet?.add(normalizedPath);

    try {
      const content = fs.readFileSync(normalizedPath, 'utf8');
      const lexer = new FreeMarkerLexer();
      const tokens = lexer.tokenize(content);
      const parser = new FreeMarkerParser(tokens);
      const ast = parser.parse();
      const analyzer = new SemanticAnalyzer();
      analyzer.setErrorReporter(this.errorReporter ?? new ErrorReporter());
      return analyzer.analyze(ast, normalizedPath, {
        templateRoots: this.context.templateRoots,
        visited: visitedSet
      });
    } catch {
      return undefined;
    } finally {
      visitedSet?.delete(normalizedPath);
    }
  }

  private extractDefinedVariables(expr: ExpressionNode): string[] {
    const vars: string[] = [];
    const visit = (e: ExpressionNode): void => {
      switch (e.type) {
        case 'Exists': {
          const exists = e as ExistsNode;
          if (exists.target.type === 'Variable') {
            vars.push((exists.target as VariableNode).name);
          }
          break;
        }
        case 'BuiltIn': {
          const b = e as BuiltInNode;
          if (b.name === 'has_content' && b.target.type === 'Variable') {
            vars.push((b.target as VariableNode).name);
          }
          break;
        }
        case 'BinaryExpression': {
          visit((e as BinaryExpressionNode).left);
          visit((e as BinaryExpressionNode).right);
          break;
        }
      }
    };

    visit(expr);
    return vars;
  }

  private findVariable(name: string): VariableInfo | undefined {
    let currentScope: Scope | undefined = this.symbolTable.currentScope;
    
    while (currentScope) {
      const variable = currentScope.variables.get(name);
      if (variable) {
        return variable;
      }
      currentScope = currentScope.parent;
    }
    
    return undefined;
  }

  private findFunction(name: string): FunctionInfo | undefined {
    let currentScope: Scope | undefined = this.symbolTable.currentScope;
    
    while (currentScope) {
      const func = currentScope.functions.get(name);
      if (func) {
        return func;
      }
      currentScope = currentScope.parent;
    }
    
    return undefined;
  }

  private findMacro(name: string): MacroInfo | undefined {
    let currentScope: Scope | undefined = this.symbolTable.currentScope;
    
    while (currentScope) {
      const macro = currentScope.macros.get(name);
      if (macro) {
        return macro;
      }
      currentScope = currentScope.parent;
    }
    
    return undefined;
  }

  public getErrors(): string[] {
    return this.errors;
  }

  public getWarnings(): string[] {
    return this.warnings;
  }

  private normalizePath(filePath: string): string {
    return path.resolve(filePath).replace(/\\/g, '/');
  }
}
