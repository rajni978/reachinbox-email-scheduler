import { Client } from '@elastic/elasticsearch';
import { config } from '../config';
import { prisma } from '../db/prisma';

export interface IndexedEmailDoc {
  emailJobId: string;
  campaignId: string;
  senderId: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt?: string | null;
  etherealUrl?: string | null;
  messageId?: string | null;
  createdAt: string;
}

export class ElasticsearchService {
  private static client: Client | null = null;
  private static isConnected = false;

  static getClient(): Client {
    if (!this.client) {
      this.client = new Client({
        node: config.ELASTICSEARCH_NODE,
        maxRetries: 3,
        requestTimeout: 5000,
      });
    }
    return this.client;
  }

  /**
   * Initializes the Elasticsearch index with appropriate field mappings
   */
  static async init(): Promise<boolean> {
    try {
      const client = this.getClient();
      const index = config.ELASTICSEARCH_INDEX;

      const exists = await client.indices.exists({ index });
      if (!exists) {
        await client.indices.create({
          index,
          mappings: {
            properties: {
              emailJobId: { type: 'keyword' },
              campaignId: { type: 'keyword' },
              senderId: { type: 'keyword' },
              senderEmail: { type: 'keyword' },
              recipientEmail: { type: 'keyword' },
              subject: { type: 'text' },
              body: { type: 'text' },
              status: { type: 'keyword' },
              scheduledAt: { type: 'date' },
              sentAt: { type: 'date' },
              etherealUrl: { type: 'keyword' },
              messageId: { type: 'keyword' },
              createdAt: { type: 'date' },
            },
          },
        });
        console.log(`[Elasticsearch] Index "${index}" created with mappings.`);
      }
      this.isConnected = true;
      return true;
    } catch (err: any) {
      console.warn(`[Elasticsearch] Connection or initialization notice: ${err.message}. Graceful fallback to PostgreSQL enabled.`);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Indexes or updates an email record in Elasticsearch
   */
  static async indexEmail(doc: IndexedEmailDoc): Promise<void> {
    try {
      const client = this.getClient();
      await client.index({
        index: config.ELASTICSEARCH_INDEX,
        id: doc.emailJobId,
        document: doc,
        refresh: true,
      });
    } catch (err: any) {
      console.error(`[Elasticsearch] Failed to index email job ${doc.emailJobId}:`, err.message);
      // Non-blocking: PostgreSQL is source of truth
    }
  }

  /**
   * Searches emails with full-text search across recipient, subject, and body
   */
  static async searchEmails(
    queryStr: string,
    filters?: { status?: string; senderId?: string },
    page = 1,
    limit = 20
  ): Promise<{ hits: any[]; total: number; source: 'elasticsearch' | 'database' }> {
    const client = this.getClient();

    try {
      const mustClauses: any[] = [];

      if (queryStr && queryStr.trim().length > 0) {
        mustClauses.push({
          multi_match: {
            query: queryStr,
            fields: ['recipientEmail^3', 'subject^2', 'body', 'senderEmail'],
            fuzziness: 'AUTO',
          },
        });
      }

      if (filters?.status) {
        mustClauses.push({ term: { status: filters.status } });
      }

      if (filters?.senderId) {
        mustClauses.push({ term: { senderId: filters.senderId } });
      }

      const response = await client.search({
        index: config.ELASTICSEARCH_INDEX,
        from: (page - 1) * limit,
        size: limit,
        query: mustClauses.length > 0 ? { bool: { must: mustClauses } } : { match_all: {} },
        sort: [{ scheduledAt: { order: 'desc' } }],
      });

      const total =
        typeof response.hits.total === 'number'
          ? response.hits.total
          : response.hits.total?.value || 0;

      const hits = response.hits.hits.map((hit) => hit._source);

      return {
        hits,
        total,
        source: 'elasticsearch',
      };
    } catch (err: any) {
      console.warn(`[Elasticsearch] Search query failed (${err.message}). Falling back to PostgreSQL query.`);
      return await this.fallbackDatabaseSearch(queryStr, filters, page, limit);
    }
  }

  /**
   * Fallback query against PostgreSQL source of truth
   */
  private static async fallbackDatabaseSearch(
    queryStr: string,
    filters?: { status?: string; senderId?: string },
    page = 1,
    limit = 20
  ) {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.senderId) {
      where.senderId = filters.senderId;
    }

    if (queryStr && queryStr.trim().length > 0) {
      where.OR = [
        { recipientEmail: { contains: queryStr, mode: 'insensitive' } },
        { subject: { contains: queryStr, mode: 'insensitive' } },
        { body: { contains: queryStr, mode: 'insensitive' } },
      ];
    }

    const [total, records] = await Promise.all([
      prisma.emailJob.count({ where }),
      prisma.emailJob.findMany({
        where,
        include: { sender: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { scheduledAt: 'desc' },
      }),
    ]);

    const hits = records.map((r) => ({
      emailJobId: r.id,
      campaignId: r.campaignId,
      senderId: r.senderId,
      senderEmail: r.sender.email,
      recipientEmail: r.recipientEmail,
      subject: r.subject,
      body: r.body,
      status: r.status,
      scheduledAt: r.scheduledAt.toISOString(),
      sentAt: r.sentAt?.toISOString() || null,
      etherealUrl: r.etherealUrl,
      messageId: r.messageId,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      hits,
      total,
      source: 'database' as const,
    };
  }

  /**
   * Bulk sync all PostgreSQL email jobs into Elasticsearch for recovery
   */
  static async bulkSyncFromDatabase(): Promise<number> {
    try {
      const allJobs = await prisma.emailJob.findMany({
        include: { sender: true },
        take: 5000,
      });

      if (allJobs.length === 0) return 0;

      const client = this.getClient();
      const operations = allJobs.flatMap((job) => [
        { index: { _index: config.ELASTICSEARCH_INDEX, _id: job.id } },
        {
          emailJobId: job.id,
          campaignId: job.campaignId,
          senderId: job.senderId,
          senderEmail: job.sender.email,
          recipientEmail: job.recipientEmail,
          subject: job.subject,
          body: job.body,
          status: job.status,
          scheduledAt: job.scheduledAt.toISOString(),
          sentAt: job.sentAt?.toISOString() || null,
          etherealUrl: job.etherealUrl,
          messageId: job.messageId,
          createdAt: job.createdAt.toISOString(),
        },
      ]);

      const bulkResponse = await client.bulk({ refresh: true, operations });
      if (bulkResponse.errors) {
        console.error('[Elasticsearch] Bulk sync encountered some errors');
      }
      return allJobs.length;
    } catch (err: any) {
      console.error('[Elasticsearch] Bulk sync failed:', err.message);
      return 0;
    }
  }
}
