import { FreeMarkerStaticAnalyzer } from '../index';
import { ImportResolver } from '../import-resolver';

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
