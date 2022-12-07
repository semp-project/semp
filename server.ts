import * as server from "./system.ts";
import * as user from "./user.ts";
import { Application } from "./application.ts";
import { hex, HttpError } from "./deps.ts";

const NotFound = new Response(null, { status: 404 });
const CORSHeaders = {
  "access-control-allow-origin": "*",
};

export function handle(app: Application) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: CORSHeaders });
    }

    const uri = new URL(req.url);

    const cl = parseInt(req.headers.get("content-length")!);
    if (cl > app.bodyLimit) {
      return respondJson(
        {
          error: "Body too large",
          description: `Content length out of limit: ${app.bodyLimit}`,
        },
        {},
        400,
      );
    }

    const subject = uri.pathname.slice(1);

    try {
      if (subject === "~") {
        // handle server operations
        switch (req.method) {
          case "GET":
            return respondJson(await server.status(req, app));
          case "PATCH":
            return respondJson(await server.update(req, app));
          case "PUT":
            return respondJson(await server.createUser(req, app));
          case "POST":
            return respondJson(await server.exchange(req, app));
        }
      }

      if (subject.match(/^[a-z0-9][a-z0-9_]+$/i)) {
        // handle user operations
        switch (req.method) {
          case "GET":
            return respondJson(await user.getUser(req, app));
          case "POST":
            return respondJson(await user.getMessage(req, app));
          case "PUT":
            return respondJson(await user.send(req, app));
          case "PATCH":
            return respondJson(await user.updateUser(req, app));
        }
      }
    } catch (err) {
      if (err instanceof HttpError) {
        return err.toResponse();
      } else {
        return respondJson({ error: err.message }, {}, 400);
      }
    }

    return NotFound;
  };
}

function JSONFormater(_key: string, val: unknown) {
  if (typeof val === "bigint") {
    return parseInt(val.toString());
  } else if (val instanceof Uint8Array) {
    return hex.encode(val);
  } else {
    return val;
  }
}

function respondJson(data: unknown, headers?: HeadersInit, status = 200) {
  if (data instanceof Response) return data;
  return new Response(
    JSON.stringify(data, JSONFormater),
    {
      status,
      headers: {
        ...headers,
        ...CORSHeaders,
        "content-type": "application/json",
      },
    },
  );
}
