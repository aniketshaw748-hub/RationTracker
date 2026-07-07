import { type SQLiteDatabase } from 'expo-sqlite';

export interface AlertResult {
  mode: 'static' | 'dynamic';
  daysRemaining: number | null;
  status: 'ok' | 'warning' | 'critical';
  dailyRate: number | null;
  fillPercentage: number;
}

export async function calculateRestockingAlert(
  db: SQLiteDatabase,
  itemId: number,
  currentAmount: number,
  capacity: number
): Promise<AlertResult> {
  const fillPercentage = (currentAmount / capacity) * 100;
  const now = Math.floor(Date.now() / 1000);
  const lookbackPeriod = 14 * 24 * 60 * 60; // 14 days in seconds
  const startTimestamp = now - lookbackPeriod;

  try {
    // Get negative inventory logs (deductions) in the last 14 days, sorted by oldest first
    const deductions = await db.getAllAsync<{ amount: number; timestamp: number }>(
      `SELECT amount, timestamp FROM inventory_log 
       WHERE pantry_item_id = ? AND amount < 0 AND timestamp >= ?
       ORDER BY timestamp ASC;`,
      [itemId, startTimestamp]
    );

    const count = deductions.length;
    
    if (count >= 5) {
      const oldestTimestamp = deductions[0].timestamp;
      const secondsElapsed = now - oldestTimestamp;
      const daysElapsed = secondsElapsed / (24 * 60 * 60);

      if (daysElapsed >= 5) {
        // Calculate daily rate
        const totalDeducted = deductions.reduce((sum, log) => sum + Math.abs(log.amount), 0);
        const dailyRate = totalDeducted / daysElapsed;

        if (dailyRate > 0) {
          const daysRemaining = currentAmount / dailyRate;
          
          let status: 'ok' | 'warning' | 'critical' = 'ok';
          if (daysRemaining < 7) {
            status = 'critical';
          } else if (daysRemaining <= 14) {
            status = 'warning';
          }

          return {
            mode: 'dynamic',
            daysRemaining,
            status,
            dailyRate,
            fillPercentage,
          };
        }
      }
    }
  } catch (error) {
    console.error(`Error calculating alerts for item ${itemId}:`, error);
  }

  // Static Fallback Mode
  let status: 'ok' | 'warning' | 'critical' = 'ok';
  if (fillPercentage < 10) {
    status = 'critical';
  } else if (fillPercentage < 25) {
    status = 'warning';
  }

  return {
    mode: 'static',
    daysRemaining: null,
    status,
    dailyRate: null,
    fillPercentage,
  };
}
