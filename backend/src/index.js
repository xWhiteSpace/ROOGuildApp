import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 🌟 BULLETPROOF PATH RESOLVER: Locates your .env file relative to this index.js file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// --- Diagnostic Dashboard Tool ---
console.log('🔌 [ENV CHECK] Checking variable loading sequences...');
console.log('   👉 Target Spreadsheet ID:', process.env.GOOGLE_SHEETS_SPREADSHEET_ID ? '✅ LOADED SUCCESSFULLY' : '❌ NOT FOUND (UNDEFINED)');
// ----------------------------------

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { initializeEnv } from './config/env.js';
import authRoutes from './auth/discordOAuth.js';
import chatRoutes from './api/chat.routes.js';
import { initializeFirebase } from './config/firebase.js';
import { initializeDiscordBot } from './discord-bot/client.js';
import syncRouter, { executeSpreadsheetSync } from './routes/syncRouter.js';

initializeEnv();
initializeFirebase();

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const app = express();

// 1. Tell Express to trust ngrok's secure proxy headers
app.set('trust proxy', 1);

// 🌟 CORROSION PREVENTION MATRIX: Allows multiple devices (PC and mobile profiles) to use the API simultaneously
const allowedOrigins = [
  frontendUrl, 
  'http://localhost:3000', 
  'http://localhost:5173'
];

app.use(cors({ 
  origin: function (origin, callback) {
    // Permit standard desktop browsers, mobile apps, or headless requests safely
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Cross-Origin Resource Sharing (CORS) blocked this device path.'));
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
      secure: true, // 2. Kept true so Safari and modern web clients accept cross-site ngrok cookies
      sameSite: 'none',
    },
  })
);

app.use('/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/sync', syncRouter);

// 🌟 AUTOMATED AUTO-REFRESH BROADCAST LOOP
// Fires the synchronization process immediately on boot, then repeats automatically every 5 seconds
executeSpreadsheetSync(); 
setInterval(() => {
  executeSpreadsheetSync();
}, 5 * 1000);

app.get('/', (req, res) => {
  res.send('DynastyGuild backend is running. Use /health or /auth/login.');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'dynastyguild-backend' });
});

const port = process.env.PORT || 5001;
app.listen(port, () => {
  console.log(`🚀 [BACKEND ONLINE] Server streaming data cleanly on port ${port}`);
  console.log(`   👉 Current Allowed Web Gateway Node: ${frontendUrl}`);
});