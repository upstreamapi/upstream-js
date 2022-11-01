import { IHasUpstreamInternal, UpstreamOverrides } from './UpstreamClient';
import { INTERNAL_STORE_KEY, OVERRIDES_STORE_KEY, STICKY_DEVICE_EXPERIMENTS_KEY, } from './utils/Constants';
import { getHashValue } from './utils/Hashing';
import UpstreamAsyncStorage from './utils/UpstreamAsyncStorage';
import UpstreamLocalStorage from './utils/UpstreamLocalStorage';

export enum EvaluationReason {
  Network = 'Network',
  Bootstrap = 'Bootstrap',
  Cache = 'Cache',
  Prefetch = 'Prefetch',
  Sticky = 'Sticky',
  LocalOverride = 'LocalOverride',
  Unrecognized = 'Unrecognized',
  Uninitialized = 'Uninitialized',
  Error = 'Error',
}

export type EvaluationDetails = {
  time: number;
  reason: EvaluationReason;
};

type APIFeatureGate = {
  name: string;
  value: boolean;
  rule_id: string;
  secondary_exposures: [];
};

type APIDynamicConfig = {
  name: string;
  value: { [key: string]: unknown };
  rule_id: string;
  secondary_exposures: [];
  is_device_based?: boolean;
  is_user_in_experiment?: boolean;
  is_experiment_active?: boolean;
  allocated_experiment_name: string | null;
  undelegated_secondary_exposures?: [];
  explicit_parameters?: string[];
};

type APIInitializeData = {
  dynamic_configs: Record<string, APIDynamicConfig | undefined>;
  feature_gates: Record<string, APIFeatureGate | undefined>;
  layer_configs: Record<string, APIDynamicConfig | undefined>;
};

type APIInitializeDataWithPrefetchedUsers = APIInitializeData & {
  prefetched_user_values?: Record<string, APIInitializeData>;
};

type UserCacheValues = APIInitializeDataWithPrefetchedUsers & {
  sticky_experiments: Record<string, APIDynamicConfig | undefined>;
  time: number;
  evaluation_time?: number;
};

const MAX_USER_VALUE_CACHED = 10;

export default class UpstreamStore {
  private sdkInternal: IHasUpstreamInternal;
  private overrides: UpstreamOverrides = { gates: {}, };
  private loaded: boolean;
  private values: Record<string, UserCacheValues | undefined>;
  private userValues: UserCacheValues;
  private stickyDeviceExperiments: Record<string, APIDynamicConfig>;
  private userCacheKey: string;
  private reason: EvaluationReason;

  public constructor(sdkInternal: IHasUpstreamInternal) {
    this.sdkInternal = sdkInternal;
    this.userCacheKey = this.sdkInternal.getCurrentUserCacheKey();
    console.log('userCacheKey::', this.userCacheKey)
    this.values = {};
    this.userValues = {
      feature_gates: {},
      dynamic_configs: {},
      sticky_experiments: {},
      layer_configs: {},
      time: 0,
      evaluation_time: 0,
    };
    this.stickyDeviceExperiments = {};
    this.loaded = false;
    this.reason = EvaluationReason.Uninitialized;
    this.loadFromLocalStorage();
  }

  public updateUser(isUserPrefetched: boolean): boolean {
    this.userCacheKey = this.sdkInternal.getCurrentUserCacheKey();
    return this.setUserValueFromCache(isUserPrefetched);
  }

  public async loadFromAsyncStorage(): Promise<void> {
    this.parseCachedValues(
      await UpstreamAsyncStorage.getItemAsync(INTERNAL_STORE_KEY),
      await UpstreamAsyncStorage.getItemAsync(STICKY_DEVICE_EXPERIMENTS_KEY),
    );
    this.loaded = true;
  }

  public bootstrap(initializeValues: Record<string, any>): void {

    console.log('bootstrapp init values::', initializeValues)

    const key = this.sdkInternal.getCurrentUserCacheKey();
    // clients are going to assume that the SDK is bootstraped after this method runs
    // if we fail to parse, we will fall back to defaults, but we dont want to throw
    // when clients try to check gates/configs/etc after this point
    this.loaded = true;
    try {
      this.userValues.feature_gates = initializeValues.feature_gates ?? {};
      this.userValues.dynamic_configs = initializeValues.dynamic_configs ?? {};
      this.userValues.layer_configs = initializeValues.layer_configs ?? {};
      this.userValues.evaluation_time = Date.now();
      this.userValues.time = Date.now();
      this.values[key] = this.userValues;
      this.reason = EvaluationReason.Bootstrap;
      this.loadOverrides();
    } catch (_e) {
      return;
    }
  }

