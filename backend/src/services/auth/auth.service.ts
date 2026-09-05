import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../middleware/error.middleware';
import { AuthUser } from '../../types';

export interface LoginResult {
  user: AuthUser;
  token: string;
}

export class AuthService {
  async login(email: string, password: string): Promise<LoginResult> {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    if (!user || !user.isActive) {
      throw new AppError('Invalid credentials', 401);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new AppError('Invalid credentials', 401);
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(authUser, env.JWT_SECRET, {
      expiresIn: '24h',
    });

    return { user: authUser, token };
  }

  async getMe(userId: string): Promise<AuthUser> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new AppError('User not found', 404);
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }
}

export const authService = new AuthService();
