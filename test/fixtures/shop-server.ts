import * as http from 'node:http';
import sharp from 'sharp';

/**
 * A shop, for tests. Started on 127.0.0.1 so url-policy's loopback rules apply
 * exactly as they would to a real address once IMPORT_ALLOW_PRIVATE_NETWORKS
 * is set — the flag under test is the one production leaves off.
 */
export interface ShopRequest {
  path: string;
  headers: http.IncomingHttpHeaders;
}

export interface ShopServer {
  origin: string;
  /** Every request the app made, so a test can assert what the shop was told. */
  requests: ShopRequest[];
  close: () => Promise<void>;
}

const productPage = (origin: string) => `<!doctype html>
<html><head>
<title>Wool Blend Coat | Northwind</title>
<meta property="og:site_name" content="Northwind">
<script type="application/ld+json">{
  "@context": "https://schema.org", "@type": "Product",
  "name": "Wool Blend Coat", "brand": {"@type":"Brand","name":"Northwind"},
  "color": "Beige", "size": "M", "category": "Women > Clothing > Coats",
  "image": ["${origin}/coat-1.jpg", "${origin}/coat-2.jpg"],
  "description": "A midweight coat in a wool blend.",
  "offers": {"@type":"Offer","price":"189","priceCurrency":"EUR"}
}</script>
</head><body><h1>Wool Blend Coat</h1></body></html>`;

const CHALLENGE = `<!doctype html><html><head><title>Just a moment...</title></head>
<body>Checking your browser</body></html>`;

const photo = (r: number, g: number, b: number) =>
  sharp({
    create: { width: 800, height: 1000, channels: 3, background: { r, g, b } },
  })
    .jpeg()
    .toBuffer();

export async function startShop(): Promise<ShopServer> {
  const requests: ShopRequest[] = [];
  const server = http.createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    requests.push({ path, headers: req.headers });
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    if (path === '/p/moved') {
      // Shops redirect constantly; the fetcher re-checks the policy per hop.
      res.writeHead(302, { location: `${origin}/p/wool-coat` });
      res.end();
    } else if (path === '/p/wool-coat') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(productPage(origin));
    } else if (path === '/p/blocked') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(CHALLENGE);
    } else if (path === '/p/refused') {
      res.writeHead(403, { 'content-type': 'text/html' });
      res.end('Access Denied');
    } else if (path === '/coat-1.jpg' || path === '/coat-2.jpg') {
      const shade = path === '/coat-1.jpg' ? 200 : 60;
      void photo(shade, shade - 20, shade - 40).then((body) => {
        res.writeHead(200, { 'content-type': 'image/jpeg' });
        res.end(body);
      });
    } else {
      res.writeHead(404).end('not found');
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
