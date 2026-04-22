export type JsonOpt = { json?: boolean };

export type ListOpts = JsonOpt & {
  limit: string;
  status?: string;
  projectId?: string;
  type?: string;
};

export type CreateOpts = JsonOpt & {
  title: string;
  body: string;
  type: string;
  projectId?: string;
  priority?: string;
  email?: string;
};

export type CloseOpts = JsonOpt & { comment?: string };

export type CommentOpts = JsonOpt & { body: string };
