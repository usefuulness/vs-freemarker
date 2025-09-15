import * as path from 'path';
import * as fs from 'fs';
import { ImportNode, IncludeNode, TemplateNode } from './parser';
import { FreeMarkerStaticAnalyzer } from './index';
import { LRUCache } from './lru-cache';

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: Map<string, string[]>;
  circularDependencies: string[][];
}

export interface DependencyNode {
  uri: string;
  content?: string;
  ast?: TemplateNode;
  imports: ImportInfo[];
  includes: IncludeInfo[];
  isResolved: boolean;
  lastModified?: Date;
  errors: string[];
}

export interface ImportInfo {
  path: string;
  alias: string;
  resolvedPath?: string;
  node: ImportNode;
}

export interface IncludeInfo {
  path: string;
  resolvedPath?: string;
  node: IncludeNode;
}

export interface ResolverOptions {
  basePath: string;
  templateDirectories: string[];
  extensions: string[];
  maxDepth: number;
  followSymlinks: boolean;
  cacheEnabled: boolean;
  maxCacheSize: number;
}

export class ImportResolver {
  private dependencyGraph: DependencyGraph;
  private analyzer: FreeMarkerStaticAnalyzer;
  private options: ResolverOptions;
  private cache: LRUCache<string, DependencyNode>;
  private resolutionStack: Set<string> = new Set();

  constructor(analyzer: FreeMarkerStaticAnalyzer, options: Partial<ResolverOptions> = {}) {
    this.analyzer = analyzer;
    this.dependencyGraph = {
      nodes: new Map(),
      edges: new Map(),
      circularDependencies: []
    };

    this.options = {
      basePath: process.cwd(),
      templateDirectories: ['templates', 'views', 'src'],
      extensions: ['.ftl', '.ftlh', '.ftlx'],
      maxDepth: 10,
      followSymlinks: false,
      cacheEnabled: true,
      maxCacheSize: 200,
      ...options
    };
    
    this.cache = new LRUCache<string, DependencyNode>(this.options.maxCacheSize);

  }

  public async resolveImports(rootUri: string, content?: string): Promise<DependencyGraph> {
    this.resolutionStack.clear();
    this.dependencyGraph = {
      nodes: new Map(),
      edges: new Map(),
      circularDependencies: []
    };

    await this.resolveTemplate(rootUri, 0, content);
    this.detectCircularDependencies();
    
    return this.dependencyGraph;
  }

  private async resolveTemplate(uri: string, depth: number, content?: string): Promise<DependencyNode> {
    if (depth > this.options.maxDepth) {
      throw new Error(`Maximum dependency depth exceeded: ${this.options.maxDepth}`);
    }

    const normalizedUri = this.normalizeUri(uri);
    
    // Check for circular dependencies
    if (this.resolutionStack.has(normalizedUri)) {
      throw new Error(`Circular dependency detected: ${Array.from(this.resolutionStack).join(' -> ')} -> ${normalizedUri}`);
    }

    // Check cache first
    if (this.options.cacheEnabled) {
      const cached = this.cache.get(normalizedUri);
      if (cached && (await this.isCacheValid(cached))) {
        return cached;
      }

      if (cached) {
        this.cache.delete(normalizedUri);
      }
    }

    this.resolutionStack.add(normalizedUri);

    try {
      const node = await this.createDependencyNode(normalizedUri, content);
      
      if (node.ast) {
        // Process imports
        for (const importNode of node.ast.imports) {
          const importInfo: ImportInfo = {
            path: importNode.path,
            alias: importNode.alias,
            node: importNode
          };

          try {
            importInfo.resolvedPath = await this.resolveImportPath(importNode.path, normalizedUri);
            if (importInfo.resolvedPath) {
              importNode.resolvedPath = importInfo.resolvedPath;
              
              // Add edge to dependency graph
              this.addEdge(normalizedUri, importInfo.resolvedPath);
              
              // Recursively resolve the imported template
              await this.resolveTemplate(importInfo.resolvedPath, depth + 1, undefined);
            }
          } catch (error) {
            node.errors.push(`Failed to resolve import "${importNode.path}": ${(error as Error).message}`);
          }

          node.imports.push(importInfo);
        }

        // Process includes
        for (const includeNode of node.ast.includes) {
          const includeInfo: IncludeInfo = {
            path: includeNode.path,
            node: includeNode
          };

          try {
            includeInfo.resolvedPath = await this.resolveIncludePath(includeNode.path, normalizedUri);
            if (includeInfo.resolvedPath) {
              includeNode.resolvedPath = includeInfo.resolvedPath;
              
              // Add edge to dependency graph
              this.addEdge(normalizedUri, includeInfo.resolvedPath);
              
              // Recursively resolve the included template
              await this.resolveTemplate(includeInfo.resolvedPath, depth + 1, undefined);
            }
          } catch (error) {
            node.errors.push(`Failed to resolve include "${includeNode.path}": ${(error as Error).message}`);
          }

          node.includes.push(includeInfo);
        }
      }

      node.isResolved = true;
      this.dependencyGraph.nodes.set(normalizedUri, node);
      
      if (this.options.cacheEnabled) {
        this.cache.set(normalizedUri, node);
      }

      return node;
    } finally {
      this.resolutionStack.delete(normalizedUri);
    }
  }

