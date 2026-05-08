import { FreeMarkerStaticAnalyzer } from '../../static-analyzer';
import { createSymbolIndex, getCompletionContext, getWordAtOffset } from '../symbol-index';

describe('FreeMarker IntelliSense symbol index', () => {
  test('indexes template symbols and hash/list properties', async () => {
    const template = [
      '<#assign title = "Dashboard"/>',
      '<#assign product = {"name": "Desk", "price": 42}/>',
      '<#assign users = [{"name": "Ada", "email": "ada@example.com"}]/>',
      '<#function format value><#return value?string/></#function>',
      '<#macro card user>${user.name}</#macro>',
      '<#list users as user>${user.email}</#list>',
      '${title}'
    ].join('\n');

    const analyzer = new FreeMarkerStaticAnalyzer();
    const result = await analyzer.analyze(template);
    const index = createSymbolIndex(template, result);

    expect(index.symbols.get('title')?.kind).toBe('variable');
    expect(index.symbols.get('format')?.kind).toBe('function');
    expect(index.symbols.get('card')?.parameters).toEqual(['user']);
    expect(index.symbols.get('product')?.properties.has('name')).toBe(true);
    expect(index.symbols.get('user')?.properties.has('email')).toBe(true);
    expect(index.symbols.get('title')?.usages.length).toBeGreaterThan(0);
  });

  test('detects completion contexts around FreeMarker syntax', () => {
    expect(getCompletionContext('<#as', 4).kind).toBe('directive');
    expect(getCompletionContext('${title?st', 10).kind).toBe('builtin');
    expect(getCompletionContext('${product.na', 12)).toMatchObject({
      kind: 'property',
      receiver: 'product',
      prefix: 'na'
    });
    expect(getCompletionContext('<@card', 6).kind).toBe('macro');
    expect(getCompletionContext('<#include "layout', 17).kind).toBe('path');
    const namedPath = '<#include path="layout';
    expect(getCompletionContext(namedPath, namedPath.length).kind).toBe('path');
  });

  test('finds dotted symbols at offsets', () => {
    const content = '<@layout.header title=title />';
    const offset = content.indexOf('layout.header') + 'layout.header'.length - 1;

    expect(getWordAtOffset(content, offset)?.text).toBe('layout.header');
  });
});
