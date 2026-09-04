export interface Env {
  DOCS_ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.DOCS_ASSETS.fetch(new Request(request));
  },
};
