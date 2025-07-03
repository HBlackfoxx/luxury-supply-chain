// Event Listener Manager for Hyperledger Fabric
// Handles blockchain events and notifications

import { Network, Contract, ContractListener, ContractEvent, Checkpointer } from '@hyperledger/fabric-gateway';
import { EventEmitter } from 'events';

export interface EventListenerOptions {
  checkpointer?: Checkpointer;
  replay?: boolean;
  startBlock?: bigint;
}

export type EventHandler = (event: ContractEvent) => Promise<void> | void;

export class EventListenerManager extends EventEmitter {
  private listeners: Map<string, ContractListener> = new Map();
  private handlers: Map<string, Set<EventHandler>> = new Map();

  public async startContractEventListener(
    contract: Contract,
    eventName: string,
    handler: EventHandler,
    options: EventListenerOptions = {}
  ): Promise<string> {
    const listenerId = this.generateListenerId(contract.getChaincodeName(), eventName);

    // Add handler to the set
    if (!this.handlers.has(listenerId)) {
      this.handlers.set(listenerId, new Set());
    }
    this.handlers.get(listenerId)!.add(handler);

    // Create listener if it doesn't exist
    if (!this.listeners.has(listenerId)) {
      const listener = await contract.events.addContractListener(
        async (event: ContractEvent) => {
          await this.handleEvent(listenerId, event);
        },
        {
          ...options,
          eventName
        }
      );

      this.listeners.set(listenerId, listener);
      this.emit('listenerStarted', { listenerId, eventName });
    }

    return listenerId;
  }

  public async startBlockEventListener(
    network: Network,
    handler: (blockNumber: bigint) => Promise<void> | void,
    options: { startBlock?: bigint } = {}
  ): Promise<string> {
    const listenerId = this.generateListenerId('network', 'block');

    const listener = await network.events.addBlockListener(
      async (block) => {
        await handler(block.blockNumber);
        this.emit('blockEvent', { blockNumber: block.blockNumber });
      },
      options
    );

    this.listeners.set(listenerId, listener as any);
    this.emit('listenerStarted', { listenerId, type: 'block' });

    return listenerId;
  }

  public async startChaincodeEventListener(
    network: Network,
    chaincodeName: string,
    handler: EventHandler,
    options: EventListenerOptions = {}
  ): Promise<string> {
    const listenerId = this.generateListenerId(chaincodeName, 'all');

    // Add handler to the set
    if (!this.handlers.has(listenerId)) {
      this.handlers.set(listenerId, new Set());
    }
    this.handlers.get(listenerId)!.add(handler);

    // Create listener if it doesn't exist
    if (!this.listeners.has(listenerId)) {
      const listener = await network.events.addContractListener(
        async (event: ContractEvent) => {
          await this.handleEvent(listenerId, event);
        },
        {
          ...options,
          contractName: chaincodeName
        }
      );

      this.listeners.set(listenerId, listener);
      this.emit('listenerStarted', { listenerId, chaincodeName });
    }

    return listenerId;
  }

  private async handleEvent(listenerId: string, event: ContractEvent): Promise<void> {
    const handlers = this.handlers.get(listenerId);
    if (!handlers) return;

    // Parse event payload
    const eventData = this.parseEventPayload(event.payload);

    // Emit for general listeners
    this.emit('contractEvent', {
      chaincodeName: event.chaincodeName,
      eventName: event.eventName,
      transactionId: event.transactionId,
      blockNumber: event.blockNumber,
      data: eventData
    });

    // Call specific handlers
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        this.emit('error', {
          listenerId,
          event,
          error
        });
      }
    }
  }

  private parseEventPayload(payload: Uint8Array): any {
    try {
      const decoder = new TextDecoder();
      const payloadString = decoder.decode(payload);
      return JSON.parse(payloadString);
    } catch {
      return payload;
    }
  }

  public stopListener(listenerId: string): void {
    const listener = this.listeners.get(listenerId);
    if (listener) {
      listener.close();
      this.listeners.delete(listenerId);
      this.handlers.delete(listenerId);
      this.emit('listenerStopped', { listenerId });
    }
  }

  public stopAllListeners(): void {
    for (const [listenerId, listener] of this.listeners) {
      listener.close();
      this.emit('listenerStopped', { listenerId });
    }
    this.listeners.clear();
    this.handlers.clear();
  }

  public getActiveListeners(): string[] {
    return Array.from(this.listeners.keys());
  }

  private generateListenerId(scope: string, event: string): string {
    return `${scope}:${event}:${Date.now()}`;
  }

  public removeHandler(listenerId: string, handler: EventHandler): void {
    const handlers = this.handlers.get(listenerId);
    if (handlers) {
      handlers.delete(handler);
      
      // If no more handlers, stop the listener
      if (handlers.size === 0) {
        this.stopListener(listenerId);
      }
    }
  }
}