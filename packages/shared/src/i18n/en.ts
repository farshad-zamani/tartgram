import type { Messages } from "./types.js";

/** English catalog — must satisfy the same `Messages` contract as `fa`. */
export const en: Messages = {
  app: {
    name: "Instagram Assistant",
    tagline: "Comment & DM automation on the official Instagram API",
  },
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    enabled: "Enabled",
    disabled: "Disabled",
    loading: "Loading…",
    connect: "Connect",
    disconnect: "Disconnect",
  },
  connection: {
    status_connected: "Connected",
    status_disconnected: "Disconnected",
    status_connecting: "Connecting…",
    webhook_healthy: "Webhook healthy",
    webhook_unhealthy: "Webhook not responding",
  },
  automation: {
    title: "Automations",
    new: "New automation",
    trigger_comment: "Comment on a post",
    trigger_dm_keyword: "Keyword in DM",
    trigger_story_reply: "Story reply",
    trigger_welcome: "Welcome message",
    trigger_default_reply: "Default reply",
  },
};
