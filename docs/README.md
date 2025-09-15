# FreeMarker Static Analyzer

A comprehensive static analysis engine for FreeMarker templates with support for syntax analysis, semantic validation, import resolution, and performance profiling.

## Features

### 🔍 **Comprehensive Analysis**
- **Lexical Analysis**: Tokenizes FreeMarker templates with support for all syntax variants
- **Syntax Analysis**: Builds Abstract Syntax Trees (AST) with complete language support
- **Semantic Analysis**: Variable scoping, type inference, and symbol resolution
- **Import Resolution**: Dependency graph construction with circular dependency detection
- **Error Reporting**: Detailed diagnostics with categorized error codes

### ⚡ **Performance Optimized**
- **Incremental Analysis**: Only re-analyze changed portions of templates
- **Caching**: Intelligent caching of parsed and analyzed templates
- **Performance Profiling**: Built-in performance monitoring and optimization suggestions
- **Memory Efficient**: Optimized for large template files and complex dependency graphs

### 🔧 **Advanced Features**
- **Import Traversal**: Complete dependency resolution across template hierarchies
- **Type System**: Advanced type inference for template variables and expressions
- **Built-in Support**: Full support for FreeMarker built-in functions and directives
- **Error Recovery**: Robust error handling that continues analysis despite syntax errors

## Installation

```bash
npm install @freemarker/static-analyzer
```

## Quick Start

```typescript
import { FreeMarkerStaticAnalyzer } from '@freemarker/static-analyzer';

const analyzer = new FreeMarkerStaticAnalyzer();

const template = `
<#assign message = "Hello World"/>
<#list users as user>
  <div>\${user.name}: \${message}</div>
</#list>
`;

const result = analyzer.analyze(template);

console.log('Variables:', Array.from(result.semanticInfo.variables.keys()));
console.log('Diagnostics:', result.diagnostics);
console.log('Performance:', result.performance);
```

## API Reference

### FreeMarkerStaticAnalyzer

The main analyzer class that orchestrates lexical, syntactic, and semantic analysis.

#### Methods

##### `analyze(content: string, uri?: string): AnalysisResult`

Performs complete static analysis of a FreeMarker template.

**Parameters:**
- `content` - The template content to analyze
- `uri` - Optional URI for the template (used for import resolution)

**Returns:** `AnalysisResult` containing:
- `ast` - Abstract Syntax Tree
- `diagnostics` - Array of diagnostic messages
- `semanticInfo` - Symbol table and type information
- `performance` - Performance metrics

##### `analyzeIncremental(content: string, changes: TextChange[], previousResult?: AnalysisResult): AnalysisResult`

Performs incremental analysis, optimizing for changed content.

### Import Resolution

```typescript
import { ImportResolver } from '@freemarker/static-analyzer';

const resolver = new ImportResolver(analyzer, {
  basePath: '/project',
  templateDirectories: ['templates', 'views'],
  extensions: ['.ftl', '.ftlh'],
  maxDepth: 10
});

const dependencyGraph = await resolver.resolveImports('/project/main.ftl', content);
```

#### Configuration Options

- `basePath` - Base directory for resolving relative paths
- `templateDirectories` - Directories to search for templates
- `extensions` - File extensions to try when resolving imports
- `maxDepth` - Maximum depth for dependency resolution
- `cacheEnabled` - Enable/disable result caching
- `maxCacheSize` - Maximum number of templates cached before evicting the least recently used entry

Use `invalidateCache()` to manually clear cached entries or trigger the `FreeMarker: Clear Template Cache` command in VS Code when template roots change.

### Error Reporting

```typescript
import { ErrorReporter } from '@freemarker/static-analyzer';

const reporter = new ErrorReporter();

// Add custom diagnostics
reporter.addError('Custom error message', range, 'CUSTOM001');
reporter.addWarning('Performance warning', range);

// Get categorized diagnostics
const syntaxErrors = reporter.getDiagnosticsByCategory(ErrorCategory.SYNTAX);
const typeErrors = reporter.getDiagnosticsByCategory(ErrorCategory.TYPE);
```

### Performance Profiling

```typescript
import { PerformanceProfiler } from '@freemarker/static-analyzer';

const profiler = new PerformanceProfiler();

profiler.start();
profiler.startPhase('parsing');
// ... parsing logic
const parsingTime = profiler.endPhase('parsing');

const report = profiler.generateReport();
console.log('Recommendations:', report.recommendations);
```

## Advanced Usage

### Custom Analysis Pipeline

