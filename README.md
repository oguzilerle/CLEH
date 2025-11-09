# How to run the service:

## Prerequisites

- Node.js (v18+)
- Redis
- Kafka
- Docker

---

1. **Start Redis and Kafka:**
```bash
docker-compose up -d
```

1. **Install dependencies:**
```bash
npm install
```

1. **Run the server:**
```bash
npm run dev
```

The server will be running at `http://localhost:3000`

## Test the API (1 min)

Open another terminal and run:

```bash
# Run automated tests
./scripts/test-api.sh
```

Or manually test:

```bash
# Submit a score
curl -X POST http://localhost:3000/api/scores \
  -H "Content-Type: application/json" \
  -d '{
    "player_id": "alice",
    "score": 1000,
    "timestamp": "2025-11-08T12:00:00.000Z"
  }'

# Get top 10
curl http://localhost:3000/api/scores/top?limit=10
```

# System Design Rationale

## Data Structure for Ranking

**Choice: Redis SortedSet (ZSET)**

Redis SortedSet was chosen as the core data structure for maintaining the leaderboard due to its exceptional efficiency characteristics:

- **Write Efficiency (O(log N))**: The `ZADD` operation uses a skip list + hash table hybrid structure, providing logarithmic time complexity for score updates. This means adding or updating 1 million players takes only ~20 operations, making it highly efficient even under hundreds of concurrent writes per second.

- **Read Efficiency (O(log N + M))**: The `ZREVRANGE` operation retrieves the top N players in O(log N + M) time where M is the number of elements returned. For our top 10 query, this is effectively O(log N + 10), scaling excellently as the player base grows.

- **No Recalculation Required**: Unlike array-based solutions that require full sorting, SortedSet maintains order automatically. Each update only affects the specific player's position without touching other entries.

**Additional Caching Layer**: We implemented O(1) cached lookups using Redis Key-Value store for frequently accessed data (leaderboard snapshots, user details), further optimizing read performance.

## Concurrency & Performance

**High-Volume Score Updates Strategy**:

1. **Async Processing with Kafka**: Score submissions immediately write to Redis (ensuring instant leaderboard updates) and publish to Kafka for async database persistence. This decouples API response time from database operations, enabling the API to handle 500-1000 req/s per instance.

2. **Batch Processing**: Scores are batched (100 records) before database writes, reducing write load by 100x. A retry mechanism with exponential backoff and dead letter queue ensures zero data loss.

3. **Throttled Broadcasting**: WebSocket updates are throttled to 500ms intervals with checksum-based change detection, preventing unnecessary broadcasts and reducing client bandwidth consumption.

**Multi-Instance Synchronization**:

For distributed deployment across multiple instances:

- **Redis Cluster/Sentinel**: Centralized Redis ensures all API instances read/write to the same leaderboard state. Redis Sentinel provides automatic failover and high availability.

- **Kafka Consumer Groups**: Each consumer type (batch saving, leaderboard processing, broadcasting) runs in its own consumer group, allowing horizontal scaling while ensuring each message is processed exactly once.

- **Stateless API Servers**: All application state resides in Redis/Kafka, making API servers stateless and horizontally scalable behind a load balancer.

## Modular Architecture

**Project Structure**:

```
src/
├── server.ts                    # Application orchestration
├── controllers/                 # API request handlers
├── services/
│   ├── RedisService.ts         # Data layer abstraction
│   ├── KafkaService.ts         # Message broker abstraction
│   ├── BatchSavingService.ts   # Persistence logic
│   ├── LeaderboardProcessingService.ts  # Business logic
│   ├── WebSocketService.ts     # Real-time communication
│   └── DatabaseService.ts      # Data persistence interface
├── routes/                      # API routing
└── types/                       # TypeScript definitions
```

**Separation of Concerns**:

- **Services Layer**: Each service encapsulates a single responsibility (Redis operations, Kafka messaging, batch processing, etc.), promoting reusability and testability.

- **Controllers Layer**: Handle HTTP concerns (validation, request/response formatting) without business logic.

- **Type Safety**: Comprehensive TypeScript types ensure compile-time safety and serve as living documentation.

This structure enables easy unit testing (mock services independently), feature additions (add new services without touching existing code), and team collaboration (clear boundaries between components).

## Testing/Monitoring Strategy

**Key Production Strategy: Distributed Tracing + Metrics Dashboard**

Before production deployment, I would implement:

1. **Prometheus + Grafana Dashboard** monitoring:
   - API request rate, latency (p50, p95, p99)
   - Redis memory usage and operation latency
   - Kafka consumer lag (critical for detecting processing bottlenecks)
   - Batch service: current batch size, flush frequency, dead letter queue size
   - WebSocket: active connections, broadcast success rate

2. **Critical Alerts**:
   - Consumer lag > 1000 messages (indicates processing slowdown)
   - Dead letter queue growth (data loss risk)
   - Redis memory > 80% (capacity planning)
   - API error rate > 1% (service degradation)

3. **Health Checks**: Implement `/health` endpoint checks for Redis, Kafka connectivity with automated remediation triggers.

This provides end-to-end visibility into system health and enables proactive issue detection before user impact.

## Time Spent

**Total Time: ~5 hours**
