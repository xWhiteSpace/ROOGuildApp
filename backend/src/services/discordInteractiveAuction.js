// backend/src/services/discordInteractiveAuction.js
import admin from 'firebase-admin';
import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

// Pure message text block formatting the in-game display alignment rule
const IN_GAME_TAB_REMINDER = `🚩 **CRITICAL IN-GAME INTERFACE CONFIGURATION**:\n` +
  `> Please make sure to click the **[ALL]** Tab on your in-game auction book screen! ` +
  `This guarantees your game client layout matches our ledger's Page and Position grid coordinate tracking rules.`;

/**
 * 🛰️ HELPER: Dynamically generates the real-time personal ledger claim summary text block
 */
function compileUserClaimsSummary(generatedSlots, finalRosterName) {
  const matchingClaims = generatedSlots.filter(slot => slot.name === finalRosterName);
  
  if (matchingClaims.length === 0) {
    return `📦 **YOUR SECURED SHOPPING LIST SUMMARY**:\n*• No item slot coordinates secured yet during this session.*`;
  }

  const listLines = matchingClaims.map(slot => 
    `• **${slot.itemName}** ➔ Page ${slot.page}, Position ${slot.slot}`
  );

  return `📦 **YOUR SECURED SHOPPING LIST SUMMARY**:\n${listLines.join('\n')}`;
}

/**
 * 📣 Renders the permanent, pinned public message card containing the launch action button
 */
export async function sendPublicAuctionCard(channel) {
  const embed = new EmbedBuilder()
    .setTitle('⚔️ DYNASTY GUILD LIVE AUCTION DESK INTERACTION MATRICES')
    .setDescription('Stay focused on your game client. Review and claim remaining vacant item slots right here.\n\nClick the button below to open your personal panel.')
    .setColor('#4f46e5');

  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_auction_panel')
      .setLabel('🔍 Open My Personal Allocation Panel')
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [buttonRow] });
}

/**
 * 🛰️ HELPER: Generates the Master Item Category Selection View (Step 2)
 */
async function renderItemCategoryView(interaction, finalRosterName, prefixMessage = "") {
  const db = admin.database();
  const configSnap = await db.ref('settings/configuration').once('value');
  const sessionSnap = await db.ref('auction/active_session').once('value');

  if (!sessionSnap.exists() || !configSnap.exists()) {
    return await interaction.editReply({ content: '❌ **ERROR**: No active allocation session is currently running on the officer dashboard.', components: [] });
  }

  const { items = [] } = configSnap.val();
  const { generatedSlots = [] } = sessionSnap.val();

  const itemVacancyCounts = {};
  generatedSlots.forEach(slot => {
    if (slot.name === '[⚠️ EXTRA UNALLOCATED SLOT]') {
      itemVacancyCounts[slot.itemType] = (itemVacancyCounts[slot.itemType] || 0) + 1;
    }
  });

  const menuOptions = items
    .filter(item => (itemVacancyCounts[item.id] || 0) > 0)
    .map(item => ({
      label: item.name,
      description: `${itemVacancyCounts[item.id]} empty layout slots available.`,
      value: `select_item_${item.id}`
    }));

  const userClaimsSummaryText = compileUserClaimsSummary(generatedSlots, finalRosterName);

  if (menuOptions.length === 0) {
    return await interaction.editReply({ 
      content: `${prefixMessage}\n\n${IN_GAME_TAB_REMINDER}\n\n${userClaimsSummaryText}\n\n🎉 **ALL OPEN SLOTS CLAIMED**: Every single available position has been filled!`, 
      components: [] 
    });
  }

  const itemSelectMenu = new StringSelectMenuBuilder()
    .setCustomId('auction_select_item_type')
    .setPlaceholder('Select a Loot Classification Type to Inspect...')
    .addOptions(menuOptions);

  const baseContent = `🔒 **PRIVATELY VIEWING VACANT SELECTION MATRIX**\n👤 Active Character Profile: **${finalRosterName}**\n\n${IN_GAME_TAB_REMINDER}\n\n${userClaimsSummaryText}\n\nPlease choose an available loot category below to view open layout coordinates as buttons:`;
  
  await interaction.editReply({
    content: prefixMessage ? `${prefixMessage}\n\n${baseContent}` : baseContent,
    components: [new ActionRowBuilder().addComponents(itemSelectMenu)]
  });
}

