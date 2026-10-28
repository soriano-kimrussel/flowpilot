'use client';

import { useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Plus,
  Trash2,
} from 'lucide-react';
import { Badge, SimulatedBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/form';
import { ACTION_CATALOG, ACTION_CATEGORIES } from '@/lib/workflow-engine/catalog';
import { cn } from '@/lib/utils/format';
import { ConfigField } from './step-fields';

export function makeStep(type, existingIds) {
  const meta = ACTION_CATALOG[type];
  const base = type.split('.').pop().replace(/_/g, '-');
  let id = base;
  let n = 2;
  while (existingIds.has(id)) id = `${base}-${n++}`;
  const step = {
    id,
    type,
    name: meta.label,
    config: structuredClone(meta.defaults ?? {}),
    onError: 'stop',
  };
  if (type === 'condition.evaluate') {
    step.then = [];
    step.else = [];
  }
  return step;
}

export function AddStepMenu({ onAdd, disabled, label = 'Add step' }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`add-${label}`}>
        {label}
      </label>
      <Select
        id={`add-${label}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        className="h-8 w-56"
      >
        <option value="">Choose an action…</option>
        {Object.entries(ACTION_CATEGORIES).map(([cat, catLabel]) => (
          <optgroup key={cat} label={catLabel}>
            {Object.entries(ACTION_CATALOG)
              .filter(([, a]) => a.category === cat)
              .map(([type, a]) => (
                <option key={type} value={type}>
                  {a.label}
                </option>
              ))}
          </optgroup>
        ))}
      </Select>
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || !value}
        onClick={() => {
          onAdd(value);
          setValue('');
        }}
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> {label}
      </Button>
    </div>
  );
}

function StepCard({ step, index, count, path, onChange, onRemove, onMove, ctx }) {
  const [open, setOpen] = useState(true);
  const meta = ACTION_CATALOG[step.type] ?? { label: step.type, fields: [] };
  const stepIssues = ctx.issues.filter(
    (i) => i.path === `steps.${path}` || i.path.startsWith(`steps.${path}.config`),
  );
  const isCondition = step.type === 'condition.evaluate';
  const key = path.replace(/\./g, '-');

  const addTo = (branch) => (type) =>
    onChange({ ...step, [branch]: [...(step[branch] ?? []), makeStep(type, ctx.allIds)] });

  return (
    <li
      className={cn(
        'rounded-lg border bg-surface',
        stepIssues.length ? 'border-red-300' : 'border-line',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="rounded p-0.5 text-ink-subtle hover:text-ink"
          aria-expanded={open}
          aria-label={open ? 'Collapse step' : 'Expand step'}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{step.name || meta.label}</p>
          <p className="truncate text-xs text-ink-subtle">
            <code>{step.type}</code> · id <code>{step.id}</code>
          </p>
        </div>
        <div className="hidden items-center gap-1.5 sm:flex">
          {meta.simulated && <SimulatedBadge />}
          {meta.sideEffect && (
            <Badge title="Writes data; replayed idempotently on retry">Side effect</Badge>
          )}
          {stepIssues.length > 0 && (
            <Badge tone="red">
              <AlertCircle className="h-3 w-3" aria-hidden="true" /> {stepIssues.length}
            </Badge>
          )}
        </div>
        {!ctx.readOnly && (
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              disabled={index === 0}
              onClick={() => onMove(-1)}
              aria-label="Move step up"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={index === count - 1}
              onClick={() => onMove(1)}
              aria-label="Move step down"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemove}
              aria-label={`Remove step ${step.name || step.id}`}
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        )}
      </div>

      {open && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          <p className="text-xs text-ink-muted">{meta.description}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${key}-name`} className="mb-1.5">
                Step name
              </Label>
              <Input
                id={`${key}-name`}
                value={step.name ?? ''}
                maxLength={80}
                disabled={ctx.readOnly}
                onChange={(e) => onChange({ ...step, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor={`${key}-id`} className="mb-1.5">
                Step ID (used in placeholders)
              </Label>
              <Input
                id={`${key}-id`}
                value={step.id}
                maxLength={48}
                disabled={ctx.readOnly}
                onChange={(e) =>
                  onChange({
                    ...step,
                    id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
                  })
                }
              />
            </div>
            {meta.fields.map((field) => (
              <ConfigField
                key={field.name}
                stepKey={key}
                field={field}
                config={step.config ?? {}}
                onConfigChange={(config) => onChange({ ...step, config })}
                disabled={ctx.readOnly}
                stepRefs={ctx.draftStepIds}
                paths={ctx.paths}
              />
            ))}
            {!isCondition && (
              <div>
                <Label htmlFor={`${key}-onerror`} className="mb-1.5">
                  If this step fails
                </Label>
                <Select
                  id={`${key}-onerror`}
                  value={step.onError ?? 'stop'}
                  disabled={ctx.readOnly}
                  onChange={(e) => onChange({ ...step, onError: e.target.value })}
                >
                  <option value="stop">Stop the workflow</option>
                  <option value="continue">Log the error and continue</option>
                </Select>
              </div>
            )}
          </div>

          {stepIssues.length > 0 && (
            <ul
              className="space-y-1 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800"
              role="alert"
            >
              {stepIssues.map((issue, i) => (
                <li key={i}>{issue.message}</li>
              ))}
            </ul>
          )}

          {isCondition && (
            <div className="grid gap-4 lg:grid-cols-2">
              {['then', 'else'].map((branch) => (
                <div
                  key={branch}
                  className="rounded-md border border-dashed border-line-strong bg-canvas p-3"
                >
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
                    <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                    {branch === 'then' ? 'Then (conditions true)' : 'Else (conditions false)'}
                  </p>
                  <StepList
                    steps={step[branch] ?? []}
                    parentPath={`${path}.${branch}`}
                    onChange={(list) => onChange({ ...step, [branch]: list })}
                    ctx={ctx}
                  />
                  {!ctx.readOnly && (
                    <div className="mt-2">
                      <AddStepMenu onAdd={addTo(branch)} label={`Add to ${branch}`} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function StepList({ steps, onChange, parentPath = '', ctx }) {
  if (!steps.length) return <p className="py-2 text-sm text-ink-subtle">No steps yet.</p>;
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => {
        const path = parentPath ? `${parentPath}.${step.id}` : step.id;
        return (
          <StepCard
            key={`${index}-${step.type}`}
            step={step}
            index={index}
            count={steps.length}
            path={path}
            ctx={ctx}
            onChange={(next) => onChange(steps.map((s, i) => (i === index ? next : s)))}
            onRemove={() => onChange(steps.filter((_, i) => i !== index))}
            onMove={(dir) => {
              const next = [...steps];
              const [moved] = next.splice(index, 1);
              next.splice(index + dir, 0, moved);
              onChange(next);
            }}
          />
        );
      })}
    </ol>
  );
}
