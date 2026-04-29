'use client'

import { useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'

type ServerFormAction = (formData: FormData) => void | Promise<void>

interface SubmitButtonProps {
  idleLabel: string
  pendingLabel: string
  className: string
}

export function PendingSubmitButton({ idleLabel, pendingLabel, className }: SubmitButtonProps) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : idleLabel}
    </button>
  )
}

interface GuidedFlavorCreateFormProps {
  action: ServerFormAction
  flavorNameColumn: string
  flavorDescriptionColumn: string
  defaultName: string
  defaultDescription: string
}

interface GuidedFlavorUpdateFormProps extends GuidedFlavorCreateFormProps {
  flavorId: string
  idColumn: string
}

function validateFlavorFields(name: string, description: string) {
  const nextErrors: { name?: string; description?: string } = {}
  if (!name.trim()) {
    nextErrors.name = 'Flavor name is required.'
  } else if (name.trim().length < 3) {
    nextErrors.name = 'Flavor name must be at least 3 characters.'
  }

  if (!description.trim()) {
    nextErrors.description = 'Flavor description is required.'
  } else if (description.trim().length < 8) {
    nextErrors.description = 'Flavor description must be at least 8 characters.'
  }

  return nextErrors
}

export function GuidedFlavorCreateForm({
  action,
  flavorNameColumn,
  flavorDescriptionColumn,
  defaultName,
  defaultDescription,
}: GuidedFlavorCreateFormProps) {
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({})

  return (
    <form
      action={action}
      className="mt-3 grid gap-2"
      onSubmit={(event) => {
        const formData = new FormData(event.currentTarget)
        const name = String(formData.get('flavor_name') ?? '')
        const description = String(formData.get('flavor_description') ?? '')
        const nextErrors = validateFlavorFields(name, description)
        setErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="flavor_name_column" value={flavorNameColumn} />
      <input type="hidden" name="flavor_description_column" value={flavorDescriptionColumn} />
      <label className="grid gap-1 text-xs text-slate-200">
        Flavor name
        <input
          name="flavor_name"
          defaultValue={defaultName}
          required
          minLength={3}
          maxLength={120}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        />
        {errors.name && <span className="text-[11px] text-rose-300">{errors.name}</span>}
      </label>
      <label className="grid gap-1 text-xs text-slate-200">
        Flavor description
        <textarea
          name="flavor_description"
          rows={3}
          defaultValue={defaultDescription}
          required
          minLength={8}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        />
        {errors.description && <span className="text-[11px] text-rose-300">{errors.description}</span>}
      </label>
      <PendingSubmitButton
        idleLabel="Create Flavor"
        pendingLabel="Creating Flavor..."
        className="w-fit rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:from-cyan-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
      />
    </form>
  )
}

export function GuidedFlavorUpdateForm({
  action,
  flavorNameColumn,
  flavorDescriptionColumn,
  flavorId,
  idColumn,
  defaultName,
  defaultDescription,
}: GuidedFlavorUpdateFormProps) {
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({})

  return (
    <form
      action={action}
      className="mt-2 grid gap-2"
      onSubmit={(event) => {
        const formData = new FormData(event.currentTarget)
        const name = String(formData.get('flavor_name') ?? '')
        const description = String(formData.get('flavor_description') ?? '')
        const nextErrors = validateFlavorFields(name, description)
        setErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="flavor_id" value={flavorId} />
      <input type="hidden" name="id_column" value={idColumn} />
      <input type="hidden" name="flavor_name_column" value={flavorNameColumn} />
      <input type="hidden" name="flavor_description_column" value={flavorDescriptionColumn} />
      <label className="grid gap-1 text-xs text-slate-200">
        Flavor name
        <input
          name="flavor_name"
          defaultValue={defaultName}
          required
          minLength={3}
          maxLength={120}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
        {errors.name && <span className="text-[11px] text-rose-300">{errors.name}</span>}
      </label>
      <label className="grid gap-1 text-xs text-slate-200">
        Flavor description
        <textarea
          name="flavor_description"
          rows={3}
          defaultValue={defaultDescription}
          required
          minLength={8}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
        {errors.description && <span className="text-[11px] text-rose-300">{errors.description}</span>}
      </label>
      <PendingSubmitButton
        idleLabel="Update Selected Flavor"
        pendingLabel="Updating Flavor..."
        className="admin-accent-btn w-fit rounded-lg border border-cyan-500/60 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-70"
      />
    </form>
  )
}

interface GuidedStepBuilderFormProps {
  action: ServerFormAction
  flavorId: string
  flavorColumn: string
  orderColumn: string
  promptColumn: string
  defaultTone: string
  defaultTemplate: string
}

export function GuidedStepBuilderForm({
  action,
  flavorId,
  flavorColumn,
  orderColumn,
  promptColumn,
  defaultTone,
  defaultTemplate,
}: GuidedStepBuilderFormProps) {
  const [subject, setSubject] = useState('the image')
  const [focus, setFocus] = useState('the funniest detail')
  const [tone, setTone] = useState(defaultTone || 'playful')
  const [maxWords, setMaxWords] = useState('12')
  const [template, setTemplate] = useState(defaultTemplate)
  const [errors, setErrors] = useState<{
    subject?: string
    focus?: string
    tone?: string
    maxWords?: string
    template?: string
  }>({})

  const preview = useMemo(() => {
    return template
      .split('[SUBJECT]').join(subject || '[SUBJECT]')
      .split('[FOCUS]').join(focus || '[FOCUS]')
      .split('[TONE]').join(tone || '[TONE]')
      .split('[MAX_WORDS]').join(maxWords || '[MAX_WORDS]')
  }, [focus, maxWords, subject, template, tone])

  return (
    <form
      action={action}
      className="mt-3 grid gap-2 sm:grid-cols-2"
      onSubmit={(event) => {
        const nextErrors: {
          subject?: string
          focus?: string
          tone?: string
          maxWords?: string
          template?: string
        } = {}

        if (!subject.trim()) nextErrors.subject = 'Subject is required.'
        if (!focus.trim()) nextErrors.focus = 'Focus is required.'
        if (!tone.trim()) nextErrors.tone = 'Tone is required.'
        const parsedMaxWords = Number.parseInt(maxWords, 10)
        if (!Number.isFinite(parsedMaxWords) || parsedMaxWords < 3 || parsedMaxWords > 80) {
          nextErrors.maxWords = 'Max words must be between 3 and 80.'
        }
        if (!template.trim()) {
          nextErrors.template = 'Template is required.'
        } else {
          const requiredTokens = ['[SUBJECT]', '[FOCUS]', '[TONE]', '[MAX_WORDS]']
          const missingTokens = requiredTokens.filter((token) => !template.includes(token))
          if (missingTokens.length > 0) {
            nextErrors.template = `Template is missing token(s): ${missingTokens.join(', ')}`
          }
        }

        setErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="flavor_id" value={flavorId} />
      <input type="hidden" name="flavor_column" value={flavorColumn} />
      <input type="hidden" name="order_column" value={orderColumn} />
      <input type="hidden" name="prompt_column" value={promptColumn} />

      <label className="grid gap-1 text-xs text-slate-200">
        Subject word(s)
        <input
          name="subject_word"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          required
          minLength={2}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        />
        {errors.subject && <span className="text-[11px] text-rose-300">{errors.subject}</span>}
      </label>
      <label className="grid gap-1 text-xs text-slate-200">
        Focus word(s)
        <input
          name="focus_word"
          value={focus}
          onChange={(event) => setFocus(event.target.value)}
          required
          minLength={2}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        />
        {errors.focus && <span className="text-[11px] text-rose-300">{errors.focus}</span>}
      </label>
      <label className="grid gap-1 text-xs text-slate-200">
        Tone word
        <input
          name="tone_word"
          value={tone}
          onChange={(event) => setTone(event.target.value)}
          required
          minLength={2}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        />
        {errors.tone && <span className="text-[11px] text-rose-300">{errors.tone}</span>}
      </label>
      <label className="grid gap-1 text-xs text-slate-200">
        Max words
        <input
          type="number"
          min={3}
          max={80}
          name="max_words"
          value={maxWords}
          onChange={(event) => setMaxWords(event.target.value)}
          required
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        />
        {errors.maxWords && <span className="text-[11px] text-rose-300">{errors.maxWords}</span>}
      </label>
      <label className="grid gap-1 text-xs text-slate-200 sm:col-span-2">
        Prompt format template
        <textarea
          name="prompt_template"
          rows={4}
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
          required
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
        />
        {errors.template && <span className="text-[11px] text-rose-300">{errors.template}</span>}
      </label>
      <div className="rounded-lg border border-slate-700 bg-slate-950/80 p-3 text-xs text-slate-300 sm:col-span-2">
        <p className="uppercase tracking-[0.14em] text-cyan-200/80">Live Preview</p>
        <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-slate-100">{preview}</pre>
      </div>
      <div className="sm:col-span-2">
        <PendingSubmitButton
          idleLabel="Create Step From Guided Format"
          pendingLabel="Creating Step..."
          className="w-fit rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:from-cyan-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
        />
      </div>
    </form>
  )
}
