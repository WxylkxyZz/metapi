import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

vi.mock('undici', () => ({
  fetch: (...args: unknown[]) => fetchMock(...args),
}));

const withExplicitProxyRequestInitMock = vi.fn(
  (_proxyUrl: unknown, options?: Record<string, unknown>) => {
    if (_proxyUrl) return { ...(options || {}), dispatcher: 'mock-proxy-dispatcher' };
    return options ?? {};
  },
);

vi.mock('./siteProxy.js', () => ({
  withExplicitProxyRequestInit: (...args: unknown[]) => withExplicitProxyRequestInitMock(...args),
}));

describe('notifyService', () => {
  beforeEach(async () => {
    vi.resetModules();
    fetchMock.mockReset();
    withExplicitProxyRequestInitMock.mockClear();

    const { config } = await import('../config.js');
    config.notifyCooldownSec = 300;
    config.webhookEnabled = false;
    config.webhookUrl = '';
    config.barkEnabled = false;
    config.barkUrl = '';
    (config as any).telegramEnabled = false;
    (config as any).telegramBotToken = '';
    (config as any).telegramChatId = '';
    (config as any).telegramUseSystemProxy = false;
    config.systemProxyUrl = '';
    (config as any).telegramMessageThreadId = '';
  });

  it('bypasses cooldown when bypassThrottle is enabled', async () => {
    const { config } = await import('../config.js');
    config.webhookEnabled = true;
    config.webhookUrl = 'https://webhook.example.com/notify';
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const { sendNotification } = await import('./notifyService.js');

    await (sendNotification as any)('测试通知', 'same-message', 'info', { bypassThrottle: true });
    await (sendNotification as any)('测试通知', 'same-message', 'info', { bypassThrottle: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws when strict delivery is required and no channels are enabled', async () => {
    const { sendNotification } = await import('./notifyService.js');
    await expect(
      (sendNotification as any)('测试通知', 'message', 'info', {
        requireChannel: true,
        throwOnFailure: true,
      }),
    ).rejects.toThrow('未启用任何通知渠道');
  });

  it('throws when strict delivery is required and all channel sends fail', async () => {
    const { config } = await import('../config.js');
    config.webhookEnabled = true;
    config.webhookUrl = 'https://webhook.example.com/notify';
    fetchMock.mockRejectedValue(new Error('webhook failed'));
    const { sendNotification } = await import('./notifyService.js');

    await expect(
      (sendNotification as any)('测试通知', 'message', 'info', {
        bypassThrottle: true,
        throwOnFailure: true,
      }),
    ).rejects.toThrow(/webhook failed|通知发送失败/);
  });

  it('includes failed channel details when all enabled channels fail', async () => {
    const { config } = await import('../config.js');
    config.webhookEnabled = true;
    config.webhookUrl = 'https://webhook.example.com/notify';
    config.barkEnabled = true;
    config.barkUrl = 'https://api.day.app/mock-key';

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

    const { sendNotification } = await import('./notifyService.js');

    await expect(
      (sendNotification as any)('测试通知', 'message', 'info', {
        bypassThrottle: true,
        throwOnFailure: true,
      }),
    ).rejects.toThrow(/webhook|bark|Webhook 响应状态|Bark 响应状态/i);
  });

  it('sends enterprise wechat webhook payload as structured text message', async () => {
    const { config } = await import('../config.js');
    config.webhookEnabled = true;
    config.webhookUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=demo-key';

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ errcode: 0, errmsg: 'ok' }),
    });

    const { sendNotification } = await import('./notifyService.js');
    await sendNotification('测试通知', 'message', 'info', { bypassThrottle: true, throwOnFailure: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as [string, { body?: string }];
    expect(call[0]).toContain('qyapi.weixin.qq.com/cgi-bin/webhook/send');

    const payload = JSON.parse(call[1]?.body || '{}') as { msgtype?: string; text?: { content?: string } };
    expect(Array.isArray(payload)).toBe(false);
    expect(payload.msgtype).toBe('text');
    expect(payload.text?.content || '').toContain('[canopy][INFO] 测试通知');
    expect(payload.text?.content || '').toContain('message');
  });

  it('fails when enterprise wechat webhook returns non-zero errcode', async () => {
    const { config } = await import('../config.js');
    config.webhookEnabled = true;
    config.webhookUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=demo-key';

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ errcode: 93000, errmsg: 'invalid json' }),
    });

    const { sendNotification } = await import('./notifyService.js');
    await expect(
      sendNotification('测试通知', 'message', 'info', {
        bypassThrottle: true,
        throwOnFailure: true,
      }),
    ).rejects.toThrow(/企业微信|93000|invalid json/);
  });

  it('includes local time and utc time labels in the webhook payload', async () => {
    const { config } = await import('../config.js');
    config.webhookEnabled = true;
    config.webhookUrl = 'https://webhook.example.com/notify';
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const { sendNotification } = await import('./notifyService.js');

    await sendNotification('测试通知', 'message', 'info', { bypassThrottle: true });

    const call = fetchMock.mock.calls[0] as [string, { body?: string }];
    const payload = JSON.parse(call[1]?.body || '{}') as { localTime?: string; timeZone?: string };
    expect(payload.localTime).toBeTruthy();
    expect(payload.timeZone).toBeTruthy();
  });

  it('sends telegram message without topic when telegram thread id is empty', async () => {
    const { config } = await import('../config.js');
    (config as any).telegramEnabled = true;
    (config as any).telegramBotToken = '123456:telegram-token';
    (config as any).telegramChatId = '-1001234567890';
    (config as any).telegramMessageThreadId = '';

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
    });

    const { sendNotification } = await import('./notifyService.js');
    await sendNotification('测试通知', 'message', 'warning', { bypassThrottle: true, throwOnFailure: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/bot123456:telegram-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const rawBody = fetchMock.mock.calls[0]?.[1] as { body?: string };
    const payload = JSON.parse(rawBody?.body || '{}') as { chat_id?: string; text?: string; message_thread_id?: number };
    expect(payload.chat_id).toBe('-1001234567890');
    expect(payload.message_thread_id).toBeUndefined();
    expect(payload.text || '').toContain('Level: warning');
    expect(payload.text || '').toContain('Local Time:');
    expect(payload.text || '').toContain('UTC Time:');
  });

  it('sends telegram topic id when telegram thread id is configured', async () => {
    const { config } = await import('../config.js');
    (config as any).telegramEnabled = true;
    (config as any).telegramBotToken = '123456:telegram-token';
    (config as any).telegramChatId = '-1001234567890';
    (config as any).telegramMessageThreadId = '77';

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
    });

    const { sendNotification } = await import('./notifyService.js');
    await sendNotification('测试通知', 'message', 'warning', { bypassThrottle: true, throwOnFailure: true });

    const rawBody = fetchMock.mock.calls[0]?.[1] as { body?: string };
    const payload = JSON.parse(rawBody?.body || '{}') as { message_thread_id?: number };
    expect(payload.message_thread_id).toBe(77);
  });

  it('uses TELEGRAM_API_BASE_URL when configured', async () => {
    const { config } = await import('../config.js');
    (config as any).telegramEnabled = true;
    (config as any).telegramBotToken = '123456:telegram-token';
    (config as any).telegramChatId = '-1001234567890';
    (config as any).telegramApiBaseUrl = 'https://tg-proxy.example.com/custom/';

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
    });

    const { sendNotification } = await import('./notifyService.js');
    await sendNotification('测试通知', 'message', 'warning', { bypassThrottle: true, throwOnFailure: true });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tg-proxy.example.com/custom/bot123456:telegram-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('applies system proxy dispatcher when telegramUseSystemProxy is enabled', async () => {
    const { config } = await import('../config.js');
    (config as any).telegramEnabled = true;
    (config as any).telegramBotToken = '123456:telegram-token';
    (config as any).telegramChatId = '-1001234567890';
    (config as any).telegramUseSystemProxy = true;
    config.systemProxyUrl = 'http://127.0.0.1:7890';

    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const { sendNotification } = await import('./notifyService.js');
    await sendNotification('测试通知', 'proxy-test', 'info', { bypassThrottle: true, throwOnFailure: true });

    expect(withExplicitProxyRequestInitMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7890',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({ dispatcher: 'mock-proxy-dispatcher' }),
    );
  });

  it('does not apply proxy dispatcher when telegramUseSystemProxy is disabled', async () => {
    const { config } = await import('../config.js');
    (config as any).telegramEnabled = true;
    (config as any).telegramBotToken = '123456:telegram-token';
    (config as any).telegramChatId = '-1001234567890';
    (config as any).telegramUseSystemProxy = false;
    config.systemProxyUrl = 'http://127.0.0.1:7890';

    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const { sendNotification } = await import('./notifyService.js');
    await sendNotification('测试通知', 'no-proxy-test', 'info', { bypassThrottle: true, throwOnFailure: true });

    expect(withExplicitProxyRequestInitMock).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ method: 'POST' }),
    );
    const fetchOptions = fetchMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(fetchOptions.dispatcher).toBeUndefined();
  });

  it('sends feishu webhook payload with msg_type text format', async () => {
    const { config } = await import('../config.js');
    config.webhookEnabled = true;
    config.webhookUrl = 'https://open.feishu.cn/open-apis/bot/v2/hook/demo-token';

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ code: 0, msg: 'success' }),
    });

    const { sendNotification } = await import('./notifyService.js');
    await sendNotification('测试通知', 'feishu message', 'info', { bypassThrottle: true, throwOnFailure: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as [string, { body?: string }];
    expect(call[0]).toContain('open.feishu.cn/open-apis/bot/v2/hook/');

    const payload = JSON.parse(call[1]?.body || '{}') as { msg_type?: string; content?: { text?: string } };
    expect(payload.msg_type).toBe('text');
    expect(payload.content?.text || '').toContain('[canopy][INFO] 测试通知');
    expect(payload.content?.text || '').toContain('feishu message');
  });

  it('fails when feishu webhook returns non-zero code', async () => {
    const { config } = await import('../config.js');
    config.webhookEnabled = true;
    config.webhookUrl = 'https://open.feishu.cn/open-apis/bot/v2/hook/demo-token';

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ code: 19001, msg: 'param invalid' }),
    });

    const { sendNotification } = await import('./notifyService.js');
    await expect(
      sendNotification('测试通知', 'message', 'info', {
        bypassThrottle: true,
        throwOnFailure: true,
      }),
    ).rejects.toThrow(/飞书|19001|param invalid/);
  });

  it('sends feishu webhook payload for larksuite.com domain', async () => {
    const { config } = await import('../config.js');
    config.webhookEnabled = true;
    config.webhookUrl = 'https://open.larksuite.com/open-apis/bot/v2/hook/demo-token';

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ code: 0, msg: 'success' }),
    });

    const { sendNotification } = await import('./notifyService.js');
    await sendNotification('测试通知', 'lark message', 'warning', { bypassThrottle: true, throwOnFailure: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as [string, { body?: string }];
    expect(call[0]).toContain('open.larksuite.com/open-apis/bot/v2/hook/');

    const payload = JSON.parse(call[1]?.body || '{}') as { msg_type?: string; content?: { text?: string } };
    expect(payload.msg_type).toBe('text');
    expect(payload.content?.text || '').toContain('[canopy][WARNING] 测试通知');
    expect(payload.content?.text || '').toContain('lark message');
  });
});