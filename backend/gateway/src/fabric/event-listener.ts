// backend/gateway/src/fabric/event-listener.ts
// Event Listener Manager for Hyperledger Fabric
// Updated for fabric-gateway 1.x API

import { Network, Contract, ChaincodeEventsRequest, BlockEventsRequest, FilteredBlockEventsRequest } from '@hyperledger/fabric-gateway';
import { EventEmitter } from 'events';

export interface EventListenerOptions {
  startBlock?: bigint;
  // Checkpointer is optional and implementation-specific
  checkpointer?: any;
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
  request: ChaincodeEventsRequest | BlockEventsRequest | FilteredBlockEventsRequest;
  handlers: Set<EventHandler | BlockHandler>;
  active: boolean;
  cleanup?: () => void;
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
      // Create new event request
      const request = contract.events(eventName);
      
      if (options.startBlock !== undefined) {
        request.startBlock(options.startBlock);
      }
      // Note: Checkpointer implementation is custom and optional
      // In production, you would implement persistent checkpoint storage

      listener = {
        request,
        handlers: new Set([handler]),
        active: true
      };
      
      this.activeListeners.set(listenerId, listener);
      
      // Start processing events
      this.processEvents(listenerId, request, 'chaincode');
      
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
      // Create new block event request
      const request = network.blockEvents();
      
      if (options.startBlock !== undefined) {
        request.startBlock(options.startBlock);
      }

      listener = {
        request,
        handlers: new Set([handler]),
        active: true
      };
      
      this.activeListeners.set(listenerId, listener);
      
      // Start processing blocks
      this.processEvents(listenerId, request, 'block');
      
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
      // Create new filtered block event request
      const request = network.filteredBlockEvents();
      
      if (options.startBlock !== undefined) {
        request.startBlock(options.startBlock);
      }

      // Wrap handler to match BlockHandler signature
      const wrappedHandler: BlockHandler = async (event) => {
        await handler(event.blockNumber);
      };
      
      listener = {
        request,
        handlers: new Set([wrappedHandler]),
        active: true
      };
      
      this.activeListeners.set(listenerId, listener);
      
      // Start processing filtered blocks
      this.processEvents(listenerId, request, 'filtered-block');
      
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
    request: ChaincodeEventsRequest | BlockEventsRequest | FilteredBlockEventsRequest,
    type: 'chaincode' | 'block' | 'filtered-block'
  ): Promise<void> {
    try {
      const events = request.getEvents();
      
      for await (const event of events) {
        const listener = this.activeListeners.get(listenerId);
        if (!listener || !listener.active) {
          break;
        }

        let processedEvent: ChaincodeEvent | BlockEvent | undefined;
        
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
        if (processedEvent) {
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
      // Close the event stream
      if (listener.cleanup) {
        listener.cleanup();
      }
      this.activeListeners.delete(listenerId);
      this.emit('listenerStopped', { listenerId });
    }
  }

  public stopAllListeners(): void {
    for (const [listenerId, listener] of this.activeListeners) {
      listener.active = false;
      if (listener.cleanup) {
        listener.cleanup();
      }
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

  // Helper method to create a simple checkpointer
  // Note: In fabric-gateway 1.x, checkpointers are optional and mainly used
  // to track which blocks have been processed
  public createCheckpointer(checkpointId: string): any {
    let lastBlockNumber: bigint | undefined;
    
    // Return a simple object that can track block numbers
    return {
      id: checkpointId,
      setBlockNumber(blockNumber: bigint): void {
        lastBlockNumber = blockNumber;
        console.log(`Checkpoint ${checkpointId} at block ${blockNumber}`);
      },
      getBlockNumber(): bigint | undefined {
        return lastBlockNumber;
      }
    };
  }
}