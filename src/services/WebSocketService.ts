import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { EnhancedLeaderboardEntry } from '../types';

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/leaderboard' });
    this.setupWebSocketServer();
  }

  /**
   * Set up WebSocket server and handle connections
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientIp = req.socket.remoteAddress;
      console.log(`[WebSocket] New client connected from ${clientIp}`);
      
      this.clients.add(ws);
      console.log(`[WebSocket] Total clients: ${this.clients.size}`);

      // Send welcome message
      ws.send(
        JSON.stringify({
          type: 'connected',
          message: 'Connected to leaderboard service',
          timestamp: Date.now(),
        })
      );

      // Handle client messages
      ws.on('message', (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleClientMessage(ws, data);
        } catch (error) {
          console.error('[WebSocket] Error parsing client message:', error);
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'Invalid message format',
            })
          );
        }
      });

      // Handle client disconnection
      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(
          `[WebSocket] Client disconnected. Total clients: ${this.clients.size}`
        );
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('[WebSocket] Client error:', error);
        this.clients.delete(ws);
      });
    });

    console.log('[WebSocket] Server initialized on path /leaderboard');
  }

  /**
   * Handle messages from clients
   */
  private handleClientMessage(ws: WebSocket, data: any): void {
    console.log('[WebSocket] Received client message:', data);

    switch (data.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      case 'subscribe':
        // Client explicitly subscribes to updates
        ws.send(
          JSON.stringify({
            type: 'subscribed',
            message: 'Subscribed to leaderboard updates',
          })
        );
        break;
      default:
        ws.send(
          JSON.stringify({
            type: 'error',
            message: 'Unknown message type',
          })
        );
    }
  }

  /**
   * Broadcast leaderboard update to all connected clients
   */
  broadcast(data: {
    leaderboard: EnhancedLeaderboardEntry[];
    timestamp: number;
    checksum: string;
    changedRankings?: any[];
  }): void {
    const message = JSON.stringify({
      type: 'leaderboard_update',
      data,
    });

    let successCount = 0;
    let failCount = 0;

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
          successCount++;
        } catch (error) {
          console.error('[WebSocket] Error sending to client:', error);
          failCount++;
        }
      } else {
        // Remove closed connections
        this.clients.delete(client);
        failCount++;
      }
    });

    console.log(
      `[WebSocket] Broadcasted to ${successCount} clients (${failCount} failed)`
    );
  }

  /**
   * Send message to a specific client
   */
  sendToClient(client: WebSocket, data: any): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Close all connections and shut down server
   */
  close(): void {
    console.log('[WebSocket] Closing all connections...');
    
    this.clients.forEach((client) => {
      try {
        client.send(
          JSON.stringify({
            type: 'server_shutdown',
            message: 'Server is shutting down',
          })
        );
        client.close();
      } catch (error) {
        console.error('[WebSocket] Error closing client:', error);
      }
    });

    this.clients.clear();
    this.wss.close();
    console.log('[WebSocket] Server closed');
  }

  /**
   * Send heartbeat to all clients to keep connections alive
   */
  sendHeartbeat(): void {
    const heartbeat = JSON.stringify({
      type: 'heartbeat',
      timestamp: Date.now(),
    });

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(heartbeat);
        } catch (error) {
          console.error('[WebSocket] Error sending heartbeat:', error);
          this.clients.delete(client);
        }
      } else {
        this.clients.delete(client);
      }
    });
  }

  /**
   * Start periodic heartbeat (every 30 seconds)
   */
  startHeartbeat(): NodeJS.Timeout {
    return setInterval(() => {
      this.sendHeartbeat();
    }, 30000);
  }
}

