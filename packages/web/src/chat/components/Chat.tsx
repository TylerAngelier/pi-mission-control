/**
 * Chat component - main chat interface with message list and event stream.
 */

import React, { useState, useEffect, useRef } from "react";
import type { ChatMessage, ToolCall, ExecutionEvent, ApprovalRequiredEvent } from "../types.js";
import { RemoteEventAdapter } from "../remote-event-adapter.js";
import { ChatMessage as ChatMessageComponent } from "./ChatMessage.js";
import { ToolCall as ToolCallComponent } from "./ToolCall.js";
import { RunStatus } from "./RunStatus.js";
import { ExecutionTimeline, toTimelineEvents } from "./ExecutionTimeline.js";
import { ApprovalInbox } from "./ApprovalInbox.js";

export interface ChatProps {
  sessionId: string;
  apiBaseUrl: string;
  authToken: string;
  initialMessages?: ChatMessage[];
  runStatus?: {
    runId?: string;
    status?: "queued" | "running" | "waiting_approval" | "completed" | "failed" | "canceled" | "orphaned";
    costUsd?: number | null;
    startedAt?: string;
    finishedAt?: string | null;
    errorCode?: string | null;
  };
}

export const Chat: React.FC<ChatProps> = ({
  sessionId,
  apiBaseUrl,
  authToken,
  initialMessages = [],
  runStatus,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | undefined>();
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(true);
  const [approvals, setApprovals] = useState<ApprovalRequiredEvent[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Handle approval decisions
  const handleApprove = async (approvalId: string, reason?: string) => {
    // In a real implementation, this would call the control API
    console.log(`Approving ${approvalId} with reason:`, reason);
    setApprovals((prev) => prev.filter((a) => a.approvalId !== approvalId));
  };

  const handleReject = async (approvalId: string, reason?: string) => {
    // In a real implementation, this would call the control API
    console.log(`Rejecting ${approvalId} with reason:`, reason);
    setApprovals((prev) => prev.filter((a) => a.approvalId !== approvalId));
  };

  const adapterRef = useRef<RemoteEventAdapter | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolCalls, events]);

  // Initialize and connect to event stream
  useEffect(() => {
    const adapter = new RemoteEventAdapter({
      apiBaseUrl,
      authToken,
      sessionId,
      onMessage: (message) => {
        setMessages((prev) => {
          // Check if this message already exists
          const exists = prev.some((m) => m.id === message.id);
          if (exists) {
            return prev;
          }
          return [...prev, message];
        });
      },
      onToolCall: (toolCall) => {
        setToolCalls((prev) => {
          const index = prev.findIndex((tc) => tc.id === toolCall.id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = toolCall;
            return updated;
          }
          return [...prev, toolCall];
        });
      },
      onEvent: (event) => {
        setEvents((prev) => [...prev, event]);

        // Track approval_required events
        if (event.type === "approval_required") {
          const approval = event.data as ApprovalRequiredEvent;
          setApprovals((prev) => {
            // Avoid duplicates
            const exists = prev.some((a) => a.approvalId === approval.approvalId);
            if (exists) {
              return prev;
            }
            return [...prev, approval];
          });
        }

        // Remove approval when decided
        if (event.type === "approval_decided") {
          const decidedApproval = event.data as ApprovalRequiredEvent;
          setApprovals((prev) => prev.filter((a) => a.approvalId !== decidedApproval.approvalId));
        }
      },
      onStateChange: (state) => {
        if (state.isStreaming !== undefined) {
          setIsStreaming(state.isStreaming);
        }
        if (state.currentRunId !== undefined) {
          setCurrentRunId(state.currentRunId);
        }
      },
      onError: (error) => {
        console.error("Remote event adapter error:", error);
      },
    });

    adapterRef.current = adapter;
    adapter.connect();

    return () => {
      adapter.disconnect();
      adapterRef.current = null;
    };
  }, [sessionId, apiBaseUrl, authToken]);

  return (
    <div className="chat" data-testid="chat">
      <div className="chat__header">
        <h2 className="chat__title">Session {sessionId}</h2>
        <div className="chat__status">
          {runStatus ? (
            <RunStatus
              runId={runStatus.runId || currentRunId}
              status={runStatus.status}
              costUsd={runStatus.costUsd}
              startedAt={runStatus.startedAt}
              finishedAt={runStatus.finishedAt}
              errorCode={runStatus.errorCode}
            />
          ) : (
            <span className="chat__status-indicator">
              {currentRunId ? (
                <span className="chat__status-indicator--running">Running</span>
              ) : (
                <span className="chat__status-indicator--idle">Idle</span>
              )}
              {isStreaming && <span className="chat__stream-indicator">● Live</span>}
            </span>
          )}
        </div>
      </div>

      <div className="chat__content">
        <div className="chat__messages">
          {messages.map((message) => (
            <ChatMessageComponent key={message.id} message={message} />
          ))}
        </div>

        {toolCalls.length > 0 && (
          <div className="chat__tool-calls">
            {toolCalls.map((toolCall) => (
              <ToolCallComponent key={toolCall.id} toolCall={toolCall} />
            ))}
          </div>
        )}

        <ExecutionTimeline
          events={toTimelineEvents(events, toolCalls)}
          toolCalls={toolCalls}
          isExpanded={isTimelineExpanded}
          onToggle={() => setIsTimelineExpanded(!isTimelineExpanded)}
        />

        <div ref={messagesEndRef} />
      </div>

      {/* Approval Inbox */}
      <ApprovalInbox
        approvals={approvals}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  );
};
