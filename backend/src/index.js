// backend/src/index.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 🌟 Secure Environment Path Resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { initializeEnv } from './config/env.js';
import { initializeFirebase } from './config/firebase.js';

// Initialize core environmental protections and cloud clusters first 
// to insulate downstream routers against initialization errors.
initializeEnv();
initializeFirebase();

// Safe to load remaining asynchronous and platform module layers
import authRoutes from './auth/discordOAuth.js';
import chatRoutes from './api/chat.routes.js';
import { initializeDiscordBot, discordClient } from './discord-bot/client.js'; 
import requestRoutes from './api/request.routes.js';

// 📣 Live Automated Snapshots Controller
import { processAndPostDiscordSnapshot } from './services/discordSnapshot.js';

// Bootstrap the Discord gateway protocol handshake loops
initializeDiscordBot(); 

// 🤖 Bot Gateway Tracker Diagnostics
if (discordClient) {
  discordClient.on('debug', (info) => {
    if (info.includes('heartbeat') || info.includes('Gateway')) return;
    console.log('🤖 [BOT GATEWAY TRACE]:', info);
  });
  discordClient.on('error', (error) => {
    console.error('❌ [BOT CRITICAL ERROR]:', error);
  });
  discordClient.on('warn', (warning) => {
    console.warn('⚠️ [BOT GATEWAY WARNING]:', warning);
  });
}

const app = express();

app.set('trust proxy', 1);

const allowedOrigins = [
  process.env.FRONTEND_URL, 
  'http://localhost:3000',
  'http://localhost:5173'
];

app.use(cors({ 
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://192.168.')) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy rules layout context.'));
    }
  },
  credentials: true 
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

// 🛣️ Application Routing Matrices
app.use('/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/requests', requestRoutes);

app.get('/', (req, res) => {
  res.send('DynastyGuild backend is online and tracking event-driven Firebase data lines.');
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🌐 [SERVER ONLINE] Listening smoothly on port ${PORT}`);
  console.log(`🚀 [TASK001 PASS]: Event-driven architecture active. 5-second loop decommissioned.`);

  // ⏰ GMT+8 Clock sequence checks for automated Discord Snapshot Posts
  setInterval(() => {
    const gmt8TimeStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
    const gmt8Date = new Date(gmt8TimeStr);
    
    const currentHour = gmt8Date.getHours();
    const currentMinute = gmt8Date.getMinutes();

    // Catch progress milestones at 07:00, 12:00, and 19:00 GMT+8
    if (currentMinute === 0 && (currentHour === 7 || currentHour === 12 || currentHour === 19)) {
      console.log(`⏰ Time target reached (${currentHour}:00 GMT+8). Firing snapshot update...`);
      processAndPostDiscordSnapshot(false);
    }

    // Catch final hard cutoff lock sequence mark at 22:15 GMT+8
    if (currentHour === 22 && currentMinute === 15) {
      console.log(`🔒 Cutoff threshold reached (22:15 GMT+8). Broadcasting finalized list...`);
      processAndPostDiscordSnapshot(true);
    }
  }, 60 * 1000); // Check timeline matrices every 60 seconds
});