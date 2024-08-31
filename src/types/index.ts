export interface BlockedSite {
  hostname: string;
  isBlocked: boolean;
  blockedCount: number;
}

export enum MessageType {
  TOGGLE_BLOCKING = 'TOGGLE_BLOCKING',
  GET_BLOCKING_STATUS = 'GET_BLOCKING_STATUS',
  UPDATE_BLOCKING_STATUS = 'UPDATE_BLOCKING_STATUS',
  INCREMENT_BLOCKED_COUNT = 'INCREMENT_BLOCKED_COUNT',
}

export interface MessagePayload {
  type: MessageType;
  data?: unknown;
}
