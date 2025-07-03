// Monitoring and Logging Framework for Fabric Operations
// Tracks performance, errors, and network health

import { EventEmitter } from 'events';
import * as winston from 'winston';
import * as promClient from 'prom-client';

export interface MetricsConfig {
  enablePrometheus: boolean;
  prometheusPort: number;
  logLevel: string;
  logFile?: string;
}

export class FabricMonitor extends EventEmitter {
  private logger: winston.Logger;
  private metrics: Map<string, promClient.Counter | promClient.Histogram | promClient.Gauge> = new Map();
  private metricsRegistry: promClient.Registry;

  constructor(config: MetricsConfig) {
    super();
    this.setupLogger(config);
    this.setupMetrics(config);
  }

  private setupLogger(config: MetricsConfig): void {
    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
          })
        )
      })
    ];

    if (config.logFile) {
      transports.push(new winston.transports.File({
        filename: config.logFile,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }));
    }

    this.logger = winston.createLogger({
      level: config.logLevel,
      transports
    });
  }

  private setupMetrics(config: MetricsConfig): void {
    if (!config.enablePrometheus) return;

    this.metricsRegistry = new promClient.Registry();

    // Transaction metrics
    this.metrics.set('tx_submitted', new promClient.Counter({
      name: 'fabric_tx_submitted_total',
      help: 'Total number of transactions submitted',
      labelNames: ['channel', 'chaincode', 'function'],
      registers: [this.metricsRegistry]
    }));

    this.metrics.set('tx_success', new promClient.Counter({
      name: 'fabric_tx_success_total',
      help: 'Total number of successful transactions',
      labelNames: ['channel', 'chaincode', 'function'],
      registers: [this.metricsRegistry]
    }));

    this.metrics.set('tx_failure', new promClient.Counter({
      name: 'fabric_tx_failure_total',
      help: 'Total number of failed transactions',
      labelNames: ['channel', 'chaincode', 'function', 'error_type'],
      registers: [this.metricsRegistry]
    }));

    this.metrics.set('tx_duration', new promClient.Histogram({
      name: 'fabric_tx_duration_seconds',
      help: 'Transaction execution duration in seconds',
      labelNames: ['channel', 'chaincode', 'function'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.metricsRegistry]
    }));

    // Query metrics
    this.metrics.set('query_count', new promClient.Counter({
      name: 'fabric_query_total',
      help: 'Total number of queries executed',
      labelNames: ['channel', 'chaincode', 'function'],
      registers: [this.metricsRegistry]
    }));

    this.metrics.set('query_duration', new promClient.Histogram({
      name: 'fabric_query_duration_seconds',
      help: 'Query execution duration in seconds',
      labelNames: ['channel', 'chaincode', 'function'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
      registers: [this.metricsRegistry]
    }));

    // Connection metrics
    this.metrics.set('connection_active', new promClient.Gauge({
      name: 'fabric_connection_active',
      help: 'Number of active gateway connections',
      labelNames: ['org'],
      registers: [this.metricsRegistry]
    }));

    // Event metrics
    this.metrics.set('event_received', new promClient.Counter({
      name: 'fabric_event_received_total',
      help: 'Total number of events received',
      labelNames: ['chaincode', 'event_name'],
      registers: [this.metricsRegistry]
    }));

    // Block metrics
    this.metrics.set('block_height', new promClient.Gauge({
      name: 'fabric_block_height',
      help: 'Current block height of the channel',
      labelNames: ['channel'],
      registers: [this.metricsRegistry]
    }));

    // Start metrics server
    this.startMetricsServer(config.prometheusPort);
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

    (this.metrics.get('tx_submitted') as promClient.Counter).inc(labels);
    
    if (data.success) {
      (this.metrics.get('tx_success') as promClient.Counter).inc(labels);
    } else {
      const errorType = data.error?.message.split(':')[0] || 'unknown';
      (this.metrics.get('tx_failure') as promClient.Counter).inc({
        ...labels,
        error_type: errorType
      });
    }

    (this.metrics.get('tx_duration') as promClient.Histogram).observe(labels, data.duration);
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

    (this.metrics.get('query_count') as promClient.Counter).inc(labels);
    (this.metrics.get('query_duration') as promClient.Histogram).observe(labels, data.duration);
  }

  public logConnection(data: {
    org: string;
    action: 'connect' | 'disconnect';
    activeConnections: number;
  }): void {
    this.logger.info('Connection event', data);

    (this.metrics.get('connection_active') as promClient.Gauge).set(
      { org: data.org },
      data.activeConnections
    );
  }

  public logEvent(data: {
    chaincode: string;
    eventName: string;
    transactionId: string;
    blockNumber: bigint;
  }): void {
    this.logger.debug('Event received', data);

    (this.metrics.get('event_received') as promClient.Counter).inc({
      chaincode: data.chaincode,
      event_name: data.eventName
    });
  }

  public updateBlockHeight(channel: string, height: number): void {
    (this.metrics.get('block_height') as promClient.Gauge).set(
      { channel },
      height
    );
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

  public getMetricsRegistry(): promClient.Registry {
    return this.metricsRegistry;
  }
}