// backend/gateway/src/fabric/event-listener.ts
// Event Listener Manager for Hyperledger Fabric
// Updated for fabric-gateway 1.x API

import { Network, Contract, Checkpointer, CloseableAsyncIterable } from '@hyperledger/fabric-gateway';
import { EventEmitter } from 'events';

export interface EventListenerOptions {
  startBlock?: bigint;
  checkpointer?: Checkpointer;
}

export interface ChaincodeEvent {
  chaincodeName: string;
  eventName: string;
  transactionId: string;
  blockNumber: bigint;
  payload: Uint8Array;
}

export interface BlockEvent {
  blockNumber: bigint;
  blockData: Uint8Array;
}

export type EventHandler = (event: ChaincodeEvent) => Promise<void> | void;
export type BlockHandler = (event: BlockEvent) => Promise<void> | void;

interface ActiveListener {
  iterator: CloseableAsyncIterable<any>;
  handlers: Set<EventHandler | BlockHandler>;
  active: boolean;
}

export class EventListenerManager extends EventEmitter {
  private activeListeners: Map<string, ActiveListener> = new Map();
  private readonly textDecoder = new TextDecoder();

  public async startContractEventListener(
    contract: Contract,
    eventName: string,
    handler: EventHandler,
    options: EventListenerOptions = {}
  ): Promise<string> {
    const listenerId = this.generateListenerId(contract.getChaincodeName(), eventName);

    // Check if listener already exists
    let listener = this.activeListeners.get(listenerId);
    
    if (!listener) {
      // Create new event iterator
      const eventOptions: any = {};
      if (options.startBlock !== undefined) {
        eventOptions.startBlock = options.startBlock;
      }
      if (options.checkpointer) {
        eventOptions.checkpointer = options.checkpointer;
      }

      const iterator = await contract.newChaincodeEventsRequest(eventName, eventOptions);
      
      listener = {
        iterator,
        handlers: new Set([handler]),
        active: true
      };
      
      this.activeListeners.set(listenerId, listener);
      
      // Start processing events
      this.processEvents(listenerId, iterator, 'chaincode');
      
      this.emit('listenerStarted', { listenerId, eventName });
    } else {
      // Add handler to existing listener
      listener.handlers.add(handler);
    }

    return listenerId;
  }

  public async startBlockEventListener(
    network: Network,
    handler: BlockHandler,
    options: { startBlock?: bigint } = {}
  ): Promise<string> {
    const listenerId = this.generateListenerId('network', 'block');

    // Check if listener already exists
    let listener = this.activeListeners.get(listenerId);
    
    if (!listener) {
      // Create new block event iterator
      const eventOptions: any = {};
      if (options.startBlock !== undefined) {
        eventOptions.startBlock = options.startBlock;
      }

      const iterator = await network.newBlockEventsRequest(eventOptions);
      
      listener = {
        iterator,
        handlers: new Set([handler]),
        active: true
      };
      
      this.activeListeners.set(listenerId, listener);
      
      // Start processing blocks
      this.processEvents(listenerId, iterator, 'block');
      
      this.emit('listenerStarted', { listenerId, type: 'block' });
    } else {
      // Add handler to existing listener
      listener.handlers.add(handler);
    }

    return listenerId;
  }

  public async startFilteredBlockEventListener(
    network: Network,
    handler: (blockNumber: bigint) => Promise<void> | void,
    options: { startBlock?: bigint } = {}
  ): Promise<string> {
    const listenerId = this.generateListenerId('network', 'filtered-block');

    // Check if listener already exists
    let listener = this.activeListeners.get(listenerId);
    
    if (!listener) {
      // Create new filtered block event iterator
      const eventOptions: any = {};
      if (options.startBlock !== undefined) {
        eventOptions.startBlock = options.startBlock;
      }

      const iterator = await network.newFilteredBlockEventsRequest(eventOptions);
      
      // Wrap handler to match BlockHandler signature
      const wrappedHandler: BlockHandler = async (event) => {
        await handler(event.blockNumber);
      };
      
      listener = {
        iterator,
        handlers: new Set([wrappedHandler]),
        active: true
      };
      
      this.activeListeners.set(listenerId, listener);
      
      // Start processing filtered blocks
      this.processEvents(listenerId, iterator, 'filtered-block');
      
      this.emit('listenerStarted', { listenerId, type: 'filtered-block' });
    } else {
      // Add handler to existing listener
      const wrappedHandler: BlockHandler = async (event) => {
        await handler(event.blockNumber);
      };
      listener.handlers.add(wrappedHandler);
    }

    return listenerId;
  }