  private async createDependencyNode(uri: string, content?: string): Promise<DependencyNode> {
    let templateContent = content;
    let lastModified: Date | undefined;
    
    if (!templateContent) {
      try {
        templateContent = await this.readFile(uri);
        const stats = await this.getFileStats(uri);
        lastModified = stats?.mtime;
      } catch (error) {
        return {
          uri,
          imports: [],
          includes: [],
          isResolved: false,
          errors: [`Failed to read file: ${(error as Error).message}`]
        };
      }
    }

    const node: DependencyNode = {
      uri,
      content: templateContent,
      imports: [],
      includes: [],
      isResolved: false,
      lastModified,
      errors: []
    };

    try {
      const result = this.analyzer.analyze(templateContent, uri);
      node.ast = result.ast;
      
      // Add any analysis errors
      for (const diagnostic of result.diagnostics) {
        if (diagnostic.severity === 'error') {
          node.errors.push(diagnostic.message);
        }
      }
    } catch (error) {
      node.errors.push(`Failed to analyze template: ${(error as Error).message}`);
    }

    return node;
  }

  private async resolveImportPath(importPath: string, currentUri: string): Promise<string> {
    // Handle relative imports
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      const currentDir = path.dirname(currentUri);
      const resolvedPath = path.resolve(currentDir, importPath);
      return await this.findTemplateFile(resolvedPath);
    }

    // Handle absolute imports
    if (path.isAbsolute(importPath)) {
      return await this.findTemplateFile(importPath);
    }

    // Handle template directory lookups
    for (const templateDir of this.options.templateDirectories) {
      const basePath = path.isAbsolute(templateDir) 
        ? templateDir 
        : path.join(this.options.basePath, templateDir);
      
      const candidatePath = path.join(basePath, importPath);
      
      try {
        const resolvedPath = await this.findTemplateFile(candidatePath);
        return resolvedPath;
      } catch {
        // Continue to next directory
      }
    }

