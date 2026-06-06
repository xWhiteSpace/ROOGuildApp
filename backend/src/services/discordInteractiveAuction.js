// backend/src/services/discordInteractiveAuction.js
import admin from 'firebase-admin';
import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

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
 * 🛰️ HELPER: Generates the Master Item Category Selection View
 * Reused dynamically across initial opens and successful transaction loopbacks
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

  // Aggregate current vacancies using the literal string from MimicBookTab
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
      description: `${itemVacancyCounts[item.id]} empty layout slot positions available.`,
      value: `select_item_${item.id}`
    }));

  if (menuOptions.length === 0) {
    return await interaction.editReply({ 
      content: `${prefixMessage}\n🎉 **ALL OPEN SLOTS CLAIMED**: Every single available position has been filled! Panel closing out.`, 
      components: [] 
    });
  }

  const itemSelectMenu = new StringSelectMenuBuilder()
    .setCustomId('auction_select_item_type')
    .setPlaceholder('Select a Loot Classification Type to Inspect...')
    .addOptions(menuOptions);

  const baseContent = `🔒 **PRIVATELY VIEWING VACANT SELECTION MATRIX**\n👤 Active Character Profile: **${finalRosterName}**\n\nPlease choose an available loot category below to check open layout coordinates:`;
  
  await interaction.editReply({
    content: prefixMessage ? `${prefixMessage}\n\n${baseContent}` : baseContent,
    components: [new ActionRowBuilder().addComponents(itemSelectMenu)]
  });
}

/**
 * 🛰️ HELPER: Generates the Specific Position Coordinate Dropdown Selection View
 * Reused dynamically during standard selections and instant collision mitigation loops
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

  const availableSlotOptions = [];
  generatedSlots.forEach((slot, index) => {
    if (slot.itemType === itemId && slot.name === '[⚠️ EXTRA UNALLOCATED SLOT]') {
      availableSlotOptions.push({
        label: `Page ${slot.page}, Position ${slot.slot}`,
        description: `Claim this vacant grid square for ${slot.itemName}`,
        value: `claim_slot_idx_${index}_item_${itemId}` // Chains the itemId to preserve state context during loops
      });
    }
  });

  if (userClaimedCount >= maxAllowedLimit) {
    return await renderItemCategoryView(interaction, finalRosterName, `❌ **CLAIM RESTRICTED**: You have reached your maximum allowed capacity limit (**${userClaimedCount}/${maxAllowedLimit}**) for item node **${selectedItemObj?.name}**.`);
  }

  if (availableSlotOptions.length === 0) {
    return await renderItemCategoryView(interaction, finalRosterName, `⚠️ **CATEGORY EXPIRED**: The remaining slots for **${selectedItemObj?.name}** were just snapped up! Returning to main register...`);
  }

  const slotSelectMenu = new StringSelectMenuBuilder()
    .setCustomId('auction_claim_specific_slot')
    .setPlaceholder('Choose an empty layout position coordinate...')
    .addOptions(availableSlotOptions.slice(0, 25));

  const backButton = new ButtonBuilder()
    .setCustomId('open_auction_panel_back') // Custom ID bypassing deferReply locks on return jumps
    .setLabel('↩️ Return to Categories')
    .setStyle(ButtonStyle.Secondary);

  const baseContent = `📋 **Loot Target**: **${selectedItemObj?.name}**\n👤 Your Limit Status: **${userClaimedCount}/${maxAllowedLimit} Claimed**\n\nSelect an unallocated book coordinate below to claim this item slot immediately:`;

  await interaction.editReply({
    content: prefixMessage ? `${prefixMessage}\n\n${baseContent}` : baseContent,
    components: [
      new ActionRowBuilder().addComponents(slotSelectMenu),
      new ActionRowBuilder().addComponents(backButton)
    ]
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

  // ─── STEP 3: USER SELECTS A SPECIFIC COORDINATE TO CLAIM (THE OPEN-LOOP ENGINE) ───
  if (interaction.isStringSelectMenu() && interaction.customId === 'auction_claim_specific_slot') {
    await interaction.deferUpdate();
    
    // Parse target row indexing data and secondary item metadata parameters cleanly
    const rawValueToken = interaction.values[0].replace('claim_slot_idx_', '');
    const valueParts = rawValueToken.split('_item_');
    
    const targetIndex = parseInt(valueParts[0], 10);
    const itemId = valueParts[1];

    let targetPage = 1;
    let targetSlotCoordinate = 1;
    let targetItemName = "Item";

    try {
      // Execute an atomic transaction to process changes securely
      await db.ref('auction/active_session').transaction((currentSession) => {
        if (!currentSession || !currentSession.generatedSlots || !currentSession.generatedSlots[targetIndex]) {
          return currentSession; 
        }

        const slot = currentSession.generatedSlots[targetIndex];
        targetPage = slot.page;
        targetSlotCoordinate = slot.slot;
        targetItemName = slot.itemName;

        // Anti-collision guard: Check if someone beat them to it
        if (slot.name !== '[⚠️ EXTRA UNALLOCATED SLOT]') {
          throw new Error('COLLISION_DETECTED');
        }

        slot.name = finalRosterName;
        slot.status = 'Selected';

        return currentSession;
      });

      // 🟩 SUCCESS FLOW LOOPBACK: Keep panel completely active and direct them back to main menu
      const successBanner = `✅ **SUCCESSFULLY LOCKED IN!**\n• Bound Profile: **${finalRosterName}**\n• Allocation: **${targetItemName} (Page ${targetPage}, Position ${targetSlotCoordinate})**\n\n*The officer dashboard has updated! Your session remains active below—feel free to claim another item category row slot:*`;
      
      await renderItemCategoryView(interaction, finalRosterName, successBanner);

    } catch (err) {
      if (err.message === 'COLLISION_DETECTED') {
        // 🟨 COLLISION FLOW LOOPBACK: Instantly re-render the coordinate list for that same category
        const collisionBanner = `⚠️ **SLOT ACQUIRED MID-FLIGHT**: Another player locked down **Page ${targetPage}, Position ${targetSlotCoordinate}** a microsecond before you clicked!\n\n*No structural ledger parameters were overwritten. The menu below has refreshed automatically—please select an alternative available coordinate:*`;
        
        await renderSpecificSlotView(interaction, itemId, finalRosterName, collisionBanner);
      } else {
        console.error("Interaction Open Loop Step 3 Exception Caught:", err.message);
        await interaction.editReply({ content: '❌ Critical error executing real-time database ledger updates.', components: [] });
      }
    }
  }
}