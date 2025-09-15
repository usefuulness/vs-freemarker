import { Token, TokenType } from './lexer';
import { Position, Range } from './index';

export interface ASTNode {
  type: string;
  position: Position;
  range: Range;
}

export interface TemplateNode extends ASTNode {
  type: 'Template';
  body: ASTNode[];
  imports: ImportNode[];
  includes: IncludeNode[];
}

export interface DirectiveNode extends ASTNode {
  type: 'Directive';
  name: string;
  parameters: ParameterNode[];
  body?: ASTNode[];
}

export interface MacroNode extends ASTNode {
  type: 'Macro';
  name: string;
  parameters: string[];
  body: ASTNode[];
}

export interface FunctionNode extends ASTNode {
  type: 'Function';
  name: string;
  parameters: string[];
  body: ASTNode[];
  returnType?: string;
}

export interface InterpolationNode extends ASTNode {
  type: 'Interpolation';
  expression: ExpressionNode;
}

export interface ExpressionNode extends ASTNode {
  type: string;
  [key: string]: any;
}

export interface VariableNode extends ExpressionNode {
  type: 'Variable';
  name: string;
  scope?: string;
}

export interface LiteralNode extends ExpressionNode {
  type: 'Literal';
  value: any;
  dataType: 'string' | 'number' | 'boolean';
}

export interface BinaryExpressionNode extends ExpressionNode {
  type: 'BinaryExpression';
  left: ExpressionNode;
  operator: string;
  right: ExpressionNode;
}

export interface UnaryExpressionNode extends ExpressionNode {
  type: 'UnaryExpression';
  operator: string;
  operand: ExpressionNode;
}

export interface FunctionCallNode extends ExpressionNode {
  type: 'FunctionCall';
  name: string;
  arguments: ExpressionNode[];
}

export interface PropertyAccessNode extends ExpressionNode {
  type: 'PropertyAccess';
  object: ExpressionNode;
  property: string;
}

export interface AssignmentNode extends ASTNode {
  type: 'Assignment';
  variable: string;
  value: ExpressionNode;
  scope: 'local' | 'global' | 'auto';
}

export interface ImportNode extends ASTNode {
  type: 'Import';
  path: string;
  alias: string;
  resolvedPath?: string;
}

export interface IncludeNode extends ASTNode {
  type: 'Include';
  path: string;
  resolvedPath?: string;
}

export interface ParameterNode extends ASTNode {
  type: 'Parameter';
  name: string;
  value?: ExpressionNode;
}

export interface IfNode extends ASTNode {
  type: 'If';
  condition: ExpressionNode;
  thenBody: ASTNode[];
  elseBody?: ASTNode[];
}

export interface ListNode extends ASTNode {
  type: 'List';
  item: string;
  iterable: ExpressionNode;
  body: ASTNode[];
}

export interface SwitchNode extends ASTNode {
  type: 'Switch';
  expression: ExpressionNode;
  cases: CaseNode[];
  defaultCase?: ASTNode[];
}

export interface CaseNode extends ASTNode {
  type: 'Case';
  value: ExpressionNode;
  body: ASTNode[];
}

export interface TextNode extends ASTNode {
  type: 'Text';
  content: string;
}

