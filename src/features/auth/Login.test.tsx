import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'react-router';
import { createMemoryHistory } from 'history';
import { vi } from 'vitest';

// Mock the auth and global UI hooks used by the Login component
vi.mock('../../shared/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: null,
    token: null,
    isAuthenticated: false,
    login: vi.fn(() => Promise.resolve({ success: true })),
    register: vi.fn(),
    socialLogin: vi.fn(() => Promise.resolve(true)),
    logout: vi.fn(),
  }),
}));

vi.mock('../../shared/ui/GlobalUIProvider', () => ({
  useGlobalUI: () => ({ showToast: vi.fn(), showModal: vi.fn(), hideModal: vi.fn() }),
}));

import Login from './Login';

test('submits login and navigates to /tab1 on success', async () => {
  const history = createMemoryHistory();

  render(
    <Router history={history}>
      <Login />
    </Router>
  );

  const signIn = screen.getByText(/sign in/i);
  await userEvent.click(signIn);

  await waitFor(() => {
    expect(history.location.pathname).toBe('/tab1');
  });
});
