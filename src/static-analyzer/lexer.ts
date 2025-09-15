export enum TokenType {
  // Literals
  TEXT = 'TEXT',
  STRING_LITERAL = 'STRING_LITERAL',
  NUMBER_LITERAL = 'NUMBER_LITERAL',
  BOOLEAN_LITERAL = 'BOOLEAN_LITERAL',
  
  // FreeMarker Syntax
  DIRECTIVE_START = 'DIRECTIVE_START',     // <# or [#
  DIRECTIVE_END = 'DIRECTIVE_END',         // > or ]
  MACRO_START = 'MACRO_START',             // <@ or [@
  MACRO_END = 'MACRO_END',                 // > or ]
  INTERPOLATION_START = 'INTERPOLATION_START', // ${
  INTERPOLATION_END = 'INTERPOLATION_END',     // }
  COMMENT_START = 'COMMENT_START',         // <#--
  COMMENT_END = 'COMMENT_END',             // -->
  
  // Operators
  ASSIGN = 'ASSIGN',                       // =
  PLUS_ASSIGN = 'PLUS_ASSIGN',            // +=
  MINUS_ASSIGN = 'MINUS_ASSIGN',          // -=
  MULTIPLY_ASSIGN = 'MULTIPLY_ASSIGN',    // *=
  DIVIDE_ASSIGN = 'DIVIDE_ASSIGN',        // /=
  MODULO_ASSIGN = 'MODULO_ASSIGN',        // %=
  INCREMENT = 'INCREMENT',                 // ++
  DECREMENT = 'DECREMENT',                // --
  
  PLUS = 'PLUS',                          // +
  MINUS = 'MINUS',                        // -
  MULTIPLY = 'MULTIPLY',                  // *
  DIVIDE = 'DIVIDE',                      // /
  MODULO = 'MODULO',                      // %
  
  EQUAL = 'EQUAL',                        // ==
  NOT_EQUAL = 'NOT_EQUAL',               // !=
  LESS_THAN = 'LESS_THAN',               // <
  LESS_EQUAL = 'LESS_EQUAL',             // <=
  GREATER_THAN = 'GREATER_THAN',         // >
  GREATER_EQUAL = 'GREATER_EQUAL',       // >=
  
  AND = 'AND',                           // &&
  OR = 'OR',                             // ||
  NOT = 'NOT',                           // !
  
  RANGE = 'RANGE',                       // ..
  RANGE_INCLUSIVE = 'RANGE_INCLUSIVE',   // ...
  
  // Built-in operators
  BUILTIN_START = 'BUILTIN_START',       // ?
  FALLBACK = 'FALLBACK',                 // !
  
  // Punctuation
  LPAREN = 'LPAREN',                     // (
  RPAREN = 'RPAREN',                     // )
  LBRACKET = 'LBRACKET',                 // [
  RBRACKET = 'RBRACKET',                 // ]
  LBRACE = 'LBRACE',                     // {
  RBRACE = 'RBRACE',                     // }
  COMMA = 'COMMA',                       // ,
  SEMICOLON = 'SEMICOLON',              // ;
  COLON = 'COLON',                      // :
  DOT = 'DOT',                          // .
  QUESTION = 'QUESTION',                // ?
  SLASH = 'SLASH',                      // /
  
  // Keywords and Identifiers
  IDENTIFIER = 'IDENTIFIER',
  DIRECTIVE_NAME = 'DIRECTIVE_NAME',
  MACRO_NAME = 'MACRO_NAME',
  
  // FreeMarker Keywords
  IF = 'IF',
  ELSE = 'ELSE',
  ELSEIF = 'ELSEIF',
  LIST = 'LIST',
  AS = 'AS',
  IN = 'IN',
  ASSIGN_DIRECTIVE = 'ASSIGN_DIRECTIVE',
  LOCAL = 'LOCAL',
  GLOBAL = 'GLOBAL',
  FUNCTION = 'FUNCTION',
  MACRO = 'MACRO',
  RETURN = 'RETURN',
  INCLUDE = 'INCLUDE',
  IMPORT = 'IMPORT',
  SETTING = 'SETTING',
  SWITCH = 'SWITCH',
  CASE = 'CASE',
  DEFAULT = 'DEFAULT',
  BREAK = 'BREAK',
  ATTEMPT = 'ATTEMPT',
  RECOVER = 'RECOVER',
  NESTED = 'NESTED',
  COMPRESS = 'COMPRESS',
  ESCAPE = 'ESCAPE',
  NOESCAPE = 'NOESCAPE',
  NOPARSE = 'NOPARSE',
  
  // Special
  WHITESPACE = 'WHITESPACE',
  NEWLINE = 'NEWLINE',
  EOF = 'EOF',
  ERROR = 'ERROR'
}

