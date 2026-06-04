// backend/src/index.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { initializeEnv } from './config/env.js';
import authRoutes from './auth/discordOAuth.js';
import chatRoutes from './api/chat.routes.js';
import { initializeFirebase } from './config/firebase.js';
import { initializeDiscordBot, discordClient } from './discord-bot/client.js'; 
import requestRoutes from './api/request.routes.js';

import { processAndPostDiscordSnapshot } from './services/discordSnapshot.js';
import { getGateStatusDetails } from './config/timeWindow.js';

initializeEnv();
initializeFirebase();
initializeDiscordBot(); 

const app = express();

app.set('trust proxy', 1);

const allowedOrigins = [
  process.env.FRONTEND_URL, 
  'http://localhost:3000',
  'http://localhost:5173',
  'https://dynasty-guild-frontend-staging.vercel.app'
];

// 📡 PRODUCTION HARDENED EXPLICIT CORS WHITELIST FOR MULTI-HOST HANDSHAKES
app.use(cors({ 
  origin: function (origin, callback) {
    // Broadens origin matches to accept ngrok tunnels and vercel staging indicators cleanly
    if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://192.168.') || origin.includes('ngrok-free.app')) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy rules layout context.'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'Accept', 
    'Origin',
    'x-user-profile',      // Whitelists fallback auth headers
    'x-authorized-user',   // Whitelists mobile chat verification headers
    'ngrok-skip-browser-warning' // Whitelists tunnel warning bypass flags
  ]
}));

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dynasty_secret_pass',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true, 
      sameSite: 'none',
    },
  })
);

app.use('/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/requests', requestRoutes);

app.get('/', (req, res) => {
  res.send('DynastyGuild backend is online.');
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🌐 [SERVER ONLINE] Listening smoothly on port ${PORT}`);

  // ⏰ Isolated schedule evaluator helper can be cleanly called on demand
  function evaluateAnnouncementSchedules() {
    try {
      const gateDataContext = getGateStatusDetails() || {};
      const activeAnnounceLimits = gateDataContext.announcements || {
        phase1: ["07:00", "12:00", "19:00"],
        phase2: "22:15",
        phase3: "20:55"
      };

      const localizedString = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
      const localizedDate = new Date(localizedString);

      const true24HourInt = localizedDate.getHours();
      const trueMinuteInt = localizedDate.getMinutes();
      const timeTokenString = `${String(true24HourInt).padStart(2, '0')}:${String(trueMinuteInt).padStart(2, '0')}`;

      console.log(`[DEBUG] Clock Ticker Active | True Phase: ${gateDataContext.currentPhase} | Extracted Time Token: "${timeTokenString}"`);

      if (gateDataContext.currentPhase === 1) {
        const matchFound = (activeAnnounceLimits.phase1 || ["07:00", "12:00", "19:00"]).includes(timeTokenString);
        if (matchFound) {
          console.log(`⏰ [PHASE 1 TRIGGER] Milestone schedule matched (${timeTokenString}). Dispensing live demand matrix...`);
          processAndPostDiscordSnapshot(false);
        }
      } else if (gateDataContext.currentPhase === 2) {
        if ((activeAnnounceLimits.phase2 || "22:15") === timeTokenString) {
          console.log(`🔒 [PHASE 2 TRIGGER] Cutoff schedule matched (${timeTokenString}). Transmitting closed snapshot ledger...`);
          processAndPostDiscordSnapshot(true);
        }
      } else if (gateDataContext.currentPhase === 3) {
        if ((activeAnnounceLimits.phase3 || "20:55") === timeTokenString) {
          console.log(`⚔️ [PHASE 3 TRIGGER] Live auction schedule matched (${timeTokenString}). Initializing arena countdown notice...`);
          processAndPostDiscordSnapshot(false);
        }
      }
    } catch (loopErr) {
      console.error("⚠️ Background announcement interval ticker exception caught:", loopErr.message);
    }
  }

  // 🚀 Execution Step 1: Fire an evaluation immediately right now on server boot
  evaluateAnnouncementSchedules();

  // 🔄 Execution Step 2: Queue the function to run continuously every 60 seconds thereafter
  setInterval(evaluateAnnouncementSchedules, 60 * 1000);
});