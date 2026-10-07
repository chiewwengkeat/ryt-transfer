import { setupServer } from "msw/node";

export const mswServer = setupServer();

export const unhandledRequests: string[] = [];
