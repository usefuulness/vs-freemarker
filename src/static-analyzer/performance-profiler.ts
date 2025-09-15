export interface PerformanceMetrics {
  lexingTime: number;
  parsingTime: number;
  semanticAnalysisTime: number;
  totalTime: number;
  memoryUsage?: MemoryUsage;
  tokenCount?: number;
  nodeCount?: number;
  fileSize?: number;
}

export interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

export interface PhaseMetrics {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryBefore?: MemoryUsage;
  memoryAfter?: MemoryUsage;
}

export class PerformanceProfiler {
  private startTime: number = 0;
  private phases: Map<string, PhaseMetrics> = new Map();
  private memoryTrackingEnabled: boolean = true;

  constructor(enableMemoryTracking: boolean = true) {
    this.memoryTrackingEnabled = enableMemoryTracking;
  }

  public start(): void {
    this.startTime = this.getCurrentTime();
    this.phases.clear();
  }

  public end(): number {
    const endTime = this.getCurrentTime();
    return endTime - this.startTime;
  }

  public startPhase(name: string): void {
    const phase: PhaseMetrics = {
      name,
      startTime: this.getCurrentTime(),
      memoryBefore: this.memoryTrackingEnabled ? this.getMemoryUsage() : undefined
    };
    this.phases.set(name, phase);
  }

  public endPhase(name: string): number {
    const phase = this.phases.get(name);
    if (!phase) {
      throw new Error(`Phase "${name}" was not started`);
    }

    const endTime = this.getCurrentTime();
    const duration = endTime - phase.startTime;

    phase.endTime = endTime;
    phase.duration = duration;
    phase.memoryAfter = this.memoryTrackingEnabled ? this.getMemoryUsage() : undefined;

    return duration;
  }

  public getPhaseMetrics(name: string): PhaseMetrics | undefined {
    return this.phases.get(name);
  }

  public getAllPhaseMetrics(): PhaseMetrics[] {
    return Array.from(this.phases.values());
  }

  public generateReport(): PerformanceReport {
    const totalTime = this.end();
    const phases = this.getAllPhaseMetrics();
    
    return {
      totalTime,
      phases,
      summary: this.generateSummary(phases, totalTime),
      recommendations: this.generateRecommendations(phases, totalTime)
    };
  }

  private generateSummary(phases: PhaseMetrics[], totalTime: number): PerformanceSummary {
    const summary: PerformanceSummary = {
      totalExecutionTime: totalTime,
      phaseBreakdown: new Map(),
      slowestPhase: '',
      averagePhaseTime: 0,
      memoryDelta: 0
    };

    let slowestPhaseTime = 0;
    let totalPhaseTime = 0;
    let initialMemory = 0;
    let finalMemory = 0;

    for (const phase of phases) {
      if (phase.duration !== undefined) {
        summary.phaseBreakdown.set(phase.name, {
          duration: phase.duration,
          percentage: (phase.duration / totalTime) * 100
        });

        totalPhaseTime += phase.duration;

        if (phase.duration > slowestPhaseTime) {
          slowestPhaseTime = phase.duration;
          summary.slowestPhase = phase.name;
        }

        // Track memory usage
        if (phase.memoryBefore && phase.memoryAfter) {
          if (initialMemory === 0) {
            initialMemory = phase.memoryBefore.heapUsed;
          }
          finalMemory = phase.memoryAfter.heapUsed;
        }
      }
    }

    summary.averagePhaseTime = phases.length > 0 ? totalPhaseTime / phases.length : 0;
    summary.memoryDelta = finalMemory - initialMemory;

    return summary;
  }

  private generateRecommendations(phases: PhaseMetrics[], totalTime: number): string[] {
    const recommendations: string[] = [];

    // Check for slow phases
    for (const phase of phases) {
      if (phase.duration && phase.duration > totalTime * 0.5) {
        recommendations.push(`Phase "${phase.name}" is taking ${((phase.duration / totalTime) * 100).toFixed(1)}% of total time. Consider optimization.`);
      }
    }

    // Check for memory issues
    for (const phase of phases) {
      if (phase.memoryBefore && phase.memoryAfter) {
        const memoryIncrease = phase.memoryAfter.heapUsed - phase.memoryBefore.heapUsed;
        if (memoryIncrease > 50 * 1024 * 1024) { // 50MB threshold
          recommendations.push(`Phase "${phase.name}" increased memory usage by ${(memoryIncrease / 1024 / 1024).toFixed(1)}MB. Check for memory leaks.`);
        }
      }
    }

    // Performance thresholds
    if (totalTime > 1000) { // 1 second
      recommendations.push('Total analysis time exceeds 1 second. Consider implementing incremental analysis or caching.');
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance looks good! No specific recommendations.');
    }

    return recommendations;
  }