/**
 * 🛰️ HELPER: Generates the Fast-Tap Button Grid Matrix (Step 3 Upgraded)
 */
async function renderSpecificSlotView(interaction, itemId, finalRosterName, prefixMessage = "") {
  const db = admin.database();
  const configSnap = await db.ref('settings/configuration').once('value');
  const sessionSnap = await db.ref('auction/active_session').once('value');

  const { items = [] } = configSnap.val();
  const { generatedSlots = [] } = sessionSnap.val();

  const selectedItemObj = items.find(i => i.id === itemId);
  const maxAllowedLimit = selectedItemObj ? (selectedItemObj.limitQty || 1) : 1;

  const userClaimedCount = generatedSlots.filter(s => s.itemType === itemId && s.name === finalRosterName).length;

  // 1. Build an array of standard button components for every vacancy found
  const rawButtonsArray = [];
  generatedSlots.forEach((slot, index) => {
    if (slot.itemType === itemId && slot.name === '[⚠️ EXTRA UNALLOCATED SLOT]') {
      rawButtonsArray.push(
        new ButtonBuilder()
          .setCustomId(`claim_slot_btn_${index}_item_${itemId}`) // Securely chains parameters
          .setLabel(`P${slot.page} Pos${slot.slot}`)
          .setStyle(ButtonStyle.Secondary)
      );
    }
  });

  const userClaimsSummaryText = compileUserClaimsSummary(generatedSlots, finalRosterName);

  if (userClaimedCount >= maxAllowedLimit) {
    return await renderItemCategoryView(interaction, finalRosterName, `❌ **CLAIM RESTRICTED**: You have reached your capacity limit (**${userClaimedCount}/${maxAllowedLimit}**) for **${selectedItemObj?.name}**.`);
  }

  if (rawButtonsArray.length === 0) {
    return await renderItemCategoryView(interaction, finalRosterName, `⚠️ **CATEGORY EXPIRED**: The remaining slots for **${selectedItemObj?.name}** were just snapped up!`);
  }

  // 2. DISCORD INTERFACE MATRIX MATH: Slice array down to 20 options max to guarantee room for back utility buttons
  const cappedButtons = rawButtonsArray.slice(0, 20);
  const totalComponentRows = [];

  // Break flat button array into rows containing up to 5 elements each
  for (let i = 0; i < cappedButtons.length; i += 5) {
    const actionRow = new ActionRowBuilder().addComponents(cappedButtons.slice(i, i + 5));
    totalComponentRows.push(actionRow);
  }

  // 3. Append the primary navigation options to the bottom row profile
  const backButton = new ButtonBuilder()
    .setCustomId('open_auction_panel_back')
    .setLabel('↩️ Return to Categories')
    .setStyle(ButtonStyle.Danger);

  const utilityRow = new ActionRowBuilder().addComponents(backButton);
  totalComponentRows.push(utilityRow);

  const baseContent = `📋 **Loot Target**: **${selectedItemObj?.name}**\n👤 Your Limit Status: **${userClaimedCount}/${maxAllowedLimit} Claimed**\n\n${IN_GAME_TAB_REMINDER}\n\n${userClaimsSummaryText}\n\nTap any vacant grid coordinate button below to lock your claim instantly:`;

  await interaction.editReply({
    content: prefixMessage ? `${prefixMessage}\n\n${baseContent}` : baseContent,
    components: totalComponentRows
  });
}

/**
 * ⚡ CORE INTERACTION INTERCEPT ROUTINE
 */
