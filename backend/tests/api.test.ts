import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { redisClient } from '../src/db/redis';

describe('API Integration Tests', () => {
  afterAll(async () => {
    await prisma.$disconnect();
    await redisClient.quit();
  });

  it('GET /health returns 200 and healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('reachinbox-backend');
  });

  it('POST /api/emails/parse extracts and deduplicates emails from text', async () => {
    const res = await request(app)
      .post('/api/emails/parse')
      .send({
        content: 'alpha@test.com, beta@test.com, alpha@test.com, bad-string',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.recipients).toEqual(['alpha@test.com', 'beta@test.com']);
    expect(res.body.data.duplicateCount).toBe(1);
    expect(res.body.data.invalidCount).toBe(1);
  });

  it('GET /api/senders returns list of configured senders', async () => {
    const res = await request(app).get('/api/senders');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.senders)).toBe(true);
    expect(res.body.senders.length).toBeGreaterThan(0);
  });

  it('GET /api/dashboard/stats returns system metrics', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.stats).toHaveProperty('scheduledEmails');
    expect(res.body.stats).toHaveProperty('sentEmails');
    expect(res.body.stats).toHaveProperty('queue');
  });

  it('GET /admin/queues returns BullMQ Board dashboard', async () => {
    const res = await request(app).get('/admin/queues/');
    expect(res.status).toBe(200);
  });
});
