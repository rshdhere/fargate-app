const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export interface User {
  id: number;
  email: string;
  emailVerified?: boolean;
}

export interface Todo {
  id: number;
  title: string;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface SignupResponse {
  message: string;
  user: User;
}

const TOKEN_KEY = 'todo_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let message = 'request failed';
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    if (res.status === 401) clearToken();
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  signup: (email: string, password: string) =>
    request<SignupResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  resendVerification: (email: string) =>
    request<{ message: string }>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  signin: (email: string, password: string) =>
    request<AuthResponse>('/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  getCurrentUser: () => request<User>('/auth/me'),
  listTodos: () => request<Todo[]>('/todos'),
  createTodo: (title: string) =>
    request<Todo>('/todos', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  deleteTodo: (id: number) => request<void>(`/todos/${id}`, { method: 'DELETE' }),
};
