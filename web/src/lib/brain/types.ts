export type BrainDocument = {
  id: string;
  title: string;
  topic: string;
  keywords: string[];
  source: string;
  authorisedBy: string;
  added: string;
  status: string;
  body: string;
};

export type ScoredDocument = BrainDocument & { score: number };
