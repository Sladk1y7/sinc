import type { Plan } from './models';

export interface Entitlements {
  maxParticipants: number;
  fileUpload: boolean;
  circles: boolean;
  scheduling: boolean;
  history: boolean;
  prioritySync: boolean;
  customReactions: boolean;
}

export function entitlementsFor(plan: Plan): Entitlements {
  if (plan === 'pro') {
    return {
      maxParticipants: 50,
      fileUpload: true,
      circles: true,
      scheduling: true,
      history: true,
      prioritySync: true,
      customReactions: true,
    };
  }
  return {
    maxParticipants: 4,
    fileUpload: false,
    circles: false,
    scheduling: false,
    history: false,
    prioritySync: false,
    customReactions: false,
  };
}
