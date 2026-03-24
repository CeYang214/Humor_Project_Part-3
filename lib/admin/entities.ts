export type AdminEntityMode = 'read' | 'read_update' | 'crud'

export interface AdminEntityDefinition {
  key: string
  label: string
  description: string
  mode: AdminEntityMode
  tableCandidates: string[]
  rowLimit?: number
}

export const ADMIN_ENTITY_DEFINITIONS: AdminEntityDefinition[] = [
  {
    key: 'profiles',
    label: 'Users / Profiles',
    description: 'Read users and profile roles.',
    mode: 'read',
    tableCandidates: ['profiles'],
    rowLimit: 150,
  },
  {
    key: 'images',
    label: 'Images',
    description: 'Create, read, update, delete image records and upload new image files.',
    mode: 'crud',
    tableCandidates: ['images'],
    rowLimit: 120,
  },
  {
    key: 'humor_flavors',
    label: 'Humor Flavors',
    description: 'Create, read, update, delete humor flavor catalog rows.',
    mode: 'crud',
    tableCandidates: ['humor_flavors', 'humor_flavor'],
    rowLimit: 120,
  },
  {
    key: 'humor_flavor_steps',
    label: 'Humor Flavor Steps',
    description: 'Create, read, update, delete humor flavor workflow steps.',
    mode: 'crud',
    tableCandidates: ['humor_flavor_steps', 'humor_flavor_step'],
    rowLimit: 200,
  },
  {
    key: 'humor_mix',
    label: 'Humor Mix',
    description: 'Read and update humor mix configuration records.',
    mode: 'read_update',
    tableCandidates: ['humor_mix', 'humor_mixes'],
    rowLimit: 120,
  },
  {
    key: 'terms',
    label: 'Terms',
    description: 'Create, read, update, delete term records.',
    mode: 'crud',
    tableCandidates: ['terms', 'humor_terms'],
    rowLimit: 200,
  },
  {
    key: 'captions',
    label: 'Captions',
    description: 'Read generated captions.',
    mode: 'read',
    tableCandidates: ['captions'],
    rowLimit: 250,
  },
  {
    key: 'caption_requests',
    label: 'Caption Requests',
    description: 'Read caption request jobs and payload metadata.',
    mode: 'read',
    tableCandidates: ['caption_requests', 'caption_request'],
    rowLimit: 250,
  },
  {
    key: 'caption_examples',
    label: 'Caption Examples',
    description: 'Create, read, update, delete caption example records.',
    mode: 'crud',
    tableCandidates: ['caption_examples', 'caption_example'],
    rowLimit: 200,
  },
  {
    key: 'llm_models',
    label: 'LLM Models',
    description: 'Create, read, update, delete llm model records.',
    mode: 'crud',
    tableCandidates: ['llm_models', 'llm_model'],
    rowLimit: 200,
  },
  {
    key: 'llm_providers',
    label: 'LLM Providers',
    description: 'Create, read, update, delete llm provider records.',
    mode: 'crud',
    tableCandidates: ['llm_providers', 'llm_provider'],
    rowLimit: 120,
  },
  {
    key: 'llm_prompt_chains',
    label: 'LLM Prompt Chains',
    description: 'Read llm prompt chain definitions.',
    mode: 'read',
    tableCandidates: ['llm_prompt_chains', 'llm_prompt_chain'],
    rowLimit: 200,
  },
  {
    key: 'llm_responses',
    label: 'LLM Responses',
    description: 'Read llm response logs.',
    mode: 'read',
    tableCandidates: ['llm_responses', 'llm_response'],
    rowLimit: 250,
  },
  {
    key: 'allowed_signup_domains',
    label: 'Allowed Signup Domains',
    description: 'Create, read, update, delete allowed email domains.',
    mode: 'crud',
    tableCandidates: ['allowed_signup_domains', 'allowed_signup_domain'],
    rowLimit: 120,
  },
  {
    key: 'whitelisted_email_addresses',
    label: 'Whitelisted E-mail Addresses',
    description: 'Create, read, update, delete whitelisted e-mail rows.',
    mode: 'crud',
    tableCandidates: ['whitelisted_email_addresses', 'whitelisted_emails', 'whitelisted_email_address'],
    rowLimit: 200,
  },
]

export const ADMIN_ENTITY_BY_KEY = new Map(ADMIN_ENTITY_DEFINITIONS.map((entity) => [entity.key, entity]))

export function getEntityDefinition(entityKey: string) {
  return ADMIN_ENTITY_BY_KEY.get(entityKey) ?? null
}

export function entitySupportsCreate(entity: AdminEntityDefinition) {
  return entity.mode === 'crud'
}

export function entitySupportsUpdate(entity: AdminEntityDefinition) {
  return entity.mode === 'crud' || entity.mode === 'read_update'
}

export function entitySupportsDelete(entity: AdminEntityDefinition) {
  return entity.mode === 'crud'
}
