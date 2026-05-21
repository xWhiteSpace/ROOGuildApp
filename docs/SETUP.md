# DynastyGuild Setup Guide

## Phase 1: Project Bootstrap

1. Install Node.js (LTS version).
2. Open Terminal and navigate to the repo:
   ```bash
   cd ~/Documents/Github/DynastyGuild
   ```
3. Install dependencies for the monorepo:
   ```bash
   npm install
   ```
4. Start the frontend and backend together:
   ```bash
   npm run dev
   ```

## Environment Files

- `frontend/.env.example` contains environment variables used by the React app.
- `backend/.env.example` contains environment variables used by the Node backend and Discord bot.

## Next Steps

- Add your Firebase credentials to `backend/.env`.
- Add your Discord bot token and IDs to `backend/.env`.
- Add Firebase web config values to `frontend/.env`.
