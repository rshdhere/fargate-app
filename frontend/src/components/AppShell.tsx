import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { clearToken } from '../lib/api';

interface AppShellProps {
  title: string;
  children: ReactNode;
}

export function AppShell({ title, children }: AppShellProps) {
  const navigate = useNavigate();

  function onLogout() {
    clearToken();
    navigate('/signin');
  }

  return (
    <div className="container">
      <div className="card">
        <div className="header">
          <h1 style={{ margin: 0 }}>{title}</h1>
          <button onClick={onLogout}>Sign out</button>
        </div>

        <nav className="tabs" aria-label="App sections">
          <NavLink to="/todos" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            Todos
          </NavLink>
          <NavLink to="/profile" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            Profile
          </NavLink>
        </nav>

        {children}
      </div>
    </div>
  );
}
