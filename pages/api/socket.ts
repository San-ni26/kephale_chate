import { NextApiRequest, NextApiResponse } from 'next';

/**
 * Legacy Socket.IO endpoint - no longer needed.
 * Real-time communication now uses Pusher.
 * This endpoint is kept for backward compatibility (returns 200).
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
    res.status(200).json({ message: 'Real-time is now handled via Pusher' });
}
