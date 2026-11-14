import type { UIMessage } from "ai";

/* The server's authoritative verdict for one companion turn. Sent as a
   `data-verdict` part so the draft shown while streaming can be replaced. */
export type CompanionVerdict = {
  can_answer: boolean;
  message: string;
  sources: Array<{
    id: string;
    title: string;
    source: string;
    added: string;
    authorised_by: string;
  }>;
  escalation: { required: boolean; categories?: string[] };
  stopped?: boolean;
};

export type CompanionUIData = { verdict: CompanionVerdict };

export type CompanionUIMessage = UIMessage<never, CompanionUIData>;
