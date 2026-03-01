/**
 * Chat component - main chat interface with message list and event stream.
 */

import React, { useState, useEffect, useRef } from "react";
import type { ChatMessage, ToolCall, ExecutionEvent } from "../types.js";
import { RemoteEventAdapter } from "../remote-event-adapter.js";
import { ChatMessage as ChatMessageComponent } from "./ChatMessage.js";
import { ToolCall as ToolCallComponent } from "./ToolCall.js";

export interface ChatProps {
  sessionId: string;
  apiBaseUrl: string;
  authToken: string;
  initialMessages?: ChatMessage[];
}

export const Chat: React.FC<ChatProps> = ({
  sessionId,
  apiBaseUrl,
  authToken,
  initialMessages = [],
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
          {currentRunId ? (
            <span className="chat__status-indicator chat__status-indicator--running">
              Running
            </span>
          ) : (
            <span className="chat__status-indicator chat__status-indicator--idle">
              Idle
            </span>
          )}
          {isStreaming && (
            <span className="chat__stream-indicator">● Live</span>
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

        {events.length > 0 && (
          <div className="chat__events">
            {events.map((event) => (
              <div key={event.id} className="chat__event" data-testid="chat-event">
                <span className="chat__event-type">{event.type}</span>
                <span className="chat__event-timestamp">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
