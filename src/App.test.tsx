import React from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

vi.mock('@ionic/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/react')>();
  return {
    ...actual,
    IonRouterOutlet: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  };
});

test('renders without crashing', async () => {
  const { baseElement, unmount } = render(<App />);
  expect(baseElement).toBeDefined();
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  unmount();
});