export class FreeMarkerParser {
  private tokens: Token[];
  private current: number = 0;
  private imports: ImportNode[] = [];
  private includes: IncludeNode[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  public parse(): TemplateNode {
    this.current = 0;
    this.imports = [];
    this.includes = [];
    
    const body: ASTNode[] = [];
    
    while (!this.isAtEnd()) {
      const node = this.parseTopLevel();
      if (node) {
        body.push(node);
      }
    }

    return {
      type: 'Template',
      position: { line: 1, character: 1, offset: 0},
      range: {
        start: { line: 1, character: 1, offset: 0 },
        end: this.getCurrentPosition()
      },
      body,
      imports: this.imports,
      includes: this.includes
    };
  }

  private parseTopLevel(): ASTNode | null {
    if (this.match(TokenType.DIRECTIVE_START)) {
      return this.parseDirective();
    } else if (this.match(TokenType.INTERPOLATION_START)) {
      return this.parseInterpolation();
    } else if (this.match(TokenType.TEXT)) {
      return this.parseText();
    } else if (this.match(TokenType.COMMENT_START)) {
      this.skipComment();
      return null;
    }
    
    // Skip unknown tokens
    this.advance();
    return null;
  }

  private parseDirective(): ASTNode | null {
    const nameToken = this.peek();
    if (nameToken.type !== TokenType.IDENTIFIER) {
      return null;
    }
    
    const name = nameToken.value;
    this.advance();

    // Handle different directive types
    if (name === 'assign') {
      return this.parseAssignment();
    } else if (name === 'import') {
      return this.parseImport();
    } else if (name === 'include') {
      return this.parseInclude();
    } else if (name === 'if') {
      return this.parseIf();
    } else if (name === 'list') {
      return this.parseList();
    } else if (name === 'switch') {
      return this.parseSwitch();
    } else if (name === 'macro') {
      return this.parseMacro();
    } else if (name === 'function') {
      return this.parseFunction();
    }
    
    // Generic directive
    const parameters = this.parseParameters();
    const body = this.parseDirectiveBody();
    
    return {
      type: 'Directive',
      name,
      parameters,
      body,
      position: this.getCurrentPosition(),
      range: {
        start: this.getCurrentPosition(),
        end: this.getCurrentPosition()
      }
    } as DirectiveNode;
  }

  private parseAssignment(): AssignmentNode | null {
    const variableName = this.advance().value;
    
    if (!this.match(TokenType.ASSIGN)) {
      return null;
    }
    
    const value = this.parseExpression();
    this.match(TokenType.DIRECTIVE_END);
    
    return {
      type: 'Assignment',
      variable: variableName,
      value,
      scope: 'auto',
      position: this.getCurrentPosition(),
      range: {
        start: this.getCurrentPosition(),
        end: this.getCurrentPosition()
      }
    };
  }

  private parseImport(): ImportNode {
    const path = this.advance().value;
    let alias = '';
    
    if (this.match(TokenType.AS)) {
      alias = this.advance().value;
    }
    
    this.match(TokenType.DIRECTIVE_END);
    
    const importNode: ImportNode = {
      type: 'Import',
      path: path.replace(/['"]/g, ''),
      alias,
      position: this.getCurrentPosition(),
      range: {
        start: this.getCurrentPosition(),
        end: this.getCurrentPosition()
      }
    };
    
    this.imports.push(importNode);
    return importNode;
  }

  private parseInclude(): IncludeNode {
    const path = this.advance().value;
    this.match(TokenType.DIRECTIVE_END);
    
    const includeNode: IncludeNode = {
      type: 'Include',
      path: path.replace(/['"]/g, ''),
      position: this.getCurrentPosition(),
      range: {
        start: this.getCurrentPosition(),
        end: this.getCurrentPosition()
      }
    };
    
    this.includes.push(includeNode);
    return includeNode;
  }

  private parseIf(): IfNode {
    const condition = this.parseExpression();
    this.match(TokenType.DIRECTIVE_END);
    
    const thenBody = this.parseDirectiveBody();
    let elseBody: ASTNode[] | undefined;
    
    if (this.checkDirective('else')) {
      this.advance(); // consume 'else'
      this.match(TokenType.DIRECTIVE_END);
      elseBody = this.parseDirectiveBody();
    }
    
    return {
      type: 'If',
      condition,
      thenBody,
      elseBody,
      position: this.getCurrentPosition(),
      range: {
        start: this.getCurrentPosition(),
        end: this.getCurrentPosition()
      }
    };
  }

  private parseList(): ListNode {
    const item = this.advance().value;
    
    if (!this.match(TokenType.AS)) {
      throw new Error('Expected "as" in list directive');
    }
    
    const iterable = this.parseExpression();
    this.match(TokenType.DIRECTIVE_END);
    
    const body = this.parseDirectiveBody();
    
    return {
      type: 'List',
      item,
      iterable,
      body,
      position: this.getCurrentPosition(),
      range: {
        start: this.getCurrentPosition(),
        end: this.getCurrentPosition()
      }
    };
  }

  private parseSwitch(): SwitchNode {
    const expression = this.parseExpression();
    this.match(TokenType.DIRECTIVE_END);
    
    const cases: CaseNode[] = [];
    let defaultCase: ASTNode[] | undefined;
    
    while (!this.checkDirective('switch') && !this.isAtEnd()) {
      if (this.checkDirective('case')) {
        const caseValue = this.parseExpression();
        this.match(TokenType.DIRECTIVE_END);
        const caseBody = this.parseDirectiveBody();
        
        cases.push({
          type: 'Case',
          value: caseValue,
          body: caseBody,
          position: this.getCurrentPosition(),
          range: {
            start: this.getCurrentPosition(),
            end: this.getCurrentPosition()
          }
        });
      } else if (this.checkDirective('default')) {
        this.advance();
        this.match(TokenType.DIRECTIVE_END);
        defaultCase = this.parseDirectiveBody();
      } else {
        this.advance();
      }
    }
    
    return {
      type: 'Switch',
      expression,
      cases,
      defaultCase,
      position: this.getCurrentPosition(),
      range: {
        start: this.getCurrentPosition(),
        end: this.getCurrentPosition()
      }
    };
  }

  private parseMacro(): MacroNode {
    const name = this.advance().value;
    const parameters: string[] = [];
    
    // Parse parameters
    while (!this.check(TokenType.DIRECTIVE_END) && !this.isAtEnd()) {
      if (this.check(TokenType.IDENTIFIER)) {
        parameters.push(this.advance().value);
      } else {
        this.advance();
      }
    }
    
    this.match(TokenType.DIRECTIVE_END);
    const body = this.parseDirectiveBody();
    
    return {
      type: 'Macro',
      name,
      parameters,
      body,
      position: this.getCurrentPosition(),
      range: {
        start: this.getCurrentPosition(),
        end: this.getCurrentPosition()
      }
    };
  }

  private parseFunction(): FunctionNode {
    const name = this.advance().value;
    const parameters: string[] = [];
    
    // Parse parameters
    while (!this.check(TokenType.DIRECTIVE_END) && !this.isAtEnd()) {
      if (this.check(TokenType.IDENTIFIER)) {
        parameters.push(this.advance().value);
      } else {
        this.advance();
      }
    }
    
    this.match(TokenType.DIRECTIVE_END);
    const body = this.parseDirectiveBody();
    
    return {
      type: 'Function',
      name,
      parameters,
      body,
      position: this.getCurrentPosition(),
      range: {
        start: this.getCurrentPosition(),
        end: this.getCurrentPosition()
      }
    };
  }

  private parseExpression(): ExpressionNode {
    return this.parseOrExpression();
  }

  private parseOrExpression(): ExpressionNode {
    let expr = this.parseAndExpression();
    
    while (this.match(TokenType.OR)) {
      const operator = this.previous().value;
      const right = this.parseAndExpression();
      expr = {
        type: 'BinaryExpression',
        left: expr,
        operator,
        right,
        position: expr.position,
        range: {
          start: expr.range.start,
          end: this.getCurrentPosition()
        }
      } as any;
    }
    
    return expr;
  }

  private parseAndExpression(): ExpressionNode {
    let expr = this.parseEqualityExpression();
    
    while (this.match(TokenType.AND)) {
      const operator = this.previous().value;
      const right = this.parseEqualityExpression();
      expr = {
        type: 'BinaryExpression',
        left: expr,
        operator,
        right,
        position: expr.position,
        range: {
          start: expr.range.start,
          end: this.getCurrentPosition()
        }
      } as any;
    }
    
    return expr;
  }

  private parseEqualityExpression(): ExpressionNode {
    let expr = this.parseComparisonExpression();
    
    while (this.match(TokenType.EQUAL, TokenType.NOT_EQUAL)) {
      const operator = this.previous().value;
      const right = this.parseComparisonExpression();
      expr = {
        type: 'BinaryExpression',
        left: expr,
        operator,
        right,
        position: expr.position,
        range: {
          start: expr.range.start,
          end: this.getCurrentPosition()
        }
      } as any;
    }
    
    return expr;
  }

  private parseComparisonExpression(): ExpressionNode {
    let expr = this.parseAdditionExpression();
    
    while (this.match(TokenType.LESS_THAN, TokenType.GREATER_THAN, TokenType.LESS_EQUAL, TokenType.GREATER_EQUAL)) {
      const operator = this.previous().value;
      const right = this.parseAdditionExpression();
      expr = {
        type: 'BinaryExpression',
        left: expr,
        operator,
        right,
        position: expr.position,
        range: {
          start: expr.range.start,
          end: this.getCurrentPosition()
        }
      } as any;
    }
    
    return expr;
  }

  private parseAdditionExpression(): ExpressionNode {
    let expr = this.parseMultiplicationExpression();
    
    while (this.match(TokenType.PLUS, TokenType.MINUS)) {
      const operator = this.previous().value;
      const right = this.parseMultiplicationExpression();
      expr = {
        type: 'BinaryExpression',
        left: expr,
        operator,
        right,
        position: expr.position,
        range: {
          start: expr.range.start,
          end: this.getCurrentPosition()
        }
      } as any;
    }
    
    return expr;
  }

  private parseMultiplicationExpression(): ExpressionNode {
    let expr = this.parseUnaryExpression();
    
    while (this.match(TokenType.MULTIPLY, TokenType.DIVIDE, TokenType.MODULO)) {
      const operator = this.previous().value;
      const right = this.parseUnaryExpression();
      expr = {
        type: 'BinaryExpression',
        left: expr,
        operator,
        right,
        position: expr.position,
        range: {
          start: expr.range.start,
          end: this.getCurrentPosition()
        }
      } as any;
    }
    
    return expr;
  }

  private parseUnaryExpression(): ExpressionNode {
    if (this.match(TokenType.NOT, TokenType.MINUS, TokenType.PLUS)) {
      const operator = this.previous().value;
      const operand = this.parseUnaryExpression();
      return {
        type: 'UnaryExpression',
        operator,
        operand,
        position: this.getCurrentPosition(),
        range: {
          start: this.getCurrentPosition(),
          end: this.getCurrentPosition()
        }
      } as any;
    }
    
    return this.parseCallExpression();
  }

  private parseCallExpression(): ExpressionNode {
    let expr = this.parsePrimaryExpression();

    while (this.check(TokenType.DOT) || this.check(TokenType.LPAREN)) {
      if (this.match(TokenType.DOT)) {
        const property = this.advance().value;
        expr = {
          type: 'PropertyAccess',
          object: expr,
          property,
          position: expr.position,
          range: {
            start: expr.range.start,
            end: this.getCurrentPosition()
          }
        } as any;
      } else if (this.match(TokenType.LPAREN)) {
        const args: ExpressionNode[] = [];
        if (!this.check(TokenType.RPAREN)) {
          do {
            args.push(this.parseExpression());
          } while (this.match(TokenType.COMMA));
        }
        this.match(TokenType.RPAREN);

        expr = {
          type: 'FunctionCall',
          name: (expr as VariableNode).name,
          arguments: args,
          position: expr.position,
          range: {
            start: expr.range.start,
            end: this.getCurrentPosition()
          }
        } as any;
      }
    }
    
    return expr;
  }

  private parsePrimaryExpression(): ExpressionNode {
    if (this.match(TokenType.STRING_LITERAL)) {
      return {
        type: 'Literal',
        value: this.previous().value,
        dataType: 'string',
        position: this.getCurrentPosition(),
        range: {
          start: this.getCurrentPosition(),
          end: this.getCurrentPosition()
        }
      } as any;
    }
    
    if (this.match(TokenType.NUMBER_LITERAL)) {
      return {
        type: 'Literal',
        value: parseFloat(this.previous().value),
        dataType: 'number',
        position: this.getCurrentPosition(),
        range: {
          start: this.getCurrentPosition(),
          end: this.getCurrentPosition()
        }
      } as any;
    }
    
    if (this.match(TokenType.BOOLEAN_LITERAL)) {
      return {
        type: 'Literal',
        value: this.previous().value === 'true',
        dataType: 'boolean',
        position: this.getCurrentPosition(),
        range: {
          start: this.getCurrentPosition(),
          end: this.getCurrentPosition()
        }
      } as any;
    }
    
    if (this.match(TokenType.IDENTIFIER)) {
      return {
        type: 'Variable',
        name: this.previous().value,
        position: this.getCurrentPosition(),
        range: {
          start: this.getCurrentPosition(),
          end: this.getCurrentPosition()
        }
      } as any;
    }
    
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseExpression();
      this.match(TokenType.RPAREN);
      return expr;
    }
    
    // Default fallback
    return {
      type: 'Variable',
      name: 'unknown',
      position: this.getCurrentPosition(),
      range: {
        start: this.getCurrentPosition(),
        end: this.getCurrentPosition()
      }
    } as any;
  }

  private parseInterpolation(): InterpolationNode {
    const expression = this.parseExpression();
    this.match(TokenType.INTERPOLATION_END);
    
    return {
      type: 'Interpolation',
      expression,
      position: this.getCurrentPosition(),
      range: {
        start: this.getCurrentPosition(),
        end: this.getCurrentPosition()
      }
    };
  }

  private parseText(): TextNode {
    const content = this.previous().value;
    
    return {
      type: 'Text',
      content,
      position: this.getCurrentPosition(),
      range: {
        start: this.getCurrentPosition(),
        end: this.getCurrentPosition()
      }
    };
  }

  private parseParameters(): ParameterNode[] {
    const parameters: ParameterNode[] = [];
    
    while (!this.check(TokenType.DIRECTIVE_END) && !this.isAtEnd()) {
      const name = this.advance().value;
      let value: ExpressionNode | undefined;
      
      if (this.match(TokenType.ASSIGN)) {
        value = this.parseExpression();
      }
      
      parameters.push({
        type: 'Parameter',
        name,
        value,
        position: this.getCurrentPosition(),
        range: {
          start: this.getCurrentPosition(),
          end: this.getCurrentPosition()
        }
      });
    }
    
    return parameters;
  }

  private parseDirectiveBody(): ASTNode[] {
    const body: ASTNode[] = [];
    
    while (!this.isAtEnd()) {
      if (this.checkDirectiveEnd()) {
        this.advance();
        break;
      }
      
      const node = this.parseTopLevel();
      if (node) {
        body.push(node);
      }
    }
    
    return body;
  }

  private checkDirective(name: string): boolean {
    return this.check(TokenType.DIRECTIVE_START) && 
           this.tokens[this.current + 1]?.value === name;
  }

  private checkDirectiveEnd(): boolean {
    return this.check(TokenType.DIRECTIVE_START) && 
           this.tokens[this.current + 1]?.value?.startsWith('/');
  }

  private skipComment(): void {
    while (!this.check(TokenType.COMMENT_END) && !this.isAtEnd()) {
      this.advance();
    }
    this.match(TokenType.COMMENT_END);
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.current >= this.tokens.length;
  }

  private peek(): Token {
    if (this.isAtEnd()) {
      return { type: TokenType.EOF, value: '', position: { line: 0, character: 0, offset: 0 }, length: 0 };
    }
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private getCurrentPosition(): Position {
    const token = this.peek();
    return token.position || { line: 1, character: 1, offset: 0 };
  }
}