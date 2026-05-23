// Automatically handles slashes and maps to the correct local network or Ngrok ports
const getCleanBackendUrl = () => {
  const envUrl = import.meta.env.VITE_BACKEND_API_URL;
  
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }

  const hostname = window.location.hostname;

  if (hostname.includes('ngrok-free.dev')) {
    return `https://${hostname}`;
  }

  return `http://${hostname}:5001`;
};

const backendUrl = getCleanBackendUrl();

export async function sendChatMessage(content) {
  try {
    // 🌟 MATCHING KEY: Aligns perfectly with the storage engine inside App.jsx
    const storedUser = localStorage.getItem('dynasty_raid_session');

    const response = await fetch(`${backendUrl}/api/chat/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        // encodeURIComponent keeps special characters from breaking the HTTP header value rules
        'X-Authorized-User': storedUser ? encodeURIComponent(storedUser) : '',
      },
      credentials: 'include',
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Server rejected message execution context.' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('💥 [CHAT SERVICE ERROR]:', error.message);
    throw error;
  }
}