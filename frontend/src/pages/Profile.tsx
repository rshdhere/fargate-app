import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, clearToken, Todo, User } from '../lib/api';
import { AppShell } from '../components/AppShell';

export function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      try {
        const [currentUser, userTodos] = await Promise.all([
          api.getCurrentUser(),
          api.listTodos(),
        ]);
        setUser(currentUser);
        setTodos(userTodos);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'failed to load profile';
        setError(message);
        if (message === 'unauthorized' || message === 'invalid token') {
          clearToken();
          navigate('/signin');
        }
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [navigate]);

  return (
    <AppShell title="Profile">
      {error && <div className="error">{error}</div>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : user ? (
        <div className="stack">
          <div className="panel">
            <p className="label">User ID</p>
            <p className="value">{user.id}</p>
          </div>
          <div className="panel">
            <p className="label">Email</p>
            <p className="value">{user.email}</p>
          </div>
          <div className="panel">
            <p className="label">Todo Count</p>
            <p className="value">{todos.length}</p>
          </div>
          <div className="panel">
            <p className="label">Latest Todo</p>
            <p className="value">{todos[0]?.title ?? 'No todos yet'}</p>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
