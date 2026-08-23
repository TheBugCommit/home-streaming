export type UserRole = 'admin' | 'viewer';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  role: UserRole;
  isActive: boolean;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(input: {
    email: string;
    passwordHash: string;
    displayName?: string;
    role: UserRole;
  }): Promise<User>;
  count(): Promise<number>;
}
