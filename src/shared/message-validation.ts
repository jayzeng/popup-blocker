import { BackgroundRequest, MessageType, UpdateBlockingStatusMessage } from '../types';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isBackgroundRequest(message: unknown): message is BackgroundRequest {
  if (!isObjectRecord(message) || typeof message.type !== 'string') {
    return false;
  }

  const data = isObjectRecord(message.data) ? message.data : undefined;

  switch (message.type) {
    case MessageType.TOGGLE_BLOCKING:
      return typeof data?.hostname === 'string' && typeof data?.isIncognito === 'boolean';
    case MessageType.GET_BLOCKING_STATUS:
      return typeof data?.hostname === 'string';
    case MessageType.INCREMENT_BLOCKED_COUNT:
      return typeof data?.hostname === 'string';
    case MessageType.UNBLOCK_SITE:
      return typeof data?.hostname === 'string';
    case MessageType.GET_BLOCKED_SITES:
      return true;
    default:
      return false;
  }
}

export function isUpdateBlockingStatusMessage(message: unknown): message is UpdateBlockingStatusMessage {
  if (!isObjectRecord(message) || message.type !== MessageType.UPDATE_BLOCKING_STATUS) {
    return false;
  }

  if (!isObjectRecord(message.data) || typeof message.data.isBlocked !== 'boolean') {
    return false;
  }

  if (
    message.data.blockedCount !== undefined &&
    (typeof message.data.blockedCount !== 'number' || !Number.isFinite(message.data.blockedCount))
  ) {
    return false;
  }

  return true;
}
