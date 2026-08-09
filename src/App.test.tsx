import React from 'react';
import { render } from '@testing-library/react';
import App from './App';

test('renders without crashing', async () => {
  const { baseElement, unmount } = render(<App />);
  expect(baseElement).toBeDefined();
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  unmount();
});
