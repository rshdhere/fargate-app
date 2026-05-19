import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, clearToken, Todo } from '../lib/api';

export function Todos() {
  const navigate = useNavigate();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const items = await api.listTodos();
      setTodos(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to load todos';
      setError(message);
      if (message === 'unauthorized' || message === 'invalid token') {
        clearToken();
        navigate('/signin');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    try {
      const todo = await api.createTodo(title.trim());
      setTodos((prev) => [todo, ...prev]);
      setTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to create todo');
    }
  }

  async function onDelete(id: number) {
    setError(null);
    try {
      await api.deleteTodo(id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to delete todo');
    }
  }

  function onLogout() {
    clearToken();
    navigate('/signin');
  }

  return (
    <div className="container">
      <div className="card">
        <div className="header">
          <h1 style={{ margin: 0 }}>Todos</h1>
          <button onClick={onLogout}>Sign out</button>
        </div>

        <form onSubmit={onCreate}>
          <input
            type="text"
            placeholder="what needs doing?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={500}
          />
          <button type="submit" disabled={!title.trim()}>
            Add
          </button>
        </form>

        {error && <div className="error" style={{ marginTop: '1rem' }}>{error}</div>}

        <div style={{ marginTop: '1.5rem' }}>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : todos.length === 0 ? (
            <p className="muted">No todos yet.</p>
          ) : (
            todos.map((todo) => (
              <div key={todo.id} className="row">
                <span>{todo.title}</span>
                <button onClick={() => onDelete(todo.id)} aria-label={`Delete ${todo.title}`}>
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
