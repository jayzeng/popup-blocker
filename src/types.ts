export enum MessageType {
  TOGGLE_BLOCKING = 'TOGGLE_BLOCKING',
  GET_BLOCKING_STATUS = 'GET_BLOCKING_STATUS',
  UPDATE_BLOCKING_STATUS = 'UPDATE_BLOCKING_STATUS',
  INCREMENT_BLOCKED_COUNT = 'INCREMENT_BLOCKED_COUNT',
  CHECK_COVERAGE = 'CHECK_COVERAGE',
  GET_BLOCKED_SITES = 'GET_BLOCKED_SITES',
  UNBLOCK_SITE = 'UNBLOCK_SITE'
}

export interface BlockedSite {
  hostname: string;
  isBlocked: boolean;
  blockedCount: number;
  isMasked: boolean; // Add this new property
}

export interface MessagePayload {
  type: MessageType;
  data?: any;
}

// You might want to add more specific payload types for different message types
export interface ToggleBlockingPayload {
  hostname: string;
}

export interface GetBlockingStatusPayload {
  hostname: string;
}

export interface UpdateBlockingStatusPayload {
  isBlocked: boolean;
  blockedCount: number;
}

export interface IncrementBlockedCountPayload {
  hostname: string;
}

export interface CheckCoveragePayload {
  hostname: string;
}

export enum StorageKeys {
  BLOCKED_SITES = 'BLOCKED_SITES',
}

export interface ToggleBlockingResponse {
  isBlocked: boolean;
  blockedCount: number;
  blockedSites: BlockedSite[];
}