const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

export async function fetchCurrentUser() {
  const response = await fetch(`${backendUrl}/auth/me`, {
    credentials: 'include',
  });

  if (!response.ok) {
    return { authenticated: false, user: null };
  }

  return response.json();
}

export async function logoutUser() {
  const response = await fetch(`${backendUrl}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return response.json();
}
