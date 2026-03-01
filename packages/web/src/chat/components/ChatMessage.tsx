/**
 * ChatMessage component - displays a single message in the chat interface.
 */

import React from "react";
import type { ChatMessage as ChatMessageType } from "../types.js";

interface ChatMessageProps {
  message: ChatMessageType;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  return (
    <div
      className={`chat-message chat-message--${message.role}`}
      data-testid="chat-message"
    >
      <div className="chat-message__header">
        <span className="chat-message__role">{formatRole(message.role)}</span>
        <span className="chat-message__timestamp">{formatTimestamp(message.timestamp)}</span>
      </div>
      <div className="chat-message__content">
        <pre className="chat-message__text">{message.content}</pre>
      </div>
    </div>
  );
};

function formatRole(role: ChatMessageType["role"]): string {
  switch (role) {
    case "user":
      return "You";
    case "assistant":
      return "Assistant";
    case "system":
      return "System";
  }
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
