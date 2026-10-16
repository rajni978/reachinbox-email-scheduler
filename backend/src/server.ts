import { app } from './app';
import { config } from './config';
import { connectPrisma, prisma } from './db/prisma';
import { MailerService } from './services/mailer';
import { ElasticsearchService } from './services/elasticsearch';
import { SchedulerService } from './services/schedulerService';

async function bootstrap() {
  console.log(`[Server] Bootstrapping ReachInbox Email Scheduler API (${config.NODE_ENV})...`);

  // 1. Connect to PostgreSQL
  await connectPrisma();

  // 2. Ensure at least one default sender exists (auto-create Ethereal if none)
  const existingSender = await prisma.sender.findFirst({ where: { active: true } });
  if (!existingSender) {
    console.log('[Server] No active email sender found. Generating default Ethereal test sender...');
    try {
      const ethereal = await MailerService.createEtherealAccount();
      await prisma.sender.create({
        data: {
          name: 'Ethereal Test Sender',
          email: ethereal.user,
          host: ethereal.host,
          port: ethereal.port,
          secure: ethereal.secure,
          user: ethereal.user,
          pass: ethereal.pass,
          isDefault: true,
          hourlyLimit: config.MAX_EMAILS_PER_HOUR_PER_SENDER,
          active: true,
        },
      });
      console.log(`[Server] Created default Ethereal sender: ${ethereal.user}`);
    } catch (ethErr: any) {
      console.warn('[Server] Could not auto-generate Ethereal account:', ethErr.message);
    }
  }

  // 3. Initialize Elasticsearch index
  await ElasticsearchService.init();

  // 4. Run recovery check on any pending database records
  await SchedulerService.recoverUnscheduledJobs();

  // 5. Start listening
  const server = app.listen(config.PORT, () => {
    console.log(`[Server] API server running on http://localhost:${config.PORT}`);
    console.log(`[Server] BullMQ Board dashboard accessible at http://localhost:${config.PORT}/admin/queues`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[Server] Received ${signal}. Gracefully shutting down...`);
    server.close(async () => {
      await prisma.$disconnect();
      console.log('[Server] API server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[Server] Fatal bootstrap error:', err);
  process.exit(1);
});
