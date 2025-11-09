import { createClient, RedisClientType } from 'redis';
import { LeaderboardEntry, LeaderboardUpdate } from '../types';

export class RedisService {
  private client: RedisClientType;
  private readonly LEADERBOARD_KEY = 'global:leaderboard';
  private readonly LEADERBOARD_CACHE_KEY = 'leaderboard:cache';
  private readonly LEADERBOARD_TIMESTAMP_KEY = 'leaderboard:last_update';
  private readonly USER_CACHE_PREFIX = 'user:';

  constructor(host: string, port: number) {
    this.client = createClient({
      socket: {
        host,
        port,
      },
    });

    this.client.on('error', (err) => console.error('Redis Client Error', err));
  }

  async connect(): Promise<void> {
    await this.client.connect();
    console.log('Redis connected successfully');
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  /**
   * Add or update a player's score in the leaderboard
   * Time Complexity: O(log N)
   */
  async addScore(playerId: string, score: number): Promise<void> {
    await this.client.zAdd(this.LEADERBOARD_KEY, {
      score,
      value: playerId,
    });
  }

  /**
   * Get top N players from the leaderboard
   * Time Complexity: O(log(N) + M) where M is the number of elements returned
   */
  async getTopPlayers(count: number = 10): Promise<LeaderboardEntry[]> {
    // ZREVRANGE with WITHSCORES returns players in descending order (highest scores first)
    const results = await this.client.zRangeWithScores(
      this.LEADERBOARD_KEY,
      0,
      count - 1,
      { REV: true }
    );

    return results.map((result, index) => ({
      player_id: result.value,
      rank: index + 1,
      score: result.score,
    }));
  }

  /**
   * Get a specific player's rank
   * Time Complexity: O(log N)
   */
  async getPlayerRank(playerId: string): Promise<number | null> {
    const rank = await this.client.zRevRank(this.LEADERBOARD_KEY, playerId);
    return rank !== null ? rank + 1 : null;
  }

  /**
   * Get a specific player's score
   * Time Complexity: O(1)
   */
  async getPlayerScore(playerId: string): Promise<number | null> {
    const score = await this.client.zScore(this.LEADERBOARD_KEY, playerId);
    return score;
  }

  /**
   * Cache the leaderboard result with O(1) lookup
   */
  async cacheLeaderboard(leaderboard: LeaderboardUpdate): Promise<void> {
    await this.client.set(
      this.LEADERBOARD_CACHE_KEY,
      JSON.stringify(leaderboard)
    );
  }

  /**
   * Get cached leaderboard with O(1) lookup
   */
  async getCachedLeaderboard(): Promise<LeaderboardUpdate | null> {
    const cached = await this.client.get(this.LEADERBOARD_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  }

  /**
   * Update the last update timestamp
   */
  async setLastUpdateTimestamp(timestamp: number): Promise<void> {
    await this.client.set(this.LEADERBOARD_TIMESTAMP_KEY, timestamp.toString());
  }

  /**
   * Get the last update timestamp
   */
  async getLastUpdateTimestamp(): Promise<number | null> {
    const timestamp = await this.client.get(this.LEADERBOARD_TIMESTAMP_KEY);
    return timestamp ? parseInt(timestamp, 10) : null;
  }

  /**
   * Cache user details for O(1) lookup
   */
  async cacheUser(userId: string, userDetails: any): Promise<void> {
    await this.client.set(
      `${this.USER_CACHE_PREFIX}${userId}`,
      JSON.stringify(userDetails)
    );
  }

  /**
   * Get cached user details
   */
  async getCachedUser(userId: string): Promise<any | null> {
    const user = await this.client.get(`${this.USER_CACHE_PREFIX}${userId}`);
    return user ? JSON.parse(user) : null;
  }

  /**
   * Get total number of players in leaderboard
   */
  async getTotalPlayers(): Promise<number> {
    return await this.client.zCard(this.LEADERBOARD_KEY);
  }

  /**
   * Remove a player from leaderboard
   */
  async removePlayer(playerId: string): Promise<void> {
    await this.client.zRem(this.LEADERBOARD_KEY, playerId);
  }
}

