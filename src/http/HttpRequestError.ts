export class HttpRequestError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
    public readonly responseBody: string
  ) {
    super(message);
    this.name = "HttpRequestError";
  }
}
