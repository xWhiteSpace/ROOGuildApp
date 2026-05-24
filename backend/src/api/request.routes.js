import { Router } from 'express';
import { getDatabase } from 'firebase-admin/database';

const router = Router();

// Low-level CSV data splitter matching your background sync engine conventions
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

/**
 * 📡 INFINITE INITIALIZATION PATHWAY
 * GET /api/requests/init
 */
router.get('/init', async (req, res) => {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const playerDisplayName = user.displayName || user.username;
    const playerLower = playerDisplayName.trim().toLowerCase();

    const availableItems = [
      { name: 'Puppet', maxQty: 1 },
      { name: 'Illu', maxQty: 1 },
      { name: 'Light&Dark', maxQty: 3 },
      { name: 'Time&Space', maxQty: 5 }
    ];

    const requestUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=RequestHistory`;
    const response = await fetch(requestUrl);
    const csvText = await response.text();
    const spreadsheetRows = parseCSVToRawArrays(csvText, 'Member');

    const db = getDatabase();
    const snapshot = await db.ref('auction/web_requests').once('value');
    const firebaseRequests = snapshot.exists() ? Object.values(snapshot.val()) : [];

    const liveCounts = {};
    availableItems.forEach(item => { liveCounts[item.name] = 0; });

    spreadsheetRows.forEach(row => {
      if ((row[1] || '').trim().toLowerCase() === playerLower) {
        const itemType = row[2];
        const itemQty = parseInt(row[3], 10) || 0;
        const appStatus = (row[4] || '').trim().toLowerCase();
        const selStatus = (row[5] || 'pending').trim().toLowerCase();
        const liveStatus = (row[6] || '').trim().toLowerCase();

        // 🛡️ THE LIVE SESSION GUARD LOCK
        // An item remains counted if it is Pending OR if it was Selected but the live loop hasn't been set to 'done'
        const isAwaitingEvaluation = (selStatus === 'pending');
        const isLiveInCurrentSession = (selStatus === 'selected' && ['now', 'next', 'standby'].includes(liveStatus));

        if (isAwaitingEvaluation || isLiveInCurrentSession) {
          if (appStatus === 'active' || appStatus === 'requested') liveCounts[itemType] += itemQty;
          if (appStatus === 'canceled' || appStatus === 'cancelled') liveCounts[itemType] -= itemQty;
        }
      }
    });

    // Layer in temporary requests currently sitting in the Firebase write-back pipe
    firebaseRequests.forEach(req => {
      if ((req.member || '').trim().toLowerCase() === playerLower) {
        if (['pending', 'standby', 'now', 'next', ''].includes((req.selectionStatus || 'pending').toLowerCase())) {
          const appStatus = (req.applicationStatus || '').toLowerCase();
          if (appStatus === 'requested') liveCounts[req.item] += req.quantity;
          if (appStatus === 'canceled') liveCounts[req.item] -= req.quantity;
        }
      }
    });

    Object.keys(liveCounts).forEach(k => { if (liveCounts[k] < 0) liveCounts[k] = 0; });

    return res.json({
      success: true,
      displayName: playerDisplayName,
      date: `${new Date().getMonth() + 1}/${new Date().getDate()}/${new Date().getFullYear()}`,
      items: availableItems,
      liveCounts
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 📡 BATCH CHECKOUT REQUISITION PORTER
 * POST /api/requests/submit
 */
router.post('/submit', async (req, res) => {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const { selections } = req.body; 
  if (!selections || Object.keys(selections).length === 0) {
    return res.status(400).json({ success: false, error: 'No item selections detected.' });
  }

  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const playerDisplayName = user.displayName || user.username;
    const playerLower = playerDisplayName.trim().toLowerCase();

    const requestUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=RequestHistory`;
    const response = await fetch(requestUrl);
    const spreadsheetRows = parseCSVToRawArrays(await response.text(), 'Member');

    const db = getDatabase();
    const snapshot = await db.ref('auction/web_requests').once('value');
    const firebaseRequests = snapshot.exists() ? Object.values(snapshot.val()) : [];

    const combinedSelectionTimeline = [];
    spreadsheetRows.forEach(row => {
      if ((row[1] || '').trim().toLowerCase() === playerLower) {
        combinedSelectionTimeline.push((row[5] || 'pending').trim().toLowerCase());
      }
    });
    firebaseRequests.forEach(req => {
      if ((req.member || '').trim().toLowerCase() === playerLower) {
        combinedSelectionTimeline.push((req.selectionStatus || 'pending').trim().toLowerCase());
      }
    });

    let lastSelectedIdx = -1;
    for (let i = combinedSelectionTimeline.length - 1; i >= 0; i--) {
      if (combinedSelectionTimeline[i] === 'selected') {
        lastSelectedIdx = i;
        break;
      }
    }

    let dynamicPriority = 0;
    const searchStart = lastSelectedIdx !== -1 ? lastSelectedIdx + 1 : 0;
    for (let i = searchStart; i < combinedSelectionTimeline.length; i++) {
      const status = combinedSelectionTimeline[i].replace(/\s+/g, '');
      if (['notselected', 'passed'].includes(status)) dynamicPriority++;
    }

    const chosenItemNames = Object.keys(selections);
    for (const itemName of chosenItemNames) {
      const targetQty = parseInt(selections[itemName], 10) || 0;
      if (targetQty <= 0) continue; 

      const newRequestRef = db.ref('auction/web_requests').push();
      await newRequestRef.set({
        id: newRequestRef.key,
        date: `${new Date().getMonth() + 1}/${new Date().getDate()}/${new Date().getFullYear()}`,
        member: playerDisplayName,
        item: itemName,
        quantity: targetQty,
        applicationStatus: 'Requested',
        selectionStatus: 'Pending',
        priority: dynamicPriority
      });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 📡 BALANCING COUNTER-LEDGER CANCELLATION PORTER
 * POST /api/requests/cancel
 */
router.post('/cancel', async (req, res) => {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ success: false, error: 'Session identity missing' });

  const { itemName, cancelQty } = req.body;
  try {
    const playerDisplayName = user.displayName || user.username;
    const db = getDatabase();
    
    const newCancelRef = db.ref('auction/web_requests').push();
    await newCancelRef.set({
      id: newCancelRef.key,
      date: `${new Date().getMonth() + 1}/${new Date().getDate()}/${new Date().getFullYear()}`,
      member: playerDisplayName,
      item: itemName,
      quantity: parseInt(cancelQty, 10),
      applicationStatus: 'Canceled',
      selectionStatus: 'Pending',
      priority: 0
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;