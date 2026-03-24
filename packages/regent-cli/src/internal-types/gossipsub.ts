export interface GossipsubStatus {
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  subscribedTopics: string[];
  peerCount: number;
  lastError: string | null;
  eventSocketPath: string | null;
  status: "disabled" | "starting" | "ready" | "stopped" | "stub" | "error" | "degraded";
  note?: string;
  mode?: "libp2p" | "local_only" | "degraded" | string;
  ready?: boolean;
}

export interface GossipsubCommandResult {
  ok: false;
  code: "not_implemented";
  message: string;
}
