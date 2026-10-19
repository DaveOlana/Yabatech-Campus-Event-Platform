import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express, { Express } from 'express';
import helmet from 'helmet';
import { healthRouter } from './routes/health.route.js';
import { publicEventsRouter } from './routes/public-events.route.js';
import { registrationRouter } from './routes/registration.route.js';
import { authRouter } from './routes/auth.route.js';
import { adminRouter } from './routes/admin.route.js';
import { organizerRouter } from './routes/organizer.route.js';
import { organizerEventsRouter } from './routes/organizer-events.route.js';
import { adminEventsRouter } from './routes/admin-events.route.js';
import { createSessionMiddleware } from './session.js';
import { ensureCsrfToken, verifyCsrfToken } from './middleware/csrf.middleware.js';
import { notFoundHandler, applicationErrorHandler } from './middleware/error.middleware.js';
import { validateRuntimeEnvironment } from './config.js';
import { parseEventPosterUpload } from './middleware/event-poster-upload.middleware.js';
import { posterUploadRouter } from './routes/poster-upload.route.js';
import { productionUsesDirectPosterUpload } from './services/poster-storage.service.js';
import { maintenanceRouter } from './routes/maintenance.route.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(configure?: (app: Express) => void): Express {
  validateRuntimeEnvironment();
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], styleSrcAttr: ["'unsafe-inline'"], imgSrc: ["'self'", "https:", "data:", "blob:"],
      fontSrc: ["'self'"], connectSrc: ["'self'", "https://vercel.com"], formAction: ["'self'"], frameAncestors: ["'none'"], baseUri: ["'self'"], objectSrc: ["'none'"], upgradeInsecureRequests: null,
    } },
    hsts: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));
  app.use((_req, res, next) => { res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()'); next(); });
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use(express.urlencoded({ extended: true, limit: '32kb', parameterLimit: 100 }));

  // Session middleware
  app.use(createSessionMiddleware());
  app.use(ensureCsrfToken);
  // Multipart event forms must be parsed before the CSRF synchronizer reads
  // the hidden token. Files remain in memory and are capped at 4 MB.
  app.use(parseEventPosterUpload);
  app.use(verifyCsrfToken);

  // View engine setup
  const viewsDir = fs.existsSync(path.join(process.cwd(), 'views'))
    ? path.join(process.cwd(), 'views')
    : path.join(__dirname, '../views');
  app.set('view engine', 'ejs');
  app.set('views', viewsDir);
  app.use((_req, res, next) => { res.locals.directPosterUploads = productionUsesDirectPosterUpload(); next(); });

  // Static assets
  const publicDir = fs.existsSync(path.join(process.cwd(), 'public'))
    ? path.join(process.cwd(), 'public')
    : path.join(__dirname, '../public');
  app.use(express.static(publicDir));

  // Routes
  app.use(healthRouter);
  app.use(maintenanceRouter);
  app.use(publicEventsRouter);
  app.use(registrationRouter);
  app.use(authRouter);
  app.use(adminRouter);
  app.use(adminEventsRouter);
  app.use(organizerRouter);
  app.use(posterUploadRouter);
  app.use(organizerEventsRouter);

  configure?.(app);

  app.use(notFoundHandler);
  app.use(applicationErrorHandler);

  return app;
}

export const app = createApp();
