import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/Toast.js';
import Settings from './Settings.js';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getAuthInfo: vi.fn(),
    getRuntimeSettings: vi.fn(),
    getDownstreamApiKeys: vi.fn(),
    getRoutesLite: vi.fn(),
    getRuntimeDatabaseConfig: vi.fn(),
    getBrandList: vi.fn(),
    factoryReset: vi.fn(),
    getModelTokenCandidates: vi.fn(),
  },
}));

vi.mock('../api.js', () => ({
  api: apiMock,
}));

vi.mock('../components/BrandIcon.js', () => ({
  BrandGlyph: () => null,
  InlineBrandIcon: () => null,
  getBrand: () => null,
  normalizeBrandIconKey: (icon: string) => icon,
}));

function collectText(node: any): string {
  return (node.children || []).map((child: unknown) => {
    if (typeof child === 'string') return child;
    return collectText(child);
  }).join('');
}

function createStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.has(key) ? store.get(key)! : null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    dump: () => Object.fromEntries(store.entries()),
  };
}

const baseRuntime = {
  checkinCron: '0 8 * * *',
  balanceRefreshCron: '0 * * * *',
  logCleanupCron: '0 6 * * *',
  logCleanupUsageLogsEnabled: false,
  logCleanupProgramLogsEnabled: false,
  logCleanupRetentionDays: 30,
  routingFallbackUnitCost: 1,
  routingWeights: {},
  adminIpAllowlist: [],
  systemProxyUrl: '',
};

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('Settings default-credential warning', () => {
  let storage: ReturnType<typeof createStorage>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    apiMock.getRuntimeSettings.mockResolvedValue(baseRuntime);
    apiMock.getDownstreamApiKeys.mockResolvedValue({ items: [] });
    apiMock.getRoutesLite.mockResolvedValue([]);
    apiMock.getBrandList.mockResolvedValue({ brands: [] });
    apiMock.getRuntimeDatabaseConfig.mockResolvedValue({
      active: { dialect: 'sqlite', connection: '(default sqlite path)', ssl: false },
      saved: null,
      restartRequired: false,
    });
    apiMock.factoryReset.mockResolvedValue({ success: true });
    apiMock.getModelTokenCandidates.mockResolvedValue({ models: {} });

    storage = createStorage({
      auth_token: 'secret-token',
      auth_token_expires_at: String(Date.now() + 60_000),
      theme_mode: 'dark',
      theme: 'dark',
      user_profile: JSON.stringify({ name: '管理员', avatarSeed: 'seed', avatarStyle: 'bottts' }),
      metapi_first_use_docs_reminder_seen_v1: '1',
    });

    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { reload: vi.fn() },
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not render the warning when credentials are not defaults', async () => {
    apiMock.getAuthInfo.mockResolvedValue({ masked: 'secr****', isDefault: false });
    apiMock.getRuntimeSettings.mockResolvedValue({
      ...baseRuntime,
      authTokenIsDefault: false,
      proxyTokenIsDefault: false,
    });

    let root: any;
    await act(async () => {
      root = create(
        <MemoryRouter>
          <ToastProvider>
            <Settings />
          </ToastProvider>
        </MemoryRouter>,
      );
    });
    await flushMicrotasks();

    const json = JSON.stringify(root!.toJSON());
    expect(json).not.toContain('检测到默认访问令牌');
  });

  it('renders a warning when the admin token is a default', async () => {
    apiMock.getAuthInfo.mockResolvedValue({ masked: '1234****56', isDefault: true });
    apiMock.getRuntimeSettings.mockResolvedValue({
      ...baseRuntime,
      authTokenIsDefault: true,
      proxyTokenIsDefault: false,
    });

    let root: any;
    await act(async () => {
      root = create(
        <MemoryRouter>
          <ToastProvider>
            <Settings />
          </ToastProvider>
        </MemoryRouter>,
      );
    });
    await flushMicrotasks();

    const json = JSON.stringify(root!.toJSON());
    expect(json).toContain('检测到默认访问令牌');
    expect(json).toContain('管理员登录令牌');
    expect(json).toContain('修改登录令牌');
  });

  it('renders a warning when the proxy token is a default', async () => {
    apiMock.getAuthInfo.mockResolvedValue({ masked: 'secr****', isDefault: false });
    apiMock.getRuntimeSettings.mockResolvedValue({
      ...baseRuntime,
      authTokenIsDefault: false,
      proxyTokenIsDefault: true,
    });

    let root: any;
    await act(async () => {
      root = create(
        <MemoryRouter>
          <ToastProvider>
            <Settings />
          </ToastProvider>
        </MemoryRouter>,
      );
    });
    await flushMicrotasks();

    const json = JSON.stringify(root!.toJSON());
    expect(json).toContain('检测到默认访问令牌');
    expect(json).toContain('下游访问令牌');
  });
});