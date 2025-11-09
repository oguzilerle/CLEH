/**
 * Example client demonstrating how to interact with the leaderboard service
 */

import WebSocket from 'ws';
import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3000/api';
const WS_URL = 'ws://localhost:3000/leaderboard';

/**
 * Submit a score to the leaderboard
 */
async function submitScore(playerId: string, score: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/scores`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      player_id: playerId,
      score,
      timestamp: new Date().toISOString(),
    }),
  });

  const result = await response.json();
  console.log('Score submitted:', result);
}

/**
 * Get top players from the leaderboard
 */
async function getTopPlayers(limit: number = 10): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/scores/top?limit=${limit}`);
  const result = await response.json();
  console.log('Top players:', JSON.stringify(result, null, 2));
}

/**
 * Get a specific player's stats
 */
async function getPlayerStats(playerId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/scores/player/${playerId}`);
  const result = await response.json();
  console.log(`Player ${playerId} stats:`, result);
}

/**
 * Connect to WebSocket and listen for leaderboard updates
 */
function connectWebSocket(): void {
  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('Connected to WebSocket');
    
    // Send subscribe message
    ws.send(JSON.stringify({ type: 'subscribe' }));
  });

  ws.on('message', (data: Buffer) => {
    const message = JSON.parse(data.toString());
    
    switch (message.type) {
      case 'connected':
        console.log('[WS] Connected:', message.message);
        break;
      
      case 'leaderboard_update':
        console.log('[WS] Leaderboard Update Received!');
        console.log('Top 10:', message.data.leaderboard);
        console.log('Changed Rankings:', message.data.changedRankings);
        break;
      
      case 'heartbeat':
        console.log('[WS] Heartbeat received');
        break;
      
      default:
        console.log('[WS] Message:', message);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
}

/**
 * Simulate multiple concurrent score submissions (load test)
 */
async function loadTest(numRequests: number, concurrency: number): Promise<void> {
  console.log(`Starting load test: ${numRequests} requests with concurrency ${concurrency}`);
  
  const startTime = Date.now();
  const promises: Promise<void>[] = [];
  
  for (let i = 0; i < numRequests; i++) {
    const playerId = `player-${Math.floor(Math.random() * 1000)}`;
    const score = Math.floor(Math.random() * 10000);
    
    const promise = submitScore(playerId, score).catch((error) => {
      console.error('Request failed:', error);
    });
    
    promises.push(promise);
    
    // Limit concurrency
    if (promises.length >= concurrency) {
      await Promise.race(promises);
      promises.splice(
        promises.findIndex((p) => p === undefined),
        1
      );
    }
  }
  
  // Wait for all remaining requests
  await Promise.all(promises);
  
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  const rps = numRequests / duration;
  
  console.log(`\nLoad test completed:`);
  console.log(`Total requests: ${numRequests}`);
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Requests/second: ${rps.toFixed(2)}`);
}

/**
 * Main demo function
 */
async function demo(): Promise<void> {
  try {
    console.log('=== Leaderboard Service Client Demo ===\n');
    
    // 1. Connect to WebSocket
    console.log('1. Connecting to WebSocket...');
    connectWebSocket();
    
    // Wait a bit for WebSocket to connect
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // 2. Submit some scores
    console.log('\n2. Submitting scores...');
    await submitScore('alice', 1000);
    await submitScore('bob', 2000);
    await submitScore('charlie', 1500);
    
    // 3. Get top players
    console.log('\n3. Fetching top players...');
    await getTopPlayers(10);
    
    // 4. Get specific player stats
    console.log('\n4. Fetching player stats...');
    await getPlayerStats('alice');
    
    // 5. Run a small load test
    console.log('\n5. Running load test...');
    await loadTest(100, 10);
    
    // 6. Check top players again
    console.log('\n6. Fetching top players after load test...');
    await getTopPlayers(10);
    
    console.log('\n=== Demo completed ===');
    console.log('WebSocket connection will continue to receive updates...');
    
  } catch (error) {
    console.error('Demo error:', error);
    process.exit(1);
  }
}

// Run demo if executed directly
if (require.main === module) {
  demo();
}

export { submitScore, getTopPlayers, getPlayerStats, connectWebSocket, loadTest };

