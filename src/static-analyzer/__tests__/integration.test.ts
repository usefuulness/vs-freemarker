import { FreeMarkerStaticAnalyzer } from '../index';
import { ImportResolver } from '../import-resolver';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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
        const diag = result.diagnostics.find(d => d.code === 'FTL2001');
        expect(diag).toBeDefined();
        expect(diag?.range.start.line).toBe(1);
        expect(diag?.range.start.character).toBe(3);
        expect(diag?.range.end.character).toBe(6);
      });

      test('reports syntax error as diagnostic', () => {
        const template = '${foo';
        const result = analyzer.analyze(template);

        expect(result.diagnostics.some(d => d.code === 'FTL1005')).toBe(true);
      });

      test('treats variable as defined after null check', () => {
        const template = `<#if user??>\${user}</#if>`;
        const result = analyzer.analyze(template);
        expect(result.diagnostics.some(d => d.code === 'FTL2001' && d.message.includes('user'))).toBe(false);
      });

      test('supports fallback default operator', () => {
        const template = '${foo!"bar"}';
        const result = analyzer.analyze(template);
        expect(result.diagnostics.some(d => d.code === 'FTL2001')).toBe(false);
      });

      test('handles list with key and value variables', () => {
        const template = '<#list others as attrName, attrVal>${attrName}="${attrVal?string}"</#list>';
        const result = analyzer.analyze(template);
        expect(result.diagnostics.some(d => d.message.includes('attrName'))).toBe(false);
        expect(result.diagnostics.some(d => d.message.includes('attrVal'))).toBe(false);
      });

      test('imports macro and applies assigned variables globally', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-'));
        const macroPath = path.join(tmpDir, 'macros.ftl');
        fs.writeFileSync(macroPath, '<#macro init><#assign x=1></#macro>');

        const mainTemplate = `<#import "${macroPath}" as m/><@m.init/>\${x}`;
        const mainPath = path.join(tmpDir, 'main.ftl');
        fs.writeFileSync(mainPath, mainTemplate);
        const result = analyzer.analyze(mainTemplate, mainPath);

        expect(result.diagnostics.some(d => d.code === 'FTL2001' && d.message.includes('x'))).toBe(false);
      });

      test('parses macro calls with parameters correctly', () => {
        const template =
          '<#macro layout title></#macro>' +
          '<#macro include path></#macro>' +
          '<@layout title="foo"></@layout>' +
          '<@include path="bar"/>';
        const result = analyzer.analyze(template);
        expect(result.diagnostics.some(d => d.code === 'FTL2004' && /(title|path)/.test(d.message))).toBe(false);
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