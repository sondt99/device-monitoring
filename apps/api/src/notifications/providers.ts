import type { Device, DeviceStatus, NotificationChannelType } from '@device-monitoring/shared';

export interface NotificationPayload {
  device: Pick<Device, 'id' | 'name' | 'host'>;
  previousStatus: DeviceStatus;
  currentStatus: DeviceStatus;
  latencyMs: number | null;
  error: string | null;
  checkedAt: string;
}

export interface NotificationProvider {
  readonly type: NotificationChannelType;
  send(config: Record<string, unknown>, payload: NotificationPayload): Promise<void>;
}

function statusEmoji(status: DeviceStatus): string {
  if (status === 'up') return '✅';
  if (status === 'degraded') return '⚠️';
  if (status === 'down') return '🚨';
  return '❔';
}

function renderMessage(payload: NotificationPayload): string {
  const latency = payload.latencyMs === null ? 'n/a' : `${payload.latencyMs}ms`;
  const reason = payload.error ? `\nError: ${payload.error}` : '';
  return `${statusEmoji(payload.currentStatus)} ${payload.device.name} (${payload.device.host}) changed ${payload.previousStatus} → ${payload.currentStatus}\nLatency: ${latency}\nChecked: ${payload.checkedAt}${reason}`;
}

async function postJson(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Notification request failed with HTTP ${response.status}`);
  }
}

function discordEmbed(payload: NotificationPayload): Record<string, unknown> {
  const { device, currentStatus, previousStatus, latencyMs, error, checkedAt } = payload;
  const color = currentStatus === 'up' ? 0x34d399 : currentStatus === 'degraded' ? 0xfbbf24 : currentStatus === 'down' ? 0xfb7185 : 0xc4b5fd;
  const icon = currentStatus === 'up' ? '✅' : currentStatus === 'degraded' ? '⚠️' : currentStatus === 'down' ? '🚨' : '❔';
  const label = (s: DeviceStatus) => (s === 'up' ? 'Online' : s === 'degraded' ? 'Degraded' : s === 'down' ? 'Offline' : 'Unknown');

  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: 'Host', value: `\`${device.host}\``, inline: true },
    { name: 'Latency', value: latencyMs !== null ? `${latencyMs}ms` : 'n/a', inline: true },
    { name: 'Previous', value: label(previousStatus), inline: true }
  ];
  if (error) fields.push({ name: 'Error', value: error, inline: false });

  return {
    embeds: [
      {
        color,
        author: { name: 'Device Monitoring' },
        title: `${icon}  ${device.name} — ${label(currentStatus)}`,
        fields,
        timestamp: checkedAt,
        footer: { text: 'device-monitoring · status change' }
      }
    ]
  };
}

export const discordProvider: NotificationProvider = {
  type: 'discord',
  async send(config, payload) {
    const webhookUrl = String(config.webhookUrl ?? config.url ?? '');
    if (!webhookUrl) throw new Error('Discord webhookUrl is required');
    await postJson(webhookUrl, discordEmbed(payload));
  }
};

export const telegramProvider: NotificationProvider = {
  type: 'telegram',
  async send(config, payload) {
    const botToken = String(config.botToken ?? '');
    const chatId = String(config.chatId ?? '');
    if (!botToken || !chatId) throw new Error('Telegram botToken and chatId are required');
    await postJson(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: renderMessage(payload)
    });
  }
};

export const webhookProvider: NotificationProvider = {
  type: 'webhook',
  async send(config, payload) {
    const url = String(config.url ?? config.webhookUrl ?? '');
    if (!url) throw new Error('Webhook url is required');
    await postJson(url, { event: 'device.status_changed', payload, text: renderMessage(payload) });
  }
};

export const providers = new Map<NotificationChannelType, NotificationProvider>([
  ['discord', discordProvider],
  ['telegram', telegramProvider],
  ['webhook', webhookProvider]
]);
