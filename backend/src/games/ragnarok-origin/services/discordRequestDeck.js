/**
 * Discord Request Card: public launcher (shared with live claim) plus a private
 * ephemeral cart matching the website Request Tab (stage qty, Submit, Cancel/Drop).
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { getTenantStore } from '../../../db/database.js';
import { getCurrentTenantId } from '../../../db/tenantContext.js';
import {
  buildRequestLobby,
  submitSelections,
  cancelPending,
  RequestDeckError,
} from './requestDeck.js';

const EMBED_COLOR = '#4f46e5';
const DISCORD_SELECT_LIMIT = 25;
const PANEL_TITLE = 'Request Card';

const userLocks = new Map();
const carts = new Map();

function withUserLock(key, fn) {
  const prev = userLocks.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  userLocks.set(key, next);
  return next.finally(() => {
    if (userLocks.get(key) === next) userLocks.delete(key);
  });
}

function cartKey(userId) {
  return `${getCurrentTenantId() || 'tenant'}:${userId}`;
}

function getCart(userId) {
  const key = cartKey(userId);
  if (!carts.has(key)) {
    carts.set(key, {
      staged: {},
      selectedItemId: '',
      view: 'cart',
      pendingDropItemId: '',
      notice: '',
    });
  }
  return carts.get(key);
}

function resetStaged(cart) {
  cart.staged = {};
}

function rosterDisplayName(interaction) {
  return (
    interaction.member?.nickname
    || interaction.member?.displayName
    || interaction.user?.globalName
    || interaction.user?.username
    || ''
  ).trim();
}

function phaseLabel(phase) {
  if (phase === 1) return 'Bid Open';
  if (phase === 2) return 'Bid Locked';
  if (phase === 3) return 'Live Auction';
  return 'Unscheduled';
}

function stagedTotal(staged) {
  return Object.values(staged).reduce((sum, val) => sum + (Number(val) || 0), 0);
}

function hasStagedChanges(staged) {
  return Object.values(staged).some((val) => (Number(val) || 0) !== 0);
}

function savedItems(lobby) {
  return (lobby.items || []).filter((item) => (lobby.liveCounts?.[item.id] || 0) > 0);
}

function lockdownReply() {
  return {
    content: '🚨 **ADMINISTRATIVE LOCKDOWN**: The bidding framework has been completely frozen by management. Discord inputs are currently offline.',
    embeds: [],
    components: [],
  };
}

function rosterDisconnectReply() {
  return {
    content: '⚠️ **ROSTER DISCONNECT**: Your Discord account ID is not linked to an active guild roster row.\n\n👉 *Please tell a Guild officer to Synchronize the web app profile again.*',
    embeds: [],
    components: [],
  };
}

function buildCartEmbed(lobby, cart) {
  const items = lobby.items || [];
  const selected = items.find((item) => item.id === cart.selectedItemId) || items[0] || null;
  const liveCounts = lobby.liveCounts || {};
  const staged = cart.staged || {};

  const lines = [];
  if (cart.notice) lines.push(cart.notice, '');

  lines.push(`**${lobby.displayName || 'Member'}** · ${lobby.date || '—'}`);
  lines.push(`Event: **[${lobby.eventId || '—'}]** ${lobby.eventName || 'Raid Session'}`);
  lines.push(`Phase: **${phaseLabel(lobby.currentPhase)}**`);
  if (!lobby.isGateOpen && lobby.nextStatusChangeMessage) {
    lines.push(`🔒 ${lobby.nextStatusChangeMessage}`);
  }
  lines.push('');

  const additional = stagedTotal(staged);
  const stagedLines = items
    .filter((item) => (staged[item.id] || 0) !== 0)
    .map((item) => {
      const delta = staged[item.id];
      const sign = delta > 0 ? '+' : '';
      return `• ${item.name}  ${sign}${delta}`;
    });
  lines.push('**Cart Status**');
  if (!lobby.isGateOpen) {
    lines.push('Event is currently Locked');
  } else if (hasStagedChanges(staged)) {
    lines.push(additional > 0 ? `${additional} Additional Request` : 'Qty adjustments staged');
    if (stagedLines.length) lines.push(...stagedLines);
  } else {
    lines.push('No adjustments made');
  }
  lines.push('');

  const savedLines = items
    .filter((item) => (liveCounts[item.id] || 0) > 0)
    .map((item) => `• ${item.name} — ${liveCounts[item.id]} Saved`);
  lines.push('**Saved**');
  lines.push(savedLines.length ? savedLines.join('\n') : '*None*');

  if (selected) {
    const currentActive = liveCounts[selected.id] || 0;
    const localInput = staged[selected.id] || 0;
    const combinedTotal = currentActive + localInput;
    const limitQty = selected.limitQty;
    lines.push('');
    lines.push(`**Selected:** ${selected.name}${selected.isHighValue ? ' · High Value' : ''}`);
    lines.push(`Qty **${combinedTotal}** / ${limitQty}`);
    lines.push(`Application: **${currentActive > 0 ? 'ACTIVE' : 'NOT APPLIED'}** · Queue: **${currentActive > 0 ? 'PENDING' : '—'}**`);
  } else if (items.length === 0) {
    lines.push('');
    lines.push('*No loot items are scheduled for tonight’s auction cycle.*');
  }

  return new EmbedBuilder()
    .setTitle(PANEL_TITLE)
    .setColor(EMBED_COLOR)
    .setDescription(lines.join('\n').slice(0, 4096));
}

function buildCartComponents(lobby, cart) {
  const items = lobby.items || [];
  const selected = items.find((item) => item.id === cart.selectedItemId) || items[0] || null;
  const liveCounts = lobby.liveCounts || {};
  const staged = cart.staged || {};
  const gateOpen = lobby.isGateOpen === true;
  const rows = [];

  if (items.length > 0) {
    const options = items.slice(0, DISCORD_SELECT_LIMIT).map((item) => {
      const saved = liveCounts[item.id] || 0;
      const delta = staged[item.id] || 0;
      const descParts = [`${saved} saved`];
      if (delta) descParts.push(`${delta > 0 ? '+' : ''}${delta} staged`);
      return {
        label: item.name.slice(0, 100),
        description: descParts.join(' · ').slice(0, 100),
        value: item.id,
        default: selected?.id === item.id,
      };
    });
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('reqcard:item')
        .setPlaceholder('Select a loot item')
        .addOptions(options)
    ));
  }

  if (selected) {
    const currentActive = liveCounts[selected.id] || 0;
    const localInput = staged[selected.id] || 0;
    const combinedTotal = currentActive + localInput;
    const minQty = currentActive > 0 ? 1 : 0;
    const limitQty = Number(selected.limitQty) || 0;
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('reqcard:minus')
        .setLabel('-')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!gateOpen || combinedTotal <= minQty),
      new ButtonBuilder()
        .setCustomId('reqcard:plus')
        .setLabel('+')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!gateOpen || combinedTotal >= limitQty),
      new ButtonBuilder()
        .setCustomId('reqcard:max')
        .setLabel('Set Max')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!gateOpen || combinedTotal >= limitQty),
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('reqcard:submit')
      .setLabel(gateOpen ? 'Submit Requests' : 'Event Locked')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!gateOpen || !hasStagedChanges(staged)),
    new ButtonBuilder()
      .setCustomId('reqcard:cancel')
      .setLabel('Cancel Request')
      .setStyle(ButtonStyle.Danger),
  ));

  return rows.slice(0, 5);
}

function buildCancelEmbed(lobby, cart) {
  const active = savedItems(lobby);
  const pending = active.find((item) => item.id === cart.pendingDropItemId) || null;
  const lines = [];
  if (cart.notice) lines.push(cart.notice, '');

  lines.push('**Active Requests**');
  lines.push('Select a saved request below and press Drop to cancel.');
  lines.push('');

  if (lobby.currentPhase === 3) {
    lines.push('🔒 Cancellations are locked during the Live Event / Auction phase.');
    lines.push('');
  }

  if (active.length === 0) {
    lines.push('*You have no active pending requests currently in queue.*');
  } else {
    active.forEach((item) => {
      const qty = lobby.liveCounts[item.id] || 0;
      const marker = pending?.id === item.id ? ' →' : '•';
      lines.push(`${marker} **${item.name}** — Requested Qty: ${qty}`);
    });
  }

  if (pending && lobby.currentPhase !== 3) {
    lines.push('');
    lines.push(`Drop **${pending.name}** (qty ${lobby.liveCounts[pending.id]})? This cannot be undone from Discord.`);
  }

  return new EmbedBuilder()
    .setTitle(`${PANEL_TITLE} · Cancel`)
    .setColor(EMBED_COLOR)
    .setDescription(lines.join('\n').slice(0, 4096));
}

function buildCancelComponents(lobby, cart) {
  const active = savedItems(lobby);
  const dropLocked = lobby.currentPhase === 3;
  const pending = active.find((item) => item.id === cart.pendingDropItemId) || null;
  const rows = [];

  if (active.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('reqcard:drop_item')
        .setPlaceholder('Choose a request to drop')
        .setDisabled(dropLocked)
        .addOptions(active.slice(0, DISCORD_SELECT_LIMIT).map((item) => ({
          label: item.name.slice(0, 100),
          description: `Requested Qty: ${lobby.liveCounts[item.id] || 0}`.slice(0, 100),
          value: item.id,
          default: pending?.id === item.id,
        })))
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('reqcard:drop_confirm')
      .setLabel('Drop')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(dropLocked || !pending),
    new ButtonBuilder()
      .setCustomId('reqcard:back')
      .setLabel('Go back')
      .setStyle(ButtonStyle.Secondary),
  ));

  return rows;
}

async function renderPanel(interaction, lobby, cart) {
  const embed = cart.view === 'cancel'
    ? buildCancelEmbed(lobby, cart)
    : buildCartEmbed(lobby, cart);
  const components = cart.view === 'cancel'
    ? buildCancelComponents(lobby, cart)
    : buildCartComponents(lobby, cart);
  await interaction.editReply({ embeds: [embed], components });
}

function applyStepper(cart, item, liveCount, direction) {
  const currentInput = cart.staged[item.id] || 0;
  const combinedTotal = liveCount + currentInput;
  const minQty = liveCount > 0 ? 1 : 0;
  const limitQty = Number(item.limitQty) || 0;
  if (direction === 'up' && combinedTotal < limitQty) {
    cart.staged[item.id] = currentInput + 1;
  } else if (direction === 'down' && combinedTotal > minQty) {
    cart.staged[item.id] = currentInput - 1;
  } else if (direction === 'max') {
    cart.staged[item.id] = Math.max(0, limitQty - liveCount);
  }
  if (cart.staged[item.id] === 0) delete cart.staged[item.id];
}

async function loadLobby(interaction) {
  return buildRequestLobby(interaction.user.id, rosterDisplayName(interaction));
}

export async function handleRequestDeckInteraction(interaction) {
  const db = getTenantStore();
  const userId = interaction.user.id;
  const lockKey = cartKey(userId);

  return withUserLock(lockKey, async () => {
    try {
    const configSnap = await db.ref('settings/configuration').once('value');
    if (configSnap.exists() && configSnap.val().isForceLocked === true) {
      return interaction.editReply(lockdownReply());
    }

    const memberCheckSnap = await db.ref(`auction/members/${userId}`).once('value');
    if (!memberCheckSnap.exists()) {
      return interaction.editReply(rosterDisconnectReply());
    }

    const cart = getCart(userId);
    const id = interaction.customId;

    if (id === 'reqcard:open') {
      cart.view = 'cart';
      cart.notice = '';
      cart.pendingDropItemId = '';
      const lobby = await loadLobby(interaction);
      if (!cart.selectedItemId && lobby.items[0]) cart.selectedItemId = lobby.items[0].id;
      return renderPanel(interaction, lobby, cart);
    }

    if (id === 'reqcard:back') {
      cart.view = 'cart';
      cart.pendingDropItemId = '';
      cart.notice = '';
      return renderPanel(interaction, await loadLobby(interaction), cart);
    }

    if (id === 'reqcard:cancel') {
      cart.view = 'cancel';
      cart.pendingDropItemId = '';
      cart.notice = '';
      return renderPanel(interaction, await loadLobby(interaction), cart);
    }

    if (interaction.isStringSelectMenu() && id === 'reqcard:item') {
      cart.selectedItemId = interaction.values[0] || cart.selectedItemId;
      cart.view = 'cart';
      cart.notice = '';
      return renderPanel(interaction, await loadLobby(interaction), cart);
    }

    if (interaction.isStringSelectMenu() && id === 'reqcard:drop_item') {
      cart.pendingDropItemId = interaction.values[0] || '';
      cart.view = 'cancel';
      cart.notice = '';
      return renderPanel(interaction, await loadLobby(interaction), cart);
    }

    const lobby = await loadLobby(interaction);
    const selected = (lobby.items || []).find((item) => item.id === cart.selectedItemId) || lobby.items[0];
    if (selected) cart.selectedItemId = selected.id;

    if (id === 'reqcard:plus' || id === 'reqcard:minus' || id === 'reqcard:max') {
      if (!lobby.isGateOpen) {
        cart.notice = `🔒 ${lobby.nextStatusChangeMessage || 'Bidding registration is closed.'}`;
        return renderPanel(interaction, lobby, cart);
      }
      if (selected) {
        applyStepper(
          cart,
          selected,
          lobby.liveCounts[selected.id] || 0,
          id === 'reqcard:plus' ? 'up' : id === 'reqcard:minus' ? 'down' : 'max'
        );
      }
      cart.notice = '';
      return renderPanel(interaction, lobby, cart);
    }

    if (id === 'reqcard:submit') {
      if (!lobby.isGateOpen) {
        cart.notice = `🔒 ${lobby.nextStatusChangeMessage || 'Bidding registration is closed.'}`;
        return renderPanel(interaction, lobby, cart);
      }
      const selections = {};
      (lobby.items || []).forEach((item) => {
        const localInput = cart.staged[item.id] || 0;
        if (localInput !== 0) {
          selections[item.id] = (lobby.liveCounts[item.id] || 0) + localInput;
        }
      });
      try {
        await submitSelections(userId, rosterDisplayName(interaction), selections);
        resetStaged(cart);
        cart.notice = '✅ Requests submitted.';
        const refreshed = await loadLobby(interaction);
        return renderPanel(interaction, refreshed, cart);
      } catch (err) {
        cart.notice = `❌ ${err instanceof RequestDeckError ? err.message : 'Submit failed.'}`;
        return renderPanel(interaction, lobby, cart);
      }
    }

    if (id === 'reqcard:drop_confirm') {
      const dropItem = savedItems(lobby).find((item) => item.id === cart.pendingDropItemId);
      if (!dropItem) {
        cart.notice = 'Select a saved request first.';
        cart.view = 'cancel';
        return renderPanel(interaction, lobby, cart);
      }
      try {
        await cancelPending(userId, rosterDisplayName(interaction), {
          itemId: dropItem.id,
          itemName: dropItem.name,
        });
        delete cart.staged[dropItem.id];
        cart.pendingDropItemId = '';
        cart.view = 'cart';
        cart.notice = `✅ Dropped ${dropItem.name}.`;
        const refreshed = await loadLobby(interaction);
        return renderPanel(interaction, refreshed, cart);
      } catch (err) {
        cart.notice = `❌ ${err instanceof RequestDeckError ? err.message : 'Drop failed.'}`;
        cart.view = 'cancel';
        return renderPanel(interaction, lobby, cart);
      }
    }
    } catch (err) {
      console.error('❌ [REQUEST CARD]: Failed to resolve cart interaction:', err.message);
      await interaction.editReply({
        content: '❌ An internal processing failure occurred while updating your request panel.',
        embeds: [],
        components: [],
      }).catch(() => {});
    }
  });
}
