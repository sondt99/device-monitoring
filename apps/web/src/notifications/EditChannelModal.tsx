import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NotificationChannel } from '@device-monitoring/shared';
import { DetailRow, Field, Modal } from '../components/index.js';
import { formatDateTimeFull } from '../lib/format.js';
import { api } from '../api.js';

export function EditChannelModal({ channel, onClose }: { channel: NotificationChannel | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [secret, setSecret] = useState('');
  const [chatId, setChatId] = useState('');

  const save = useMutation({
    mutationFn: () => {
      if (!channel) return Promise.reject(new Error('No channel selected'));
      const config: Record<string, unknown> = {};
      if (secret.trim()) {
        if (channel.type === 'discord') config.webhookUrl = secret.trim();
        else if (channel.type === 'telegram') config.botToken = secret.trim();
        else config.url = secret.trim();
      }
      if (channel.type === 'telegram' && chatId.trim() && chatId.trim() !== String(channel.config.chatId ?? '')) {
        config.chatId = chatId.trim();
      }
      return api.updateChannel(channel.id, {
        name: name.trim(),
        enabled,
        ...(Object.keys(config).length > 0 ? { config } : {})
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
      onClose();
    }
  });

  const resetForm = save.reset;
  useEffect(() => {
    if (!channel) return;
    setName(channel.name);
    setEnabled(channel.enabled);
    setSecret('');
    setChatId(channel.type === 'telegram' ? String(channel.config.chatId ?? '') : '');
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  const secretLabel =
    channel?.type === 'discord' ? 'Webhook URL' : channel?.type === 'telegram' ? 'Bot Token' : 'Endpoint URL';

  return (
    <Modal open={channel !== null} title={channel ? `Edit — ${channel.name}` : 'Edit channel'} onClose={onClose}>
      {channel ? (
        <form
          className="channel-edit-form"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="detail-rows channel-edit-meta">
            <DetailRow label="Type">{channel.type === 'discord' ? 'Discord' : channel.type === 'telegram' ? 'Telegram' : 'Generic webhook'}</DetailRow>
            <DetailRow label="Created">{formatDateTimeFull(channel.createdAt)}</DetailRow>
            <DetailRow label="Updated">{formatDateTimeFull(channel.updatedAt)}</DetailRow>
          </div>

          <Field label="Display name">
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field label={secretLabel} hint="Write-only: leave blank to keep the stored value.">
            <input
              placeholder="•••••••• (unchanged)"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="off"
            />
          </Field>

          {channel.type === 'telegram' ? (
            <Field label="Chat ID">
              <input value={chatId} onChange={(e) => setChatId(e.target.value)} />
            </Field>
          ) : null}

          <label className="toggle-field">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>
              <strong>Enabled</strong>
              <small>Paused channels stop receiving alerts.</small>
            </span>
          </label>

          {save.error ? <p className="error form-error">{save.error.message}</p> : null}
          <button className="primary full-width" type="submit" disabled={save.isPending || !name.trim()}>
            {save.isPending ? 'Saving…' : 'Save channel'}
          </button>
        </form>
      ) : null}
    </Modal>
  );
}
