import path from 'path';
import { fileURLToPath } from 'url';
import express, { Express } from 'express';
import { healthRouter } from './routes/health.route.js';
import { indexRouter } from './routes/index.route.js';
import { registrationRouter } from './routes/registration.route.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  app.use(registrationRouter);

  return app;
}

export const app = createApp();
