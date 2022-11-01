import { UpstreamUninitializedError, UpstreamInvalidArgumentError, } from './Errors.js';

export const ExceptionEndpoint = 'http://127.0.0.1:3010/sdk_exception';

type ExtraDataExtractor = () => Promise<Record<string, unknown>>;

export default class ErrorBoundary {
  private sdkKey: string;
  private upstreamMetadata?: Record<string, string | number>;
  private seen = new Set<string>();

  constructor(sdkKey: string) {
    this.sdkKey = sdkKey;
  }

  setUpstreamMetadata(upstreamMetadata: Record<string, string | number>) {
    this.upstreamMetadata = upstreamMetadata;
  }

  swallow<T>(tag: string, task: () => T) {
    this.capture(tag, task, () => {
      return undefined;
    });
  }

  capture<T>( tag: string, task: () => T, recover: () => T, getExtraData?: ExtraDataExtractor,): T {
    try {
      const result = task();
      if (result instanceof Promise) {
        return (result as any).catch((e: unknown) => {
          return this.onCaught(tag, e, recover, getExtraData);
        });
      }
      return result;
    } catch (error) {
      return this.onCaught(tag, error, recover, getExtraData);
    }
  }

  private onCaught<T>(
    tag: string,
    error: unknown,
    recover: () => T,
    getExtraData?: ExtraDataExtractor,
  ): T {
    if (
      error instanceof UpstreamUninitializedError ||
      error instanceof UpstreamInvalidArgumentError
    ) {
      throw error; // Don't catch these
    }

    console.error('[Upstream] An unexpected exception occurred.', error);

    this.logError(tag, error, getExtraData);
    return recover();
  }

  private async logError(
    tag: string,
    error: unknown,
    getExtraData?: ExtraDataExtractor,
  ): Promise<void> {
    console.log('logerror::')
    try {
      const extra =
        typeof getExtraData === 'function' ? await getExtraData() : null;
      const unwrapped = (error ?? Error('[Upstream] Error was empty')) as any;
      const isError = unwrapped instanceof Error;
      const name = isError ? unwrapped.name : 'No Name';

      if (this.seen.has(name)) return;
      this.seen.add(name);

      const info = isError ? unwrapped.stack : this.getDescription(unwrapped);
      const metadata = this.upstreamMetadata ?? {};
      const body = JSON.stringify({
        tag,
        exception: name,
        info,
        upstreamMetadata: metadata,
        extra: extra ?? {},
      });
      fetch(ExceptionEndpoint, {
        method: 'POST',
        headers: {
          'UPSTREAM-API-KEY': this.sdkKey,
          'UPSTREAM-SDK-TYPE': String(metadata['sdkType']),
          'UPSTREAM-SDK-VERSION': String(metadata['sdkVersion']),
          'Content-Type': 'application/json',
          'Content-Length': `${body.length}`,
        },
        body,
      });
    } catch (_error) {
      /* noop */
    }
  }

  private getDescription(obj: any): string {
    try {
      return JSON.stringify(obj);
    } catch {
      return '[Upstream] Failed to get string for error.';
    }
  }
}
