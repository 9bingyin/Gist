import { request } from "./client";

export interface AuthUser {
  username: string;
  nickname: string;
  email: string;
  avatarUrl: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface AuthStatusResponse {
  exists: boolean;
}

export interface UpdateProfileRequest {
  nickname?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface UpdateProfileResponse {
  user: AuthUser;
  token?: string;
}

export async function checkAuthStatus(): Promise<AuthStatusResponse> {
  return request<AuthStatusResponse>("/api/auth/status");
}

export async function register(
  username: string,
  nickname: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, nickname, email, password }),
  });
}

export async function login(
  identifier: string,
  password: string,
): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
}

export async function getCurrentUser(): Promise<AuthUser> {
  return request<AuthUser>("/api/auth/me");
}

export async function logout(): Promise<void> {
  return request<void>("/api/auth/logout", {
    method: "POST",
  });
}

export async function updateProfile(
  data: UpdateProfileRequest,
): Promise<UpdateProfileResponse> {
  return request<UpdateProfileResponse>("/api/auth/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}
