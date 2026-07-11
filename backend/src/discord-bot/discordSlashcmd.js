import admin from 'firebase-admin'; // Hooked directly to your backend setup[cite: 1]
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';

function getUpcomingTargetCalendarDates(targetDayOfWeekIndex) {
  const calculatedDates = [];
  const serverTimeContext = new Date();
  for (let offsetIndex = 0; offsetIndex < 14; offsetIndex++) {
    const calendarDayFocus = new Date(serverTimeContext.getTime() + (offsetIndex * 24 * 60 * 60 * 1000));
    if (calendarDayFocus.getDay() === parseInt(targetDayOfWeekIndex, 10)) {
      calculatedDates.push(calendarDayFocus.toISOString().split('T')[0]);
    }
  }
  return calculatedDates;
}

async function generateRSVPMatrixDashboard(db, snowflakeId, page = 1) {
  const eventsSnap = await db.ref('settings/configuration/events').once('value'); //[cite: 1]
  const specialSnap = await db.ref('scheduler/special_events').once('value'); //[cite: 2]

  // Phase 3: Resolve dynamic timezone alignment using configurations from settings path
  const globalConfigSnap = await db.ref('settings/configuration').once('value');
  const targetTimezone = globalConfigSnap.exists() ? (globalConfigSnap.val().timezone || 'Asia/Manila') : 'Asia/Manila';
  
  const localTimeString = new Date().toLocaleString('en-US', { timeZone: targetTimezone });
  const now = new Date(localTimeString);
  const allEvents = [];

 // Mirror Scheduler.jsx: Calculate the current week's Monday bound dynamically
  const currentDay = now.getDay();
  const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = new Date(now);
  monday.setDate(now.getDate() + distanceToMonday);

  const pad = (n) => String(n).padStart(2, '0');

  for (let i = 0; i < 7; i++) {
    const currentDayFocus = new Date(monday);
    currentDayFocus.setDate(monday.getDate() + i);
    const dStr = `${currentDayFocus.getFullYear()}-${pad(currentDayFocus.getMonth() + 1)}-${pad(currentDayFocus.getDate())}`;
    const dayOfWeek = currentDayFocus.getDay();

    // 1. Map matching weekly templates for this calendar day
    if (eventsSnap.exists()) {
      Object.entries(eventsSnap.val()).forEach(([id, ev]) => {
        const p3 = ev.phases?.[3];
        if (p3 && parseInt(p3.dayStart, 10) === dayOfWeek) {
          allEvents.push({ id: `weekly:${id}`, title: ev.title, dateStr: dStr, type: 'Weekly' });
        }
      });
    }

    // 2. Map matching ad-hoc special events for this calendar day
    if (specialSnap.exists()) {
      Object.entries(specialSnap.val()).forEach(([id, ev]) => {
        if (ev.title && ev.date === dStr) {
          allEvents.push({ id: `special:${id}`, title: ev.title, dateStr: dStr, type: 'Special' });
        }
      });
    }
  }

  const paginatedEvents = allEvents; // Direct 7-day list assignment with no pagination required

  const embed = new EmbedBuilder()
    .setTitle('🗓️ Upcoming Week Sign-Up (7 Days)')
    .setDescription('Review active raid deployments for the current week (Monday - Sunday). Toggle availability tags seamlessly:')
    .setColor('#9333ea')
    .setTimestamp();

  const componentRows = [];

  // Build matrix row groupings dynamically for each scheduled timeline entry
  for (const ev of paginatedEvents) {
    const rawEventId = ev.id.split(':')[1];
    const compositeKey = `${ev.dateStr}_${rawEventId}`; //[cite: 2]
    const commitmentSnap = await db.ref(`attendance/commitments/${compositeKey}/${snowflakeId}`).once('value');
    const userStatus = commitmentSnap.exists() ? commitmentSnap.val().status : 'Unanswered';

    // Phase 2: Fetch specific ad-hoc operational overrides from the normalized tracking path
    const instanceSnap = await db.ref(`scheduler/active_instances/${compositeKey}`).once('value');
    const instanceData = instanceSnap.exists() ? instanceSnap.val() : null;
    const isCancelled = instanceData?.isCancelled === true;
    const customTitle = instanceData?.title || ev.title;

    const customNotes = instanceData?.notes ? `\n📝 **Notes:** ${instanceData.notes}` : '';
    embed.addFields([{
      name: `${isCancelled ? '❌ [CANCELLED]' : (ev.type === 'Weekly' ? '📅' : '⚔️')} ${customTitle}`,
      value: `Target Window: \`${ev.dateStr}\` | Current Status: **${isCancelled ? 'N/A' : userStatus}**${customNotes}`,
      inline: false
    }]);

    const row = new ActionRowBuilder();

    // Column Component 1: Context Meta Label Info Display
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`lbl:${ev.id}`)
        .setLabel(`${ev.title.slice(0, 10)}...`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    // Column Component 2: Confirm Engagement Control
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`matrsvp:confirm:${compositeKey}:1`)
        .setLabel(userStatus === 'Confirmed' ? '✅ Confirmed' : 'Confirm')
        .setStyle(userStatus === 'Confirmed' ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(isCancelled)
    );

    // Column Component 3: Absence Request Control (Enforcing 'Leave' as absolute SSOT)
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
              const parts = coordKey.split('_'); 
              const partyNum = parseInt(parts[0], 10) + 1;
              const slotNum = parseInt(parts[1], 10) + 1;
              locatedSlot = `P${partyNum}-S${slotNum}`;
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
    const instanceCheck = await db.ref(`scheduler/active_instances/${compositeKey}`).once('value');
    if (instanceCheck.exists() && instanceCheck.val().isCancelled === true) return;

    const raiderProfileSnap = await db.ref(`auction/members/${snowflakeId}`).once('value');
    const displayName = raiderProfileSnap.exists() ? (raiderProfileSnap.val().name || interaction.user.username) : interaction.user.username;

    // Persist status updates atomically straight into the targeted composite node path
    await db.ref(`attendance/commitments/${compositeKey}/${snowflakeId}`).set({
      displayName: displayName,
      status: targetStatus,
      declaredAt: Date.now()
    });

    // Re-render the matrix instantly to update component visual states
    const updatedPayload = await generateRSVPMatrixDashboard(db, snowflakeId, currentPage);
    return await interaction.editReply(updatedPayload);
  }

  // Dashboard Pagination Controls dropped to maintain clean alignment with the single-week schedule framework
}