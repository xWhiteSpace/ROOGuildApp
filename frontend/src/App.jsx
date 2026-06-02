import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import RequestTab from './pages/RequestTab';
import LiveBiddingTab from './pages/LiveBiddingTab';
import MimicBookTab from './pages/MimicBookTab';
import RequestHistoryTab from './pages/RequestHistoryTab';
import PastAuctionTab from './pages/PastAuctionTab';
import SubmitEvidenceTab from './pages/SubmitEvidenceTab';
import LoginPage from './pages/LoginPage';
import SettingsTab from './pages/SettingsTab'; // Dynamic Desk Workspace loaded here

// 🌐 Absolute target network routing parameters for cross-domain Vercel/Render deployments
const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

/**
 * 🔒 SECURE PROTECTED ROUTE GUARD FRAME
 * Prevents unauthenticated users from seeing inner control metrics or administrative tabs.
 */
function ProtectedRoute({ user, children }) {
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

/**
 * 🔓 PUBLIC ROUTE GUARD FRAME
 * Redirects logged-in users straight back to the main cockpit if they try to access the login sheet.
 */
function PublicRoute({ user, children }) {
  if (user) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const synchronizeAuthenticationState = async () => {
      try {
        // Step 1: Intercept incoming OAuth redirect payload queries from the URL string
        const urlParams = new URLSearchParams(window.location.search);
        const authUserQueryParam = urlParams.get('auth_user');

        if (authUserQueryParam) {
          const decodedUserStr = decodeURIComponent(authUserQueryParam);
          // Commit the profile object to the browser cache immediately
          localStorage.setItem('dynasty_raid_session', decodedUserStr);
          
          // Scrub the bloated parameter out of the Safari address bar cleanly without page refresh
          const cleanWindowUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanWindowUrl);
        }

        // Step 2: Query the backend status verification gate utilizing hybrid fallback mechanisms
        const savedSessionData = localStorage.getItem('dynasty_raid_session');
        const customSecurityHeaders = { 'Content-Type': 'application/json' };
        
        if (savedSessionData) {
          customSecurityHeaders['x-user-profile'] = encodeURIComponent(savedSessionData);
        }

        const res = await fetch(`${backendUrl}/auth/me`, {
          method: 'GET',
          headers: customSecurityHeaders,
          credentials: 'include'
        });

        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
          // Keep data synchronized with any live status updates from the server
          localStorage.setItem('dynasty_raid_session', JSON.stringify(data.user));
        } else {
          setUser(null);
          localStorage.removeItem('dynasty_raid_session');
        }
      } catch (err) {
        console.error("❌ Authentication gateway sync crash:", err);
        // Resilient Fallback: If Render times out but a local session exists, trust cache to prevent lockouts
        const cachedSessionFallback = localStorage.getItem('dynasty_raid_session');
        if (cachedSessionFallback) {
          try {
            setUser(JSON.parse(cachedSessionFallback));
          } catch (_) {
            localStorage.removeItem('dynasty_raid_session');
          }
        }
      } finally {
        setLoading(false);
      }
    };

    synchronizeAuthenticationState();
  }, []);

  // 🌀 HIGH-FIDELITY DARK GATEWAY LOADER 
  // Freezes the initialization frame until authentication is explicitly checked or restored
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white font-sans select-none">
        <div className="w-7 h-7 border-2 border-t-amber-500 border-slate-900 rounded-full animate-spin mb-4.5"></div>
        <div className="text-[10px] font-mono text-slate-500 tracking-widest uppercase animate-pulse">Initializing Security Gateway...</div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Isolated Authentication Pathway View */}
        <Route 
          path="/login" 
          element={
            <PublicRoute user={user}>
              <LoginPage />
            </PublicRoute>
          } 
        />
        
        {/* Core Layout Frame Shell Wrapper */}
        <Route 
          element={
            <ProtectedRoute user={user}>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<RequestTab />} />
          <Route path="/live-bidding" element={<LiveBiddingTab />} />
          <Route path="/mimic-book" element={<MimicBookTab />} />
          <Route path="/request-history" element={<RequestHistoryTab />} />
          <Route path="/past-auction" element={<PastAuctionTab />} />
          <Route path="/submit-evidence" element={<SubmitEvidenceTab />} />
          
          {/* ⚙️ Secure Administrative Settings Workspace View Route */}
          <Route path="/settings-configuration" element={<SettingsTab />} />
        </Route>

        {/* Catch-all fallback matrix redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}