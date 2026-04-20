import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from "undici";

let agent: MockAgent | null = null;
let previous: Dispatcher | null = null;

export function installMockAgent(): MockAgent {
  previous = getGlobalDispatcher();
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  return agent;
}

export function restoreDispatcher(): void {
  if (previous) setGlobalDispatcher(previous);
  agent = null;
  previous = null;
}

export function mockPool(agent: MockAgent, origin: string) {
  return agent.get(origin);
}

export const TEST_BASE_URL = "http://localhost:4000/1.0";
export const TEST_ORIGIN = "http://localhost:4000";
export const TEST_API_KEY = "test-key";
