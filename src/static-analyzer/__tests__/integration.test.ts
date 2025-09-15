import { FreeMarkerStaticAnalyzer } from '../index';
import { ImportResolver } from '../import-resolver';

describe('FreeMarker Static Analyzer Integration', () => {
  let analyzer: FreeMarkerStaticAnalyzer;

  beforeEach(() => {
    analyzer = new FreeMarkerStaticAnalyzer();
  });

  describe('End-to-end analysis', () => {
    test('should analyze basic FreeMarker template', () => {
      const template = `
        <#assign title = "Test"/>
        <#if users??>
          <#list users as user>
            <div>\${user.name}</div>
          </#list>
        </#if>
      `;

      const result = analyzer.analyze(template);

      expect(result.ast).toBeDefined();
      expect(result.performance).toBeDefined();
      expect(result.semanticInfo).toBeDefined();
      expect(result.diagnostics).toBeDefined();
    });

    test('should not crash on complex template', () => {
      const template = `
        <#macro card user>
          <div>\${user.name}</div>
        </#macro>
        <#function getName user>
          <#return user.name/>
        </#function>
        <@card user=currentUser/>
      `;

      expect(() => analyzer.analyze(template)).not.toThrow();
    });

    test('should handle incremental analysis', () => {
      const template1 = '<#assign x = 1/>';
      const template2 = '<#assign x = 1/><#assign y = 2/>';

      const result1 = analyzer.analyze(template1);
      const result2 = analyzer.analyzeIncremental(template2, [], result1);

      expect(result2).toBeDefined();
      expect(result2.semanticInfo).toBeDefined();
    });

      test('reports missing import as diagnostic', () => {
        const template = '<#import "missing.ftl" as m/>';
        const result = analyzer.analyze(template, '/project/main.ftl');

        expect(result.diagnostics.some(d => d.code === 'FTL4001')).toBe(true);
      });

      test('reports undefined variable as diagnostic', () => {
        const template = '${foo}';
        const result = analyzer.analyze(template);

        expect(result.diagnostics.some(d => d.code === 'FTL2001')).toBe(true);
      });

      test('reports syntax error as diagnostic', () => {
        const template = '${foo';
        const result = analyzer.analyze(template);

        expect(result.diagnostics.some(d => d.code === 'FTL1005')).toBe(true);
      });
    });

  describe('Basic robustness', () => {
    test('should handle simple malformed template', () => {
      const template = '<#assign x = "test"/>${x}';
      expect(() => analyzer.analyze(template)).not.toThrow();
    });

    test('should handle empty template', () => {
      expect(() => analyzer.analyze('')).not.toThrow();
    });
  });
});