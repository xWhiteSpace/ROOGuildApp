import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 🌟 BULLETPROOF PATH RESOLVER
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
import { initializeDiscordBot, discordClient } from './discord-bot/client.js'; 
import syncRouter, { executeSpreadsheetSync } from './routes/syncRouter.js';
import requestRoutes from './api/request.routes.js';

// Ensure your startup sequences execute the bot login function
initializeEnv();
initializeFirebase();
initializeDiscordBot(); 

// 🤖 ================================================================
// HARDCORE BOT DEBUG DIAGNOSTICS ENGINE
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
} else {
  console.error('❌ [BOT DEBUG] discordClient object is completely undefined or missing upon import!');
}
// ================================================================

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
      secure: true, 
      sameSite: 'none',
    },
  })
);

// 🌟 ROUTE MOUNTING (Safely initialized after 'app' has been created)
app.use('/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/sync', syncRouter);
app.use('/api/requests', requestRoutes);

executeSpreadsheetSync(); 
setInterval(() => {
  executeSpreadsheetSync();
}, 5 * 1000);

app.get('/', (req, res) => {
  res.send('DynastyGuild backend is running.');
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🌐 [SERVER ONLINE] Listening smoothly on port ${PORT}`);
});