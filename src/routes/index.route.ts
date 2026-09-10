import { Router, Request, Response } from 'express';

export const indexRouter = Router();

indexRouter.get('/', (_req: Request, res: Response) => {
  res.render('index', {
    title: 'YCEP — YABATECH Campus Events Platform',
    status: 'Running',
    version: '0.1.0',
  });
});
