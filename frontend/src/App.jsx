import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import RequestTab from './pages/RequestTab';
import LiveBiddingTab from './pages/LiveBiddingTab';
import MimicBookTab from './pages/MimicBookTab';
import RequestHistoryTab from './pages/RequestHistoryTab';
import PastAuctionTab from './pages/PastAuctionTab';
import SubmitEvidenceTab from './pages/SubmitEvidenceTab';
import LoginPage from './pages/LoginPage';
import SettingsTab from './pages/SettingsTab'; // Dynamic Desk Workspace loaded here

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Isolated Authentication Pathway View */}
        <Route path="/login" element={<LoginPage />} />
        
        {/* Core Layout Frame Shell Wrapper */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<RequestTab />} />
          <Route path="/live-bidding" element={<LiveBiddingTab />} />
          <Route path="/mimic-book" element={<MimicBookTab />} />
          <Route path="/request-history" element={<RequestHistoryTab />} />
          <Route path="/past-auction" element={<PastAuctionTab />} />
          <Route path="/submit-evidence" element={<SubmitEvidenceTab />} />
          
          {/* ⚙️ Secure Administrative Settings Workspace View Route */}
          <Route path="/settings-configuration" element={<SettingsTab />} />
        </Route>
      </Routes>
    </Router>
  );
}