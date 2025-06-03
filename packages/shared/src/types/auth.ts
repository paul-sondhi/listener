// Authentication types

import { BaseEntity } from './common.js';

// User authentication types
export interface User extends BaseEntity {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  email_confirmed_at?: string;
  last_sign_in_at?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

// Authentication session
export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: User;
}

// Login credentials
export interface LoginCredentials {
  email: string;
  password: string;
}

// Registration credentials
export interface RegisterCredentials extends LoginCredentials {
  confirmPassword: string;
}

// Password reset request
export interface PasswordResetRequest {
  email: string;
}

// Auth context state
export interface AuthContextState {
  user: User | null;
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
}

// Auth actions
export interface AuthActions {
  signIn: (credentials: LoginCredentials) => Promise<void>;
  signUp: (credentials: RegisterCredentials) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (request: PasswordResetRequest) => Promise<void>;
  clearError: () => void;
}

// Complete auth context
export interface AuthContext extends AuthContextState, AuthActions {} 