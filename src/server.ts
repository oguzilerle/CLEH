import express, { Application } from 'express';
import * as http from 'http';
import { RedisService } from './services/RedisService';
import { KafkaService } from './services/KafkaService';
import { DatabaseService } from './services/DatabaseService';
import { BatchSavingService } from './services/BatchSavingService';
import { LeaderboardProcessingService } from './services/LeaderboardProcessingService';
import { WebSocketService } from './services/WebSocketService';
import { ScoreController } from './controllers/ScoreController';
import { createScoreRoutes } from './routes/scoreRoutes';

// Configuration from environment variables
const PORT = parseInt(process.env.PORT || '3000', 10);
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'leaderboard-service';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100', 10);
const THROTTLE_DURATION_MS = parseInt(process.env.THROTTLE_DURATION_MS || '500', 10);

class LeaderboardServer {
  private app: Application;
  private server: http.Server;
  private redisService: RedisService;
  private kafkaService: KafkaService;
  private dbService: DatabaseService;
  private batchSavingService: BatchSavingService;
  private leaderboardProcessingService: LeaderboardProcessingService;
  private wsService: WebSocketService;
  private scoreController: ScoreController;

  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);

    // Initialize services
    this.redisService = new RedisService(REDIS_HOST, REDIS_PORT);
    this.kafkaService = new KafkaService(KAFKA_BROKERS, KAFKA_CLIENT_ID);
    this.dbService = new DatabaseService();
    this.batchSavingService = new BatchSavingService(BATCH_SIZE, this.dbService);
    this.leaderboardProcessingService = new LeaderboardProcessingService(
      this.redisService,
      this.kafkaService,
      this.dbService,
      THROTTLE_DURATION_MS
    );
    this.wsService = new WebSocketService(this.server);
    this.scoreController = new ScoreController(
      this.redisService,
      this.kafkaService
    );

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json());

    // Log requests
    this.app.use((req, res, next) => {
      console.log(`${req.method} ${req.path}`);
      next();
    });

    // CORS headers (adjust for production)
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }

  private setupRoutes(): void {
    // Score routes
    this.app.use('/api', createScoreRoutes(this.scoreController));

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Leaderboard API',
        version: '1.0.0',
        endpoints: {
          scores: {
            submit: 'POST /api/scores',
            topPlayers: 'GET /api/scores/top?limit=10',
            playerStats: 'GET /api/scores/player/:playerId',
            stats: 'GET /api/scores/stats',
          },
          websocket: 'ws://localhost:' + PORT + '/leaderboard',
          health: 'GET /api/health',
        },
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  private async setupKafkaConsumers(): Promise<void> {
    // Consumer 1: Process score submissions and batch save to database
    const scoreConsumer = new KafkaService(KAFKA_BROKERS, KAFKA_CLIENT_ID);
    await scoreConsumer.initConsumer('score-consumer-group');
    
    await scoreConsumer.subscribeToScoreSubmissions(async (submission) => {
      console.log('[Kafka] Processing score submission:', submission);
      await this.batchSavingService.addToBatch(submission);
    });

    // Consumer 2: Process leaderboard changes with throttling
    const leaderboardConsumer = new KafkaService(KAFKA_BROKERS, KAFKA_CLIENT_ID);
    await leaderboardConsumer.initConsumer('leaderboard-consumer-group');
    
    await leaderboardConsumer.subscribeToLeaderboardChanges(async (message) => {
      console.log('[Kafka] Processing leaderboard change');
      await this.leaderboardProcessingService.processLeaderboardChange(message);
    });

    // Consumer 3: Broadcast leaderboard updates via WebSocket
    const broadcastConsumer = new KafkaService(KAFKA_BROKERS, KAFKA_CLIENT_ID);
    await broadcastConsumer.initConsumer('broadcast-consumer-group');
    
    await broadcastConsumer.subscribeToLeaderboardUpdates(async (update) => {
      console.log('[Kafka] Broadcasting leaderboard update to WebSocket clients');
      this.wsService.broadcast(update);
    });
  }

  async start(): Promise<void> {
    try {
      console.log('Starting Leaderboard Service...');
      console.log('Configuration:', {
        PORT,
        REDIS_HOST,
        REDIS_PORT,
        KAFKA_BROKERS,
        BATCH_SIZE,
        THROTTLE_DURATION_MS,
      });

      // Connect to Redis
      await this.redisService.connect();

      // Initialize Kafka producer
      await this.kafkaService.initProducer();

      // Set up Kafka consumers
      await this.setupKafkaConsumers();

      // Start WebSocket heartbeat
      this.wsService.startHeartbeat();

      // Start HTTP server
      this.server.listen(PORT, () => {
        console.log(`\n✓ Server running on http://localhost:${PORT}`);
        console.log(`✓ WebSocket server running on ws://localhost:${PORT}/leaderboard`);
        console.log(`\n=== Leaderboard Service Ready ===\n`);
      });

      // Graceful shutdown
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private async shutdown(): Promise<void> {
    console.log('\n\nShutting down gracefully...');

    try {
      // Force flush any remaining batched scores
      await this.batchSavingService.forceFlush();

      // Close WebSocket connections
      this.wsService.close();

      // Disconnect Kafka
      await this.kafkaService.disconnect();

      // Disconnect Redis
      await this.redisService.disconnect();

      // Close HTTP server
      this.server.close(() => {
        console.log('Server shut down successfully');
        process.exit(0);
      });

      // Force exit after 10 seconds if graceful shutdown fails
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Start the server
const server = new LeaderboardServer();
server.start();

export default LeaderboardServer;

