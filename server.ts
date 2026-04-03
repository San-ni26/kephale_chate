import 'dotenv/config';
import { ensureJwtSecret } from '@/src/lib/jwt';
import { createServer } from 'http';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// En production, vérifier que JWT_SECRET est défini
if (process.env.NODE_ENV === 'production') {
    ensureJwtSecret();
}

app.prepare().then(() => {
    const server = createServer(async (req, res) => {
        try {
            // Use WHATWG URL API to replace deprecated url.parse
            const protocol = req.headers['x-forwarded-proto'] || 'http';
            const host = req.headers.host || `${hostname}:${port}`;
            const url = new URL(req.url!, `${protocol}://${host}`);
            
            const query: Record<string, string | string[]> = {};
            url.searchParams.forEach((value, key) => {
                if (query[key]) {
                    if (Array.isArray(query[key])) {
                        (query[key] as string[]).push(value);
                    } else {
                        query[key] = [query[key] as string, value];
                    }
                } else {
                    query[key] = value;
                }
            });

            const parsedUrl = {
                pathname: url.pathname,
                query: query,
            };

            await handle(req, res, parsedUrl as any);
        } catch (err) {
            console.error('Error occurred handling', req.url, err);
            res.statusCode = 500;
            res.end('internal server error');
        }
    });

    server.listen(port, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
        console.log(`> Real-time via Pusher (no WebSocket server needed)`);
    });
});
