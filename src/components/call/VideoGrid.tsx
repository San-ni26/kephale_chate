'use client';

/**
 * Grille vidéo adaptative pour appels multi-participants
 * Affiche les vidéos des participants selon leur nombre
 */

import { useRef, useEffect, memo, useCallback, useState } from 'react';
import { cn } from '@/src/lib/utils';
import { UserAvatar } from '@/src/components/ui/UserAvatar';
import { QualityIndicator, ConnectionQuality } from './QualityIndicator';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { safePlay } from '@/src/lib/safe-media-play';

interface Participant {
  userId: string;
  userName: string;
  stream?: MediaStream | null;
  isMuted: boolean;
  isVideoOn: boolean;
  isSpeaking: boolean;
  quality: ConnectionQuality;
  isHost?: boolean;
}

interface VideoGridProps {
  participants: Participant[];
  localStream?: MediaStream | null;
  localUserId: string;
  localUserName: string;
  isLocalMuted: boolean;
  isLocalVideoOn: boolean;
  className?: string;
}

// ─── VideoParticipant Component (memoized) ───────────────────────────────────

interface VideoParticipantProps {
  participant: Participant;
  isLocal?: boolean;
  className?: string;
}

const VideoParticipant = memo(function VideoParticipant({
  participant,
  isLocal = false,
  className,
}: VideoParticipantProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !participant.stream) return;

    if (video.srcObject !== participant.stream) {
      video.srcObject = participant.stream;
    }
    if (video.paused) {
      safePlay(video);
    }
  }, [participant.stream]);

  const hasVideo = participant.stream?.getVideoTracks().some(t => t.enabled && t.readyState === 'live') ?? false;
  const showVideo = participant.isVideoOn && hasVideo;

  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-gray-900', className)}>
      {/* Vidéo ou Avatar */}
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
          style={{ transform: isLocal ? 'scaleX(-1)' : undefined }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900">
          <UserAvatar
            avatarUrl={undefined}
            name={participant.userName}
            size="xl"
            className="border-4 border-white/20"
            fallbackClassName="bg-primary/30 text-white"
          />
        </div>
      )}

      {/* Overlay info */}
      <div className="absolute inset-x-0 top-0 p-3 flex items-start justify-between bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center gap-2">
          <QualityIndicator quality={participant.quality} size="sm" />
          {participant.isSpeaking && (
            <span className="px-2 py-0.5 rounded-full bg-blue-500/50 text-blue-100 text-xs flex items-center gap-1">
              <Mic className="w-3 h-3" />
              parle...
            </span>
          )}
        </div>
      </div>

      {/* Barre du bas avec nom et statut */}
      <div className="absolute inset-x-0 bottom-0 p-3 flex items-end justify-between bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium text-sm drop-shadow-lg">
            {participant.userName} {isLocal && '(Vous)'}
          </span>
          {participant.isHost && (
            <span className="px-1.5 py-0.5 rounded bg-primary/60 text-white text-[10px]">
              Host
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          {participant.isMuted ? (
            <div className="p-1.5 rounded-full bg-red-500/60">
              <MicOff className="w-3.5 h-3.5 text-white" />
            </div>
          ) : null}
          {!participant.isVideoOn ? (
            <div className="p-1.5 rounded-full bg-red-500/60">
              <VideoOff className="w-3.5 h-3.5 text-white" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

// ─── Grid Layout Helper ──────────────────────────────────────────────────────

function getGridClasses(count: number): string {
  switch (count) {
    case 1:
      return 'grid-cols-1 grid-rows-1';
    case 2:
      return 'grid-cols-1 md:grid-cols-2 grid-rows-1';
    case 3:
      return 'grid-cols-2 grid-rows-2';
    case 4:
      return 'grid-cols-2 grid-rows-2';
    case 5:
    case 6:
      return 'grid-cols-2 md:grid-cols-3 grid-rows-2 md:grid-rows-2';
    case 7:
    case 8:
    case 9:
      return 'grid-cols-3 grid-rows-3';
    default:
      return 'grid-cols-3 md:grid-cols-4 auto-rows-fr';
  }
}

function getAspectRatio(count: number): string {
  if (count <= 2) return 'aspect-video';
  if (count <= 4) return 'aspect-video';
  if (count <= 6) return 'aspect-video';
  return 'aspect-video';
}

// ─── Main VideoGrid Component ────────────────────────────────────────────────

export function VideoGrid({
  participants,
  localStream,
  localUserId,
  localUserName,
  isLocalMuted,
  isLocalVideoOn,
  className,
}: VideoGridProps) {
  // Combiner local + remote participants
  const allParticipants: Participant[] = [
    {
      userId: localUserId,
      userName: localUserName,
      stream: localStream,
      isMuted: isLocalMuted,
      isVideoOn: isLocalVideoOn,
      isSpeaking: false,
      quality: 'excellent',
      isHost: participants.find(p => p.isHost)?.userId === localUserId,
    },
    ...participants.filter(p => p.userId !== localUserId),
  ];

  const count = allParticipants.length;
  const gridClasses = getGridClasses(count);

  return (
    <div
      className={cn(
        'grid gap-2 p-2 h-full w-full',
        gridClasses,
        className
      )}
    >
      {allParticipants.map((participant, index) => (
        <VideoParticipant
          key={participant.userId}
          participant={participant}
          isLocal={participant.userId === localUserId}
          className={cn(
            getAspectRatio(count),
            'min-h-0',
            // Plein écran pour 1 participant
            count === 1 && 'col-span-1 row-span-1',
            // Pour 3 participants : le premier prend 2 colonnes
            count === 3 && index === 0 && 'col-span-2 md:col-span-1',
          )}
        />
      ))}
    </div>
  );
}

export type { Participant, ConnectionQuality };
