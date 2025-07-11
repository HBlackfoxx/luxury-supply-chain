// backend/gateway/src/monitoring/fabric-monitor.ts
// Monitoring and Logging Framework for Fabric Operations
// Updated with winston v3 API

import { EventEmitter } from 'events';
import winston from 'winston';
import express from 'express';
import { Registry as PromRegistry, Counter, Gauge, Histogram } from 'prom-client';

export interface MetricsConfig {
  enablePrometheus: boolean;
  prometheusPort: number;
  logLevel: string;
  logFile?: string;
}

export class FabricMonitor extends EventEmitter {
  private logger: winston.Logger;
  private promRegistry: PromRegistry;

  // Prometheus Metrics
  private txSubmittedTotal: Counter;
  private txSuccessTotal: Counter;
  private txFailureTotal: Counter;
  private txDurationSeconds: Histogram;
  private queryTotal: Counter;
  private queryDurationSeconds: Histogram;

  constructor(config: MetricsConfig) {
    super();
    this.logger = this.setupLogger(config);
    this.promRegistry = new PromRegistry();
    
    // Initialize metrics
    this.txSubmittedTotal = this.createCounter('fabric_tx_submitted_total', 'Total transactions submitted', ['channel', 'chaincode', 'function']);
    this.txSuccessTotal = this.createCounter('fabric_tx_success_total', 'Total successful transactions', ['channel', 'chaincode', 'function']);
    this.txFailureTotal = this.createCounter('fabric_tx_failure_total', 'Total failed transactions', ['channel', 'chaincode', 'function', 'error_type']);
    this.txDurationSeconds = this.createHistogram('fabric_tx_duration_seconds', 'Transaction duration', ['channel', 'chaincode', 'function']);
    this.queryTotal = this.createCounter('fabric_query_total', 'Total queries executed', ['channel', 'chaincode', 'function']);
    this.queryDurationSeconds = this.createHistogram('fabric_query_duration_seconds', 'Query duration', ['channel', 'chaincode', 'function']);

    if (config.enablePrometheus) {
      this.startMetricsServer(config.prometheusPort);
    }
  }

  private setupLogger(config: MetricsConfig): winston.Logger {
    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
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

    return winston.createLogger({
      level: config.logLevel,
      transports
    });
  }

  private startMetricsServer(port: number): void {
    const app = express();
    app.get('/metrics', async (req, res) => {
      res.set('Content-Type', this.promRegistry.contentType);
      res.end(await this.promRegistry.metrics());
    });
    app.listen(port, () => {
      this.logger.info(`Metrics server listening on port ${port}`);
    });
  }
  
  // Metric Creation Helpers
  private createCounter(name: string, help: string, labelNames: string[]): Counter {
      const counter = new Counter({ name, help, labelNames, registers: [this.promRegistry] });
      return counter;
  }
  private createHistogram(name: string, help: string, labelNames: string[]): Histogram {
      const histogram = new Histogram({ name, help, labelNames, registers: [this.promRegistry] });
      return histogram;
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
    this.logger.log(level, `Transaction executed: ${data.function}`, { ...data });

    const labels = { channel: data.channel, chaincode: data.chaincode, 'function': data.function };
    this.txSubmittedTotal.inc(labels);
    this.txDurationSeconds.observe(labels, data.duration);
    
    if (data.success) {
      this.txSuccessTotal.inc(labels);
    } else {
      const errorType = data.error?.name || 'UnknownError';
      this.txFailureTotal.inc({ ...labels, error_type: errorType });
    }
  }

  public logQuery(data: {
    channel: string;
    chaincode: string;
    function: string;
    success: boolean;
    duration: number;
  }): void {
    this.logger.info(`Query executed: ${data.function}`, { ...data });

    const labels = { channel: data.channel, chaincode: data.chaincode, 'function': data.function };
    this.queryTotal.inc(labels);
    this.queryDurationSeconds.observe(labels, data.duration);
  }

  public logError(error: Error, context?: any): void {
    this.logger.error(error.message, { stack: error.stack, context });
  }
  
  public logInfo(message: string, context?: any): void {
    this.logger.info(message, context);
  }
}