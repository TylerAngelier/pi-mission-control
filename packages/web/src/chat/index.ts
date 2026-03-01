/**
 * Chat module - remote event adapter and React components for chat UI.
 */

export type {
  ChatMessage,
  ChatMessageRole,
  ToolCall,
  ExecutionEvent,
  ChatState,
  RemoteEventAdapterOptions,
  StreamEventType,
  MessageUpdateEvent,
  ToolCallEvent,
  ToolOutputEvent,
  ApprovalRequiredEvent,
  ApprovalDecidedEvent,
} from "./types.js";

export { RemoteEventAdapter, createRemoteEventAdapter } from "./remote-event-adapter.js";
export { Chat } from "./components/Chat.js";
export { ChatMessage as ChatMessageComponent } from "./components/ChatMessage.js";
export { ToolCall as ToolCallComponent } from "./components/ToolCall.js";
export { Sidebar } from "./components/Sidebar.js";
export { RunStatus } from "./components/RunStatus.js";
export { ExecutionTimeline, toTimelineEvents } from "./components/ExecutionTimeline.js";
export { ApprovalDialog } from "./components/ApprovalDialog.js";
export { ApprovalInbox, useApprovalInbox } from "./components/ApprovalInbox.js";
export type { ChatProps } from "./components/Chat.js";
export type { SidebarProps } from "./components/Sidebar.js";
export type { RunStatusProps } from "./components/RunStatus.js";
export type { ExecutionTimelineProps, TimelineEvent } from "./components/ExecutionTimeline.js";
export type { ApprovalDialogProps } from "./components/ApprovalDialog.js";
export type { ApprovalInboxProps } from "./components/ApprovalInbox.js";