  private loadFromLocalStorage(): void {
    if (UpstreamAsyncStorage.asyncStorage) {
      console.log('asyncStorage::', UpstreamAsyncStorage.asyncStorage)
      return;
    }
    this.parseCachedValues(
      UpstreamLocalStorage.getItem(INTERNAL_STORE_KEY),
      UpstreamLocalStorage.getItem(STICKY_DEVICE_EXPERIMENTS_KEY),
    );
    this.loaded = true;
  }

  public isLoaded(): boolean {
    return this.loaded;
  }

  private parseCachedValues(
    allValues: string | null,
    deviceExperiments: string | null,
  ): void {
    console.log('parseCachedValue::', this.parseCachedValues)
    try {
      this.values = allValues ? JSON.parse(allValues) : this.values;
      this.setUserValueFromCache();
    } catch (e) {
      // Cached value corrupted, remove cache
      this.removeFromStorage(INTERNAL_STORE_KEY);
    }

    try {
      const deviceExpParsed = deviceExperiments
        ? JSON.parse(deviceExperiments)
        : null;
      if (deviceExpParsed) {
        this.stickyDeviceExperiments = deviceExpParsed;
      }
    } catch (e) {
      this.removeFromStorage(STICKY_DEVICE_EXPERIMENTS_KEY);
    }

    this.loadOverrides();
  }

  private setUserValueFromCache(isUserPrefetched: boolean = false): boolean {
    let cachedValues = this.values[this.userCacheKey];
    if (cachedValues == null) {
      this.resetUserValues();
      this.reason = EvaluationReason.Uninitialized;
      return false;
    }

    this.userValues = cachedValues;
    this.reason = isUserPrefetched
      ? EvaluationReason.Prefetch
      : EvaluationReason.Cache;
    return true;
  }

  private removeFromStorage(key: string) {
    UpstreamAsyncStorage.removeItemAsync(key);
    UpstreamLocalStorage.removeItem(key);
  }

  private loadOverrides(): void {
    const overrides = UpstreamLocalStorage.getItem(OVERRIDES_STORE_KEY);
    if (overrides != null) {
      try {
        this.overrides = JSON.parse(overrides);
      } catch (e) {
        UpstreamLocalStorage.removeItem(OVERRIDES_STORE_KEY);
      }
    }
  }

  public async save(
    requestedUserCacheKey: string | null,
    jsonConfigs: Record<string, any>,
  ): Promise<void> {
    const data = jsonConfigs as APIInitializeDataWithPrefetchedUsers;

    console.log('responsedata <str,any>::', data)
    console.log('requestedUserCacheKey <str>::', requestedUserCacheKey)
    console.log('objectvalues::', this.values)

    if (data.prefetched_user_values) {
      console.log('prefetcheduservalues::')
      const cacheKeys = Object.keys(data.prefetched_user_values);
      for (const key of cacheKeys) {
        const prefetched = data.prefetched_user_values[key];
        this.values[key] = this.convertAPIDataToCacheValues(prefetched, key);
      }
    }

    if (requestedUserCacheKey) {
      console.log('requestedUserCacheKey::', requestedUserCacheKey)
      const requestedUserValues = this.convertAPIDataToCacheValues(
        data,
        requestedUserCacheKey,
      );

      console.log('requesteduservalue::', requestedUserValues)

      this.values[requestedUserCacheKey] = requestedUserValues;

      if (requestedUserCacheKey == this.userCacheKey) {
        this.userValues = requestedUserValues;
        this.reason = EvaluationReason.Network;
      }
    }

    // trim values to only have the max allowed
    const filteredValues = Object.entries(this.values)
      .sort(({ 1: a }, { 1: b }) => {
        if (a == null) {
          return 1;
        }
        if (b == null) {
          return -1;
        }
        return b?.time - a?.time;
      })
      .slice(0, MAX_USER_VALUE_CACHED);
    this.values = Object.fromEntries(filteredValues);
    if (UpstreamAsyncStorage.asyncStorage) {
      await UpstreamAsyncStorage.setItemAsync(
        INTERNAL_STORE_KEY,
        JSON.stringify(this.values),
      );
    } else {
      UpstreamLocalStorage.setItem(
        INTERNAL_STORE_KEY,
        JSON.stringify(this.values),
      );
    }
  }

