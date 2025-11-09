import { Request, Response } from 'express';
import { ScoreSubmission } from '../types';
import { RedisService } from '../services/RedisService';
import { KafkaService } from '../services/KafkaService';
import Joi from 'joi';

export class ScoreController {
  private redisService: RedisService;
  private kafkaService: KafkaService;

  // Validation schema for score submission
  private scoreSchema = Joi.object({
    player_id: Joi.string().required().min(1).max(255),
    score: Joi.number().integer().min(0).required(),
    timestamp: Joi.string().isoDate().required(),
  });

  constructor(redisService: RedisService, kafkaService: KafkaService) {
    this.redisService = redisService;
    this.kafkaService = kafkaService;
  }

  /**
   * POST /scores - Submit a score
   * Handles hundreds of requests per second with async processing
   */
  submitScore = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const { error, value } = this.scoreSchema.validate(req.body);

      if (error) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.details.map((d) => d.message),
        });
        return;
      }

      const submission: ScoreSubmission = value;

      console.log(`[ScoreController] Received score submission:`, submission);

      // Step 1: Immediately add to Redis SortedSet (O(log N))
      // This ensures instant leaderboard updates
      await this.redisService.addScore(submission.player_id, submission.score);

      // Step 2: Publish to Kafka for async processing
      // This isolates the database save process from the API response
      await this.kafkaService.publishScoreSubmission(submission);

      // Step 3: Publish leaderboard change event
      // This triggers the throttled leaderboard update process
      await this.kafkaService.publishLeaderboardChange({
        player_id: submission.player_id,
        score: submission.score,
        timestamp: Date.now(),
      });

      // Return success immediately without waiting for database save
      res.status(202).json({
        success: true,
        message: 'Score submitted successfully',
        player_id: submission.player_id,
        score: submission.score,
      });

      console.log(`[ScoreController] Score submission accepted for player: ${submission.player_id}`);
    } catch (error) {
      console.error('[ScoreController] Error submitting score:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to submit score',
      });
    }
  };

  /**
   * GET /scores/top - Get top N players
   */
  getTopPlayers = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

      const topPlayers = await this.redisService.getTopPlayers(limit);

      res.status(200).json({
        success: true,
        data: topPlayers,
        count: topPlayers.length,
      });
    } catch (error) {
      console.error('[ScoreController] Error fetching top players:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to fetch top players',
      });
    }
  };

  /**
   * GET /scores/player/:playerId - Get player's rank and score
   */
  getPlayerStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const { playerId } = req.params;

      const [rank, score] = await Promise.all([
        this.redisService.getPlayerRank(playerId),
        this.redisService.getPlayerScore(playerId),
      ]);

      if (rank === null || score === null) {
        res.status(404).json({
          error: 'Player not found',
          message: `Player ${playerId} has no scores`,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          player_id: playerId,
          rank,
          score,
        },
      });
    } catch (error) {
      console.error('[ScoreController] Error fetching player stats:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to fetch player stats',
      });
    }
  };

  /**
   * GET /scores/stats - Get leaderboard statistics
   */
  getLeaderboardStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const totalPlayers = await this.redisService.getTotalPlayers();
      const cachedLeaderboard = await this.redisService.getCachedLeaderboard();

      res.status(200).json({
        success: true,
        data: {
          total_players: totalPlayers,
          last_update: cachedLeaderboard?.timestamp || null,
          checksum: cachedLeaderboard?.checksum || null,
        },
      });
    } catch (error) {
      console.error('[ScoreController] Error fetching stats:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to fetch statistics',
      });
    }
  };

  /**
   * Health check endpoint
   */
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      success: true,
      message: 'Leaderboard service is healthy',
      timestamp: Date.now(),
    });
  };
}

