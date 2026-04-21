/**
 * Collision Guard - Détection et résolution des collisions d'appels
 * Quand deux utilisateurs s'appellent mutuellement en même temps
 */

export interface CollisionResolution {
  winner: string;      // Celui qui devient host
  loser: string;       // Celui qui rejoint
  action: 'merge' | 'decline';
  roomId?: string;     // ID de la salle si merge
}

/**
 * Détecte et résout une collision d'appel
 * Algorithme déterministe basé sur userId et timestamp
 */
export function resolveCollision(
  userA: string,
  userB: string,
  timestampA: number,
  timestampB: number
): CollisionResolution {
  // Si timestamps très proches (< 2s), c'est probablement une collision réelle
  const timeDiff = Math.abs(timestampA - timestampB);
  
  if (timeDiff > 5000) {
    // Trop d'écart, pas une collision
    return {
      winner: timestampA < timestampB ? userA : userB,
      loser: timestampA < timestampB ? userB : userA,
      action: 'decline'
    };
  }

  // Algorithme déterministe : userId "plus petit" en ordre lexicographique gagne
  // Cela garantit que les deux côtés arrivent à la même conclusion
  const winner = userA.localeCompare(userB) < 0 ? userA : userB;
  const loser = userA.localeCompare(userB) < 0 ? userB : userA;

  return {
    winner,
    loser,
    action: 'merge',
    roomId: generateRoomId(winner, loser)
  };
}

/**
 * Génère un roomId déterministe basé sur les deux participants
 */
export function generateRoomId(userA: string, userB: string): string {
  const sorted = [userA, userB].sort();
  return `call_${sorted[0]}_${sorted[1]}_${Date.now()}`;
}

/**
 * Vérifie si deux appels entrants sont en collision
 */
export function isColliding(
  callerId: string,
  currentOutgoingCallTargetId: string
): boolean {
  return callerId === currentOutgoingCallTargetId;
}

/**
 * Détermine si l'utilisateur actuel doit créer la salle ou rejoindre
 */
export function shouldCreateRoom(
  currentUserId: string,
  otherUserId: string
): boolean {
  return currentUserId.localeCompare(otherUserId) < 0;
}
