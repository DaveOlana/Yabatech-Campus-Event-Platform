import { Router, Request, Response } from 'express';
import { pool } from '../db.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

healthRouter.get('/ready', async (_req: Request, res: Response) => {
  try {
    let timeout: NodeJS.Timeout | undefined;
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('Readiness deadline exceeded')), 5_000); }),
    ]).finally(() => { if (timeout) clearTimeout(timeout); });
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});