  public checkGate(
    gateName: string,
    ignoreOverrides: boolean = false,
  ): boolean {
    const gateNameHash = getHashValue(gateName);
    console.log('gatename::', gateName)
    console.log('gatehash::', gateNameHash)
    console.log('userValue::', this.userValues)
    // let gateValue = { value: false, rule_id: '' }; //default
    let gateValue = { value: false, rule_id: '', secondary_exposures: [] }; // original
    console.log('gatevalueDefault::', gateValue)
    let details: EvaluationDetails; // this is specifying type of details

    if (!ignoreOverrides && this.overrides.gates[gateName] != null) {
      console.log('ignoreOverridesActive::')
      gateValue = {
        value: this.overrides.gates[gateName],
        rule_id: 'override',
        secondary_exposures: []
      };
      details = this.getEvaluationDetails( false, EvaluationReason.LocalOverride,);
    }
    else {
      // let value = this.userValues?.feature_gates[gateNameHash]; hash provenance is unclear
      let value = this.userValues?.feature_gates[gateName];
      console.log('userValues::', this.userValues)
      if (value) {
        gateValue = value;
      }
      details = this.getEvaluationDetails(value != null);
    }

    console.log('gateValue::value::', gateValue.value)

    this.sdkInternal.getLogger().logGateExposure(
        this.sdkInternal.getCurrentUser(),
        gateName,
        gateValue.value,
        gateValue.rule_id,
        gateValue.secondary_exposures,
        details);

    return gateValue.value === true;
  }

  public overrideGate(gateName: string, value: boolean): void {
    this.overrides.gates[gateName] = value;
    this.saveOverrides();
  }

  public removeGateOverride(gateName?: string): void {
    if (gateName == null) {
      this.overrides.gates = {};
    } else {
      delete this.overrides.gates[gateName];
    }
    this.saveOverrides();
  }

  public getAllOverrides(): UpstreamOverrides {
    return this.overrides;
  }

  private saveOverrides(): void {
    try {
      UpstreamLocalStorage.setItem(
        OVERRIDES_STORE_KEY,
        JSON.stringify(this.overrides),
      );
    } catch (e) {
      console.warn('Failed to persist gate/config overrides');
    }
  }

  public getGlobalEvaluationDetails(): EvaluationDetails {
    return {
      reason: this.reason ?? EvaluationReason.Uninitialized,
      time: this.userValues.evaluation_time ?? 0,
    };
  }

  private getEvaluationDetails(
    valueExists: Boolean,
    reasonOverride?: EvaluationReason,
  ): EvaluationDetails {
    if (valueExists) {
      return {
        reason: this.reason,
        time: this.userValues.evaluation_time ?? Date.now(),
      };
    } else {
      return {
        reason:
          reasonOverride ??
          (this.reason == EvaluationReason.Uninitialized
            ? EvaluationReason.Uninitialized
            : EvaluationReason.Unrecognized),
        time: Date.now(),
      };
    }
  }

  private resetUserValues() {
    this.userValues = {
      feature_gates: {},
      dynamic_configs: {},
      sticky_experiments: {},
      layer_configs: {},
      time: 0,
      evaluation_time: 0,
    };
  }

  private convertAPIDataToCacheValues(
    data: APIInitializeData,
    cacheKey: string,
  ): UserCacheValues {
    console.log('initdata::', data)
    console.log('initfeaturegates::', data.feature_gates)
    // Specifically pulling keys from data here to avoid pulling in unwanted keys

    return {
      feature_gates: data.feature_gates,
      layer_configs: data.layer_configs,
      dynamic_configs: data.dynamic_configs,
      sticky_experiments: this.values[cacheKey]?.sticky_experiments ?? {},
      time: Date.now(),
      evaluation_time: Date.now(),
    };
  }
}
