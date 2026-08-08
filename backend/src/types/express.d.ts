import type { Role } from '../constants/roles.js';

export interface AuthContext {
  userId: string;
  role: Role;
  tokenVersion?: number;
  accountStatus?: string;
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: AuthContext;
    }
  }
}

export {};
