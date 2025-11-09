export interface ScoreSubmission {
  player_id: string;
  score: number;
  timestamp: string;
}

export interface LeaderboardEntry {
  player_id: string;
  rank: number;
  score: number;
}

export interface LeaderboardUpdate {
  top10: LeaderboardEntry[];
  timestamp: number;
  checksum: string;
}

export interface User {
  id: string;
  username: string;
  // Add more user details as needed
}

export interface EnhancedLeaderboardEntry extends LeaderboardEntry {
  username: string;
}

export interface KafkaMessage {
  type: 'SCORE_SUBMISSION' | 'LEADERBOARD_CHANGE';
  data: any;
  timestamp: number;
}

