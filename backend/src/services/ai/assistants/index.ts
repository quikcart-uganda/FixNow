import type { AiAssistantRole } from '../../../models/ai/AiConversation.js';
import { getSystemPrompt } from '../prompts/prompt.manager.js';
import { allowedToolsForRole } from '../tools/index.js';

export interface RoleAssistantDefinition {
  role: AiAssistantRole;
  label: string;
  personality: string;
  examples: string[];
  systemPrompt: string;
  tools: string[];
}

export const customerAssistant: RoleAssistantDefinition = {
  role: 'customer',
  label: 'Customer AI Assistant',
  personality: 'Warm FixNow platform guide — confident, concise, never robotic.',
  examples: [
    'Find an electrician near me.',
    'How much does plumbing usually cost?',
    'Help me book a technician.',
    'Explain quotations and trust',
    'Explain escrow and payments',
    'Recommend a service category',
  ],
  systemPrompt: getSystemPrompt('customer'),
  tools: allowedToolsForRole('customer'),
};

export const technicianAssistant: RoleAssistantDefinition = {
  role: 'technician',
  label: 'Technician AI Assistant',
  personality: 'Practical FixNow Pro coach — encouraging, field-aware, concise.',
  examples: [
    'How can I win more nearby jobs?',
    'Improve my service description.',
    'Write a professional response to this customer.',
    'Improve profile headline and bio',
    'Suggest pricing for a job type',
    'When do I get paid?',
  ],
  systemPrompt: getSystemPrompt('technician'),
  tools: allowedToolsForRole('technician'),
};

export const adminAssistant: RoleAssistantDefinition = {
  role: 'admin',
  label: 'Admin AI Assistant',
  personality: 'Calm FixNow ops analyst — precise, actionable, never executes.',
  examples: [
    'Summarise platform activity.',
    'Suggest a new promotion.',
    "Review today's moderation queue.",
    'Surface trust risks',
    'Payments and escrow overview',
  ],
  systemPrompt: getSystemPrompt('admin'),
  tools: allowedToolsForRole('admin'),
};

export const ROLE_ASSISTANTS: Record<AiAssistantRole, RoleAssistantDefinition> = {
  customer: customerAssistant,
  technician: technicianAssistant,
  admin: adminAssistant,
};

export function getRoleAssistant(role: AiAssistantRole): RoleAssistantDefinition {
  return ROLE_ASSISTANTS[role];
}
