import type { UpstreamUser } from './UpstreamUser';

export default class LogEvent {
  private eventName: string;
  private user: UpstreamUser | null = null;
  private value: string | number | null = null;
  private metadata: object | null = null;
  private time: number;
  private upstreamMetadata: Record<string, string | number>;
  private secondaryExposures?: Record<string, string>[];

  public constructor(eventName: string) {
    this.eventName = eventName;
    this.upstreamMetadata = {};
    this.time = Date.now();
  }

  public getName() {
    return this.eventName;
  }

  public setValue(value: string | number | null) {
    this.value = value;
  }

  public setMetadata(metadata: object | null) {
    this.metadata = metadata;
  }

  public addUpstreamMetadata(key: string, value: string | number) {
    this.upstreamMetadata[key] = value;
  }

  public setUser(newUser: UpstreamUser | null) {
    // Need to remove private attributes from logs and also keep in the original user for evaluations.
    this.user = { ...newUser };
    delete this.user.privateAttributes;
  }

  public setSecondaryExposures(exposures: Record<string, string>[] = []) {
    this.secondaryExposures = exposures;
  }

  public toJsonObject(): Record<string, any> {
    return {
      eventName: this.eventName,
      user: this.user,
      value: this.value,
      metadata: this.metadata,
      time: this.time,
      upstreamMetadata: this.upstreamMetadata,
      secondaryExposures: this.secondaryExposures ?? undefined,
    };
  }
}