export interface Token {
  type: TokenType;
  value: string;
  position: Position;
  length: number;
}

export interface Position {
  line: number;
  character: number;
  offset: number;
}

export class FreeMarkerLexer {
  private content: string = '';
  private position: number = 0;
  private line: number = 1;
  private character: number = 1;
  private tokens: Token[] = [];
  private inDirective = false;

  private keywords = new Map([
    ['if', TokenType.IF],
    ['else', TokenType.ELSE],
    ['elseif', TokenType.ELSEIF],
    ['list', TokenType.LIST],
    ['as', TokenType.AS],
    ['in', TokenType.IN],
    ['assign', TokenType.ASSIGN_DIRECTIVE],
    ['local', TokenType.LOCAL],
    ['global', TokenType.GLOBAL],
    ['function', TokenType.FUNCTION],
    ['macro', TokenType.MACRO],
    ['return', TokenType.RETURN],
    ['include', TokenType.INCLUDE],
    ['import', TokenType.IMPORT],
    ['setting', TokenType.SETTING],
    ['switch', TokenType.SWITCH],
    ['case', TokenType.CASE],
    ['default', TokenType.DEFAULT],
    ['break', TokenType.BREAK],
    ['attempt', TokenType.ATTEMPT],
    ['recover', TokenType.RECOVER],
    ['nested', TokenType.NESTED],
    ['compress', TokenType.COMPRESS],
    ['escape', TokenType.ESCAPE],
    ['noescape', TokenType.NOESCAPE],
    ['noparse', TokenType.NOPARSE],
    ['true', TokenType.BOOLEAN_LITERAL],
    ['false', TokenType.BOOLEAN_LITERAL]
  ]);

  public tokenize(content: string): Token[] {
    this.content = content;
    this.position = 0;
    this.line = 1;
    this.character = 1;
    this.tokens = [];
    this.inDirective = false;

    while (!this.isAtEnd()) {
      this.scanToken();
    }

    this.addToken(TokenType.EOF, '');
    return this.tokens;
  }

  private scanToken(): void {
    const c = this.advance();

    switch (c) {
      case ' ':
      case '\r':
      case '\t':
        this.addToken(TokenType.WHITESPACE, c);
        break;
      case '\n':
        this.addToken(TokenType.NEWLINE, c);
        this.line++;
        this.character = 1;
        break;
      case '(':
        this.addToken(TokenType.LPAREN, c);
        break;
      case ')':
        this.addToken(TokenType.RPAREN, c);
        break;
      case '{':
        this.addToken(TokenType.LBRACE, c);
        break;
      case '}':
        this.addToken(TokenType.RBRACE, c);
        break;
      case '[':
        this.scanSquareBracket();
        break;
      case ']':
        this.addToken(TokenType.RBRACKET, c);
        break;
      case ',':
        this.addToken(TokenType.COMMA, c);
        break;
      case ';':
        this.addToken(TokenType.SEMICOLON, c);
        break;
      case ':':
        this.addToken(TokenType.COLON, c);
        break;
      case '.':
        this.scanDot();
        break;
      case '?':
        this.addToken(TokenType.QUESTION, c);
        break;
      case '/':
        this.addToken(TokenType.SLASH, c);
        break;
      case '+':
        this.scanPlus();
        break;
      case '-':
        this.scanMinus();
        break;
      case '*':
        this.scanMultiply();
        break;
      case '%':
        this.scanModulo();
        break;
      case '=':
        this.scanEqual();
        break;
      case '!':
        this.scanExclamation();
        break;
      case '&':
        this.scanAmpersand();
        break;
      case '|':
        this.scanPipe();
        break;
      case '<':
        this.scanLessThan();
        break;
      case '>':
        this.scanGreaterThan();
        break;
      case '$':
        this.scanDollar();
        break;
      case '"':
      case "'":
        this.scanString(c);
        break;
      default:
        if (this.isDigit(c)) {
          this.scanNumber();
        } else if (this.isAlpha(c)) {
          this.scanIdentifier();
        } else {
          this.scanText();
        }
        break;
    }
  }

