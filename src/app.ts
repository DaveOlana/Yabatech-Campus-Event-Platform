import path from 'path';
import { fileURLToPath } from 'url';
import express, { Express } from 'express';
import { healthRouter } from './routes/health.route.js';
import { indexRouter } from './routes/index.route.js';
import { registrationRouter } from './routes/registration.route.js';
import { authRouter } from './routes/auth.route.js';
import { adminRouter } from './routes/admin.route.js';
import { organizerRouter } from './routes/organizer.route.js';
import { organizerEventsRouter } from './routes/organizer-events.route.js';
import { createSessionMiddleware } from './session.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Session middleware
  app.use(createSessionMiddleware());

  // View engine setup
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../views'));

  // Static assets
  app.use(express.static(path.join(__dirname, '../public')));

  // Routes
  app.use(healthRouter);
  app.use(indexRouter);
  app.use(registrationRouter);
  app.use(authRouter);
  app.use(adminRouter);
  app.use(organizerRouter);
  app.use(organizerEventsRouter);

  return app;
}

export const app = createApp();
