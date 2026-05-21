import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { initializeEnv } from './config/env.js';
import authRoutes from './auth/discordOAuth.js';
import chatRoutes from './api/chat.routes.js';
import { initializeFirebase } from './config/firebase.js';
import { initializeDiscordBot } from './discord-bot/client.js';

initializeEnv();
initializeFirebase();

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const app = express();

// 1. Tell Express to trust ngrok's secure proxy headers
app.set('trust proxy', 1);

app.use(cors({ origin: frontendUrl, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true, // 2. Change to true so Safari accepts cross-site ngrok cookies
      sameSite: 'none',
    },
  })
);

app.use('/auth', authRoutes);
app.use('/api/chat', chatRoutes);

app.get('/', (req, res) => {
  res.send('DynastyGuild backend is running. Use /health or /auth/login.');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'dynastyguild-backend' });
});

const port = process.env.PORT || 5000;
app.listen(port, async () => {
  console.log(`Backend listening on http://localhost:${port}`);
  try {
    await initializeDiscordBot();
  } catch (error) {
    console.error('Discord bot failed to initialize:', error.message);
  }
});