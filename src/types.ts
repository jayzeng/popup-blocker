export enum MessageType {
  TOGGLE_BLOCKING = 'TOGGLE_BLOCKING',
  GET_BLOCKING_STATUS = 'GET_BLOCKING_STATUS',
  UPDATE_BLOCKING_STATUS = 'UPDATE_BLOCKING_STATUS',
  INCREMENT_BLOCKED_COUNT = 'INCREMENT_BLOCKED_COUNT',
  GET_BLOCKED_SITES = 'GET_BLOCKED_SITES',
  UNBLOCK_SITE = 'UNBLOCK_SITE',
}

export enum StorageKeys {
  BLOCKED_SITES = 'BLOCKED_SITES',
}

export interface BlockedSite {
  hostname: string;
  isBlocked: boolean;
  blockedCount: number;
  isMasked: boolean;
}

export interface ExtensionState {
  blockedSites: BlockedSite[];
}

export const DEFAULT_EXTENSION_STATE: ExtensionState = {
  blockedSites: [],
};

export type ToggleBlockingRequest = {
  type: MessageType.TOGGLE_BLOCKING;
  data: { hostname: string; isIncognito: boolean };
};

export type GetBlockingStatusRequest = {
  type: MessageType.GET_BLOCKING_STATUS;
  data: { hostname: string };
};

export type IncrementBlockedCountRequest = {
  type: MessageType.INCREMENT_BLOCKED_COUNT;
  data: { hostname: string };
};

export type GetBlockedSitesRequest = {
  type: MessageType.GET_BLOCKED_SITES;
};

export type UnblockSiteRequest = {
  type: MessageType.UNBLOCK_SITE;
  data: { hostname: string };
};

export type UpdateBlockingStatusMessage = {
  type: MessageType.UPDATE_BLOCKING_STATUS;
  data: { isBlocked: boolean; blockedCount?: number };
};

export type BackgroundRequest =
  | ToggleBlockingRequest
  | GetBlockingStatusRequest
  | IncrementBlockedCountRequest
  | GetBlockedSitesRequest
  | UnblockSiteRequest;

export interface ToggleBlockingResponse {
  isBlocked: boolean;
  blockedCount: number;
  blockedSites: BlockedSite[];
}

export interface GetBlockingStatusResponse {
  isBlocked: boolean;
  blockedCount: number;
}

export interface IncrementBlockedCountResponse {
  blockedCount: number;
}

export interface UnblockSiteResponse {
  success: boolean;
}

export interface AckResponse {
  success: boolean;
}

export interface ErrorResponse {
  success: false;
  error: string;
}
