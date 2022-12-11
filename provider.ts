import { PostgresDataProvider } from "./pg/mod.ts";

export function getProvider(conf: string): DataProvider {
  if (conf.startsWith("postgresql:")) {
    return new PostgresDataProvider(conf);
  }

  if (conf.startsWith("postgres:")) {
    return new PostgresDataProvider(conf);
  }

  throw new Error(`Unsupport data provider in config: ${conf}`);
}

export interface DataProvider {
  /** Initialize database */
  init(): Promise<void>;

  /** Users */
  createUser(input: CreateUserInput): Promise<void>;
  updateUser(name: string, data: UpdateUserInput): Promise<void>;
  getUser(name: string): Promise<UserInfo>;

  /** Messages */
  getMessages(input: GetMessageInput): Promise<Message[]>;
  deleteMessages(user: string, list: string[]): Promise<void>;
  storeMessage(input: MessageInput): Promise<void>;

  /** Server ban list, global */
  getBanHosts(): Promise<string[]>;
  setBanHosts(hosts: string[]): Promise<void>;
}

export type CreateUserInput = {
  name: string;
  public_key: string;
  display_name: string;
};

export type UpdateUserInput = {
  display_name: string;
  ban_hosts: string[];
  ban_users: string[];
  public_key?: string;
};

export type UserInfo = {
  name: string;
  public_key: Uint8Array;
  display_name: string;
  ban_hosts: string[];
  ban_users: string[];
};

export type GetMessageInput = {
  name: string;
  since?: string;
  limit?: number;
};

export type MessageInput = {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: Date;
};

export type Message = MessageInput & { content: Uint8Array };

export type ExchangeBody = {
  from: string;
  to: string;
  timestamp: string;
  content: string;
  nonce: string;
  sign: string;
};
