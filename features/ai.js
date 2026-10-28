import 'server-only';
import { getServerEnv } from '@/lib/env';
import { describeProvider, getAIProvider } from '@/lib/ai/provider';

export function getAI() {
  return getAIProvider(getServerEnv());
}

export function getAIDescription() {
  return describeProvider(getServerEnv());
}
