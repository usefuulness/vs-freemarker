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

export interface MacroCallNode extends ASTNode {
  type: 'MacroCall';
  name: string;
  parameters: ParameterNode[];
  body?: ASTNode[];
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

export interface BuiltInNode extends ExpressionNode {
  type: 'BuiltIn';
  name: string;
  target: ExpressionNode;
  arguments?: ExpressionNode[];
}

export interface ExistsNode extends ExpressionNode {
  type: 'Exists';
  target: ExpressionNode;
}

export interface FallbackNode extends ExpressionNode {
  type: 'Fallback';
  target: ExpressionNode;
  fallback: ExpressionNode;
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
  iterable: ExpressionNode;
  item: string;
  key?: string;
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
    } else if (this.match(TokenType.MACRO_START)) {
      return this.parseMacroCall();
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

  private parseMacroCall(): MacroCallNode {
    const nameParts: string[] = [];

    if (this.check(TokenType.IDENTIFIER)) {
      nameParts.push(this.advance().value);
      while (this.match(TokenType.DOT)) {
        if (this.check(TokenType.IDENTIFIER)) {
          nameParts.push('.' + this.advance().value);
        }
      }
    }

    const name = nameParts.join('');
    const parameters = this.parseParameters();
    const selfClosing = this.match(TokenType.SLASH);
    this.match(TokenType.DIRECTIVE_END);
    let body: ASTNode[] | undefined;
    if (!selfClosing) {
      body = this.parseDirectiveBody();
    }

    return {
      type: 'MacroCall',
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

  private parseAssignment(): AssignmentNode | null {
    this.skipWhitespace();
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
    this.skipWhitespace();
    const path = this.advance().value;
    let alias = '';

    if (this.match(TokenType.AS)) {
      this.skipWhitespace();
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
    this.skipWhitespace();
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
    const iterable = this.parseExpression();

    if (!this.match(TokenType.AS)) {
      throw new Error('Expected "as" in list directive');
    }

    this.skipWhitespace();
    const firstVar = this.advance().value;
    let item = firstVar;
    let key: string | undefined;

    this.skipWhitespace();
    if (this.match(TokenType.COMMA)) {
      this.skipWhitespace();
      const secondVar = this.advance().value;
      key = firstVar;
      item = secondVar;
    }

    this.match(TokenType.DIRECTIVE_END);

    const body = this.parseDirectiveBody();

    return {
      type: 'List',
      iterable,
      item,
      key,
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
    this.skipWhitespace();
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
    this.skipWhitespace();
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

    while (
      this.check(TokenType.DOT) ||
      this.check(TokenType.LPAREN) ||
      this.check(TokenType.QUESTION) ||
      this.check(TokenType.NOT)
    ) {
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
      } else if (this.match(TokenType.QUESTION)) {
        if (this.match(TokenType.QUESTION)) {
          expr = {
            type: 'Exists',
            target: expr,
            position: expr.position,
            range: {
              start: expr.range.start,
              end: this.getCurrentPosition()
            }
          } as any;
        } else {
          const name = this.advance().value;
          let args: ExpressionNode[] | undefined;
          if (this.match(TokenType.LPAREN)) {
            args = [];
            if (!this.check(TokenType.RPAREN)) {
              do {
                args.push(this.parseExpression());
              } while (this.match(TokenType.COMMA));
            }
            this.match(TokenType.RPAREN);
          }
          expr = {
            type: 'BuiltIn',
            name,
            target: expr,
            arguments: args,
            position: expr.position,
            range: {
              start: expr.range.start,
              end: this.getCurrentPosition()
            }
          } as any;
        }
      } else if (this.match(TokenType.NOT)) {
        const fallbackExpr = this.parseExpression();
        const endPos = fallbackExpr.range ? fallbackExpr.range.end : this.getCurrentPosition();
        expr = {
          type: 'Fallback',
          target: expr,
          fallback: fallbackExpr,
          position: expr.position,
          range: {
            start: expr.range.start,
            end: endPos
          }
        } as any;
        break;
      } else {
        break;
      }
    }

    return expr;
  }

  private parsePrimaryExpression(): ExpressionNode {
    if (this.match(TokenType.STRING_LITERAL)) {
      const token = this.previous();
      const start = token.position;
      const end = {
        line: start.line,
        character: start.character + token.length,
        offset: start.offset + token.length
      };
      return {
        type: 'Literal',
        value: token.value,
        dataType: 'string',
        position: start,
        range: { start, end }
      } as any;
    }

    if (this.match(TokenType.NUMBER_LITERAL)) {
      const token = this.previous();
      const start = token.position;
      const end = {
        line: start.line,
        character: start.character + token.length,
        offset: start.offset + token.length
      };
      return {
        type: 'Literal',
        value: parseFloat(token.value),
        dataType: 'number',
        position: start,
        range: { start, end }
      } as any;
    }

    if (this.match(TokenType.BOOLEAN_LITERAL)) {
      const token = this.previous();
      const start = token.position;
      const end = {
        line: start.line,
        character: start.character + token.length,
        offset: start.offset + token.length
      };
      return {
        type: 'Literal',
        value: token.value === 'true',
        dataType: 'boolean',
        position: start,
        range: { start, end }
      } as any;
    }

    if (this.match(TokenType.IDENTIFIER)) {
      const token = this.previous();
      const start = token.position;
      const end = {
        line: start.line,
        character: start.character + token.length,
        offset: start.offset + token.length
      };
      return {
        type: 'Variable',
        name: token.value,
        position: start,
        range: { start, end }
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
      if (this.check(TokenType.SLASH)) {
        break;
      }
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
        this.advance(); // consume start
        this.advance(); // consume name
        this.match(TokenType.DIRECTIVE_END);
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
    return (this.check(TokenType.DIRECTIVE_START) || this.check(TokenType.MACRO_START)) &&
           this.tokens[this.current + 1]?.value?.startsWith('/');
  }

  private skipComment(): void {
    while (!this.check(TokenType.COMMENT_END) && !this.isAtEnd()) {
      this.advance();
    }
    this.match(TokenType.COMMENT_END);
  }

  private match(...types: TokenType[]): boolean {
    this.skipWhitespace();
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    this.skipWhitespace();
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private skipWhitespace(): void {
    while (
      !this.isAtEnd() &&
      (this.peek().type === TokenType.WHITESPACE || this.peek().type === TokenType.NEWLINE)
    ) {
      this.current++;
    }
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