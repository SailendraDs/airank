// Notification channel senders for alerts (Epic K).
// Supports incoming-webhook style delivery for Slack and Microsoft Teams.

export interface NotificationPayload {
  title: string;
  message: string;
  severity?: 'info' | 'warning' | 'critical';
  brandName?: string;
  metric?: string;
  url?: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  info: '#2563eb',
  warning: '#d97706',
  critical: '#dc2626',
};

/** Post an alert to a Slack incoming webhook URL. */
export async function sendSlack(webhookUrl: string, payload: NotificationPayload): Promise<void> {
  const color = SEVERITY_COLOR[payload.severity || 'info'];
  const body = {
    attachments: [
      {
        color,
        title: payload.title,
        text: payload.message,
        fields: [
          payload.brandName ? { title: 'Brand', value: payload.brandName, short: true } : null,
          payload.metric ? { title: 'Metric', value: payload.metric, short: true } : null,
        ].filter(Boolean),
        ...(payload.url ? { title_link: payload.url } : {}),
      },
    ],
  };
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Slack webhook failed: ${res.status} ${await res.text()}`);
}

/** Post an alert to a Microsoft Teams incoming webhook URL (MessageCard format). */
export async function sendTeams(webhookUrl: string, payload: NotificationPayload): Promise<void> {
  const themeColor = (SEVERITY_COLOR[payload.severity || 'info'] || '#2563eb').replace('#', '');
  const body = {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor,
    summary: payload.title,
    title: payload.title,
    text: payload.message,
    sections: [
      {
        facts: [
          payload.brandName ? { name: 'Brand', value: payload.brandName } : null,
          payload.metric ? { name: 'Metric', value: payload.metric } : null,
          payload.severity ? { name: 'Severity', value: payload.severity } : null,
        ].filter(Boolean),
      },
    ],
    ...(payload.url
      ? { potentialAction: [{ '@type': 'OpenUri', name: 'View in AIRank', targets: [{ os: 'default', uri: payload.url }] }] }
      : {}),
  };
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Teams webhook failed: ${res.status} ${await res.text()}`);
}

/** Dispatch a notification on the given channel. */
export async function dispatchNotification(
  channel: string,
  destination: string,
  payload: NotificationPayload,
): Promise<void> {
  if (channel === 'slack') return sendSlack(destination, payload);
  if (channel === 'teams') return sendTeams(destination, payload);
  throw new Error(`Unsupported notification channel: ${channel}`);
}
