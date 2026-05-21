const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

export async function sendChatMessage(content) {
  const response = await fetch(`${backendUrl}/api/chat/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to send message');
  }

  return response.json();
}
