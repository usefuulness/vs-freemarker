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
  FunctionCallNode,
  PropertyAccessNode,
  BuiltInNode,
  ExistsNode,
  FallbackNode
} from './parser';

import { FreeMarkerLexer } from './lexer';
import { FreeMarkerParser } from './parser';
import * as fs from 'fs';
import * as path from 'path';

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
  private context: AnalysisContext = { templateRoots: [] };

  public analyze(
    ast: TemplateNode,
    errorReporter?: ErrorReporter,
    context?: AnalysisContext
  ): SemanticInfo {
    this.errorReporter = errorReporter;
    this.context = {
      templateRoots: context?.templateRoots ?? [],
      filePath: context?.filePath,
      visited: context?.visited ?? new Set<string>()
    };

    this.initializeAnalysis();

    if (this.context.filePath) {
      this.context.visited?.add(path.normalize(this.context.filePath));
    }

    if (ast) {
      this.analyzeNode(ast);
    }

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

    this.semanticInfo = {
      variables: new Map(),
      macros: new Map(),
      functions: new Map(),
      includes: [],
      imports: []
    };

    this.errors = [];
    this.warnings = [];
    this.addBuiltinSymbols();
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

  private analyzeMacro(node: MacroNode): void {
    const macroInfo: MacroInfo = {
      name: node.name,
      parameters: node.parameters,
      definedAt: node.position,
      usages: [],
      node
    };

    this.symbolTable.currentScope.macros.set(node.name, macroInfo);
    this.semanticInfo.macros.set(node.name, macroInfo);

    // Create a new scope for the macro
    const macroScope: Scope = {
      type: 'macro',
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
      macroScope.variables.set(param, paramInfo);
    });

    const previousScope = this.symbolTable.currentScope;
    this.symbolTable.currentScope = macroScope;

    // Analyze macro body
    node.body.forEach(child => this.analyzeNode(child));

    this.symbolTable.currentScope = previousScope;
  }

  private analyzeFunction(node: FunctionNode): void {
    const functionInfo: FunctionInfo = {
      name: node.name,
      parameters: node.parameters,
      returnType: node.returnType || 'any',
      definedAt: node.position,
      usages: []
    };

    this.symbolTable.currentScope.functions.set(node.name, functionInfo);
    this.semanticInfo.functions.set(node.name, functionInfo);

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
    const macro = this.findMacro(node.name);
    if (macro && macro.node) {
      macro.usages.push(node.position);
      const macroScope: Scope = {
        type: 'macro',
        name: macro.name,
        variables: new Map(),
        macros: new Map(),
        functions: new Map(),
        parent: this.symbolTable.currentScope
      };

      // Map parameters
      macro.parameters.forEach((param, idx) => {
        const paramInfo: VariableInfo = {
          name: param,
          type: 'any',
          scope: 'local',
          definedAt: node.position,
          usages: []
        };
        if (node.parameters[idx]?.value) {
          this.analyzeExpression(node.parameters[idx].value!);
        }
        macroScope.variables.set(param, paramInfo);
      });

      const previousScope = this.symbolTable.currentScope;
      this.symbolTable.currentScope = macroScope;
      macro.node.body.forEach(child => this.analyzeNode(child));
      this.symbolTable.currentScope = previousScope;

      // Promote variables defined in macro scope to current scope
      macroScope.variables.forEach((info, name) => {
        if (!previousScope.variables.has(name)) {
          previousScope.variables.set(name, info);
          this.semanticInfo.variables.set(name, info);
        }
      });
    } else {
      const message = `Undefined macro: ${node.name}`;
      this.errors.push(message);
      if (this.errorReporter) {
        this.errorReporter.addError(message, node.range, 'FTL2004');
      }
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

    info.macros.forEach((m, name) => {
      const namespaced = node.alias ? `${node.alias}.${name}` : name;
      const macroInfo: MacroInfo = { ...m, name: namespaced };
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

    info.macros.forEach((macro, name) => {
      const macroInfo: MacroInfo = { ...macro, name };
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
      return analyzer.analyze(ast, undefined, {
        filePath: normalizedPath,
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
}