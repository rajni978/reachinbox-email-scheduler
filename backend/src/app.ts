import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue } from './queue/emailQueue';
import { config } from './config';
import { authenticate } from './middleware/auth';
import authRoutes from './routes/auth.routes';
import senderRoutes from './routes/sender.routes';
import emailRoutes from './routes/email.routes';
import slackRoutes from './routes/slack.routes';
import dashboardRoutes from './routes/dashboard.routes';

export const app = express();

// Trust proxy for secure cookies behind reverse proxies/docker
app.set('trust proxy', 1);

// CORS configuration
app.use(
  cors({
    origin: [config.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(cookieParser(config.SESSION_SECRET));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Setup Bull-Board dashboard at /admin/queues with session authentication protection
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue as any) as any],
  serverAdapter,
});

app.use(
  '/admin/queues',
  authenticate,
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).send('Unauthorized. Authentication required to access BullMQ Queue Dashboard.');
    }
    next();
  },
  serverAdapter.getRouter()
);

// Health Check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'reachinbox-backend',
  });
});

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/senders', senderRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/slack', slackRoutes);
app.use('/api/dashboard', dashboardRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
});

// Centralized error handling
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[App] Unhandled request error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});
