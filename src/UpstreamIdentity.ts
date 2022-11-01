import { v4 as uuidv4 } from 'uuid';
import { UPSTREAM_STABLE_ID_KEY } from './utils/Constants';
import AsyncStorage from './utils/UpstreamAsyncStorage';
import LocalStorage from './utils/UpstreamLocalStorage';

import { _SDKPackageInfo } from './UpstreamClient';
import { UpstreamUser } from './UpstreamUser';

export type DeviceInfo = {
  getVersion(): string | null;
  getSystemVersion(): string | null;
  getSystemName(): string | null;
  getModel(): string | null;
  getDeviceId(): string | null;
};

export type ExpoConstants = {
  nativeAppVersion: string | null;
  nativeBuildVersion: string | null;
};

export type ExpoDevice = {
  osVersion: string | null;
  osName: string | null;
  modelName: string | null;
  modelId: string | null;
};

export type NativeModules = {
  I18nManager?: { localeIdentifier: string; } | null;
  SettingsManager?: {
    settings: {
      AppleLocale: string | null;
      AppleLanguages: string[];
    } | null;
  } | null;
};

export type Platform = {
  OS?: {
    toLocaleLowerCase: () => string;
  } | null;
};

export type UUID = {
  v4(): string | number[];
};

type Metadata = {
  sessionID: string;
  sdkType: string;
  sdkVersion: string;
  stableID?: string;
  locale?: string;
  appVersion?: string;
  systemVersion?: string;
  systemName?: string;
  deviceModelName?: string;
  deviceModel?: string;
};

export default class UpstreamIdentity {
  private user: UpstreamUser | null;
  private upstreamMetadata: Metadata;
  private platform: Platform | null = null;
  private nativeModules: NativeModules | null = null;
  private reactNativeUUID?: UUID;
  private sdkType: string = 'js-client';
  private sdkVersion: string;

  public constructor(
    user: UpstreamUser | null,
    overrideStableID?: string | null,
    reactNativeUUID?: UUID,
  ) {
    this.reactNativeUUID = reactNativeUUID;
    this.user = user;
    this.sdkVersion = require('../package.json')?.version ?? '';
    this.upstreamMetadata = {
      sessionID: this.getUUID(),
      sdkType: this.sdkType,
      sdkVersion: this.sdkVersion,
    };

    let stableID = overrideStableID;
    if (!AsyncStorage.asyncStorage) {
      stableID =
        stableID ??
        LocalStorage.getItem(UPSTREAM_STABLE_ID_KEY) ??
        this.getUUID();
      LocalStorage.setItem(UPSTREAM_STABLE_ID_KEY, stableID);
    }
    if (stableID) {
      this.upstreamMetadata.stableID = stableID;
    }
  }

  public async initAsync(): Promise<UpstreamIdentity> {
    let stableID: string | null | undefined = this.upstreamMetadata.stableID;
    if (!stableID) {
      stableID = await AsyncStorage.getItemAsync(UPSTREAM_STABLE_ID_KEY);
      stableID = stableID ?? this.getUUID();
    }
    AsyncStorage.setItemAsync(UPSTREAM_STABLE_ID_KEY, stableID);
    this.upstreamMetadata.stableID = stableID;
    return this;
  }

  public getSDKType(): string {
    return this.sdkType;
  }

  public getSDKVersion(): string {
    return this.sdkVersion;
  }

  public getUpstreamMetadata(): Record<string, string> {
    this.upstreamMetadata.sdkType = this.sdkType;
    this.upstreamMetadata.sdkVersion = this.sdkVersion;
    return this.upstreamMetadata;
  }

  public getUser(): UpstreamUser | null {
    return this.user;
  }

  public updateUser(user: UpstreamUser | null): void {
    this.user = user;
    this.upstreamMetadata.sessionID = this.getUUID();
  }

  public setSDKPackageInfo(SDKPackageInfo: _SDKPackageInfo): void {
    this.sdkType = SDKPackageInfo.sdkType;
    this.sdkVersion = SDKPackageInfo.sdkVersion;
  }

  public setPlatform(platform: Platform): void {
    this.platform = platform;
    this.updateMetadataFromNativeModules();
  }

  public setNativeModules(nativeModules: NativeModules): void {
    this.nativeModules = nativeModules;
    this.updateMetadataFromNativeModules();
  }

  private updateMetadataFromNativeModules(): void {
    if (this.platform == null || this.nativeModules == null) {
      return;
    }

    if (this.platform.OS?.toLocaleLowerCase() === 'android') {
      this.upstreamMetadata.locale =
        this.nativeModules.I18nManager?.localeIdentifier;
    } else if (this.platform.OS?.toLocaleLowerCase() === 'ios') {
      this.upstreamMetadata.locale =
        this.nativeModules.SettingsManager?.settings?.AppleLocale ||
        this.nativeModules.SettingsManager?.settings?.AppleLanguages[0];
    }
  }

  private getUUID(): string {
    return (this.reactNativeUUID?.v4() as string) ?? uuidv4();
  }

  public setRNDeviceInfo(deviceInfo: DeviceInfo): void {
    this.upstreamMetadata.appVersion = deviceInfo.getVersion() ?? ''; // e.g. 1.0.1
    this.upstreamMetadata.systemVersion = deviceInfo.getSystemVersion() ?? ''; // Android: "4.0.3"; iOS: "12.3.1"
    this.upstreamMetadata.systemName = deviceInfo.getSystemName() ?? ''; // e.g. Android, iOS, iPadOS
    this.upstreamMetadata.deviceModelName = deviceInfo.getModel() ?? ''; // e.g. Pixel 2, iPhone XS
    this.upstreamMetadata.deviceModel = deviceInfo.getDeviceId() ?? ''; // e.g. iPhone7,2
  }

  public setExpoConstants(expoConstants: ExpoConstants): void {
    this.upstreamMetadata.appVersion =
      expoConstants.nativeAppVersion ?? expoConstants.nativeBuildVersion ?? ''; // e.g. 1.0.1
  }

  public setExpoDevice(expoDevice: ExpoDevice): void {
    this.upstreamMetadata.systemVersion = expoDevice.osVersion ?? ''; // Android: "4.0.3"; iOS: "12.3.1"
    this.upstreamMetadata.systemName = expoDevice.osName ?? ''; // e.g. Android, iOS, iPadOS
    this.upstreamMetadata.deviceModelName = expoDevice.modelName ?? ''; // e.g. Pixel 2, iPhone XS
    this.upstreamMetadata.deviceModel = expoDevice.modelId ?? ''; // e.g. iPhone7,2
  }
}
