import type { NotificationChannelType } from '@device-monitoring/shared';
import { Field } from '../components/index.js';

export interface ChannelFields {
  discordWebhookUrl: string;
  telegramBotToken: string;
  telegramChatId: string;
  webhookUrl: string;
}

export function ChannelConfigFields({
  type,
  fields,
  onChange
}: {
  type: NotificationChannelType;
  fields: ChannelFields;
  onChange: (partial: Partial<ChannelFields>) => void;
}) {
  if (type === 'discord') {
    return (
      <Field
        label="Webhook URL"
        hint="Server Settings → Integrations → Webhooks → Copy Webhook URL."
        className="field-config"
      >
        <input
          type="url"
          placeholder="https://discord.com/api/webhooks/123456/token"
          value={fields.discordWebhookUrl}
          onChange={(e) => onChange({ discordWebhookUrl: e.target.value })}
        />
      </Field>
    );
  }
  if (type === 'telegram') {
    return (
      <>
        <Field label="Bot Token" hint="From @BotFather — /newbot then copy the token." className="field-config">
          <input
            placeholder="123456789:AABBcc..."
            value={fields.telegramBotToken}
            onChange={(e) => onChange({ telegramBotToken: e.target.value })}
          />
        </Field>
        <Field label="Chat ID" hint="Your personal ID, group chat ID, or channel ID." className="field-config">
          <input
            placeholder="-1001234567890"
            value={fields.telegramChatId}
            onChange={(e) => onChange({ telegramChatId: e.target.value })}
          />
        </Field>
      </>
    );
  }
  return (
    <Field
      label="Endpoint URL"
      hint="Device Monitoring will POST a JSON payload with event details to this URL."
      className="field-config"
    >
      <input
        type="url"
        placeholder="https://example.com/hook"
        value={fields.webhookUrl}
        onChange={(e) => onChange({ webhookUrl: e.target.value })}
      />
    </Field>
  );
}
