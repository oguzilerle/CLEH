import { RedisService } from './RedisService';
import { KafkaService } from './KafkaService';
import { DatabaseService } from './DatabaseService';
import { LeaderboardEntry, EnhancedLeaderboardEntry, LeaderboardUpdate } from '../types';
import * as crypto from 'crypto';

export class LeaderboardProcessingService {
  private redisService: RedisService;
  private kafkaService: KafkaService;
  private dbService: DatabaseService;
  private throttleDuration: number;

  constructor(
    redisService: RedisService,
    kafkaService: KafkaService,
    dbService: DatabaseService,
    throttleDuration: number = 500
  ) {
    this.redisService = redisService;
    this.kafkaService = kafkaService;
    this.dbService = dbService;
    this.throttleDuration = throttleDuration;
  }

  /**
   * Process leaderboard change events with throttling
   */
  async processLeaderboardChange(message: any): Promise<void> {
    const currentTime = message.timestamp || Date.now();
    
    // Get the last update timestamp from Redis
    const lastUpdateTime = await this.redisService.getLastUpdateTimestamp();

    console.log(`[Leaderboard] Processing change event at ${currentTime}`);

    // Check throttle duration
    if (lastUpdateTime !== null) {
      const timeSinceLastUpdate = currentTime - lastUpdateTime;
      console.log(`[Leaderboard] Time since last update: ${timeSinceLastUpdate}ms`);

      if (timeSinceLastUpdate < this.throttleDuration) {
        console.log(
          `[Leaderboard] Throttling: Skipping update (${timeSinceLastUpdate}ms < ${this.throttleDuration}ms)`
        );
        return;
      }
    }

    // Fetch top 10 players from Redis SortedSet
    const top10 = await this.redisService.getTopPlayers(10);
    console.log(`[Leaderboard] Fetched top 10 players:`, top10);

    // Generate checksum for the leaderboard
    const checksum = this.generateChecksum(top10);

    // Get cached leaderboard
    const cachedLeaderboard = await this.redisService.getCachedLeaderboard();

    // Check if leaderboard actually changed using checksum
    if (cachedLeaderboard && cachedLeaderboard.checksum === checksum) {
      console.log('[Leaderboard] No changes detected (checksum match), skipping update');
      return;
    }

    console.log('[Leaderboard] Changes detected, preparing update...');

    // Enhance leaderboard with user details
    const enhancedLeaderboard = await this.enhanceLeaderboardWithUserDetails(top10);

    // Create leaderboard update object
    const leaderboardUpdate: LeaderboardUpdate = {
      top10,
      timestamp: currentTime,
      checksum,
    };

    // Cache the new leaderboard in Redis (O(1) lookup)
    await this.redisService.cacheLeaderboard(leaderboardUpdate);
    await this.redisService.setLastUpdateTimestamp(currentTime);

    // Determine which rankings changed
    const changedRankings = this.findChangedRankings(
      cachedLeaderboard?.top10 || [],
      top10
    );

    // Publish to Kafka leaderboard topic with enhanced user details
    await this.kafkaService.publishLeaderboardUpdate({
      leaderboard: enhancedLeaderboard,
      timestamp: currentTime,
      checksum,
      changedRankings,
    });

    console.log(
      `[Leaderboard] Update published. Changed rankings: ${changedRankings.length}`
    );
  }

  /**
   * Generate checksum for leaderboard based on userId + score
   */
  private generateChecksum(leaderboard: LeaderboardEntry[]): string {
    const data = leaderboard
      .map((entry) => `${entry.player_id}:${entry.score}`)
      .join('|');
    
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Enhance leaderboard with user details from cache
   */
  private async enhanceLeaderboardWithUserDetails(
    leaderboard: LeaderboardEntry[]
  ): Promise<EnhancedLeaderboardEntry[]> {
    const enhanced: EnhancedLeaderboardEntry[] = [];

    for (const entry of leaderboard) {
      // Try to get user from cache first (O(1))
      let user = await this.redisService.getCachedUser(entry.player_id);

      // If not in cache, fetch from database and cache it
      if (!user) {
        user = await this.dbService.getUser(entry.player_id);
        if (user) {
          await this.redisService.cacheUser(entry.player_id, user);
        }
      }

      enhanced.push({
        ...entry,
        username: user?.username || 'Unknown',
      });
    }

    return enhanced;
  }

  /**
   * Find which rankings have changed between two leaderboards
   */
  private findChangedRankings(
    oldLeaderboard: LeaderboardEntry[],
    newLeaderboard: LeaderboardEntry[]
  ): Array<{ player_id: string; oldRank: number | null; newRank: number }> {
    const changes: Array<{
      player_id: string;
      oldRank: number | null;
      newRank: number;
    }> = [];

    // Create a map of old rankings for quick lookup
    const oldRankMap = new Map<string, number>();
    oldLeaderboard.forEach((entry) => {
      oldRankMap.set(entry.player_id, entry.rank);
    });

    // Check each entry in new leaderboard
    for (const newEntry of newLeaderboard) {
      const oldRank = oldRankMap.get(newEntry.player_id) || null;
      
      // If rank changed or player is new to top 10
      if (oldRank !== newEntry.rank) {
        changes.push({
          player_id: newEntry.player_id,
          oldRank,
          newRank: newEntry.rank,
        });
      }
    }

    return changes;
  }

  /**
   * Get current leaderboard state
   */
  async getCurrentLeaderboard(): Promise<EnhancedLeaderboardEntry[]> {
    const top10 = await this.redisService.getTopPlayers(10);
    return await this.enhanceLeaderboardWithUserDetails(top10);
  }

  /**
   * Pre-cache users for faster lookups
   */
  async precacheUsers(userIds: string[]): Promise<void> {
    console.log(`[Leaderboard] Pre-caching ${userIds.length} users...`);
    
    const users = await this.dbService.getUsers(userIds);
    
    for (const [userId, user] of users) {
      await this.redisService.cacheUser(userId, user);
    }
    
    console.log(`[Leaderboard] Pre-cached ${users.size} users`);
  }
}

