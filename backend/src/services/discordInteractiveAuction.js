// backend/src/services/discordInteractiveAuction.js
import admin from 'firebase-admin';
import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

/**
 * 📣 Renders the permanent, pinned public message card containing the launch action button
 * Call this function inside an officer initialization slash command or channel setup routing setup.
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
 * ⚡ CORE INTERACTION INTERCEPT ROUTINE
 * Processes private button selections and dropdown adjustments based on master ledger paths
 */
export async function handleAuctionInteraction(interaction) {
  const db = admin.database();

  // Replicate exact Discord identification extraction chain utilized within request.routes.js & discordOAuth.js
  const finalRosterName = (interaction.member?.nickname || interaction.member?.displayName || interaction.user?.globalName || interaction.user?.username || '').trim();
  const sanitizedFirebaseKey = finalRosterName.replace(/[\.\#\$\[\]]/g, '_');

  // ─── STEP 1: USER CLICKS THE PUBLIC ENTRY BUTTON ───
  if (interaction.isButton() && interaction.customId === 'open_auction_panel') {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Security Gate Check: Verify if individual display name exists inside active synced members roster
      const memberCheckSnap = await db.ref(`auction/members/${sanitizedFirebaseKey}`).once('value');
      if (!memberCheckSnap.exists()) {
        return await interaction.editReply({
          content: `⚠️ **ROSTER DISCONNECT**: Your Discord identity (**${finalRosterName}**) is not linked to an active guild roster tracking row profile.\n\n👉 *Please sign into the Web Dashboard once to automatically synchronize your Discord identity parameters.*`
        });
      }

      const configSnap = await db.ref('settings/configuration').once('value');
      const sessionSnap = await db.ref('auction/active_session').once('value');

      if (!sessionSnap.exists() || !configSnap.exists()) {
        return await interaction.editReply({ content: '❌ **ERROR**: No active allocation session is currently running on the officer dashboard.' });
      }

      const { items = [] } = configSnap.val();
      const { generatedSlots = [] } = sessionSnap.val();

      // Aggregate vacancies using the precise string literal assigned inside MimicBookTab.jsx
      const itemVacancyCounts = {};
      generatedSlots.forEach(slot => {
        if (slot.name === '[⚠️ EXTRA UNALLOCATED SLOT]') {
          itemVacancyCounts[slot.itemType] = (itemVacancyCounts[slot.itemType] || 0) + 1;
        }
      });

      // Filter options down to item classifications that possess empty cells
      const menuOptions = items
        .filter(item => (itemVacancyCounts[item.id] || 0) > 0)
        .map(item => ({
          label: item.name,
          description: `${itemVacancyCounts[item.id]} empty layout slot positions available.`,
          value: `select_item_${item.id}`
        }));

      if (menuOptions.length === 0) {
        return await interaction.editReply({ content: '🎉 **ALL CLEAR**: No vacancies detected! Every single available loot slot has been successfully assigned.' });
      }

      const itemSelectMenu = new StringSelectMenuBuilder()
        .setCustomId('auction_select_item_type')
        .setPlaceholder('Select a Loot Classification Type to Inspect...')
        .addOptions(menuOptions);

      await interaction.editReply({
        content: `🔒 **PRIVATELY VIEWING VACANT SELECTION MATRIX**\n👤 Active Character Profile: **${finalRosterName}**\n\nPlease choose an available loot category below to check open layout coordinates:`,
        components: [new ActionRowBuilder().addComponents(itemSelectMenu)]
      });

    } catch (err) {
      console.error("Interaction Step 1 Exception Raised:", err.message);
      await interaction.editReply({ content: '❌ Technical exception processing real-time ledger query trees.' });
    }
  }

  // ─── STEP 2: USER SELECTS AN ITEM CATEGORY DROPDOWN ───
  if (interaction.isStringSelectMenu() && interaction.customId === 'auction_select_item_type') {
    await interaction.deferUpdate();
    
    const chosenValue = interaction.values[0];
    const itemId = chosenValue.replace('select_item_', '');

    try {
      const configSnap = await db.ref('settings/configuration').once('value');
      const sessionSnap = await db.ref('auction/active_session').once('value');

      const { items = [] } = configSnap.val();
      const { generatedSlots = [] } = sessionSnap.val();

      const selectedItemObj = items.find(i => i.id === itemId);
      const maxAllowedLimit = selectedItemObj ? (selectedItemObj.limitQty || 1) : 1;

      // Extract current user allocation volume matching the active relational sequence tracking token
      const userClaimedCount = generatedSlots.filter(s => s.itemType === itemId && s.name === finalRosterName).length;

      // Scan generated slots array to collect corresponding array layout indices
      const availableSlotOptions = [];
      generatedSlots.forEach((slot, index) => {
        if (slot.itemType === itemId && slot.name === '[⚠️ EXTRA UNALLOCATED SLOT]') {
          availableSlotOptions.push({
            label: `Page ${slot.page}, Position ${slot.slot}`,
            description: `Claim this vacant grid square for ${slot.itemName}`,
            value: `claim_slot_idx_${index}` // Packs the direct index array offset securely
          });
        }
      });

      // Guard Layer: Enforce dynamic item limits established inside SettingsTab.jsx
      if (userClaimedCount >= maxAllowedLimit) {
        return await interaction.editReply({
          content: `❌ **CLAIM RESTRICTED**: You have reached your maximum allowed capacity limit (**${userClaimedCount}/${maxAllowedLimit}**) for item node **${selectedItemObj?.name}**.`,
          components: []
        });
      }

      if (availableSlotOptions.length === 0) {
        return await interaction.editReply({
          content: `❌ **OUT OF STOCK**: The remaining open options for this item category were just claimed by another member.`,
          components: []
        });
      }

      // Discord interaction API components constraints enforce an absolute limit of 25 items max per selection row
      const cappedSlotOptions = availableSlotOptions.slice(0, 25);

      const slotSelectMenu = new StringSelectMenuBuilder()
        .setCustomId('auction_claim_specific_slot')
        .setPlaceholder('Choose an empty layout position coordinate...')
        .addOptions(cappedSlotOptions);

      const backButton = new ButtonBuilder()
        .setCustomId('open_auction_panel')
        .setLabel('↩️ Return to Categories')
        .setStyle(ButtonStyle.Secondary);

      await interaction.editReply({
        content: `📋 **Loot Target**: **${selectedItemObj?.name}**\n👤 Your Limit Status: **${userClaimedCount}/${maxAllowedLimit} Claimed**\n\nSelect an unallocated book coordinate below to claim this item slot immediately:`,
        components: [
          new ActionRowBuilder().addComponents(slotSelectMenu),
          new ActionRowBuilder().addComponents(backButton)
        ]
      });

    } catch (err) {
      console.error("Interaction Step 2 Exception Raised:", err.message);
    }
  }

  // ─── STEP 3: USER SELECTS A SPECIFIC COORDINATE TO CLAIM ───
  if (interaction.isStringSelectMenu() && interaction.customId === 'auction_claim_specific_slot') {
    await interaction.deferUpdate();
    
    const targetIndex = parseInt(interaction.values[0].replace('claim_slot_idx_', ''), 10);

    try {
      // Execute an isolated cloud transaction block to prevent mid-flight double-booking race conditions
      await db.ref('auction/active_session').transaction((currentSession) => {
        if (!currentSession || !currentSession.generatedSlots || !currentSession.generatedSlots[targetIndex]) {
          return currentSession; 
        }

        const slot = currentSession.generatedSlots[targetIndex];

        // Validate vacancy against concurrent cross-clicks happening on web panel or alternative mobile setups
        if (slot.name !== '[⚠️ EXTRA UNALLOCATED SLOT]') {
          throw new Error('COLLISION_DETECTED');
        }

        // Mutate properties strictly following schema expectations parsed by handleOriginalMatrixAssembly()
        slot.name = finalRosterName;
        slot.status = 'Selected';

        return currentSession;
      });

      await interaction.editReply({
        content: `✅ **SUCCESSFULLY LOCKED COGNITIVE ALLOCATION!**\n\nYour name **${finalRosterName}** has been recorded into the live tracking register data tables.\n\nThe officer's **Game Auction Book Grid** display has updated in real-time across all connected browser tabs!`,
        components: []
      });

    } catch (err) {
      if (err.message === 'COLLISION_DETECTED') {
        await interaction.editReply({
          content: '❌ **TRANSACTION ABORTED**: Another member selected that exact grid coordinate split-seconds before you. Please select a different vacant slot option.',
          components: []
        });
      } else {
        console.error("Interaction Step 3 Exception Raised:", err.message);
        await interaction.editReply({ content: '❌ Critical error updating real-time database ledger tracks.', components: [] });
      }
    }
  }
}