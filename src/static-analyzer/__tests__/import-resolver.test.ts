import { FreeMarkerStaticAnalyzer } from '../index';
import { ImportResolver } from '../import-resolver';
import * as fs from 'fs';
import * as path from 'path';

// Mock file system
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
    stat: jest.fn()
  },
  constants: {
    F_OK: 0
  }
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('ImportResolver', () => {
  let analyzer: FreeMarkerStaticAnalyzer;
  let resolver: ImportResolver;

  beforeEach(() => {
    analyzer = new FreeMarkerStaticAnalyzer();
    resolver = new ImportResolver(analyzer, {
      basePath: '/project',
      templateDirectories: ['templates', 'views'],
      extensions: ['.ftl', '.ftlh'],
      maxDepth: 5,
      followSymlinks: false,
      cacheEnabled: true
    });

    jest.clearAllMocks();
  });

  describe('Basic functionality', () => {
    test('should handle simple import resolution', async () => {
      const template = '<#import "lib.ftl" as lib/>';
      
      (mockFs.promises.access as unknown as jest.Mock).mockResolvedValue(undefined);
      (mockFs.promises.readFile as unknown as jest.Mock).mockResolvedValue('<#macro helper></#macro>');
      (mockFs.promises.stat as unknown as jest.Mock).mockResolvedValue({
        mtime: new Date(),
        isFile: () => true
      } as any);

      const graph = await resolver.resolveImports('/project/main.ftl', template);
      expect(graph.nodes.size).toBeGreaterThan(0);
    });

    test('should handle missing files gracefully', async () => {
      const template = '<#import "missing.ftl" as missing/>';
      
      (mockFs.promises.access as unknown as jest.Mock).mockRejectedValue(new Error('File not found'));

      const graph = await resolver.resolveImports('/project/main.ftl', template);

      expect(graph.nodes.size).toBeGreaterThan(0);
      // Should handle missing file without throwing
    });

    test('should create basic resolver', () => {
      expect(resolver).toBeDefined();
      expect(resolver.getDependencyGraph).toBeDefined();
    });
  });
});