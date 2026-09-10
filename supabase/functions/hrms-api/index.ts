import app from './app.js';

const FUNCTION_PREFIX = '/functions/v1/hrms-api';

function headersObject(headers: Headers) {
  const out: Record<string,string> = {};
  headers.forEach((v,k)=>out[k.toLowerCase()] = v);
  return out;
}

async function parsedBody(req: Request): Promise<any> {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return undefined;
  const type = req.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const text = await req.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return {}; }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    const text = await req.text();
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
  return {};
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type, authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    }});
  }

  const incoming = new URL(request.url);
  let pathname = incoming.pathname;
  // Hosted Edge Functions expose the request to user code as /hrms-api/...
  // while some local/proxy environments preserve /functions/v1/hrms-api/....
  // Support both so the same source works locally and behind the Vercel rewrite.
  const prefixes = [FUNCTION_PREFIX, '/hrms-api'];
  for (const prefix of prefixes) {
    if (pathname.startsWith(prefix)) {
      pathname = pathname.slice(prefix.length) || '/';
      break;
    }
  }
  // Vercel rewrites /api/* to /functions/v1/hrms-api/api/*, preserving the API path.
  const fakeReq: any = {
    method: request.method,
    url: pathname + incoming.search,
    headers: headersObject(request.headers),
    body: await parsedBody(request)
  };

  return await new Promise<Response>((resolve) => {
    const responseHeaders = new Headers();
    let ended = false;
    const fakeRes: any = {
      statusCode: 200,
      headersSent: false,
      writableEnded: false,
      setHeader(name: string, value: any) {
        if (String(name).toLowerCase() === 'set-cookie' && Array.isArray(value)) {
          for (const v of value) responseHeaders.append(name, String(v));
        } else responseHeaders.set(name, String(value));
      },
      getHeader(name: string) { return responseHeaders.get(name); },
      end(data?: any) {
        if (ended) return;
        ended = true;
        this.writableEnded = true;
        this.headersSent = true;
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        resolve(new Response(data == null ? null : String(data), { status: this.statusCode || 200, headers: responseHeaders }));
      }
    };
    app(fakeReq, fakeRes);
  });
});
