'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/form';
import { CONDITION_OPERATORS, UNARY_OPERATORS } from '@/lib/workflow-engine/conditions';
import { humanize } from '@/lib/utils/format';

export const COMMON_PATHS = [
  'lead.score',
  'lead.status',
  'lead.email',
  'lead.company',
  'lead.source',
  'lead.company_size',
  'lead.budget',
  'lead.classification',
  'lead.job_title',
  'trigger.payload.email',
  'trigger.payload.name',
];

function optionList(options) {
  return options.map((o) => (typeof o === 'string' ? { value: o, label: humanize(o) } : o));
}

function ConditionsEditor({ id, value = [], onChange, disabled, paths }) {
  const update = (index, patch) =>
    onChange(value.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-2">
      <datalist id={`${id}-paths`}>
        {paths.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {value.map((condition, index) => (
        <div
          key={index}
          className="grid grid-cols-1 gap-2 rounded-md border border-line p-2 sm:grid-cols-[1fr_10rem_1fr_auto]"
        >
          <Input
            aria-label={`Condition ${index + 1} field`}
            list={`${id}-paths`}
            value={condition.field ?? ''}
            disabled={disabled}
            placeholder="steps.score.score"
            onChange={(e) => update(index, { field: e.target.value.trim() })}
          />
          <Select
            aria-label={`Condition ${index + 1} operator`}
            value={condition.operator}
            disabled={disabled}
            onChange={(e) => update(index, { operator: e.target.value })}
          >
            {Object.entries(CONDITION_OPERATORS).map(([op, label]) => (
              <option key={op} value={op}>
                {label}
              </option>
            ))}
          </Select>
          {UNARY_OPERATORS.has(condition.operator) ? (
            <span className="hidden sm:block" />
          ) : (
            <Input
              aria-label={`Condition ${index + 1} value`}
              value={condition.value ?? ''}
              disabled={disabled}
              placeholder={condition.operator === 'in' ? 'a, b, c' : 'value'}
              onChange={(e) => {
                const raw = e.target.value;
                const numeric =
                  raw.trim() !== '' &&
                  !Number.isNaN(Number(raw)) &&
                  ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'].includes(condition.operator);
                update(index, { value: numeric ? Number(raw) : raw });
              }}
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled || value.length <= 1}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            aria-label={`Remove condition ${index + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || value.length >= 10}
        onClick={() => onChange([...value, { field: 'lead.score', operator: 'gte', value: 50 }])}
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Add condition
      </Button>
    </div>
  );
}

const TRANSFORM_OPS = [
  'set',
  'copy',
  'lowercase',
  'uppercase',
  'trim',
  'template',
  'default',
  'number',
];
const NEEDS_FROM = new Set(['copy', 'lowercase', 'uppercase', 'trim', 'default', 'number']);
const NEEDS_VALUE = new Set(['set', 'template', 'default']);

function OperationsEditor({ id, value = [], onChange, disabled, paths }) {
  const update = (index, patch) =>
    onChange(value.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  return (
    <div className="space-y-2">
      <datalist id={`${id}-paths`}>
        {paths.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {value.map((op, index) => (
        <div
          key={index}
          className="grid grid-cols-1 gap-2 rounded-md border border-line p-2 sm:grid-cols-[8rem_1fr_1fr_1fr_auto]"
        >
          <Select
            aria-label={`Operation ${index + 1}`}
            value={op.op}
            disabled={disabled}
            onChange={(e) => update(index, { op: e.target.value })}
          >
            {TRANSFORM_OPS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
          <Input
            aria-label={`Operation ${index + 1} target`}
            value={op.target ?? ''}
            disabled={disabled}
            placeholder="vars.name"
            onChange={(e) => update(index, { target: e.target.value.trim() })}
          />
          {NEEDS_FROM.has(op.op) ? (
            <Input
              aria-label={`Operation ${index + 1} source`}
              list={`${id}-paths`}
              value={op.from ?? ''}
              disabled={disabled}
              placeholder="from: lead.company"
              onChange={(e) => update(index, { from: e.target.value.trim() || undefined })}
            />
          ) : (
            <span className="hidden sm:block" />
          )}
          {NEEDS_VALUE.has(op.op) ? (
            <Input
              aria-label={`Operation ${index + 1} value`}
              value={op.value ?? ''}
              disabled={disabled}
              placeholder="value or {{template}}"
              onChange={(e) => update(index, { value: e.target.value })}
            />
          ) : (
            <span className="hidden sm:block" />
          )}
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled || value.length <= 1}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            aria-label={`Remove operation ${index + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || value.length >= 20}
        onClick={() => onChange([...value, { op: 'set', target: 'vars.value', value: '' }])}
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Add operation
      </Button>
    </div>
  );
}

/** Renders one config field from the action catalog descriptor. */
export function ConfigField({ stepKey, field, config, onConfigChange, disabled, stepRefs, paths }) {
  const id = `${stepKey}-${field.name}`;
  const value = config[field.name];
  const set = (next) => {
    const copy = { ...config };
    if (next === undefined || next === '') delete copy[field.name];
    else copy[field.name] = next;
    onConfigChange(copy);
  };

  if (field.kind === 'boolean') {
    return (
      <Checkbox
        id={id}
        label={field.label}
        checked={Boolean(value)}
        disabled={disabled}
        onChange={(e) => set(e.target.checked)}
      />
    );
  }

  let control;
  switch (field.kind) {
    case 'textarea':
      control = (
        <Textarea
          id={id}
          rows={3}
          value={value ?? ''}
          disabled={disabled}
          placeholder={field.placeholder}
          onChange={(e) => set(e.target.value)}
        />
      );
      break;
    case 'select':
      control = (
        <Select
          id={id}
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => set(e.target.value || undefined)}
        >
          {field.optional && <option value="">No change</option>}
          {optionList(field.options).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
      break;
    case 'step-ref':
      control = (
        <Select
          id={id}
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => set(e.target.value || undefined)}
        >
          <option value="">None (use subject and body below)</option>
          {stepRefs.map((ref) => (
            <option key={ref} value={ref}>
              {ref}
            </option>
          ))}
        </Select>
      );
      break;
    case 'conditions':
      control = (
        <ConditionsEditor id={id} value={value} onChange={set} disabled={disabled} paths={paths} />
      );
      break;
    case 'operations':
      control = (
        <OperationsEditor id={id} value={value} onChange={set} disabled={disabled} paths={paths} />
      );
      break;
    default:
      control = (
        <Input
          id={id}
          value={value ?? ''}
          disabled={disabled}
          placeholder={field.placeholder}
          onChange={(e) => set(e.target.value)}
        />
      );
  }

  return (
    <div
      className={
        field.kind === 'conditions' || field.kind === 'operations' || field.kind === 'textarea'
          ? 'sm:col-span-2'
          : ''
      }
    >
      <Label htmlFor={id} className="mb-1.5">
        {field.label}
      </Label>
      {control}
    </div>
  );
}
