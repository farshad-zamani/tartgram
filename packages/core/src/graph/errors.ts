/** Structured error for a failed Graph API call. */
export class GraphApiError extends Error {
  readonly httpStatus: number;
  readonly code?: number;
  readonly subcode?: number;
  readonly fbtraceId?: string;
  readonly type?: string;

  constructor(args: {
    message: string;
    httpStatus: number;
    code?: number;
    subcode?: number;
    fbtraceId?: string;
    type?: string;
  }) {
    super(args.message);
    this.name = "GraphApiError";
    this.httpStatus = args.httpStatus;
    this.code = args.code;
    this.subcode = args.subcode;
    this.fbtraceId = args.fbtraceId;
    this.type = args.type;
  }

  /** Rate limiting: code 4 (app), 17 (user), 32/613 (page/throughput), HTTP 429. */
  get isRateLimit(): boolean {
    return (
      this.httpStatus === 429 || [4, 17, 32, 613].includes(this.code ?? -1)
    );
  }

  /** Token invalid/expired: code 190 (with various subcodes) or OAuthException. */
  get isTokenExpired(): boolean {
    return this.code === 190 || this.type === "OAuthException";
  }

  /**
   * Outside the allowed messaging window (e.g. code 10, subcode 2534022 / 2018278) — the caller
   * should stop trying free-form sends and, where applicable, fall back to a permitted tag.
   */
  get isOutsideWindow(): boolean {
    return (
      this.code === 10 && (this.subcode === 2534022 || this.subcode === 2018278)
    );
  }
}
