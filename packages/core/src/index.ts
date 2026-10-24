// Webhook
export {
  verifyWebhookSignature,
  verifyChallenge,
} from "./webhook/signature.js";
export { normalizeWebhookBody } from "./webhook/normalize.js";

// Automation
export { matchKeyword } from "./automation/keyword.js";
export { AutomationEngine } from "./automation/engine.js";
export type { AutomationEngineOptions } from "./automation/engine.js";
export {
  runFlow,
  DirectDelivery,
  PrivateReplyDelivery,
  PrivateReplyExhaustedError,
} from "./automation/flow-runner.js";
export type { Delivery, FlowRunContext } from "./automation/flow-runner.js";

// In-memory adapters (dev/test; the gateway provides file-backed adapters)
export {
  InMemoryAccountRepository,
  InMemoryContactRepository,
  InMemoryAutomationRepository,
  InMemoryFlowRepository,
  InMemoryTokenStore,
  createInMemoryRepositories,
  uuidIdGenerator,
  silentLogger,
  consoleLogger,
} from "./adapters/memory.js";

// Graph API
export { GraphClient } from "./graph/client.js";
export type {
  GraphClientOptions,
  MessagingTag,
  MediaItem,
  ConversationSummary,
  ConversationMessage,
} from "./graph/client.js";
export { GraphApiError } from "./graph/errors.js";
export {
  buildMessagePayload,
  isWithinTextLimit,
  utf8ByteLength,
} from "./graph/message.js";
export type { GraphMessagePayload } from "./graph/message.js";

// Tokens
export { TokenManager } from "./tokens/manager.js";
export type { TokenManagerOptions } from "./tokens/manager.js";

// Utilities
export { DedupeCache } from "./util/dedupe.js";

// Ports (interfaces / adapters seam)
export * from "./ports.js";
