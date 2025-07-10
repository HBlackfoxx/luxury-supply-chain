// backend/gateway/src/monitoring/fabric-monitor.ts
// Monitoring and Logging Framework for Fabric Operations
// Updated with correct winston v2 API

import { EventEmitter } from 'events';
import * as winston from 'winston';

export interface MetricsConfig {
  enablePrometheus: boolean;
  prometheusPort: number;
  logLevel: string;
  logFile?: string;
}

export interface Registry {
  contentType: string;
  metrics(): Promise<string>;
}

// Simple metrics storage (install prom-client for production use:)
// npm install prom-client
interface Metric {
  name: string;
  help: string;
  type: 'counter' | 'histogram' | 'gauge';
  labels: string[];
  values: Map<string, number>;
}

export class FabricMonitor extends EventEmitter {
  private logger: any; // Winston logger instance
  private metrics: Map<string, Metric> = new Map();
  private metricsRegistry: Registry;

  constructor(config: MetricsConfig) {
    super();
    this.setupLogger(config);
    this.metricsRegistry = this.createSimpleRegistry();
    this.setupMetrics(config);
  }

  private setupLogger(config: MetricsConfig): void {
    const transports: any[] = [
      new winston.transports.Console({
        colorize: true,
        timestamp: true,
        prettyPrint: true,
        level: config.logLevel
      })
    ];

    if (config.logFile) {
      transports.push(new winston.transports.File({
        filename: config.logFile,
        timestamp: true,
        json: true,
        level: config.logLevel
      }));
    }

    this.logger = new winston.Logger({
      level: config.logLevel,
      transports
    });
  }

  private createSimpleRegistry(): Registry {
    return {
      contentType: 'text/plain',
      metrics: async () => {
        let output = '';
        for (const [name, metric] of this.metrics) {
          output += `# HELP ${metric.name} ${metric.help}\n`;
          output += `# TYPE ${metric.name} ${metric.type}\n`;
          
          for (const [labels, value] of metric.values) {
            output += `${metric.name}${labels} ${value}\n`;
          }
        }
        return output;
      }
    };
  }

  private setupMetrics(config: MetricsConfig): void {
    if (!config.enablePrometheus) return;

    // Define metrics
    this.createMetric('fabric_tx_submitted_total', 'counter', 
      'Total number of transactions submitted', 
      ['channel', 'chaincode', 'function']);

    this.createMetric('fabric_tx_success_total', 'counter',
      'Total number of successful transactions',
      ['channel', 'chaincode', 'function']);

    this.createMetric('fabric_tx_failure_total', 'counter',
      'Total number of failed transactions',
      ['channel', 'chaincode', 'function', 'error_type']);

    this.createMetric('fabric_tx_duration_seconds', 'histogram',
      'Transaction execution duration in seconds',
      ['channel', 'chaincode', 'function']);

    this.createMetric('fabric_query_total', 'counter',
      'Total number of queries executed',
      ['channel', 'chaincode', 'function']);

    this.createMetric('fabric_query_duration_seconds', 'histogram',
      'Query execution duration in seconds',
      ['channel', 'chaincode', 'function']);

    this.createMetric('fabric_connection_active', 'gauge',
      'Number of active gateway connections',
      ['org']);

    this.createMetric('fabric_event_received_total', 'counter',
      'Total number of events received',
      ['chaincode', 'event_name']);

    this.createMetric('fabric_block_height', 'gauge',
      'Current block height of the channel',
      ['channel']);

    // Start metrics server
    this.startMetricsServer(config.prometheusPort);
  }

  private createMetric(name: string, type: Metric['type'], help: string, labels: string[]): void {
    this.metrics.set(name, {
      name,
      type,
      help,
      labels,
      values: new Map()
    });
  }

  private startMetricsServer(port: number): void {
    const express = require('express');
    const app = express();

    app.get('/metrics', async (req: any, res: any) => {
      res.set('Content-Type', this.metricsRegistry.contentType);
      res.end(await this.metricsRegistry.metrics());
    });

    app.listen(port, () => {
      this.logger.info(`Metrics server listening on port ${port}`);
    });
  }

  // Metric update methods
  private updateMetric(name: string, labels: Record<string, string>, value: number, operation: 'inc' | 'set' | 'observe' = 'inc'): void {
    const metric = this.metrics.get(name);
    if (!metric) return;

    const labelKey = this.createLabelKey(labels);
    
    switch (operation) {
      case 'inc':
        const current = metric.values.get(labelKey) || 0;
        metric.values.set(labelKey, current + value);
        break;
      case 'set':
        metric.values.set(labelKey, value);
        break;
      case 'observe':
        // For histogram, we'd need to calculate buckets
        // For now, just store the latest value
        metric.values.set(labelKey, value);
        break;
    }
  }

  private createLabelKey(labels: Record<string, string>): string {
    const pairs = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`);
    return pairs.length > 0 ? `{${pairs.join(',')}}` : '';
  }

  // Logging methods
  public logTransaction(data: {
    channel: string;
    chaincode: string;
    function: string;
    transactionId?: string;
    success: boolean;
    duration: number;
    error?: Error;
  }): void {
    const level = data.success ? 'info' : 'error';
    this.logger.log(level, 'Transaction executed', data);

    // Update metrics
    const labels = {
      channel: data.channel,
      chaincode: data.chaincode,
      function: data.function
    };

    this.updateMetric('fabric_tx_submitted_total', labels, 1);
    
    if (data.success) {
      this.updateMetric('fabric_tx_success_total', labels, 1);
    } else {
      const errorType = data.error?.message.split(':')[0] || 'unknown';
      this.updateMetric('fabric_tx_failure_total', { ...labels, error_type: errorType }, 1);
    }

    this.updateMetric('fabric_tx_duration_seconds', labels, data.duration, 'observe');
  }

  public logQuery(data: {
    channel: string;
    chaincode: string;
    function: string;
    success: boolean;
    duration: number;
    resultCount?: number;
  }): void {
    this.logger.info('Query executed', data);

    const labels = {
      channel: data.channel,
      chaincode: data.chaincode,
      function: data.function
    };

    this.updateMetric('fabric_query_total', labels, 1);
    this.updateMetric('fabric_query_duration_seconds', labels, data.duration, 'observe');
  }

  public logConnection(data: {
    org: string;
    action: 'connect' | 'disconnect';
    activeConnections: number;
  }): void {
    this.logger.info('Connection event', data);
    this.updateMetric('fabric_connection_active', { org: data.org }, data.activeConnections, 'set');
  }

  public logEvent(data: {
    chaincode: string;
    eventName: string;
    transactionId: string;
    blockNumber: bigint;
  }): void {
    this.logger.debug('Event received', {
      ...data,
      blockNumber: data.blockNumber.toString()
    });

    this.updateMetric('fabric_event_received_total', {
      chaincode: data.chaincode,
      event_name: data.eventName
    }, 1);
  }

  public updateBlockHeight(channel: string, height: number): void {
    this.updateMetric('fabric_block_height', { channel }, height, 'set');
  }

  public logError(error: Error, context?: any): void {
    this.logger.error('Error occurred', {
      error: error.message,
      stack: error.stack,
      context
    });
  }

  public logWarning(message: string, context?: any): void {
    this.logger.warn(message, context);
  }

  public logInfo(message: string, context?: any): void {
    this.logger.info(message, context);
  }

  public logDebug(message: string, context?: any): void {
    this.logger.debug(message, context);
  }

  public getMetricsRegistry(): Registry {
    return this.metricsRegistry;
  }
}