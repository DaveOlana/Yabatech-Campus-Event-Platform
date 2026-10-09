import supertest from "supertest";

const tokenByCookie = new Map<string, Promise<string>>();

function extractToken(html: string): string {
  const match = html.match(/data-csrf-token="([A-Za-z0-9_-]{43})"/);
  if (!match) throw new Error("CSRF token was not rendered");
  return match[1];
}

function secureAgent(app: Parameters<typeof supertest.agent>[0]): any {
  const agent: any = supertest.agent(app);
  async function csrfToken(): Promise<string> {
    const response = await agent.get("/login");
    return response.headers["x-csrf-token"] || extractToken(response.text);
  }
  function mutation(method: "post" | "put" | "patch" | "delete", path: string): any {
    const operations: Array<[string, unknown[]]> = [];
    let execution: Promise<any> | undefined;
    const execute = () => execution ||= (async () => {
      const normalized = operations.map(([name, originalArgs]) => {
        const args = [...originalArgs];
        if (name === "set" && args[0] === "Cookie" && Array.isArray(args[1])) args[1] = args[1].map((cookie) => String(cookie).split(";")[0]).join("; ");
        return [name, args] as [string, unknown[]];
      });
      const cookie = normalized.find(([name, args]) => name === "set" && args[0] === "Cookie")?.[1][1];
      let value: string;
      if (typeof cookie === "string") {
        let pending = tokenByCookie.get(cookie);
        if (!pending) {
          pending = agent.get("/login").set("Cookie", cookie).then((probe: any) => probe.headers["x-csrf-token"] || extractToken(probe.text));
          tokenByCookie.set(cookie, pending);
        }
        value = await pending;
      } else {
        value = await csrfToken();
      }
      let test: any = agent[method](path).set("X-CSRF-Token", value);
      for (const [name, args] of normalized) test = test[name](...args);
      return test;
    })();
    const proxy: any = new Proxy({}, {
      get(_target, property) {
        if (property === "then") return execute().then.bind(execute());
        if (property === "catch") return execute().catch.bind(execute());
        if (property === "finally") return execute().finally.bind(execute());
        return (...args: unknown[]) => { operations.push([String(property), args]); return proxy; };
      },
    });
    return proxy;
  }
  const wrapper: any = function () {};
  for (const method of ["get", "head", "options"]) wrapper[method] = (path: string) => agent[method](path);
  for (const method of ["post", "put", "patch", "delete"] as const) wrapper[method] = (path: string) => mutation(method, path);
  return wrapper;
}

const request: any = (app: Parameters<typeof supertest.agent>[0]) => secureAgent(app);
request.agent = (app: Parameters<typeof supertest.agent>[0]) => secureAgent(app);
export default request;
