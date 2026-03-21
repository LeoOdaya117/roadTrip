export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = (() => {
    try {
      return localStorage.getItem('auth.token');
    } catch {
      return null;
    }
  })();

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> || {}),
    'Content-Type': 'application/json',
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text || res.statusText);
    (err as any).status = res.status;
    throw err;
  }
  return res.json().catch(() => null);
}

// future exports for API helpers can be added here
