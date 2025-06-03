import { BaseEntity } from './common.js';
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
export interface AuthSession {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at?: number;
    token_type: string;
    user: User;
}
export interface LoginCredentials {
    email: string;
    password: string;
}
export interface RegisterCredentials extends LoginCredentials {
    confirmPassword: string;
}
export interface PasswordResetRequest {
    email: string;
}
export interface AuthContextState {
    user: User | null;
    session: AuthSession | null;
    loading: boolean;
    error: string | null;
}
export interface AuthActions {
    signIn: (credentials: LoginCredentials) => Promise<void>;
    signUp: (credentials: RegisterCredentials) => Promise<void>;
    signOut: () => Promise<void>;
    resetPassword: (request: PasswordResetRequest) => Promise<void>;
    clearError: () => void;
}
export interface AuthContext extends AuthContextState, AuthActions {
}
//# sourceMappingURL=auth.d.ts.map