  private getCurrentTime(): number {
    return performance.now();
  }

  private getMemoryUsage(): MemoryUsage {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return {
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        external: usage.external,
        rss: usage.rss
      };
    }
    
    // Fallback for browser environments
    return {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      rss: 0
    };
  }

  public createBenchmark(name: string): PerformanceBenchmark {
    return new PerformanceBenchmark(name, this);
  }

  public static measureFunction<T>(func: () => T, name?: string): { result: T; duration: number } {
    const start = performance.now();
    const result = func();
    const end = performance.now();
    const duration = end - start;

    if (name) {
      console.log(`Function "${name}" took ${duration.toFixed(2)}ms`);
    }

    return { result, duration };
  }

  public static async measureAsyncFunction<T>(func: () => Promise<T>, name?: string): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await func();
    const end = performance.now();
    const duration = end - start;

    if (name) {
      console.log(`Async function "${name}" took ${duration.toFixed(2)}ms`);
    }

    return { result, duration };
  }
}

export interface PerformanceReport {
  totalTime: number;
  phases: PhaseMetrics[];
  summary: PerformanceSummary;
  recommendations: string[];
}

export interface PerformanceSummary {
  totalExecutionTime: number;
  phaseBreakdown: Map<string, { duration: number; percentage: number }>;
  slowestPhase: string;
  averagePhaseTime: number;
  memoryDelta: number;
}

export class PerformanceBenchmark {
  private name: string;
  private profiler: PerformanceProfiler;
  private iterations: number = 0;
  private totalTime: number = 0;
  private minTime: number = Infinity;
  private maxTime: number = 0;
  private times: number[] = [];

  constructor(name: string, profiler: PerformanceProfiler) {
    this.name = name;
    this.profiler = profiler;
  }

  public run<T>(func: () => T): T {
    const start = performance.now();
    const result = func();
    const end = performance.now();
    const duration = end - start;

    this.recordIteration(duration);
    return result;
  }

  public async runAsync<T>(func: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await func();
    const end = performance.now();
    const duration = end - start;

    this.recordIteration(duration);
    return result;
  }

  private recordIteration(duration: number): void {
    this.iterations++;
    this.totalTime += duration;
    this.minTime = Math.min(this.minTime, duration);
    this.maxTime = Math.max(this.maxTime, duration);
    this.times.push(duration);
  }

  public getStatistics(): BenchmarkStatistics {
    if (this.iterations === 0) {
      return {
        name: this.name,
        iterations: 0,
        totalTime: 0,
        averageTime: 0,
        minTime: 0,
        maxTime: 0,
        medianTime: 0,
        standardDeviation: 0
      };
    }

    const average = this.totalTime / this.iterations;
    const sortedTimes = [...this.times].sort((a, b) => a - b);
    const median = sortedTimes[Math.floor(this.iterations / 2)];
    
    const variance = this.times.reduce((sum, time) => sum + Math.pow(time - average, 2), 0) / this.iterations;
    const standardDeviation = Math.sqrt(variance);

    return {
      name: this.name,
      iterations: this.iterations,
      totalTime: this.totalTime,
      averageTime: average,
      minTime: this.minTime,
      maxTime: this.maxTime,
      medianTime: median,
      standardDeviation
    };
  }

  public reset(): void {
    this.iterations = 0;
    this.totalTime = 0;
    this.minTime = Infinity;
    this.maxTime = 0;
    this.times = [];
  }
}

export interface BenchmarkStatistics {
  name: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  medianTime: number;
  standardDeviation: number;
}

// Utility decorators for performance measurement
export function measurePerformance(name?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const methodName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = function (...args: any[]) {
      const start = performance.now();
      const result = originalMethod.apply(this, args);
      const end = performance.now();
      
      console.log(`${methodName} took ${(end - start).toFixed(2)}ms`);
      return result;
    };

    return descriptor;
  };
}

export function measureAsyncPerformance(name?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const methodName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const start = performance.now();
      const result = await originalMethod.apply(this, args);
      const end = performance.now();
      
      console.log(`${methodName} took ${(end - start).toFixed(2)}ms`);
      return result;
    };

    return descriptor;
  };
}