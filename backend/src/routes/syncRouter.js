import { Router } from 'express';
import { getDatabase } from 'firebase-admin/database';
import { google } from 'googleapis'; // 🌟 Added for secure, authorized Google Sheets write-back
import dotenv from 'dotenv';
dotenv.config();

const router = Router();

// Timezone-proof date normalizer to handle formatting variations seamlessly
function normalizeDateStr(dateStr) {
  if (!dateStr) return '';
  const clean = dateStr.trim().replace(/[-\.]/g, '/');
  const parts = clean.split('/');
  if (parts.length === 3) {
    let month, day, year;
    if (parts[0].length === 4) { // YYYY/MM/DD layout structure
      year = parts[0];
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else { // MM/DD/YYYY layout structure
      month = parseInt(parts[0], 10);
      day = parseInt(parts[1], 10);
      year = parts[2];
    }
    if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
      return `${month}/${day}/${year}`;
    }
  }
  return dateStr.trim();
}

// Low-level CSV parser that returns clean text value arrays for every single row line
function parseCSVToRawArrays(csvText, headerMatchKeyword) {
  const lines = csvText.split(/\r?\n/);
  let tableStarted = false;
  const dataRows = [];

  for (let line of lines) {
    if (!line.trim()) continue;
    
    const cleanLine = line.replace(/^\ufeff/, '');
    const cells = cleanLine.split(',').map(c => c.trim().replace(/^"|"$/g, '').trim());
    
    if (!tableStarted) {
      if (cells.map(c => c.toLowerCase()).includes(headerMatchKeyword.toLowerCase())) {
        tableStarted = true;
      }
      continue;
    }

    if (cells.every(c => c === '')) continue;
    dataRows.push(cells);
  }
  return dataRows;
}

