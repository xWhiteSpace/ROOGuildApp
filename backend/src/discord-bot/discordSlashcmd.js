import admin from 'firebase-admin'; // Hooked directly to your backend setup[cite: 1]
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';

/**
 * 📊 HELPER: COMPUTE AND COMPILE 14-DAY RSVP MATRIX BOARD
 * Uses clean colon (:) spacing to protect dates and IDs from parsing string splits
 */
async function generateRSVPMatrixDashboard(db, snowflakeId, page = 1) {
  const eventsSnap = await db.ref('settings/configuration/events').once('value'); //[cite: 1]
  const specialSnap = await db.ref('scheduler/special_events').once('value'); //[cite: 2]

  const now = new Date();
  const allEvents = [];

  // 1. Process Weekly Template Baseline Configuration Nights
  if (eventsSnap.exists()) {
    Object.entries(eventsSnap.val()).forEach(([id, ev]) => {
      if (ev.title) {
        allEvents.push({ id: `weekly:${id}`, title: ev.title, dateStr: new Date().toISOString().split('T')[0], type: 'Weekly' });
      }
    });
  }

  // 2. Process Multi-Day Ad-Hoc Special Events
  if (specialSnap.exists()) {
    Object.entries(specialSnap.val()).forEach(([id, ev]) => {
      if (ev.title && ev.date) {
        allEvents.push({ id: `special:${id}`, title: ev.title, dateStr: ev.date, type: 'Special' });
      }
    });
  }

  // Paginate options cleanly: 4 events max per page loop to reserve Row 5 for page controls
  const eventsPerPage = 4;
  const startIndex = (page - 1) * eventsPerPage;
  const paginatedEvents = allEvents.slice(startIndex, startIndex + eventsPerPage);

  const embed = new EmbedBuilder()
    .setTitle('🗓️ Raid Operations Matrix Board (Next 14 Days)')
    .setDescription('Review active raid deployments below. Toggle availability tags directly across rows sequentially without menu collapses:')
    .setColor('#9333ea')
    .setTimestamp();

  const componentRows = [];

  // Build matrix row groupings dynamically for each scheduled timeline entry
  for (const ev of paginatedEvents) {
    const rawEventId = ev.id.split(':')[1];
    const compositeKey = `${ev.dateStr}_${rawEventId}`; //[cite: 2]
    const commitmentSnap = await db.ref(`attendance/commitments/${compositeKey}/${snowflakeId}`).once('value'); //[cite: 2]
    const userStatus = commitmentSnap.exists() ? commitmentSnap.val().status : 'Unanswered'; //[cite: 2]

    embed.addFields([{
      name: `${ev.type === 'Weekly' ? '📅' : '⚔️'} ${ev.title}`,
      value: `Target Window: \`${ev.dateStr}\` | Current Status: **${userStatus}**`,
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
        .setCustomId(`matrsvp:confirm:${compositeKey}:${page}`)
        .setLabel(userStatus === 'Confirmed' ? '✅ Confirmed' : 'Confirm')
        .setStyle(userStatus === 'Confirmed' ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    // Column Component 3: Absence Request Control
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`matrsvp:leave:${compositeKey}:${page}`)
        .setLabel(userStatus === 'Absent' ? '❌ Absent' : 'Leave')
        .setStyle(userStatus === 'Absent' ? ButtonStyle.Danger : ButtonStyle.Secondary)
    );

    componentRows.push(row);
  }

  // Row 5: Navigation and Page Context controls
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`matnav:1`)
      .setLabel('Week 1')
      .setStyle(page === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(page === 1),
    new ButtonBuilder()
      .setCustomId(`matnav:2`)
      .setLabel('Week 2')
      .setStyle(page === 2 ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(page === 2 || allEvents.length <= eventsPerPage)
  );

  componentRows.push(navRow);

  return { embeds: [embed], components: componentRows };
}

/**
 * 📣 CENTRAL SLASH COMMAND ROUTER
 */
export async function handleSlashCommand(interaction) {
  const { commandName } = interaction;
  const db = admin.database(); // Establish direct Realtime DB handle[cite: 1]
  const snowflakeId = interaction.user.id; // Unique Snowflake key[cite: 1, 2]

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
    const compositeKey = parts[2];
    const currentPage = parseInt(parts[3], 10);
    const targetStatus = action === 'confirm' ? 'Confirmed' : 'Absent'; //[cite: 2]

    const raiderProfileSnap = await db.ref(`auction/members/${snowflakeId}`).once('value'); //[cite: 1]
    const displayName = raiderProfileSnap.exists() ? (raiderProfileSnap.val().name || interaction.user.username) : interaction.user.username;

    // Persist status updates atomically straight into the targeted composite node path
    await db.ref(`attendance/commitments/${compositeKey}/${snowflakeId}`).set({ //[cite: 2]
      displayName: displayName, //[cite: 2]
      status: targetStatus, //[cite: 2]
      declaredAt: Date.now() //[cite: 2]
    });

    // Re-render the matrix instantly to update component visual states
    const updatedPayload = await generateRSVPMatrixDashboard(db, snowflakeId, currentPage);
    return await interaction.editReply(updatedPayload);
  }

  // D. Dashboard Pagination Controls
  if (interaction.customId.startsWith('matnav:')) {
    await interaction.deferUpdate();
    const targetPage = parseInt(interaction.customId.split(':')[1], 10);
    const paginatedPayload = await generateRSVPMatrixDashboard(db, snowflakeId, targetPage);
    return await interaction.editReply(paginatedPayload);
  }
}