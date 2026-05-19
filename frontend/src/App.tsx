import { Routes, Route, Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { Signin } from './pages/Signin';
import { Signup } from './pages/Signup';
import { Todos } from './pages/Todos';
import { Profile } from './pages/Profile';
import { getToken } from './lib/api';

function RequireAuth({ children }: { children: ReactNode }) {
  return getToken() ? <>{children}</> : <Navigate to="/signin" replace />;
}

function RedirectIfAuthed({ children }: { children: ReactNode }) {
  return getToken() ? <Navigate to="/todos" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/signin"
        element={
          <RedirectIfAuthed>
            <Signin />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/signup"
        element={
          <RedirectIfAuthed>
            <Signup />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/"
        element={<Navigate to="/todos" replace />}
      />
      <Route
        path="/todos"
        element={
          <RequireAuth>
            <Todos />
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <Profile />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