  private async processEvents(
    listenerId: string,
    iterator: CloseableAsyncIterable<any>,
    type: 'chaincode' | 'block' | 'filtered-block'
  ): Promise<void> {
    try {
      for await (const event of iterator) {
        const listener = this.activeListeners.get(listenerId);
        if (!listener || !listener.active) {
          break;
        }

        let processedEvent: ChaincodeEvent | BlockEvent;
        
        if (type === 'chaincode') {
          // Process chaincode event
          processedEvent = {
            chaincodeName: event.chaincodeName,
            eventName: event.eventName,
            transactionId: event.transactionId,
            blockNumber: event.blockNumber,
            payload: event.payload
          };
          
          // Emit for general listeners
          this.emit('contractEvent', {
            ...processedEvent,
            data: this.parseEventPayload(event.payload)
          });
        } else if (type === 'block' || type === 'filtered-block') {
          // Process block event
          processedEvent = {
            blockNumber: event.blockNumber,
            blockData: event.blockData || new Uint8Array()
          };
          
          // Emit for general listeners
          this.emit('blockEvent', { blockNumber: event.blockNumber });
        }

        // Call specific handlers
        for (const handler of listener.handlers) {
          try {
            await handler(processedEvent as any);
          } catch (error) {
            this.emit('error', {
              listenerId,
              event: processedEvent,
              error
            });
          }
        }
      }
    } catch (error) {
      this.emit('error', {
        listenerId,
        error,
        message: `Event processing failed for ${listenerId}`
      });
    } finally {
      // Clean up when iterator ends
      this.activeListeners.delete(listenerId);
      this.emit('listenerStopped', { listenerId });
    }
  }

  private parseEventPayload(payload: Uint8Array): any {
    try {
      const payloadString = this.textDecoder.decode(payload);
      return JSON.parse(payloadString);
    } catch {
      return payload;
    }
  }

  public stopListener(listenerId: string): void {
    const listener = this.activeListeners.get(listenerId);
    if (listener) {
      listener.active = false;
      listener.iterator.close();
      this.activeListeners.delete(listenerId);
      this.emit('listenerStopped', { listenerId });
    }
  }

  public stopAllListeners(): void {
    for (const [listenerId, listener] of this.activeListeners) {
      listener.active = false;
      listener.iterator.close();
      this.emit('listenerStopped', { listenerId });
    }
    this.activeListeners.clear();
  }

  public getActiveListeners(): string[] {
    return Array.from(this.activeListeners.keys());
  }

  private generateListenerId(scope: string, event: string): string {
    return `${scope}:${event}:${Date.now()}`;
  }

  public removeHandler(listenerId: string, handler: EventHandler | BlockHandler): void {
    const listener = this.activeListeners.get(listenerId);
    if (listener) {
      listener.handlers.delete(handler);
      
      // If no more handlers, stop the listener
      if (listener.handlers.size === 0) {
        this.stopListener(listenerId);
      }
    }
  }

  // Helper method to create a checkpoint
  public createCheckpointer(checkpointId: string): Checkpointer {
    let blockNumber: bigint | undefined;
    
    return {
      async checkpoint(event: { blockNumber: bigint }): Promise<void> {
        blockNumber = event.blockNumber;
        // In a real implementation, this would persist to a database
        console.log(`Checkpoint ${checkpointId} at block ${blockNumber}`);
      },
      
      async getBlockNumber(): Promise<bigint | undefined> {
        // In a real implementation, this would read from a database
        return blockNumber;
      }
    };
  }
}