export async function handleAuctionInteraction(interaction) {
  const db = admin.database();

  const finalRosterName = (interaction.member?.nickname || interaction.member?.displayName || interaction.user?.globalName || interaction.user?.username || '').trim();
  const sanitizedFirebaseKey = finalRosterName.replace(/[\.\#\$\[\]]/g, '_');

  // ─── STEP 1: USER CLICKS THE PUBLIC ENTRY BUTTON ───
  if (interaction.isButton() && interaction.customId === 'open_auction_panel') {
    await interaction.deferReply({ ephemeral: true });

    const memberCheckSnap = await db.ref(`auction/members/${sanitizedFirebaseKey}`).once('value');
    if (!memberCheckSnap.exists()) {
      return await interaction.editReply({
        content: `⚠️ **ROSTER DISCONNECT**: Your Discord identity (**${finalRosterName}**) is not linked to an active guild roster row.\n\n👉 *Please sign into the Web Dashboard once to automatically synchronize your identity variables.*`
      });
    }

    await renderItemCategoryView(interaction, finalRosterName);
  }

  // ─── LOOPBACK JUMP: USER CLICKS THE BACK BUTTON INSIDE THE CORE WORKFLOW ───
  if (interaction.isButton() && interaction.customId === 'open_auction_panel_back') {
    await interaction.deferUpdate();
    await renderItemCategoryView(interaction, finalRosterName);
  }

  // ─── STEP 2: USER SELECTS AN ITEM CATEGORY DROPDOWN ───
  if (interaction.isStringSelectMenu() && interaction.customId === 'auction_select_item_type') {
    await interaction.deferUpdate();
    const itemId = interaction.values[0].replace('select_item_', '');
    await renderSpecificSlotView(interaction, itemId, finalRosterName);
  }

  // ─── STEP 3 & 4: USER TAPS A SPECIFIC GRID CANVAS BUTTON MATRIX CELL ───
  if (interaction.isButton() && interaction.customId.startsWith('claim_slot_btn_')) {
    await interaction.deferUpdate();
    
    // Deconstruct metadata parameters out of the button token id
    const rawValueToken = interaction.customId.replace('claim_slot_btn_', '');
    const valueParts = rawValueToken.split('_item_');
    
    const targetIndex = parseInt(valueParts[0], 10);
    const itemId = valueParts[1];

    let targetPage = 1;
    let targetSlotCoordinate = 1;
    let targetItemName = "Item";

    try {
      await db.ref('auction/active_session').transaction((currentSession) => {
        if (!currentSession || !currentSession.generatedSlots || !currentSession.generatedSlots[targetIndex]) {
          return currentSession; 
        }

        const slot = currentSession.generatedSlots[targetIndex];
        targetPage = slot.page;
        targetSlotCoordinate = slot.slot;
        targetItemName = slot.itemName;

        if (slot.name !== '[⚠️ EXTRA UNALLOCATED SLOT]') {
          throw new Error('COLLISION_DETECTED');
        }

        slot.name = finalRosterName;
        slot.status = 'Selected';

        return currentSession;
      });

      const successBanner = `✅ **SUCCESSFULLY SECURED!**\n• Item Locked: **${targetItemName} (Page ${targetPage}, Position ${targetSlotCoordinate})**\n\n*The ledger has mutated successfully. Choose another category below to continue allocations:*`;
      
      // Loop back smoothly to main categories view while showing updated shopping list data
      await renderItemCategoryView(interaction, finalRosterName, successBanner);

    } catch (err) {
      if (err.message === 'COLLISION_DETECTED') {
        const collisionBanner = `⚠️ **SLOT SNIPED!** Another member claimed **Page ${targetPage}, Position ${targetSlotCoordinate}** right before you tapped.\n\n*No layout cells were overwritten. Try hitting an alternative open coordinate button below:*`;
        
        // Loop back smoothly inside that SAME button view so they can try an adjacent button instantly
        await renderSpecificSlotView(interaction, itemId, finalRosterName, collisionBanner);
      } else {
        console.error("Button Matrix Open Loop Step 3 Exception Caught:", err.message);
        await interaction.editReply({ content: '❌ Critical error executing real-time database ledger updates.', components: [] });
      }
    }
  }
}