  private scanSquareBracket(): void {
    if (this.peek() === '#') {
      this.advance(); // consume #
      this.addToken(TokenType.DIRECTIVE_START, '[#');
    } else if (this.peek() === '@') {
      this.advance(); // consume @
      this.addToken(TokenType.MACRO_START, '[@');
    } else {
      this.addToken(TokenType.LBRACKET, '[');
    }
  }

  private scanDot(): void {
    if (this.peek() === '.') {
      this.advance();
      if (this.peek() === '.') {
        this.advance();
        this.addToken(TokenType.RANGE_INCLUSIVE, '...');
      } else {
        this.addToken(TokenType.RANGE, '..');
      }
    } else {
      this.addToken(TokenType.DOT, '.');
    }
  }

  private scanPlus(): void {
    if (this.peek() === '+') {
      this.advance();
      this.addToken(TokenType.INCREMENT, '++');
    } else if (this.peek() === '=') {
      this.advance();
      this.addToken(TokenType.PLUS_ASSIGN, '+=');
    } else {
      this.addToken(TokenType.PLUS, '+');
    }
  }

  private scanMinus(): void {
    if (this.peek() === '-') {
      this.advance();
      this.addToken(TokenType.DECREMENT, '--');
    } else if (this.peek() === '=') {
      this.advance();
      this.addToken(TokenType.MINUS_ASSIGN, '-=');
    } else {
      this.addToken(TokenType.MINUS, '-');
    }
  }

  private scanMultiply(): void {
    if (this.peek() === '=') {
      this.advance();
      this.addToken(TokenType.MULTIPLY_ASSIGN, '*=');
    } else {
      this.addToken(TokenType.MULTIPLY, '*');
    }
  }

  private scanModulo(): void {
    if (this.peek() === '=') {
      this.advance();
      this.addToken(TokenType.MODULO_ASSIGN, '%=');
    } else {
      this.addToken(TokenType.MODULO, '%');
    }
  }

  private scanEqual(): void {
    if (this.peek() === '=') {
      this.advance();
      this.addToken(TokenType.EQUAL, '==');
    } else {
      this.addToken(TokenType.ASSIGN, '=');
    }
  }

  private scanExclamation(): void {
    if (this.peek() === '=') {
      this.advance();
      this.addToken(TokenType.NOT_EQUAL, '!=');
    } else {
      this.addToken(TokenType.NOT, '!');
    }
  }

  private scanAmpersand(): void {
    if (this.peek() === '&') {
      this.advance();
      this.addToken(TokenType.AND, '&&');
    } else {
      this.addToken(TokenType.ERROR, '&');
    }
  }

  private scanPipe(): void {
    if (this.peek() === '|') {
      this.advance();
      this.addToken(TokenType.OR, '||');
    } else {
      this.addToken(TokenType.ERROR, '|');
    }
  }

  private scanLessThan(): void {
    if (this.peek() === '#') {
      this.advance(); // consume #
      if (this.peek() === '-' && this.peekNext() === '-') {
        this.advance(); // consume -
        this.advance(); // consume -
        this.scanComment();
        return;
      } else {
        this.inDirective = true;
        this.addToken(TokenType.DIRECTIVE_START, '<#');
        return;
      }
    } else if (this.peek() === '/' && this.peekNext() === '#') {
      this.advance(); // consume /
      this.advance(); // consume #
      this.inDirective = true;
      this.addToken(TokenType.DIRECTIVE_START, '<#');
      const start = this.position;
      while (this.isAlphaNumeric(this.peek())) {
        this.advance();
      }
      const name = '/' + this.content.slice(start, this.position);
      this.addToken(TokenType.IDENTIFIER, name);
      return;
    } else if (this.peek() === '@') {
      this.advance(); // consume @
      this.inDirective = true;
      this.addToken(TokenType.MACRO_START, '<@');
    } else if (this.peek() === '=') {
      this.advance();
      this.addToken(TokenType.LESS_EQUAL, '<=');
    } else {
      this.addToken(TokenType.LESS_THAN, '<');
    }
  }

  private scanGreaterThan(): void {
    if (this.peek() === '=') {
      this.advance();
      this.addToken(TokenType.GREATER_EQUAL, '>=');
    } else {
      if (this.inDirective) {
        this.inDirective = false;
        this.addToken(TokenType.DIRECTIVE_END, '>');
      } else {
        this.addToken(TokenType.GREATER_THAN, '>');
      }
    }
  }

