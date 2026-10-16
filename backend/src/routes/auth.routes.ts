import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../db/prisma';
import { config } from '../config';
import { authenticate } from '../middleware/auth';

const router = Router();
const googleClient = new OAuth2Client(
  config.GOOGLE_CLIENT_ID,
  config.GOOGLE_CLIENT_SECRET,
  config.GOOGLE_CALLBACK_URL
);

// Returns current authenticated user
router.get('/me', authenticate, (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, user: null });
  }
  return res.json({ success: true, user: req.user });
});

// Google OAuth URL generator
router.get('/google/url', (req: Request, res: Response) => {
  if (!config.GOOGLE_CLIENT_ID) {
    return res.status(400).json({
      success: false,
      error: 'Google OAuth is not configured in backend environment variables.',
    });
  }

  const url = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
    prompt: 'consent',
  });

  return res.json({ success: true, url });
});

// Google OAuth callback
router.get('/google/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) {
    return res.redirect(`${config.FRONTEND_URL}?error=missing_code`);
  }

  try {
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    if (!tokens.id_token) {
      return res.redirect(`${config.FRONTEND_URL}?error=no_id_token`);
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return res.redirect(`${config.FRONTEND_URL}?error=invalid_payload`);
    }

    let user = await prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: payload.email,
          name: payload.name || payload.email.split('@')[0],
          avatarUrl: payload.picture,
          googleId: payload.sub,
        },
      });
    }

    // Set HTTP-only secure cookie
    res.cookie('reachinbox_user_id', user.id, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000, // 7 days
    });

    return res.redirect(`${config.FRONTEND_URL}?auth_success=true`);
  } catch (error: any) {
    console.error('[Auth] Google callback error:', error);
    return res.redirect(`${config.FRONTEND_URL}?error=oauth_exchange_failed`);
  }
});

// Google ID token login endpoint for frontend Google Identity Services (One Tap / button)
router.post('/google/token', async (req: Request, res: Response) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ success: false, error: 'Credential ID token is required' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: config.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return res.status(400).json({ success: false, error: 'Invalid Google token payload' });
    }

    let user = await prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: payload.email,
          name: payload.name || payload.email.split('@')[0],
          avatarUrl: payload.picture,
          googleId: payload.sub,
        },
      });
    }

    res.cookie('reachinbox_user_id', user.id, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000,
    });

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error: any) {
    console.error('[Auth] Google token verification error:', error.message);
    return res.status(401).json({ success: false, error: 'Google authentication failed' });
  }
});

// Dev bypass login
router.post('/dev-login', async (req: Request, res: Response) => {
  let user = await prisma.user.findFirst({
    where: { email: 'demo@reachinbox.ai' },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'demo@reachinbox.ai',
        name: 'Alex Demo',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ReachInbox',
        googleId: 'dev_google_id_reachinbox',
      },
    });
  }

  res.cookie('reachinbox_user_id', user.id, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 3600 * 1000,
  });

  return res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
  });
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('reachinbox_user_id');
  return res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
