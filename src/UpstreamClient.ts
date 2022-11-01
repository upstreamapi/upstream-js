import ErrorBoundary from "./ErrorBoundary.js";
import UpstreamNetwork from "./Network.js";
import UpstreamSDKOptions, { UpstreamOptions } from "./UpstreamSDKOptions.js";
import UpstreamStore from "./UpstreamStore.js";
import UpstreamIdentity from "./UpstreamIdentity.js";
import UpstreamLogger from "./UpstreamLogger.js";
import { UpstreamUser } from "./UpstreamUser.js";
import { getUserCacheKey } from "./utils/Hashing.js";
import { AppState, AppStateStatus } from "./AppStates.js";
import UpstreamAsyncStorage from "./utils/UpstreamAsyncStorage.js";
import { UpstreamInvalidArgumentError, UpstreamUninitializedError } from "./Errors.js";

export type _SDKPackageInfo = { sdkType: string; sdkVersion: string; };

export interface IUpstream {
    initializeAsync(): Promise<void>;
    checkGate(gateName: string, ignoreOverrides?: boolean): boolean;
    // shutdown(): void; 
    // overrideGate(gateName: string, value: boolean): void; // means will return void
    // removeGateOverride(gateName?: string): void;
}

export interface IHasUpstreamInternal {
    getSDKKey(): string;
    getErrorBoundary(): ErrorBoundary;
    getNetwork(): UpstreamNetwork;
    getOptions(): UpstreamSDKOptions;
    getStore(): UpstreamStore;
    getCurrentUser(): UpstreamUser | null;
    getCurrentUserCacheKey(): string; // May not be required
    getLogger(): UpstreamLogger;
    getUpstreamMetadata(): Record<string, string | number>;
    getSDKType(): string;
    getSDKVersion(): string;
}

export type UpstreamOverrides = {
    gates: Record<string, boolean>;
};

export default class UpstreamClient implements IUpstream, IHasUpstreamInternal {
    // FIELD DECLARATION
    private ready: boolean;
    private appState: AppState | null = null;
    private currentAppState: AppStateStatus | null = null;
    private initCalled: boolean = false;
    private pendingInitPromise: Promise<void> | null = null;
    private errorBoundary: ErrorBoundary;
    private sdkKey: string | null;
    private identity: UpstreamIdentity;
    private network: UpstreamNetwork;
    private options: UpstreamSDKOptions;
    private store: UpstreamStore;
    private logger: UpstreamLogger;

    // CONSTRUCTOR 
    public constructor(
        sdkKey: string,
        user?: UpstreamUser | null,
        options?: UpstreamOptions | null
    ) {
        if (typeof sdkKey !== 'string' || !sdkKey.startsWith('sk-')) {
            throw new Error('Invalid key provided.  You must use a Client SDK Key from Upstream dashboard to initialize the sdk.',);
        }
        this.errorBoundary = new ErrorBoundary(sdkKey);
        this.ready = false;
        this.sdkKey = sdkKey;
        this.options = new UpstreamSDKOptions(options);
        this.identity = new UpstreamIdentity(
            this.normalizeUser(user ?? null),
            this.options.getOverrideStableID())

        this.network = new UpstreamNetwork(this);
        this.store = new UpstreamStore(this);
        this.logger = new UpstreamLogger(this);

        if (options?.initializeValues != null) {
            this.setInitializeValues(options?.initializeValues);
        }
        this.errorBoundary.setUpstreamMetadata(this.getUpstreamMetadata());
    }

    // GET METHODS 
    public initializeCalled(): boolean {
        return this.initCalled
    }

    public getErrorBoundary(): ErrorBoundary {
        return this.errorBoundary;
    }

    public getSDKKey(): string {
        if (this.sdkKey == null) { return ''; }
        return this.sdkKey;
    }

    public getCurrentUser(): UpstreamUser | null {
        return this.identity.getUser();
    }

    public getNetwork(): UpstreamNetwork {
        return this.network;
    }

    public getOptions(): UpstreamSDKOptions {
        return this.options;
    }

    public getStore(): UpstreamStore {
        return this.store;
    }

    public getLogger(): UpstreamLogger {
        return this.logger;
    }

    public getCurrentUserCacheKey(): string {
        return getUserCacheKey(this.getStableID(),this.getCurrentUser());
    }

    public getUpstreamMetadata(): Record<string, string | number> {
        return this.identity.getUpstreamMetadata();
    }

    public getSDKType(): string {
        return this.identity.getSDKType();
    }

    public getSDKVersion(): string {
        return this.identity.getSDKVersion();
    }

