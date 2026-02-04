import { NextApiRequest } from 'next';
import { NextApiResponseServerIO } from '../../src/types/socket';
import { initializeWebSocket } from '../../src/lib/websocket';

export const config = {
    api: {
        bodyParser: false,
    },
};

export default function handler(req: NextApiRequest, res: NextApiResponseServerIO) {
    if (!(res.socket.server as any).io) {
        console.log('Initializing Socket.IO server...');
        const io = initializeWebSocket(res.socket.server as any);
        (res.socket.server as any).io = io;
        console.log('Socket.IO server initialized successfully');
    } else {
        console.log('Socket.IO server already running');
    }

    res.end();
}
