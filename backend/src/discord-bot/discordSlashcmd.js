import admin from 'firebase-admin'; // Hooked directly to your backend setup[cite: 1]
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { ensureWeekInstances, writeCommitment } from '../services/scheduleService.js';
import { buildCompositeKey, parseCompositeKey } from '../utils/guildTime.js';

async function generateRSVPMatrixDashboard(db, snowflakeId, page = 1) {
  const { weekMonday, instances } = await ensureWeekInstances({});

  const sorted = Object.entries(instances || {})
    .map(([key, inst]) => ({ key, ...inst }))
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.timeStart || '').localeCompare(b.timeStart || ''));

  const embed = new EmbedBuilder()
    .setTitle('🗓️ Upcoming Week Sign-Up (7 Days)')
    .setDescription(`Review active raid deployments for week starting \`${weekMonday}\` (Monday - Sunday). Toggle availability tags seamlessly:`)
    .setColor('#9333ea')
    .setTimestamp();

  const componentRows = [];

  for (const ev of sorted) {
    const compositeKey = ev.key || buildCompositeKey(ev.date, ev.eventId);
    const commitmentSnap = await db.ref(`attendance/commitments/${compositeKey}/${snowflakeId}`).once('value');
    const userStatus = commitmentSnap.exists() ? commitmentSnap.val().status : 'Unanswered';

    const isCancelled = ev.isCancelled === true;
    const customTitle = ev.title || ev.eventId;
    const customNotes = ev.notes ? `\n📝 **Notes:** ${ev.notes}` : '';
    const typeLabel = ev.isSpecial ? 'Special' : 'Weekly';

    embed.addFields([{
      name: `${isCancelled ? '❌ [CANCELLED]' : (ev.isSpecial ? '⚔️' : '📅')} ${customTitle}`,
      value: `Target Window: \`${ev.date}\` | Current Status: **${isCancelled ? 'N/A' : userStatus}**${customNotes}`,
      inline: false
    }]);

    const row = new ActionRowBuilder();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`lbl:${typeLabel}:${ev.eventId}`.slice(0, 100))
        .setLabel(`${String(customTitle).slice(0, 10)}...`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`matrsvp:confirm:${compositeKey}:1`)
        .setLabel(userStatus === 'Confirmed' ? '✅ Confirmed' : 'Confirm')
        .setStyle(userStatus === 'Confirmed' ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(isCancelled)
    );

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`matrsvp:leave:${compositeKey}:${page}`)
        .setLabel(userStatus === 'Leave' ? '❌ Leave' : 'Leave')
        .setStyle(userStatus === 'Leave' ? ButtonStyle.Danger : ButtonStyle.Secondary)
        .setDisabled(isCancelled)
    );

    componentRows.push(row);
  }

  return { embeds: [embed], components: componentRows };
}

/**
 * 📣 CENTRAL SLASH COMMAND ROUTER
 */
