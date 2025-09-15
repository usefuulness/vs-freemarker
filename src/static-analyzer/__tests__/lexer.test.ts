import { FreeMarkerLexer, TokenType } from '../lexer';

describe('FreeMarkerLexer', () => {
  let lexer: FreeMarkerLexer;

  beforeEach(() => {
    lexer = new FreeMarkerLexer();
  });

  describe('Basic tokenization', () => {
    test('should tokenize plain text', () => {
      const tokens = lexer.tokenize('Hello World');
      
      // Filter out whitespace and EOF for easier testing
      const contentTokens = tokens.filter(t => t.type !== TokenType.WHITESPACE && t.type !== TokenType.EOF);
      expect(contentTokens.length).toBeGreaterThan(0);
      expect(contentTokens[0].type).toBe(TokenType.IDENTIFIER);
      expect(contentTokens[0].value).toContain('Hello');
    });

    test('should tokenize HTML with text', () => {
      const tokens = lexer.tokenize('<html><body>Hello</body></html>');
      
      const contentTokens = tokens.filter(t => t.type !== TokenType.EOF);
      expect(contentTokens.length).toBeGreaterThan(0);
      expect(contentTokens[0].type).toBe(TokenType.LESS_THAN);
      expect(tokens.some(t => t.type === TokenType.IDENTIFIER && t.value === 'html')).toBe(true);
    });
  });

  describe('FreeMarker syntax tokenization', () => {
    test('should tokenize interpolation', () => {
      const tokens = lexer.tokenize('${name}');
      
      const hasInterpolationStart = tokens.some(t => t.type === TokenType.INTERPOLATION_START);
      const hasIdentifier = tokens.some(t => t.type === TokenType.IDENTIFIER && t.value === 'name');
      const hasInterpolationEnd = tokens.some(t => t.type === TokenType.RBRACE);
      
      expect(hasInterpolationStart).toBe(true);
      expect(hasIdentifier).toBe(true);
      expect(hasInterpolationEnd).toBe(true);
    });

    test('should tokenize directive start/end', () => {
      const tokens = lexer.tokenize('<#if condition>');
      
      const hasDirectiveStart = tokens.some(t => t.type === TokenType.DIRECTIVE_START);
      const hasIfKeyword = tokens.some(t => t.type === TokenType.IF);
      
      expect(hasDirectiveStart).toBe(true);
      expect(hasIfKeyword).toBe(true);
    });

    test('should tokenize square bracket syntax', () => {
      const tokens = lexer.tokenize('[#if condition]');
      
      const hasDirectiveStart = tokens.some(t => t.type === TokenType.DIRECTIVE_START);
      const hasIfKeyword = tokens.some(t => t.type === TokenType.IF);
      
      expect(hasDirectiveStart).toBe(true);
      expect(hasIfKeyword).toBe(true);
    });

    test('should tokenize macro calls', () => {
      const tokens = lexer.tokenize('<@myMacro param="value"/>');
      
      const hasMacroStart = tokens.some(t => t.type === TokenType.MACRO_START);
      const hasIdentifier = tokens.some(t => t.type === TokenType.IDENTIFIER);
      
      expect(hasMacroStart).toBe(true);
      expect(hasIdentifier).toBe(true);
    });

    test('should tokenize comments', () => {
      const tokens = lexer.tokenize('<#-- This is a comment -->');
      
      // Comments are handled as a single token
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.some(t => t.value.includes('comment'))).toBe(true);
    });
  });

  describe('Operators and punctuation', () => {
    test('should tokenize assignment operators', () => {
      const tokens = lexer.tokenize('=');
      expect(tokens.some(t => t.type === TokenType.ASSIGN)).toBe(true);
      
      const tokens2 = lexer.tokenize('+=');
      expect(tokens2.some(t => t.type === TokenType.PLUS_ASSIGN)).toBe(true);
    });

    test('should tokenize comparison operators', () => {
      const tokens = lexer.tokenize('==');
      expect(tokens.some(t => t.type === TokenType.EQUAL)).toBe(true);
      
      const tokens2 = lexer.tokenize('!=');
      expect(tokens2.some(t => t.type === TokenType.NOT_EQUAL)).toBe(true);
    });

    test('should tokenize logical operators', () => {
      const tokens = lexer.tokenize('&&');
      expect(tokens.some(t => t.type === TokenType.AND)).toBe(true);
      
      const tokens2 = lexer.tokenize('||');
      expect(tokens2.some(t => t.type === TokenType.OR)).toBe(true);
    });

    test('should tokenize range operators', () => {
      const tokens = lexer.tokenize('..');
      expect(tokens.some(t => t.type === TokenType.RANGE)).toBe(true);
      
      const tokens2 = lexer.tokenize('...');
      expect(tokens2.some(t => t.type === TokenType.RANGE_INCLUSIVE)).toBe(true);
    });
  });

  describe('Literals', () => {
    test('should tokenize string literals', () => {
      const tokens = lexer.tokenize('"hello"');
      expect(tokens.some(t => t.type === TokenType.STRING_LITERAL)).toBe(true);
      
      const tokens2 = lexer.tokenize("'world'");
      expect(tokens2.some(t => t.type === TokenType.STRING_LITERAL)).toBe(true);
    });

    test('should tokenize number literals', () => {
      const tokens = lexer.tokenize('42');
      expect(tokens.some(t => t.type === TokenType.NUMBER_LITERAL && t.value === '42')).toBe(true);
      
      const tokens2 = lexer.tokenize('3.14');
      expect(tokens2.some(t => t.type === TokenType.NUMBER_LITERAL && t.value === '3.14')).toBe(true);
    });

    test('should tokenize boolean literals', () => {
      const tokens = lexer.tokenize('true');
      expect(tokens.some(t => t.type === TokenType.BOOLEAN_LITERAL && t.value === 'true')).toBe(true);
      
      const tokens2 = lexer.tokenize('false');
      expect(tokens2.some(t => t.type === TokenType.BOOLEAN_LITERAL && t.value === 'false')).toBe(true);
    });
  });

  describe('Keywords', () => {
    test('should tokenize FreeMarker keywords', () => {
      const tokens = lexer.tokenize('if');
      expect(tokens.some(t => t.type === TokenType.IF)).toBe(true);
      
      const tokens2 = lexer.tokenize('list');
      expect(tokens2.some(t => t.type === TokenType.LIST)).toBe(true);
    });
  });

  describe('Position tracking', () => {
    test('should track positions', () => {
      const tokens = lexer.tokenize('test');
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].position).toBeDefined();
      expect(tokens[0].position.line).toBeGreaterThan(0);
    });
  });

  describe('Complex templates', () => {
    test('should tokenize complete FreeMarker template', () => {
      const template = '<#if condition>${value}</#if>';
      const tokens = lexer.tokenize(template);
      
      // Should contain various token types
      expect(tokens.some(t => t.type === TokenType.DIRECTIVE_START)).toBe(true);
      expect(tokens.some(t => t.type === TokenType.IF)).toBe(true);
      expect(tokens.some(t => t.type === TokenType.INTERPOLATION_START)).toBe(true);
    });
  });

  describe('Basic functionality', () => {
    test('should not crash on empty input', () => {
      const tokens = lexer.tokenize('');
      expect(tokens).toBeDefined();
      expect(tokens.length).toBeGreaterThan(0); // Should at least have EOF
    });

    test('should handle simple text', () => {
      const tokens = lexer.tokenize('hello');
      expect(tokens).toBeDefined();
      expect(tokens.some(t => t.value.includes('hello'))).toBe(true);
    });
  });
});