// Explicit action registry. Only these handlers can ever run: workflow definitions reference
// actions by type name; no user-supplied code, SQL or dynamic imports are executed.
import { crmDemoSync, emailDemoSend } from './actions/demo-integrations';
import { aiDraftReply, leadClassify, leadScore, leadSummarize } from './actions/lead-ai';
import { leadCreate } from './actions/lead-create';
import { leadUpdate } from './actions/lead-update';
import { leadValidate } from './actions/lead-validate';
import { conditionEvaluate, dataTransform, executionLog } from './actions/logic';
import { notificationCreate } from './actions/notify';

const ACTIONS = [
  leadValidate,
  leadCreate,
  leadUpdate,
  leadScore,
  leadClassify,
  leadSummarize,
  aiDraftReply,
  conditionEvaluate,
  dataTransform,
  notificationCreate,
  crmDemoSync,
  emailDemoSend,
  executionLog,
];

const REGISTRY = new Map(ACTIONS.map((action) => [action.type, Object.freeze(action)]));

export function getAction(type) {
  const action = REGISTRY.get(type);
  if (!action) throw new Error(`Unknown action type "${type}"`);
  return action;
}

export function hasAction(type) {
  return REGISTRY.has(type);
}

export function listActionTypes() {
  return [...REGISTRY.keys()];
}