export async function handleSlashCommand(interaction) {
  const { commandName } = interaction;
  const db = admin.database(); // Establish direct Realtime DB handle[cite: 1]
  const snowflakeId = interaction.user.id; // Unique Snowflake key[cite: 1, 2]

  // Phase 3: Global System Lockdown Verification Gate
  if (['jobchange', 'rolechange', 'event'].includes(commandName)) {
    const globalConfigSnap = await db.ref('settings/configuration').once('value');
    if (globalConfigSnap.exists() && globalConfigSnap.val().isForceLocked === true) {
      return await interaction.reply({ content: '🔒 System Notice: The database is currently locked down by an administrative freeze. Modification requests are suspended.', ephemeral: true });
    }
  }

  // 1. /jobchange Execution
  if (commandName === 'jobchange') {
    const configSnap = await db.ref('settings/configuration/jobs').once('value'); //[cite: 1]
    if (!configSnap.exists()) return interaction.reply({ content: '❌ Jobs database catalog missing.', ephemeral: true });

    const menu = new StringSelectMenuBuilder()
      .setCustomId('menu_job_selection')
      .setPlaceholder('Select your active character class spec...')
      .addOptions(Object.entries(configSnap.val()).map(([code, jobObj]) => ({
        label: jobObj.name || code,
        value: code // Maps to standard jobCode properties[cite: 1]
      })));

    return await interaction.reply({ content: 'Select your new Job Class:', components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
  }

  // 2. /rolechange Execution
  if (commandName === 'rolechange') {
    const configSnap = await db.ref('settings/configuration/roles').once('value');
    if (!configSnap.exists()) return interaction.reply({ content: '❌ Roles database catalog missing.', ephemeral: true });

    const menu = new StringSelectMenuBuilder()
      .setCustomId('menu_role_selection')
      .setPlaceholder('Select your primary combat group role...')
      .addOptions(Object.entries(configSnap.val()).map(([code, roleObj]) => ({
        label: roleObj.name || code,
        value: code
      })));

    return await interaction.reply({ content: 'Select your Combat Role assignment:', components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
  }

  // 3. /namechange Execution
  if (commandName === 'namechange') {
    const desiredNickname = interaction.options.getString('nickname');
    try {
      await interaction.member.setNickname(desiredNickname);
      return await interaction.reply({ content: `✅ Guild server display profile name shifted to **${desiredNickname}**.`, ephemeral: true });
    } catch (err) {
      return await interaction.reply({ content: '❌ Security baseline mutation blocked. Server owners or higher ranked roles cannot be renamed by automation bots.', ephemeral: true });
    }
  }

  // 4. /event Execution (Upgraded Button Matrix Board Layout)
  if (commandName === 'event') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const payload = await generateRSVPMatrixDashboard(db, snowflakeId, 1);
      return await interaction.editReply(payload);
    } catch (err) {
      console.error("Matrix generation error:", err);
      return await interaction.editReply({ content: '❌ Internal failure compiling the matrix dashboard.' });
    }
  }

  // 5. /myparty Execution (Fixed Roster Schema Verification Pipeline)
  if (commandName === 'myparty') {
    await interaction.deferReply({ ephemeral: true });
    const liveSessionSnap = await db.ref('attendance/live_session').once('value'); //[cite: 2]

    if (!liveSessionSnap.exists()) {
      return await interaction.editReply({ content: '❌ There is no active Live Raid session currently running on the dashboard operational paths.' });
    }

    const liveData = liveSessionSnap.val();
    let assignedRaidName = liveData.eventName || "Live Raid Operation"; //[cite: 2]

    // Phase 3 Mitigation: Assert cross-reference checks against explicit instance cancellations
    const currentActiveDateStr = new Date().toISOString().split('T')[0];
    const activeEventIdField = liveData.eventId || "unknown";
    const activeInstanceKey = `${currentActiveDateStr}_${activeEventIdField}`;
    const activeInstanceCheck = await db.ref(`scheduler/active_instances/${activeInstanceKey}`).once('value');
    if (activeInstanceCheck.exists() && activeInstanceCheck.val().isCancelled === true) {
      return await interaction.editReply({ content: '🛑 Notice: The scheduled raid operation assigned for tonight has been marked as officially CANCELLED by guild officers.' });
    }
    let locatedSlot = null;

    if (liveData.grids) { //[cite: 2]
      for (const [gridId, gridObj] of Object.entries(liveData.grids)) { //[cite: 2]
        if (gridObj.slots_allocation) { //[cite: 2]
          for (const [coordKey, slotData] of Object.entries(gridObj.slots_allocation)) { //[cite: 2]
            // Safe checking parameter to protect against unallocated null grid cells
            if (slotData?.userId === snowflakeId) {
              // Grid keys are 1-indexed "party-slot" (e.g. "3-1" = P3-S1)
              const parts = coordKey.split(/[-_]/);
              const partyNum = parseInt(parts[0], 10);
              const slotNum = parseInt(parts[1], 10);
              if (!Number.isNaN(partyNum) && !Number.isNaN(slotNum)) {
                locatedSlot = `P${partyNum}-S${slotNum}`;
              } else {
                locatedSlot = coordKey;
              }
              break;
            }
          }
        }
        if (locatedSlot) break;
      }
    }

    if (!locatedSlot) {
      return await interaction.editReply({ content: 'ℹ️ Your Snowflake ID is not found allocated inside the active Live Raid Grid Roster slots right now.' });
    }

    const embed = new EmbedBuilder()
      .setTitle('🛡️ Active Live Deployment Slot Matrix')
      .setColor('#9333ea')
      .addFields([
        { name: 'Raid Instance Target', value: `\`${assignedRaidName}\``, inline: true },
        { name: 'Roster Placement Slot', value: `**${locatedSlot}**`, inline: true }
      ])
      .setTimestamp();

    return await interaction.editReply({ content: null, embeds: [embed] });
  }
}

/**
 * 🕹️ INTERACTIVE COMPONENTS ROUTER (Dynamic Event Loops & Dashboard Re-renders)
 */
export async function handleComponentInteraction(interaction) {
  const db = admin.database(); //[cite: 1]
  const snowflakeId = interaction.user.id; //[cite: 1, 2]

  // Phase 3: Component Interaction Lockdown Safety Gate
  if (interaction.customId.startsWith('menu_') || interaction.customId.startsWith('matrsvp:')) {
    const globalConfigSnap = await db.ref('settings/configuration').once('value');
    if (globalConfigSnap.exists() && globalConfigSnap.val().isForceLocked === true) {
      return await interaction.reply({ content: '🔒 Interaction Rejected: System under administrative lockdown freeze.', ephemeral: true }).catch(() => {});
    }
  }

  // A. Chained Job Selection dropdown hooks
  if (interaction.customId === 'menu_job_selection') {
    const selectedJobCode = interaction.values[0];
    await db.ref(`auction/members/${snowflakeId}`).update({ jobCode: selectedJobCode }); //[cite: 1]

    const configSnap = await db.ref('settings/configuration/roles').once('value');
    if (!configSnap.exists()) return await interaction.update({ content: `✅ Job spec successfully saved.`, components: [] });

    const roleMenu = new StringSelectMenuBuilder()
      .setCustomId('menu_role_selection_chained')
      .setPlaceholder('Next, confirm your primary combat raid role...')
      .addOptions(Object.entries(configSnap.val()).map(([code, roleObj]) => ({ label: roleObj.name || code, value: code })));

    return await interaction.update({
      content: `✅ Job specialized to **${selectedJobCode}**! Let's update your role configuration next:`,
      components: [new ActionRowBuilder().addComponents(roleMenu)]
    });
  }

  // B. Standard / Chained Role configuration hooks
  if (interaction.customId === 'menu_role_selection' || interaction.customId === 'menu_role_selection_chained') {
    const selectedRoleCode = interaction.values[0];
    await db.ref(`auction/members/${snowflakeId}`).update({ roleCode: selectedRoleCode });
    return await interaction.update({ content: `🎉 Profile configuration set! Saved combat role: **${selectedRoleCode}**.`, components: [] });
  }

  // C. Upgraded Rapid-Fire Availability Button Grid Handler (Colon delimited parsing)
  if (interaction.customId.startsWith('matrsvp:')) {
    await interaction.deferUpdate();
    const parts = interaction.customId.split(':');
    const action = parts[1]; // 'confirm' or 'leave'
    const compositeKey = parts[2]; // Extracts the safe unbroken format: dateStr_eventId
    const currentPage = parseInt(parts[3], 10);
    const targetStatus = action === 'confirm' ? 'Confirmed' : 'Leave';

    // Guard Rule: Intercept button event mutations if the targeted instance night was cancelled mid-flight
    const instanceCheck = await db.ref(`scheduler/instances/${compositeKey}`).once('value');
    if (instanceCheck.exists() && instanceCheck.val().isCancelled === true) return;

    const raiderProfileSnap = await db.ref(`auction/members/${snowflakeId}`).once('value');
    const member = raiderProfileSnap.exists() ? raiderProfileSnap.val() : {};
    const displayName = member.displayName || member.name || interaction.user.username;

    const parsed = parseCompositeKey(compositeKey);
    await writeCommitment({
      userId: snowflakeId,
      displayName,
      dateStr: parsed?.dateStr,
      eventId: parsed?.eventId,
      status: targetStatus,
      compositeKey,
    });

    // Re-render the matrix instantly to update component visual states
    const updatedPayload = await generateRSVPMatrixDashboard(db, snowflakeId, currentPage);
    return await interaction.editReply(updatedPayload);
  }

  // Dashboard Pagination Controls dropped to maintain clean alignment with the single-week schedule framework
}