// 🌟 QUIET AUTOMATED SYNCHRONIZATION ENGINE
export async function executeSpreadsheetSync() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) return;

  try {
    // -------------------------------------------------------------
    // STEP 1: ESTABLISH THE CALENDAR DATE ANCHOR VIA LOOTHISTORY
    // -------------------------------------------------------------
    const historyUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=LootHistory&range=A1:Z1010`;
    const historyRes = await fetch(historyUrl);
    const historyText = await historyRes.text();
    const historyRows = parseCSVToRawArrays(historyText, 'Date');

    let rawActiveDate = '';
    historyRows.forEach(row => {
      const rowDate = (row[0] || '').trim(); // Column A (Date)
      if (rowDate && rowDate.includes('/')) {
        if (!rawActiveDate || new Date(rowDate) > new Date(rawActiveDate)) {
          rawActiveDate = rowDate;
        }
      }
    });

    if (!rawActiveDate) return; // Silent return to protect terminal real estate

    const normalizedAnchor = normalizeDateStr(rawActiveDate);

    // -------------------------------------------------------------
    // STEP 2: EXTRACT TONIGHT'S TOTAL LOOT DROP MAX CAPS
    // -------------------------------------------------------------
    const computedTally = {
      puppet: { current: 0, max: 0 },
      illu: { current: 0, max: 0 },
      lnd: { current: 0, max: 0 },
      tns: { current: 0, max: 0 }
    };

    historyRows.forEach(row => {
      if (normalizeDateStr(row[0]) === normalizedAnchor) {
        const type = (row[2] || '').trim().toLowerCase(); // Column C (Item Name)
        const droppedQty = parseInt(row[3], 10) || 0;     // Column D (Qty)
        
        if (type === 'puppet') computedTally.puppet.max = droppedQty;
        if (type === 'illu') computedTally.illu.max = droppedQty;
        if (type === 'light&dark') computedTally.lnd.max = droppedQty;
        if (type === 'time&space') computedTally.tns.max = droppedQty;
      }
    });

    // -------------------------------------------------------------
    // STEP 3: COMPUTE ACTIVE TALLIES VIA INDEX POSITION SCANS
    // -------------------------------------------------------------
    const itemTabs = ['Puppet', 'Illu', 'Light&Dark', 'Time&Space'];
    for (const tabName of itemTabs) {
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}&range=A1:Z1010`;
      const res = await fetch(url);
      if (!res.ok) continue;

      const text = await res.text();
      const itemRows = parseCSVToRawArrays(text, 'Member');
      const shortKey = tabName === 'Light&Dark' ? 'lnd' : tabName === 'Time&Space' ? 'tns' : tabName.toLowerCase();

      itemRows.forEach(row => {
        const rowDate = row[0] || ''; // Position 0 is Column A (Date)
        if (normalizeDateStr(rowDate) === normalizedAnchor) {
          // Process items starting from Column D onwards
          for (let i = 3; i < row.length; i++) {
            const cellVal = (row[i] || '').trim().toLowerCase();
            if (cellVal === 'bid complete' || cellVal === 'not sold') {
              computedTally[shortKey].current++;
            }
          }
        }
      });
    }

    // -------------------------------------------------------------
    // STEP 4: MAP THE LIVE QUEUE VIA CENTRAL REQUESTHISTORY
    // -------------------------------------------------------------
    const requestUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=RequestHistory&range=A1:Z1010`;
    const requestRes = await fetch(requestUrl);
    const requestText = await requestRes.text();
    const requestRows = parseCSVToRawArrays(requestText, 'Member');

    let nowPlayerName = null;
    let nextPlayerName = null;
    const standbyPlayerNames = new Set();
    const requestItemsList = [];

    requestRows.forEach(row => {
      const rowDate = normalizeDateStr(row[0] || ''); // Column A (Timestamp)
      if (rowDate !== normalizedAnchor) return;

      const player = row[1]?.trim(); // Column B (Member)
      if (!player || player === '???') return;

      const biddingStatus = row[6]?.trim().toLowerCase(); // Column G (BiddingStatus)
      if (biddingStatus === 'now') nowPlayerName = player;
      if (biddingStatus === 'next') nextPlayerName = player;
      if (biddingStatus === 'standby') standbyPlayerNames.add(player);
    });

    if (nowPlayerName) {
      const targetLowerName = nowPlayerName.toLowerCase();
      requestRows.forEach(row => {
        const rowDate = normalizeDateStr(row[0] || '');
        if (rowDate !== normalizedAnchor) return;
        
        const currentLowerMember = row[1]?.trim().toLowerCase();
        const appStatus = row[4]?.trim().toLowerCase(); // Column E (ApplicationStatus)

        if (currentLowerMember === targetLowerName && appStatus === 'active') {
          const itemType = row[2]; // Column C (Item)
          const itemQty = row[3];  // Column D (Qty)
          if (itemType && itemQty) {
            requestItemsList.push(`[${itemType.trim()}] - ${itemQty.trim()}`);
          }
        }
      });
    }

    // -------------------------------------------------------------
    // STEP 5: SYNC TO FIREBASE
    // -------------------------------------------------------------
    const queueOutput = {
      now: nowPlayerName ? { name: nowPlayerName, items: requestItemsList } : null,
      next: nextPlayerName ? { name: nextPlayerName } : null,
      standby: Array.from(standbyPlayerNames).map(name => ({ name }))
    };

    const db = getDatabase();
    await db.ref('auction/tally').set(computedTally);
    await db.ref('auction/queue').set(queueOutput);

    // -------------------------------------------------------------
    // 🌟 STEP 6: BACKWARD WRITE-BACK HANDSHAKE (FIREBASE -> GOOGLE SHEET)
    // -------------------------------------------------------------
    const requestsSnapshot = await db.ref('auction/web_requests').once('value');
    
    if (requestsSnapshot.exists()) {
      const webRequestsMap = requestsSnapshot.val();
      const webRequestsEntries = Object.entries(webRequestsMap);

      // Verify Google Credentials exist before executing the append
      if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
        try {
          // 🧼 AUTOMATIC STRING CLEANER
          // 1. Remove any accidental outer quote marks left behind by the environment reader
          let cleanKey = process.env.GOOGLE_PRIVATE_KEY.trim().replace(/^["']|["']$/g, '');
          // 2. Safely translate literal text "\n" characters into real system linebreaks
          cleanKey = cleanKey.replace(/\\n/g, '\n');

          const cleanEmail = process.env.GOOGLE_CLIENT_EMAIL.trim().replace(/^["']|["']$/g, '');

          const auth = new google.auth.JWT(
            cleanEmail,
            null,
            cleanKey,
            ['https://www.googleapis.com/auth/spreadsheets']
          );
          const sheets = google.sheets({ version: 'v4', auth });
          
          const rowsToAppend = [];
          const keysToClear = [];

          webRequestsEntries.forEach(([key, req]) => {
            // Maps arrays to match columns: Timestamp,Member,Item,Qty,ApplicationStatus,SelectionStatus,LiveStatus,Priority
            rowsToAppend.push([
              req.date || '',
              req.member || '',
              req.item || '',
              req.quantity || 0,
              req.applicationStatus || 'Requested',
              req.selectionStatus || 'Pending',
              '', 
              req.priority || 0
            ]);
            keysToClear.push(key);
          });

          if (rowsToAppend.length > 0) {
            console.log(`📤 [WRITE-BACK] Moving ${rowsToAppend.length} entries out of Firebase staging into Google Sheet...`);
            
            await sheets.spreadsheets.values.append({
              spreadsheetId,
              range: 'RequestHistory!A:H',
              valueInputOption: 'USER_ENTERED',
              requestBody: {
                values: rowsToAppend
              }
            });

            // Delete successfully moved items from Firebase buffer to complete the loop
            for (const key of keysToClear) {
              await db.ref(`auction/web_requests/${key}`).remove();
            }
            console.log(`✅ [WRITE-BACK SUCCESS] Successfully updated RequestHistory spreadsheet tab.`);
          }
        } catch (writeBackError) {
          console.error('❌ [WRITE-BACK TRANSMISSION ERROR]:', writeBackError.message);
        }
      }
    }
    
  } catch (error) {
    // Only speak up if an actual server/network error goes down
    console.error('❌ [SYNC FATAL FAULT] Background loop interrupted:', error.message);
  }
}

router.get('/status', (req, res) => {
  res.json({ success: true, message: 'Quiet production loop is running smoothly.' });
});

export default router;