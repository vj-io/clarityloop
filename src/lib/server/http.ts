// Route plumbing: uniform `{ error: code }` JSON, zod bodies, no stack traces leaked.
import { z, ZodError } from "zod";

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}
export const fail = (status: number, code: string, message?: string): never => { throw new HttpError(status, code, message); };
export const forbidden = (): never => fail(403, "forbidden");
export const notFound = (): never => fail(404, "not_found");

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export function route<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, ...(e.message !== e.code ? { message: e.message } : {}) }, e.status);
      if (e instanceof ZodError) return json({ error: "invalid", message: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, 400);
      console.error("[api]", req.method, new URL(req.url).pathname, e);
      return json({ error: "internal" }, 500);
    }
  };
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try { raw = await req.json(); } catch { return fail(400, "invalid", "body must be JSON"); }
  return schema.parse(raw);
}

/** Dynamic segment from Next 16's promised params. */
export async function idParam(ctx: { params: Promise<{ id: string }> }): Promise<string> {
  const { id } = await ctx.params;
  return z.uuid().safeParse(id).success ? id : notFound();
}