  private scanDollar(): void {
    if (this.peek() === '{') {
      this.advance();
      this.addToken(TokenType.INTERPOLATION_START, '${');
    } else {
      // Handle shorthand interpolation like $variable
      this.scanText();
    }
  }

  private scanComment(): void {
    let value = '<#--';
    
    while (!this.isAtEnd()) {
      if (this.peek() === '-' && this.peekNext() === '-' && this.peekNextNext() === '>') {
        value += '-->';
        this.advance(); // -
        this.advance(); // -
        this.advance(); // >
        break;
      }
      if (this.peek() === '\n') {
        this.line++;
        this.character = 1;
      }
      value += this.advance();
    }
    
    this.addToken(TokenType.COMMENT_START, value);
  }

  private scanString(quote: string): void {
    let value = quote;
    
    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        value += this.advance(); // consume backslash
        if (!this.isAtEnd()) {
          value += this.advance(); // consume escaped character
        }
      } else {
        if (this.peek() === '\n') {
          this.line++;
          this.character = 1;
        }
        value += this.advance();
      }
    }
    
    if (!this.isAtEnd()) {
      value += this.advance(); // closing quote
    }
    
    this.addToken(TokenType.STRING_LITERAL, value);
  }

  private scanNumber(): void {
    let value = this.content[this.position - 1];
    
    while (this.isDigit(this.peek())) {
      value += this.advance();
    }
    
    // Handle decimal numbers
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      value += this.advance(); // consume .
      while (this.isDigit(this.peek())) {
        value += this.advance();
      }
    }
    
    // Handle scientific notation
    if (this.peek() === 'e' || this.peek() === 'E') {
      value += this.advance();
      if (this.peek() === '+' || this.peek() === '-') {
        value += this.advance();
      }
      while (this.isDigit(this.peek())) {
        value += this.advance();
      }
    }
    
    this.addToken(TokenType.NUMBER_LITERAL, value);
  }

  private scanIdentifier(): void {
    let value = this.content[this.position - 1];
    
    while (this.isAlphaNumeric(this.peek()) || this.peek() === '_' || this.peek() === '$' || this.peek() === '@') {
      value += this.advance();
    }
    
    const tokenType = this.keywords.get(value) || TokenType.IDENTIFIER;
    this.addToken(tokenType, value);
  }

  private scanText(): void {
    let value = this.content[this.position - 1];
    
    // Scan until we hit FreeMarker syntax
    while (!this.isAtEnd() && !this.isFreeMarkerSyntax()) {
      if (this.peek() === '\n') {
        break; // Let newlines be handled separately
      }
      value += this.advance();
    }
    
    this.addToken(TokenType.TEXT, value);
  }

  private isFreeMarkerSyntax(): boolean {
    const c = this.peek();
    const next = this.peekNext();
    
    return (c === '<' && (next === '#' || next === '@')) ||
           (c === '[' && (next === '#' || next === '@')) ||
           (c === '$' && next === '{') ||
           c === '>' || c === ']' || c === '}';
  }

  private getCurrentPosition(): Position {
    return {
      line: this.line,
      character: this.character,
      offset: this.position
    };
  }

  private addToken(type: TokenType, value: string): void {
    const position = this.getCurrentPosition();
    position.character -= value.length;
    position.offset -= value.length;

    this.tokens.push({
      type,
      value,
      position,
      length: value.length
    });
  }

  private advance(): string {
    this.character++;
    return this.content[this.position++];
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.content[this.position];
  }

  private peekNext(): string {
    if (this.position + 1 >= this.content.length) return '\0';
    return this.content[this.position + 1];
  }

  private peekNextNext(): string {
    if (this.position + 2 >= this.content.length) return '\0';
    return this.content[this.position + 2];
  }

  private isAtEnd(): boolean {
    return this.position >= this.content.length;
  }

  private isDigit(c: string): boolean {
    return c >= '0' && c <= '9';
  }

  private isAlpha(c: string): boolean {
    return (c >= 'a' && c <= 'z') ||
           (c >= 'A' && c <= 'Z') ||
           c === '_';
  }

  private isAlphaNumeric(c: string): boolean {
    return this.isAlpha(c) || this.isDigit(c);
  }
}