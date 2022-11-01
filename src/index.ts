import { UpstreamUninitializedError } from "./Errors";
import UpstreamClient from "./UpstreamClient";
import UpstreamRuntime from "./UpstreamRuntime";
import { UpstreamOptions } from "./UpstreamSDKOptions";
import { UpstreamUser } from "./UpstreamUser";

export default class Upstream {
  private static instance: UpstreamClient | null = null;

  static get encodeIntializeCall(): boolean {
    return UpstreamRuntime.encodeInitializeCall;
  }

  static set encodeIntializeCall(value: boolean) {
    UpstreamRuntime.encodeInitializeCall = value;
  }

  private constructor() { }

  public static async initialize(
    sdkKey: string,
    user?: UpstreamUser | null,
    options?: UpstreamOptions | null
  ): Promise<void> {

    const inst = Upstream.instance ?? new UpstreamClient(sdkKey, user, options);

    if (!Upstream.instance) { Upstream.instance = inst; }
    return inst.initializeAsync();
  }

  public static getClientX(): UpstreamClient {
    if (!Upstream.instance) {
      throw new UpstreamUninitializedError();
    }
    return Upstream.instance;
  }

  public static checkGate(gateName: string, ignoreOverrides: boolean = false,): boolean {
    return Upstream.getClientX().checkGate(gateName, ignoreOverrides);
  }

}
