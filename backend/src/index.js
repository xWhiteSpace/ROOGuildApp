import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import session from 'express-session';
import { initializeEnv } from './config/env.js';
import authRoutes from './auth/discordOAuth.js';
import chatRoutes from './api/chat.routes.js';
import { initializeFirebase } from './config/firebase.js';
import { initializeDiscordBot } from './discord-bot/client.js';

dotenv.config();
initializeEnv();
initializeFirebase();

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3003';
const app = express();
app.use(cors({ origin: frontendUrl, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
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
