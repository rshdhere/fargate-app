import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, setToken } from '../lib/api';

export function Signin() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as { message?: string; email?: string } | null;
  const [email, setEmail] = useState(locationState?.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token } = await api.signin(email, password);
      setToken(token);
      navigate('/todos');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Sign in</h1>
        <form onSubmit={onSubmit}>
          <input
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {locationState?.message && <div className="muted">{locationState.message}</div>}
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="muted" style={{ marginTop: '1rem' }}>
          No account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
