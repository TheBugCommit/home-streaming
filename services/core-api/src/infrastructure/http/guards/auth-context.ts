import { Request } from 'express';

export type AuthContext =
  | { type: 'jwt'; userId: string; email: string; role: 'admin' | 'viewer' }
  | { type: 'apiKey'; apiKeyId: string; ownerUserId: string; scopes: string[] };

export interface RequestWithAuth extends Request {
  authContext?: AuthContext;
}
