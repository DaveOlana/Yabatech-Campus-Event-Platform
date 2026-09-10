import path from 'path';
import express, { Express } from 'express';
import { healthRouter } from './routes/health.route';
import { indexRouter } from './routes/index.route';

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // View engine setup
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../views'));

  // Static assets
  app.use(express.static(path.join(__dirname, '../public')));

  // Routes
  app.use(healthRouter);
  app.use(indexRouter);

  return app;
}

export const app = createApp();
