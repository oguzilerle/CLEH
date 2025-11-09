import { Router } from 'express';
import { ScoreController } from '../controllers/ScoreController';

export function createScoreRoutes(controller: ScoreController): Router {
  const router = Router();

  // POST /scores - Submit a score
  router.post('/scores', controller.submitScore);

  // GET /scores/top - Get top N players
  router.get('/scores/top', controller.getTopPlayers);

  // GET /scores/player/:playerId - Get player's rank and score
  router.get('/scores/player/:playerId', controller.getPlayerStats);

  // GET /scores/stats - Get leaderboard statistics
  router.get('/scores/stats', controller.getLeaderboardStats);

  // GET /health - Health check
  router.get('/health', controller.healthCheck);

  return router;
}

