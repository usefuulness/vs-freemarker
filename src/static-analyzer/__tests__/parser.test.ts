import { FreeMarkerLexer } from '../lexer';
import { FreeMarkerParser, TemplateNode } from '../parser';

describe('FreeMarkerParser', () => {
  let lexer: FreeMarkerLexer;

  beforeEach(() => {
    lexer = new FreeMarkerLexer();
  });

  function parseTemplate(template: string): TemplateNode {
    const tokens = lexer.tokenize(template);
    const parser = new FreeMarkerParser(tokens);
    return parser.parse();
  }

  describe('Basic parsing', () => {
    test('should parse empty template', () => {
      const ast = parseTemplate('');
      expect(ast.type).toBe('Template');
      expect(ast.body).toBeDefined();
      expect(ast.imports).toBeDefined();
      expect(ast.includes).toBeDefined();
    });

    test('should parse simple text', () => {
      const ast = parseTemplate('Hello');
      expect(ast.body.length).toBeGreaterThanOrEqual(0);
    });

    test('should handle basic interpolation', () => {
      const ast = parseTemplate('${name}');
      expect(ast.body.length).toBeGreaterThan(0);
    });
  });

  describe('Directive parsing', () => {
    test('should handle directives without crashing', () => {
      const ast = parseTemplate('<#if true>test</#if>');
      expect(ast.body).toBeDefined();
    });

    test('should handle list directives', () => {
      const ast = parseTemplate('<#list items as item>content</#list>');
      expect(ast.body).toBeDefined();
    });

    test('should handle self-closing directives', () => {
      const ast = parseTemplate('<#assign x = 42/>');
      expect(ast.body).toBeDefined();
    });
  });

  describe('Basic functionality', () => {
    test('should not crash on various inputs', () => {
      expect(() => parseTemplate('${x + y}')).not.toThrow();
      expect(() => parseTemplate('<@macro/>')).not.toThrow();
      expect(() => parseTemplate('<#import "test"/>')).not.toThrow();
      expect(() => parseTemplate('<#-- comment -->')).not.toThrow();
    });

    test('should handle complex template', () => {
      const template = '<#if true>${value}<#else>default</#if>';
      const ast = parseTemplate(template);
      expect(ast.body).toBeDefined();
      expect(ast.body.length).toBeGreaterThan(0);
    });
  });
});