    throw new Error(`Template not found: ${importPath}`);
  }

  private async resolveIncludePath(includePath: string, currentUri: string): Promise<string> {
    // Include path resolution follows same rules as import
    return this.resolveImportPath(includePath, currentUri);
  }

  private async findTemplateFile(basePath: string): Promise<string> {
    // Try the path as-is first
    if (await this.fileExists(basePath)) {
      return this.normalizeUri(basePath);
    }

    // Try with extensions
    for (const ext of this.options.extensions) {
      const pathWithExt = basePath + ext;
      if (await this.fileExists(pathWithExt)) {
        return this.normalizeUri(pathWithExt);
      }
    }

    // Try as directory with index file
    for (const ext of this.options.extensions) {
      const indexPath = path.join(basePath, 'index' + ext);
      if (await this.fileExists(indexPath)) {
        return this.normalizeUri(indexPath);
      }
    }

    throw new Error(`Template file not found: ${basePath}`);
  }

  private addEdge(from: string, to: string): void {
    if (!this.dependencyGraph.edges.has(from)) {
      this.dependencyGraph.edges.set(from, []);
    }
    const edges = this.dependencyGraph.edges.get(from)!;
    if (!edges.includes(to)) {
      edges.push(to);
    }
  }

  private detectCircularDependencies(): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const circularDeps: string[][] = [];

    const dfs = (node: string, path: string[]): void => {
      if (recursionStack.has(node)) {
        const cycleStart = path.indexOf(node);
        circularDeps.push([...path.slice(cycleStart), node]);
        return;
      }

      if (visited.has(node)) {
        return;
      }

      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const edges = this.dependencyGraph.edges.get(node) || [];
      for (const neighbor of edges) {
        dfs(neighbor, [...path]);
      }

      recursionStack.delete(node);
      path.pop();
    };

    for (const node of this.dependencyGraph.nodes.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    this.dependencyGraph.circularDependencies = circularDeps;
  }

  private normalizeUri(uri: string): string {
    return path.resolve(uri).replace(/\\/g, '/');
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async readFile(filePath: string): Promise<string> {
    return fs.promises.readFile(filePath, 'utf8');
  }

  private async getFileStats(filePath: string): Promise<fs.Stats | null> {
    try {
      return await fs.promises.stat(filePath);
    } catch {
      return null;
    }
  }

  private async isCacheValid(cachedNode: DependencyNode): Promise<boolean> {
    if (!cachedNode.lastModified) {
      return false;
    }

    try {
      const stats = await this.getFileStats(cachedNode.uri);
      return stats ? stats.mtime <= cachedNode.lastModified : false;
    } catch {
      return false;
    }
  }

  public getDependencyGraph(): DependencyGraph {
    return this.dependencyGraph;
  }

  public getResolvedImports(uri: string): ImportInfo[] {
    const node = this.dependencyGraph.nodes.get(this.normalizeUri(uri));
    return node?.imports || [];
  }

  public getResolvedIncludes(uri: string): IncludeInfo[] {
    const node = this.dependencyGraph.nodes.get(this.normalizeUri(uri));
    return node?.includes || [];
  }

  public getDependents(uri: string): string[] {
    const normalizedUri = this.normalizeUri(uri);
    const dependents: string[] = [];
    
    for (const [source, targets] of this.dependencyGraph.edges) {
      if (targets.includes(normalizedUri)) {
        dependents.push(source);
      }
    }
    
    return dependents;
  }

  public getDependencies(uri: string): string[] {
    const normalizedUri = this.normalizeUri(uri);
    return this.dependencyGraph.edges.get(normalizedUri) || [];
  }

  public getAllDependencies(uri: string): string[] {
    const normalizedUri = this.normalizeUri(uri);
    const visited = new Set<string>();
    const stack = [normalizedUri];
    
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      
      visited.add(current);
      const deps = this.getDependencies(current);
      stack.push(...deps);
    }
    
    visited.delete(normalizedUri); // Remove the root
    return Array.from(visited);
  }

  public invalidateCache(uri?: string): void {
    if (uri) {
      this.cache.delete(this.normalizeUri(uri));
    } else {
      this.cache.clear();
    }
  }

  public updateOptions(options: Partial<ResolverOptions>): void {
    this.options = {
      ...this.options,
      ...options
    };

    if (options.maxCacheSize !== undefined) {
      this.cache.setMaxSize(options.maxCacheSize);
    }

    if (options.cacheEnabled === false) {
      this.cache.clear();
    }
  }
}
