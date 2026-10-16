import { Router, Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { prisma } from '../db/prisma';
import { MailerService } from '../services/mailer';
import { RateLimiterService } from '../services/rateLimiter';
import { authenticate } from '../middleware/auth';

const router = Router();

// List all email senders with current hourly usage metrics
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const senders = await prisma.sender.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const sendersWithUsage = await Promise.all(
      senders.map(async (sender) => {
        const currentUsage = await RateLimiterService.getCurrentHourlyUsage(sender.id);
        // Do not expose password in frontend response
        const { pass, ...safeSender } = sender;
        return {
          ...safeSender,
          currentUsage,
        };
      })
    );

    return res.json({ success: true, senders: sendersWithUsage });
  } catch (error: any) {
    console.error('[Senders] Error fetching senders:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Auto-create and configure an Ethereal SMTP test account as a Sender
router.post('/ethereal', authenticate, async (req: Request, res: Response) => {
  try {
    const etherealAccount = await MailerService.createEtherealAccount();

    const sender = await prisma.sender.create({
      data: {
        name: `Ethereal (${etherealAccount.user.split('@')[0]})`,
        email: etherealAccount.user,
        host: etherealAccount.host,
        port: etherealAccount.port,
        secure: etherealAccount.secure,
        user: etherealAccount.user,
        pass: etherealAccount.pass,
        isDefault: true,
        hourlyLimit: 100,
        active: true,
      },
    });

    // Make sure other senders are not default
    await prisma.sender.updateMany({
      where: { id: { not: sender.id } },
      data: { isDefault: false },
    });

    const { pass, ...safeSender } = sender;
    return res.status(201).json({
      success: true,
      sender: safeSender,
      etherealWebUrl: etherealAccount.webUrl,
      message: 'Ethereal SMTP test sender successfully created and set as default',
    });
  } catch (error: any) {
    console.error('[Senders] Failed to create Ethereal sender:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Create custom SMTP sender
router.post('/', authenticate, async (req: Request, res: Response) => {
  const { name, email, host, port, secure, user, pass, hourlyLimit, isDefault } = req.body;

  if (!email || !host || !user || !pass) {
    return res.status(400).json({
      success: false,
      error: 'Missing required sender credentials (email, host, user, pass)',
    });
  }

  try {
    if (isDefault) {
      await prisma.sender.updateMany({
        data: { isDefault: false },
      });
    }

    const sender = await prisma.sender.create({
      data: {
        name: name || email.split('@')[0],
        email,
        host,
        port: port ? parseInt(port, 10) : 587,
        secure: secure === true,
        user,
        pass,
        hourlyLimit: hourlyLimit ? parseInt(hourlyLimit, 10) : 100,
        isDefault: isDefault === true,
      },
    });

    const { pass: _, ...safeSender } = sender;
    return res.status(201).json({ success: true, sender: safeSender });
  } catch (error: any) {
    console.error('[Senders] Error creating sender:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Test SMTP connection for a sender
router.post('/:id/test', authenticate, async (req: Request, res: Response) => {
  try {
    const sender = await prisma.sender.findUnique({
      where: { id: req.params.id },
    });

    if (!sender) {
      return res.status(404).json({ success: false, error: 'Sender not found' });
    }

    const transporter = nodemailer.createTransport({
      host: sender.host,
      port: sender.port,
      secure: sender.secure,
      auth: {
        user: sender.user,
        pass: sender.pass,
      },
    });

    await transporter.verify();

    return res.json({
      success: true,
      message: `SMTP connection to ${sender.host}:${sender.port} verified successfully`,
    });
  } catch (error: any) {
    console.error('[Senders] SMTP verification failed:', error.message);
    return res.status(400).json({
      success: false,
      error: `SMTP connection failed: ${error.message}`,
    });
  }
});

export default router;
