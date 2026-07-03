import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationChannel, NotificationChannelType } from '@device-monitoring/shared';
import { useMe } from '../auth/useMe.js';
import { ConfirmDialog, EmptyState, Field, LoadingBlock, SectionHeader } from '../components/index.js';
import { api } from '../api.js';
import { ChannelConfigFields, type ChannelFields } from './ChannelConfigFields.js';
import { EditChannelModal } from './EditChannelModal.js';

function channelTypeName(t: NotificationChannelType): string {
  if (t === 'discord') return 'Discord';
  if (t === 'telegram') return 'Telegram';
  return 'Webhook';
}

function channelConfigLabel(channel: NotificationChannel): string {
  // chatId is not a secret so it survives redaction; other fields are masked
  if (channel.type === 'telegram') {
    const chatId = String(channel.config.chatId ?? '');
    return chatId ? `Chat ID: ${chatId}` : 'Token configured';
  }
  return 'Configured — secret redacted for display';
}

export function NotificationPanel() {
  const queryClient = useQueryClient();
  const { isAdmin } = useMe();
  const channels = useQuery({ queryKey: ['channels'], queryFn: api.channels, refetchInterval: 30_000 });

  const [type, setType] = useState<NotificationChannelType>('discord');
  const [channelName, setChannelName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [channelFields, setChannelFields] = useState<ChannelFields>({
    discordWebhookUrl: '',
    telegramBotToken: '',
    telegramChatId: '',
    webhookUrl: ''
  });

  const [deletingChannel, setDeletingChannel] = useState<NotificationChannel | null>(null);
  const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, { ok: boolean; message: string } | undefined>>({});

  function updateFields(partial: Partial<ChannelFields>) {
    setChannelFields((prev) => ({ ...prev, ...partial }));
    setFormError(null);
  }

  function buildConfig(): Record<string, unknown> | null {
    if (type === 'discord') {
      if (!channelFields.discordWebhookUrl.trim()) {
        setFormError('Webhook URL is required');
        return null;
      }
      return { webhookUrl: channelFields.discordWebhookUrl.trim() };
    }
    if (type === 'telegram') {
      if (!channelFields.telegramBotToken.trim() || !channelFields.telegramChatId.trim()) {
        setFormError('Bot token and Chat ID are both required');
        return null;
      }
      return { botToken: channelFields.telegramBotToken.trim(), chatId: channelFields.telegramChatId.trim() };
    }
    if (!channelFields.webhookUrl.trim()) {
      setFormError('Endpoint URL is required');
      return null;
    }
    return { url: channelFields.webhookUrl.trim() };
  }

  const create = useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      api.createChannel({ type, name: channelName, enabled: true, config }),
    onSuccess: () => {
      setChannelName('');
      setChannelFields({ discordWebhookUrl: '', telegramBotToken: '', telegramChatId: '', webhookUrl: '' });
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
    }
  });

  const remove = useMutation({
    mutationFn: api.deleteChannel,
    onSuccess: () => {
      setDeletingChannel(null);
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
    }
  });

  async function handleTest(id: number) {
    setTestingId(id);
    setTestResults((prev) => ({ ...prev, [id]: undefined }));
    try {
      await api.testChannel(id);
      setTestResults((prev) => ({ ...prev, [id]: { ok: true, message: 'Test notification sent successfully!' } }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, message: err instanceof Error ? err.message : 'Test failed' }
      }));
    } finally {
      setTestingId(null);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const config = buildConfig();
    if (config) create.mutate(config);
  }

  return (
    <section className="card notifications-card">
      <SectionHeader
        eyebrow="Alerts"
        title="Notification channels"
        description="Send alerts on state transitions: device goes down, comes back up, or is detected for the first time."
      />

      {isAdmin ? (
        <form className="notification-form" onSubmit={handleSubmit}>
          <Field label="Channel type" className="field-type">
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as NotificationChannelType);
                setFormError(null);
              }}
            >
              <option value="discord">Discord webhook</option>
              <option value="telegram">Telegram bot</option>
              <option value="webhook">Generic webhook</option>
            </select>
          </Field>
          <Field label="Display name" className="field-name">
            <input
              placeholder="Ops alerts, Home lab…"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </Field>
          <ChannelConfigFields type={type} fields={channelFields} onChange={updateFields} />
          {(formError ?? create.error?.message) ? (
            <p className="error form-error">{formError ?? create.error?.message}</p>
          ) : null}
          <button className="primary form-submit" type="submit" disabled={create.isPending}>
            {create.isPending ? 'Adding…' : 'Add channel'}
          </button>
        </form>
      ) : null}

      {channels.isLoading ? <LoadingBlock label="Loading notification channels…" /> : null}
      {!channels.isLoading && channels.data?.channels.length === 0 ? (
        <EmptyState title="No alert channels yet" description="Add Discord, Telegram, or webhook delivery for status changes." />
      ) : null}
      {channels.data && channels.data.channels.length > 0 ? (
        <ul className="channel-list">
          {channels.data.channels.map((channel) => {
            const result = testResults[channel.id];
            const isTesting = testingId === channel.id;
            return (
              <li
                className={isAdmin ? 'channel-card channel-clickable' : 'channel-card'}
                key={channel.id}
                role={isAdmin ? 'button' : undefined}
                tabIndex={isAdmin ? 0 : undefined}
                aria-label={isAdmin ? `Edit channel ${channel.name}` : undefined}
                onClick={isAdmin ? () => setEditingChannel(channel) : undefined}
                onKeyDown={
                  isAdmin
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setEditingChannel(channel);
                        }
                      }
                    : undefined
                }
              >
                <div className="channel-card-head">
                  <div className="channel-card-info">
                    <strong>{channel.name}</strong>
                    <span className="channel-type">{channelTypeName(channel.type)}</span>
                    {!channel.enabled ? <span className="disabled-dot">Paused</span> : null}
                  </div>
                  <p className="channel-config-label">{channelConfigLabel(channel)}</p>
                </div>
                {isAdmin ? (
                  <div className="channel-card-footer">
                    {result !== undefined ? (
                      <span className={result.ok ? 'test-ok' : 'test-error'}>{result.message}</span>
                    ) : (
                      <span />
                    )}
                    <div className="channel-actions">
                      <button
                        className="ghost"
                        type="button"
                        disabled={isTesting || testingId !== null}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleTest(channel.id);
                        }}
                      >
                        {isTesting ? 'Testing…' : 'Send test'}
                      </button>
                      <button
                        className="ghost"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingChannel(channel);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="ghost danger"
                        type="button"
                        disabled={remove.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingChannel(channel);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {isAdmin ? (
        <>
          <EditChannelModal channel={editingChannel} onClose={() => setEditingChannel(null)} />

          <ConfirmDialog
            open={deletingChannel !== null}
            title={`Delete ${deletingChannel?.name ?? 'channel'}?`}
            description="This will permanently remove the notification channel. Future alerts will no longer be delivered here."
            onConfirm={() => {
              if (deletingChannel) remove.mutate(deletingChannel.id);
            }}
            onCancel={() => setDeletingChannel(null)}
          />
        </>
      ) : null}
    </section>
  );
}
