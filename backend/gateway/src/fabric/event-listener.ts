// backend/gateway/src/fabric/event-listener.ts
// Event Listener Manager for Hyperledger Fabric
// CORRECTED to use only @hyperledger/fabric-gateway types via inference

import {
    Network,
    ChaincodeEventsOptions,
    BlockEventsOptions,
    ChaincodeEvent,
    CloseableAsyncIterable
} from '@hyperledger/fabric-gateway';
import { EventEmitter } from 'events';

export interface EventListenerOptions {
  startBlock?: bigint;
}

// --- FIX ---
// Use TypeScript's inference to derive the block event types directly from the Network interface.
// This avoids needing to import them from another package and is the correct modern approach.

// 1. Helper type to extract the yielded type from any async iterable
type EventFromAsyncIterable<T> = T extends AsyncIterable<infer E> ? E : never;

// 2. Get the async iterable type returned by the network methods
type BlockEventsIterator = Awaited<ReturnType<Network['getBlockEvents']>>;
type FilteredBlockEventsIterator = Awaited<ReturnType<Network['getFilteredBlockEvents']>>;

// 3. Extract the specific event type from each iterator
export type BlockEvent = EventFromAsyncIterable<BlockEventsIterator>;
export type FilteredBlockEvent = EventFromAsyncIterable<FilteredBlockEventsIterator>;

// 4. Define the handler types using our new, correctly-inferred event types
export type ChaincodeEventHandler = (event: ChaincodeEvent) => Promise<void> | void;
export type BlockEventHandler = (event: BlockEvent) => Promise<void> | void;
export type FilteredBlockEventHandler = (event: FilteredBlockEvent) => Promise<void> | void;
// --- END FIX ---

interface ActiveListener {
  iterator: CloseableAsyncIterable<any>;
}

export class EventListenerManager extends EventEmitter {
  private activeListeners: Map<string, ActiveListener> = new Map();

  constructor() {
    super();
    // Set max listeners to prevent warnings
    this.setMaxListeners(50);
  }

  public async addChaincodeListener(
    network: Network,
    chaincodeId: string,
    eventName: string,
    handler: ChaincodeEventHandler,
    options: ChaincodeEventsOptions = {}
  ): Promise<string> {
    const listenerId = `chaincode:${chaincodeId}:${eventName}:${Date.now()}`;
    
    try {
      const events = await network.getChaincodeEvents(chaincodeId, options);
      this.activeListeners.set(listenerId, { iterator: events });

      console.log(`Started chaincode event listener: ${listenerId}`);
      this.processEvents(listenerId, events, handler).catch(err => {
          // Only emit error if there are listeners, otherwise just log
          if (this.listenerCount('error') > 0) {
              this.emit('error', { listenerId, error: err });
          } else {
              console.warn(`Event listener error (no handlers): ${listenerId}`, err.message);
          }
      });

      return listenerId;
    } catch (error: any) {
      // Handle immediate errors (like permission denied)
      console.warn(`Failed to setup listener ${listenerId}:`, error.message);
      throw error;
    }
  }

  public async addBlockListener(
      network: Network,
      channelName: string,
      handler: BlockEventHandler,
      options: BlockEventsOptions = {}
  ): Promise<string> {
    const listenerId = `block:${channelName}:${Date.now()}`;
    const events = await network.getBlockEvents(options);
    this.activeListeners.set(listenerId, { iterator: events });

    console.log(`Started block event listener: ${listenerId}`);
    this.processEvents(listenerId, events, handler).catch(err => {
        this.emit('error', { listenerId, error: err });
    });

    return listenerId;
  }

  public async addFilteredBlockListener(
      network: Network,
      channelName: string,
      handler: FilteredBlockEventHandler,
      options: BlockEventsOptions = {}
  ): Promise<string> {
    const listenerId = `filtered-block:${channelName}:${Date.now()}`;
    const events = await network.getFilteredBlockEvents(options);
    this.activeListeners.set(listenerId, { iterator: events });

    console.log(`Started filtered block event listener: ${listenerId}`);
    this.processEvents(listenerId, events, handler).catch(err => {
        this.emit('error', { listenerId, error: err });
    });

    return listenerId;
  }

  private async processEvents<T>(
      listenerId: string,
      iterator: CloseableAsyncIterable<T>,
      handler: (event: T) => Promise<void> | void
  ): Promise<void> {
    try {
        for await (const event of iterator) {
            if (!this.activeListeners.has(listenerId)) {
                break;
            }
            try {
                await handler(event);
            } catch (err) {
                this.emit('error', { listenerId, error: err, event });
            }
        }
    } catch (error) {
        if (this.activeListeners.has(listenerId)) {
           this.emit('error', { listenerId, error });
        }
    } finally {
        this.stopListener(listenerId);
    }
  }

  public stopListener(listenerId: string): void {
    const listener = this.activeListeners.get(listenerId);
    if (listener) {
      listener.iterator.close();
      this.activeListeners.delete(listenerId);
      this.emit('listenerStopped', { listenerId });
      console.log(`Stopped event listener: ${listenerId}`);
    }
  }

  public stopAllListeners(): void {
    for (const listenerId of this.activeListeners.keys()) {
      this.stopListener(listenerId);
    }
    console.log('Stopped all event listeners.');
  }

  public getActiveListeners(): string[] {
    return Array.from(this.activeListeners.keys());
  }
}