import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../db/prisma';
import { config } from '../config';

const googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID);

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Ensures a default development user exists when OAuth is in dev mode or bypass
 */
async function getOrCreateDevUser(): Promise<AuthenticatedUser> {
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

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
}

/**
 * Authentication middleware that verifies session cookie or Google ID token
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    // 1. Check for session cookie
    const sessionUserId = req.cookies?.reachinbox_user_id;

    if (sessionUserId) {
      const user = await prisma.user.findUnique({
        where: { id: sessionUserId },
      });

      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        };
        return next();
      }
    }

    // 2. Check for Authorization Bearer header (Google ID token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.substring(7);

      if (config.GOOGLE_CLIENT_ID) {
        try {
          const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: config.GOOGLE_CLIENT_ID,
          });
          const payload = ticket.getPayload();

          if (payload && payload.email) {
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

            req.user = {
              id: user.id,
              email: user.email,
              name: user.name,
              avatarUrl: user.avatarUrl,
            };
            return next();
          }
        } catch (tokenErr) {
          console.warn('[Auth] Google ID token verification failed:', tokenErr);
        }
      }
    }

    // 3. Fallback to Dev User if AUTH_BYPASS_DEV=true or Google Client ID not yet configured
    if (config.AUTH_BYPASS_DEV || !config.GOOGLE_CLIENT_ID || config.NODE_ENV === 'development') {
      req.user = await getOrCreateDevUser();
      return next();
    }

    return next();
  } catch (error) {
    console.error('[Auth] Authentication middleware error:', error);
    return next();
  }
}

/**
 * Strict gate middleware requiring authenticated session
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please log in with Google.',
    });
  }
  return next();
}
