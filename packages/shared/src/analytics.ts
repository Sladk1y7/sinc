export const ANALYTICS_EVENTS = [
  'app_opened',
  'signed_up',
  'room_created',
  'invite_shared',
  'friend_joined',
  'watch_started',
  'watch_10_min',
  'returned_7_days',
  'circle_created',
  'watch_scheduled',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export function isAnalyticsEvent(value: string): value is AnalyticsEventName {
  return (ANALYTICS_EVENTS as readonly string[]).includes(value);
}