    public getStableID(): string {
        return this.errorBoundary.capture(
            'getStableID',
            () => this.identity.getUpstreamMetadata().stableID,
            () => '',
        );
    }

    // HELPER FUNCS
    private normalizeUser(user: UpstreamUser | null): UpstreamUser {
        let userCopy = JSON.parse(JSON.stringify(user));
        if (this.options.getEnvironment() != null) {
            // @ts-ignore
            userCopy.upstreamEnvironment = this.options.getEnvironment();
        }
        return userCopy;
    }

    private handleAppStateChange(nextAppState: AppStateStatus): void {
        if (
            this.currentAppState === 'active' &&
            nextAppState.match(/inactive|background/)
        ) {
            this.logger.flush(true);
        } else if (
            this.currentAppState?.match(/inactive|background/) &&
            nextAppState === 'active'
        ) {
            this.logger.sendSavedRequests();
        }
        this.currentAppState = nextAppState;
    }

    // CRITICAL FUNCTIONALITY

    public async initializeAsync(): Promise<void> {
        console.log('initAsync::')

        return this.errorBoundary.capture(
            'initializeAsync',
            async () => {
                const startTime = Date.now();
                if (this.pendingInitPromise != null) {
                    return this.pendingInitPromise;
                }
                if (this.ready) {
                    return Promise.resolve();
                }
                this.initCalled = true;
                if (UpstreamAsyncStorage.asyncStorage) {
                    await this.identity.initAsync();
                    await this.store.loadFromAsyncStorage();
                }
                if (
                    this.appState &&
                    this.appState.addEventListener &&
                    typeof this.appState.addEventListener === 'function'
                ) {
                    this.currentAppState = this.appState.currentState;
                    this.appState.addEventListener(
                        'change',
                        this.handleAppStateChange.bind(this)
                    );
                }
                if (this.options.getLocalModeEnabled()) {
                    return Promise.resolve()
                }
                const completionCallback = (
                    success: boolean,
                    message: string | null,
                ) => {
                    const cb = this.options.getInitCompletionCallback();
                    if (cb) {
                        cb(Date.now() - startTime, success, message);
                    }
                };
                this.pendingInitPromise = this.fetchAndSaveValues(
                    this.identity.getUser(),
                    completionCallback,
                ).finally(async () => {
                    this.pendingInitPromise = null;
                    this.ready = true;
                    this.logger.sendSavedRequests();
                });
            },
            () => {
                this.ready = true;
                this.initCalled = true;
                return Promise.resolve();
            },
        );
    }

    public setInitializeValues(initializeValues: Record<string, unknown>): void {

        console.log('setInitValues::',initializeValues)

        this.errorBoundary.capture(
            'setInitializeValues',
            () => {
                this.store.bootstrap(initializeValues);
                if (!this.ready) {
                    // the sdk is usable and considered initialized when configured
                    // with initializeValues
                    this.ready = true;
                    this.initCalled = true;
                }
                // we wont have access to window/document/localStorage if these run on the server
                // so try to run whenever this is called
                this.logger.sendSavedRequests();
            },
            () => {
                this.ready = true;
                this.initCalled = true;
            },
        );
    }

    private ensureStoreLoaded(): void {
        if (!this.store.isLoaded()) {
          throw new UpstreamUninitializedError(
            'Call and wait for initialize() to finish first.',
          );
        }
      }

    private async fetchAndSaveValues(
        user: UpstreamUser | null,
        completionCallback:
            | ((success: boolean, message: string | null) => void)
            | null = null,
    ): Promise<void> {
        console.log('fetchAndSaveValues::')
        return this.network
            .fetchValues(
                user,
                this.options.getInitTimeoutMs(),
                async (json: Record<string, any>): Promise<void> => {
                    return this.errorBoundary.swallow('fetchAndSaveValues', async () => {
                        await this.store.save(
                            getUserCacheKey(this.getStableID(), user),
                            json,
                        );
                    });
                },
                (e: Error) => { }
            )
            .then(() => {
                completionCallback?.(true, null);
            })
            .catch((e) => {
                completionCallback?.(false, e.message);
            });
    }

    // FETCH FROM UPSTREAM API
    public checkGate(gateName: string, ignoreOverrides: boolean = false,): boolean {
        return this.errorBoundary.capture(
            'checkGate',
            () => {
                this.ensureStoreLoaded();
                if (typeof gateName !== 'string' || gateName.length === 0) {
                    throw new UpstreamInvalidArgumentError(
                        'Must pass a valid string as the gateName.',
                    );
                }
                return this.store.checkGate(gateName, ignoreOverrides);
            },
            () => false,
        );
    }
}