```typescript
import { 
  FreeMarkerLexer, 
  FreeMarkerParser, 
  SemanticAnalyzer,
  ErrorReporter,
  PerformanceProfiler
} from '@freemarker/static-analyzer';

// Create custom pipeline
const lexer = new FreeMarkerLexer();
const parser = new FreeMarkerParser();
const semanticAnalyzer = new SemanticAnalyzer();
const errorReporter = new ErrorReporter();
const profiler = new PerformanceProfiler();

// Custom analysis workflow
profiler.start();

const tokens = lexer.tokenize(content);
const ast = parser.parse(tokens);
const semanticInfo = semanticAnalyzer.analyze(ast);

const report = profiler.generateReport();
```

### Template Validation

```typescript
function validateTemplate(content: string): ValidationResult {
  const analyzer = new FreeMarkerStaticAnalyzer();
  const result = analyzer.analyze(content);
  
  const errors = result.diagnostics.filter(d => d.severity === 'error');
  const warnings = result.diagnostics.filter(d => d.severity === 'warning');
  
  return {
    isValid: errors.length === 0,
    errors: errors.map(e => e.message),
    warnings: warnings.map(w => w.message),
    variables: Array.from(result.semanticInfo.variables.keys()),
    macros: Array.from(result.semanticInfo.macros.keys())
  };
}
```

### Dependency Analysis

```typescript
async function analyzeDependencies(rootTemplate: string): Promise<DependencyReport> {
  const analyzer = new FreeMarkerStaticAnalyzer();
  const resolver = new ImportResolver(analyzer);
  
  const graph = await resolver.resolveImports(rootTemplate);
  
  return {
    totalFiles: graph.nodes.size,
    circularDependencies: graph.circularDependencies,
    maxDepth: calculateMaxDepth(graph),
    orphanedFiles: findOrphanedFiles(graph)
  };
}
```

### Performance Monitoring

```typescript
class TemplateAnalysisService {
  private analyzer = new FreeMarkerStaticAnalyzer();
  private cache = new Map<string, AnalysisResult>();
  
  analyzeWithCaching(uri: string, content: string): AnalysisResult {
    const cached = this.cache.get(uri);
    if (cached) {
      return cached;
    }
    
    const result = this.analyzer.analyze(content, uri);
    
    // Cache if analysis was fast and successful
    if (result.performance.totalTime < 1000 && !result.diagnostics.some(d => d.severity === 'error')) {
      this.cache.set(uri, result);
    }
    
    return result;
  }
}
```

## Error Codes Reference

### Syntax Errors (FTL1xxx)
- `FTL1001` - Unexpected token
- `FTL1002` - Missing closing tag
- `FTL1003` - Invalid directive name
- `FTL1004` - Malformed expression
- `FTL1005` - Unclosed string literal

### Semantic Errors (FTL2xxx)
- `FTL2001` - Undefined variable
- `FTL2002` - Undefined macro
- `FTL2003` - Undefined function
- `FTL2004` - Variable redefinition
- `FTL2005` - Macro redefinition

### Type Errors (FTL3xxx)
- `FTL3001` - Type mismatch
- `FTL3002` - Invalid operation on type
- `FTL3003` - Cannot convert type
- `FTL3004` - Null pointer access

### Import Errors (FTL4xxx)
- `FTL4001` - File not found
- `FTL4002` - Circular dependency
- `FTL4003` - Invalid import path

## Performance Guidelines

### Best Practices
1. **Enable Caching**: Use caching for frequently analyzed templates
2. **Incremental Analysis**: Use incremental analysis for large templates
3. **Dependency Optimization**: Keep import hierarchies shallow
4. **Error Handling**: Handle parse errors gracefully in production

### Performance Tuning
```typescript
// Optimize for large files
const analyzer = new FreeMarkerStaticAnalyzer();
const resolver = new ImportResolver(analyzer, {
  cacheEnabled: true,
  maxDepth: 5, // Limit dependency depth
  templateDirectories: ['templates'] // Reduce search paths
});

// Use incremental analysis for editors
const result = analyzer.analyzeIncremental(newContent, changes, previousResult);
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/your-org/freemarker-static-analyzer
cd freemarker-static-analyzer
npm install
npm test
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- lexer.test.ts
npm test -- parser.test.ts
npm test -- semantic-analyzer.test.ts

# Run with coverage
npm run test:coverage
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes.

## Support

- 📖 [Documentation](https://docs.freemarker-analyzer.dev)
- 🐛 [Issue Tracker](https://github.com/your-org/freemarker-static-analyzer/issues)
- 💬 [Discussions](https://github.com/your-org/freemarker-static-analyzer/discussions)
- 📧 [Email Support](mailto:support@freemarker-analyzer.dev)