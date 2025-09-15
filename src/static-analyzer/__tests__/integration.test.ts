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
    test('should analyze basic FreeMarker template', async () => {
      const template = `
        <#assign title = "Test"/>
        <#if users??>
          <#list users as user>
            <div>\${user.name}</div>
          </#list>
        </#if>
      `;

      const result = await analyzer.analyze(template);

      expect(result.ast).toBeDefined();
      expect(result.performance).toBeDefined();
      expect(result.semanticInfo).toBeDefined();
      expect(result.diagnostics).toBeDefined();
    });

    test('should not crash on complex template', async () => {
      const template = `
        <#macro card user>
          <div>\${user.name}</div>
        </#macro>
        <#function getName user>
          <#return user.name/>
        </#function>
        <@card user=currentUser/>
      `;

      await expect(analyzer.analyze(template)).resolves.toBeDefined();
    });

    test('should handle incremental analysis', async () => {
      const template1 = '<#assign x = 1/>';
      const template2 = '<#assign x = 1/><#assign y = 2/>';

      const result1 = await analyzer.analyze(template1);
      const result2 = await analyzer.analyzeIncremental(template2, [], result1);

      expect(result2).toBeDefined();
      expect(result2.semanticInfo).toBeDefined();
    });

      test('reports missing import as diagnostic', () => {
        const template = '<#import "missing.ftl" as m/>';
        const result = analyzer.analyze(template, '/project/main.ftl');

        expect(result.diagnostics.some(d => d.code === 'FTL4001')).toBe(true);
      });

      test('reports missing transitive dependency as diagnostic', () => {
        const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-transitive-'));
        const projectDir = path.join(workspaceDir, 'project');
        fs.mkdirSync(projectDir, { recursive: true });

        const helpersPath = path.join(projectDir, 'helpers.ftl');
        fs.writeFileSync(helpersPath, '<#include "/project/missing.ftl"/>');

        const batchPath = path.join(projectDir, 'batch.ftl');
        fs.writeFileSync(batchPath, '<#import "/project/helpers.ftl" as helpers/>');

        const mainTemplate = '<#import "/project/batch.ftl" as batch/>';
        const mainPath = path.join(workspaceDir, 'main.ftl');
        fs.writeFileSync(mainPath, mainTemplate);

        analyzer.setTemplateRoots([workspaceDir]);
        const result = analyzer.analyze(mainTemplate, mainPath);

        const diag = result.diagnostics.find(
          d => d.code === 'FTL4001' && d.message.includes('missing.ftl')
        );
        expect(diag).toBeDefined();
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

      test('handles recursive macro calls without infinite recursion', () => {
        const template = [
          '<#macro first><@second/></#macro>',
          '<#macro second><@first/></#macro>',
          '<@first/>'
        ].join('');

        expect(() => analyzer.analyze(template)).not.toThrow();
      });

      test('makes macros from included templates available', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-include-'));
        const layoutsDir = path.join(tmpDir, 'layouts');
        fs.mkdirSync(layoutsDir, { recursive: true });
        const layoutPath = path.join(layoutsDir, 'main.ftl');
        fs.writeFileSync(layoutPath, '<#macro layout title>${title}</#macro>');

        const template = '<#include "/layouts/main.ftl"/><@layout title="Home"></@layout>';
        const mainPath = path.join(tmpDir, 'page.ftl');
        fs.writeFileSync(mainPath, template);

        analyzer.setTemplateRoots([tmpDir]);
        const result = analyzer.analyze(template, mainPath);

        expect(result.diagnostics.some(d => d.code === 'FTL2004' && d.message.includes('layout'))).toBe(false);

        const templateWithParam = '<#include path="/layouts/main.ftl"/><@layout title="Home"></@layout>';
        const resultWithParam = analyzer.analyze(templateWithParam, mainPath);
        expect(resultWithParam.diagnostics.some(d => d.code === 'FTL2004' && d.message.includes('layout'))).toBe(false);
      });

      test('resolves imports relative to configured template roots', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-import-'));
        const layoutsDir = path.join(tmpDir, 'layouts');
        fs.mkdirSync(layoutsDir, { recursive: true });
        const importPath = path.join(layoutsDir, 'main.ftl');
        fs.writeFileSync(importPath, '<#macro layout title>${title}</#macro>');

        const template = '<#import "/layouts/main.ftl" as layout/>' +
          '<@layout.layout title="Home"/>';
        const mainPath = path.join(tmpDir, 'page.ftl');
        fs.writeFileSync(mainPath, template);

        analyzer.setTemplateRoots([tmpDir]);
        const result = analyzer.analyze(template, mainPath);

        expect(result.diagnostics.some(d => d.code === 'FTL2004' && d.message.includes('layout'))).toBe(false);
      });

      test('parses hash and list literals without introducing placeholder variables', () => {
        const template = '<#assign config = {"columns": ["name", "status"], "pageable": {"size": 20}}/>';
        const result = analyzer.analyze(template);

        expect(result.diagnostics.some(d => d.code === 'FTL2001' && /unknown/.test(d.message))).toBe(false);
      });

      test('treats macro-style import directive like standard import', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-macro-import-'));
        const projectDir = path.join(tmpDir, 'project');
        fs.mkdirSync(projectDir, { recursive: true });
        const batchPath = path.join(projectDir, 'batch.ftl');
        fs.writeFileSync(
          batchPath,
          '<#macro result col entry>${col}${entry.properties.status!""}</#macro>' +
            '<#macro rollbackImport type entry>${type}${entry.properties.status!""}</#macro>'
        );

        const template =
          '<@import path="/project/batch.ftl" ns="batch" />' +
          '<#assign col="result"/>' +
          '<#assign entry = {"properties": {"status": "OPEN"}}/>' +
          '<@batch.result col entry />' +
          '<@batch.rollbackImport "DocGroupFile" entry />';
        const mainPath = path.join(tmpDir, 'config.ftl');
        fs.writeFileSync(mainPath, template);

        analyzer.setTemplateRoots([tmpDir]);
        const result = analyzer.analyze(template, mainPath);

        expect(result.diagnostics.some(d => d.code === 'FTL2004')).toBe(false);
        expect(result.diagnostics.some(d => d.code === 'FTL2001' && /unknown/.test(d.message))).toBe(false);
      });

      test('treats macro-style include directive like standard include', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-macro-include-'));
        const layoutsDir = path.join(tmpDir, 'layouts');
        fs.mkdirSync(layoutsDir, { recursive: true });
        const layoutPath = path.join(layoutsDir, 'main.ftl');
        fs.writeFileSync(layoutPath, '<#macro layout title>${title}</#macro>');

        const template = '<@include path="/layouts/main.ftl" />' + '<@layout title="Dashboard"></@layout>';
        const mainPath = path.join(tmpDir, 'index.ftl');
        fs.writeFileSync(mainPath, template);

        analyzer.setTemplateRoots([tmpDir]);
        const result = analyzer.analyze(template, mainPath);

        expect(result.diagnostics.some(d => d.code === 'FTL2004' && d.message.includes('layout'))).toBe(false);
      });

      test('does not report missing files for optional includes', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-optional-include-'));
        const template = '<@include path="/missing.ftl" optional=true />';
        const mainPath = path.join(tmpDir, 'index.ftl');
        fs.writeFileSync(mainPath, template);

        analyzer.setTemplateRoots([tmpDir]);
        const result = analyzer.analyze(template, mainPath);

        expect(result.diagnostics.some(d => d.code === 'FTL4001')).toBe(false);
      });

      test('supports lambda expressions inside built-ins without undefined diagnostics', () => {
        const template = '<#assign trimmed = [" a ", "b "]?map(lang -> lang?trim)/>${trimmed?size}';
        const result = analyzer.analyze(template);

        expect(result.diagnostics.some(d => d.code === 'FTL2001' && /lang/.test(d.message))).toBe(false);
        expect(result.diagnostics.some(d => d.code === 'FTL2001' && /unknown/.test(d.message))).toBe(false);
      });

      test('allows macros to reference helpers defined later in the template', () => {
        const template =
          '<#macro layout><@helper/></#macro>' +
          '<#macro helper>${"ok"}</#macro>' +
          '<@layout />';
        const result = analyzer.analyze(template);

        expect(result.diagnostics.some(d => d.code === 'FTL2004')).toBe(false);
      });

      test('analyzes included layouts that use lambdas and optional includes', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-layout-lambda-'));
        const layoutsDir = path.join(tmpDir, 'layouts');
        fs.mkdirSync(layoutsDir, { recursive: true });
        const layoutPath = path.join(layoutsDir, 'main.ftl');
        fs.writeFileSync(
          layoutPath,
          `<#macro layout title>
  <#assign languages = ["de", "en"]?map(lang -> lang?upper_case) />
  <@stylesheet href="/assets/css/main.css" />
  <@include path="/partials/missing.ftl" optional=true />
  <#nested>
</#macro>
<#macro stylesheet href>
  <link rel="stylesheet" href="\${href}">
</#macro>`
        );

        const template = '<@include path="/layouts/main.ftl" />' + '<@layout title="Home">Hello</@layout>';
        const mainPath = path.join(tmpDir, 'page.ftl');
        fs.writeFileSync(mainPath, template);

        analyzer.setTemplateRoots([tmpDir]);
        const result = analyzer.analyze(template, mainPath);

        expect(result.diagnostics.some(d => d.code === 'FTL2004')).toBe(false);
        expect(result.diagnostics.some(d => d.code === 'FTL2001' && /lang|unknown/.test(d.message))).toBe(false);
        expect(result.diagnostics.some(d => d.code === 'FTL4001')).toBe(false);
      });

      test('resolves absolute imports using ancestor directories as template roots', () => {
        const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-root-detect-'));
        const templatesDir = path.join(workspaceDir, 'src', 'templates');
        const projectDir = path.join(templatesDir, 'project');
        fs.mkdirSync(projectDir, { recursive: true });

        const helpersPath = path.join(projectDir, 'helpers.ftl');
        fs.writeFileSync(helpersPath, '<#macro render col entry>${col}${entry.properties.status!""}</#macro>');

        const batchPath = path.join(projectDir, 'batch.ftl');
        fs.writeFileSync(
          batchPath,
          '<@import path="/project/helpers.ftl" ns="helpers" />' +
            '<#macro result col entry><@helpers.render col entry /></#macro>'
        );

        const configDir = path.join(templatesDir, 'pages', 'admin', 'documents', 'import-dgf');
        fs.mkdirSync(configDir, { recursive: true });

        const template =
          '<@import path="/project/batch.ftl" ns="batch" />' +
          '<#assign col="result"/>' +
          '<#assign entry = {"properties": {"status": "OPEN"}}/>' +
          '<@batch.result col entry />';
        const mainPath = path.join(configDir, 'config.ftl');
        fs.writeFileSync(mainPath, template);

        analyzer.setTemplateRoots([workspaceDir]);
        const result = analyzer.analyze(template, mainPath);

        expect(result.diagnostics.some(d => d.code === 'FTL4001')).toBe(false);
        expect(result.diagnostics.some(d => d.code === 'FTL2004')).toBe(false);
        expect(result.diagnostics.some(d => d.code === 'FTL2001')).toBe(false);
      });
    });

  describe('Basic robustness', () => {
    test('should handle simple malformed template', async () => {
      const template = '<#assign x = "test"/>${x}';
      await expect(analyzer.analyze(template)).resolves.toBeDefined();
    });

    test('should handle empty template', async () => {
      await expect(analyzer.analyze('')).resolves.toBeDefined();
    });
  });
});
