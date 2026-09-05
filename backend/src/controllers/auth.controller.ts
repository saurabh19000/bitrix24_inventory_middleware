import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { authService } from '../services/auth/auth.service';
import { AppError } from '../middleware/error.middleware';
import { env } from '../config/env';
import { debugLog } from '../services/debug/debugLog.service';

export class AuthController {
  async login(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        throw new AppError('Email and password are required', 400);
      }

      const { user, token } = await authService.login(email, password);
      debugLog.info('AUTH', `Login successful for ${user.email}`);

      const cookieOptions: Record<string, unknown> = {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
      };
      if (env.COOKIE_DOMAIN) cookieOptions.domain = env.COOKIE_DOMAIN;

      res.cookie('token', token, cookieOptions);

      res.json({
        success: true,
        data: { user, token },
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(_req: AuthenticatedRequest, res: Response): Promise<void> {
    const cookieOptions: Record<string, unknown> = {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
    };
    if (env.COOKIE_DOMAIN) cookieOptions.domain = env.COOKIE_DOMAIN;

    res.clearCookie('token', cookieOptions);
    res.json({ success: true, message: 'Logged out successfully' });
  }

  async me(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.getMe(req.user!.id);
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
