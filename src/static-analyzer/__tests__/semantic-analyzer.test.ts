import { FreeMarkerLexer } from '../lexer';
import { FreeMarkerParser } from '../parser';
import { SemanticAnalyzer } from '../semantic-analyzer';

describe('SemanticAnalyzer', () => {
  let lexer: FreeMarkerLexer;
  let parser: FreeMarkerParser;
  let analyzer: SemanticAnalyzer;

  beforeEach(() => {
    lexer = new FreeMarkerLexer();
    parser = new FreeMarkerParser();
    analyzer = new SemanticAnalyzer();
  });

  function analyzeTemplate(template: string) {
    const tokens = lexer.tokenize(template);
    const ast = parser.parse(tokens);
    return analyzer.analyze(ast);
  }

  describe('Basic analysis', () => {
    test('should not crash on variable assignments', () => {
      expect(() => analyzeTemplate('<#assign x = 42/>')).not.toThrow();
      expect(() => analyzeTemplate('<#global x = "hello"/>')).not.toThrow();
      expect(() => analyzeTemplate('<#local x = true/>')).not.toThrow();
    });

    test('should handle variable usage', () => {
      const result = analyzeTemplate('<#assign x = 42/>${x}');
      expect(result.variables).toBeDefined();
    });

    test('should handle loop variables', () => {
      const result = analyzeTemplate('<#list items as item>${item}</#list>');
      expect(result.variables).toBeDefined();
    });
  });

  describe('Basic functionality', () => {
    test('should handle macro definitions', () => {
      expect(() => analyzeTemplate('<#macro greet name>Hello!</#macro>')).not.toThrow();
    });

    test('should handle function definitions', () => {
      expect(() => analyzeTemplate('<#function add x y><#return x + y></#function>')).not.toThrow();
    });

    test('should handle imports and includes', () => {
      expect(() => analyzeTemplate('<#import "lib.ftl" as lib/>')).not.toThrow();
      expect(() => analyzeTemplate('<#include "header.ftl"/>')).not.toThrow();
    });

    test('should analyze complex template without crashing', () => {
      const template = `
        <#assign title = "Test"/>
        <#macro card user>
          <div>${user.name}</div>
        </#macro>
        <#if users??>
          <#list users as user>
            <@card user=user/>
          </#list>
        </#if>
      `;
      
      expect(() => analyzeTemplate(template)).not.toThrow();
    });
  });
});