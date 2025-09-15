import {
  TemplateNode,
  ASTNode,
  DirectiveNode,
  MacroNode,
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
  PropertyAccessNode
} from './parser';

import { SemanticInfo, VariableInfo, MacroInfo, FunctionInfo, ImportInfo } from './index';

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

export class SemanticAnalyzer {
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

  public analyze(ast: TemplateNode): SemanticInfo {
    this.initializeAnalysis();
    
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
      usages: []
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
    
    // Create new scope for then branch
    const thenScope: Scope = {
      type: 'local',
      variables: new Map(),
      macros: new Map(),
      functions: new Map(),
      parent: this.symbolTable.currentScope
    };

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

    // Add loop variable
    const loopVarInfo: VariableInfo = {
      name: node.item,
      type: 'any',
      scope: 'loop',
      definedAt: node.position,
      usages: []
    };
    loopScope.variables.set(node.item, loopVarInfo);

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

  private analyzeImport(node: ImportNode): void {
    const importInfo: ImportInfo = {
      path: node.path,
      alias: node.alias,
      resolvedPath: node.resolvedPath
    };
    this.semanticInfo.imports.push(importInfo);
  }

  private analyzeInclude(node: IncludeNode): void {
    this.semanticInfo.includes.push(node.path);
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

  private analyzeExpression(expr: ExpressionNode): TypeInfo {
    switch (expr.type) {
      case 'Variable':
        return this.analyzeVariableReference(expr as VariableNode);
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
      default:
        return { type: 'unknown', nullable: true };
    }
  }

  private analyzeVariableReference(node: VariableNode): TypeInfo {
    const variable = this.findVariable(node.name);
    if (variable) {
      variable.usages.push(node.position);
      return { type: variable.type, nullable: false };
    } else {
      this.errors.push(`Undefined variable: ${node.name}`);
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
      this.errors.push(`Undefined function: ${node.name}`);
      return { type: 'unknown', nullable: true };
    }
  }

  private analyzePropertyAccess(node: PropertyAccessNode): TypeInfo {
    this.analyzeExpression(node.object);
    // Simple property access - could be enhanced with more sophisticated type checking
    return { type: 'unknown', nullable: true };
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