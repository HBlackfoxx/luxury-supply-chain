// consensus/trust-score-manager.ts
// Trust score management

import { Pool } from 'pg';

export class TrustScoreManager {
  private pool: Pool;
  private scores: Map<string, number> = new Map();

  constructor(pool: Pool) {
    this.pool = pool;
  }

  getScore(participantId: string): number {
    return this.scores.get(participantId) || 85;
  }

  updateScore(participantId: string, change: number): void {
    const current = this.getScore(participantId);
    const newScore = Math.max(0, Math.min(100, current + change));
    this.scores.set(participantId, newScore);
  }

  getLeaderboard(limit: number = 10): Array<{participantId: string, score: number}> {
    return Array.from(this.scores.entries())
      .map(([participantId, score]) => ({ participantId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}