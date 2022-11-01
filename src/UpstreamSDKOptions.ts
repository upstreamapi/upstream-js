import { UpstreamUser } from './UpstreamUser';

// const DEFAULT_FEATURE_GATE_API = 'https://upstreamapi.herokuapp.com/';
const DEFAULT_FEATURE_GATE_API = 'http://127.0.0.1:3010';
const DEFAULT_EVENT_LOGGING_API = 'http://127.0.0.1:3010';

export type UpstreamEnvironment = {
  tier?: 'production' | 'staging' | 'development' | string;
  [key: string]: string | undefined;
};

export type InitCompletionCallback = (
  initDurationMs: number,
  success: boolean,
  message: string | null
) => void;

export type UpstreamOptions = {
  api?: string;
  disableCurrentPageLogging?: boolean;
  environment?: UpstreamEnvironment;
  loggingIntervalMillis?: number;
  loggingBufferMaxSize?: number;
  disableNetworkKeepalive?: boolean;
  overrideStableID?: string;
  localMode?: boolean;
  initTimeoutMs?: number;
  disableErrorLogging?: boolean;
  disableAutoMetricsLogging?: boolean;
  initializeValues?: Record<string, any> | null;
  eventLoggingApi?: string;
  prefetchUsers?: UpstreamUser[];
  disableLocalStorage?: boolean;
  initCompletionCallback?: InitCompletionCallback | null;
};

type BoundedNumberInput = {
  default: number;
  min: number;
  max: number;
};

export default class UpstreamSDKOptions {
  private api: string;
  private disableCurrentPageLogging: boolean;
  private environment: UpstreamEnvironment | null;
  private loggingIntervalMillis: number;
  private loggingBufferMaxSize: number;
  private disableNetworkKeepalive: boolean;
  private overrideStableID: string | null;
  private localMode: boolean;
  private initTimeoutMs: number;
  private disableErrorLogging: boolean;
  private disableAutoMetricsLogging: boolean;
  private initializeValues?: Record<string, any> | null;
  private eventLoggingApi: string;
  private prefetchUsers: UpstreamUser[];
  private disableLocalStorage: boolean;
  private initCompletionCallback: InitCompletionCallback | null;

  constructor(options?: UpstreamOptions | null) {
    if (options == null) {
      options = {};
    }
    let api = options.api ?? DEFAULT_FEATURE_GATE_API;
    this.api = api.endsWith('/') ? api : api + '/';
    this.disableCurrentPageLogging = options.disableCurrentPageLogging ?? false;
    this.environment = options.environment ?? null;
    this.loggingIntervalMillis = this.normalizeNumberInput(
      options.loggingIntervalMillis,
      {
        default: 10000,
        min: 1000,
        max: 60000,
      },
    );
    this.loggingBufferMaxSize = this.normalizeNumberInput(
      options.loggingBufferMaxSize,
      {
        default: 100,
        min: 2,
        max: 500,
      },
    );

    this.disableNetworkKeepalive = options.disableNetworkKeepalive ?? false;
    this.overrideStableID = options.overrideStableID ?? null;
    this.localMode = options.localMode ?? false;
    this.initTimeoutMs =
      options.initTimeoutMs && options.initTimeoutMs >= 0
        ? options.initTimeoutMs
        : 3000;
    this.disableErrorLogging = options.disableErrorLogging ?? false;
    this.disableAutoMetricsLogging = options.disableAutoMetricsLogging ?? false;
    this.initializeValues = options.initializeValues ?? null;
    let eventLoggingApi =
      options.eventLoggingApi ?? options.api ?? DEFAULT_EVENT_LOGGING_API;
    this.eventLoggingApi = eventLoggingApi.endsWith('/')
      ? eventLoggingApi
      : eventLoggingApi + '/';
    this.prefetchUsers = options.prefetchUsers ?? [];
    this.disableLocalStorage = options.disableLocalStorage ?? false;
    this.initCompletionCallback = options.initCompletionCallback ?? null;
  }

  getApi(): string {
    return this.api;
  }

  getEnvironment(): UpstreamEnvironment | null {
    return this.environment;
  }

  getDisableCurrentPageLogging(): boolean {
    return this.disableCurrentPageLogging;
  }

  getLoggingIntervalMillis(): number {
    return this.loggingIntervalMillis;
  }

  getLoggingBufferMaxSize(): number {
    return this.loggingBufferMaxSize;
  }

  getDisableNetworkKeepalive(): boolean {
    return this.disableNetworkKeepalive;
  }

  getOverrideStableID(): string | null {
    return this.overrideStableID;
  }

  getLocalModeEnabled(): boolean {
    return this.localMode;
  }

  getInitTimeoutMs(): number {
    return this.initTimeoutMs;
  }

  getDisableErrorLogging(): boolean {
    return this.disableErrorLogging;
  }

  getDisableAutoMetricsLogging(): boolean {
    return this.disableAutoMetricsLogging;
  }

  getEventLoggingApi(): string {
    return this.eventLoggingApi;
  }

  getPrefetchUsers(): UpstreamUser[] {
    return this.prefetchUsers;
  }

  getDisableLocalStorage(): boolean {
    return this.disableLocalStorage;
  }

  getInitCompletionCallback(): InitCompletionCallback | null {
    return this.initCompletionCallback;
  }

  private normalizeNumberInput(
    input: number | undefined,
    bounds: BoundedNumberInput,
  ): number {
    if (input == null) {
      return bounds.default;
    }
    return Math.max(Math.min(input, bounds.max), bounds.min);
  }
}
