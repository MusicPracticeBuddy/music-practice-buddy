import {
  For,
  Index,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  type JSX,
} from 'solid-js';
import { createForm } from '@tanstack/solid-form';
import { Link, useNavigate, useRouter } from '@tanstack/solid-router';
import { ExerciseNotation } from '@/components/ExerciseNotation';
import { InstrumentSelect } from '@/components/InstrumentFields';
import { createExercise, updateExercise, type ExerciseInput } from '@/data/exercises';
import { EXERCISE_NOTATION_FORMAT, type ExerciseNotationFormat } from '@/domain/exercise';
import { groupInstrumentOptions } from '@/domain/instrument';
import {
  createChildRepertoire,
  createRepertoire,
  searchComposerNames,
  updateRepertoire,
  type ComposerNameSuggestion,
  type InstrumentOption,
  type RepertoireCreditInput,
  type RepertoireInput,
  type RepertoireInstrumentInput,
  type RepertoireResourceInput,
} from '@/data/repertoire';

type LibraryItemFormProps = {
  kind: 'exercise' | 'repertoire';
  id?: string;
  parentId?: string;
  parentName?: string;
  isExcerpt?: boolean;
  startMeasure?: number | null;
  endMeasure?: number | null;
  name?: string;
  compositionYear?: number | null;
  notation?: string | null;
  notationFormat?: ExerciseNotationFormat;
  instrumentId?: string | null;
  visibility?: 'PRIVATE' | 'PUBLIC';
  credits?: RepertoireCreditInput[];
  instruments?: RepertoireInstrumentInput[];
  resources?: RepertoireResourceInput[];
  instrumentOptions?: InstrumentOption[];
  canCreatePublic?: boolean;
  embedded?: boolean;
  beforeFields?: JSX.Element;
  afterFields?: JSX.Element;
  cancelAction?: JSX.Element;
  submitLabel?: string;
  onSaved?: (item: {
    id: string;
    type: 'EXERCISE' | 'REPERTOIRE';
    name: string;
    detail: string;
    instrumentIds?: string[];
  }) => void | Promise<void>;
};

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : 'The library item could not be saved.';
}

type LibraryItemFormValues = {
  name: string;
  compositionYear: string;
  startMeasure: string;
  endMeasure: string;
  notation: string;
  notationFormat: ExerciseNotationFormat;
  visibility: 'PRIVATE' | 'PUBLIC';
  instrumentId: string;
  credits: RepertoireCreditInput[];
  instruments: RepertoireInstrumentInput[];
  resources: RepertoireResourceInput[];
};

function defaultValues(props: LibraryItemFormProps): LibraryItemFormValues {
  return {
    name: props.name ?? '',
    compositionYear: props.compositionYear?.toString() ?? '',
    startMeasure: props.startMeasure?.toString() ?? '',
    endMeasure: props.endMeasure?.toString() ?? '',
    notation: props.notation ?? '',
    notationFormat: props.notationFormat ?? EXERCISE_NOTATION_FORMAT.TEXT,
    visibility: props.visibility ?? 'PRIVATE',
    instrumentId: props.instrumentId ?? '',
    credits: props.credits ?? [],
    instruments: props.instruments ?? [],
    resources: props.resources ?? [],
  };
}

export function LibraryItemForm(props: LibraryItemFormProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const editing = () => props.id !== undefined;
  const label = () => (props.kind === 'exercise' ? 'exercise' : 'repertoire');
  const formApi = createForm(() => ({
    defaultValues: defaultValues(props),
    validators: {
      onSubmit: ({ value }) =>
        props.kind === 'repertoire' &&
        props.isExcerpt &&
        value.startMeasure !== '' &&
        value.endMeasure !== '' &&
        Number(value.startMeasure) > Number(value.endMeasure)
          ? 'Starting measure cannot be after ending measure.'
          : undefined,
    },
    onSubmit: ({ value }) => save(value),
  }));
  const formValues = formApi.useSelector((state) => state.values);
  const isSubmitting = formApi.useSelector((state) => state.isSubmitting);
  const submitErrors = formApi.useSelector((state) => state.errors);
  const validationError = () => submitErrors().find((item) => typeof item === 'string') ?? '';
  const value = <Key extends keyof LibraryItemFormValues>(key: Key) => formValues()[key];
  const name = () => value('name');
  const compositionYear = () => value('compositionYear');
  const startMeasure = () => value('startMeasure');
  const endMeasure = () => value('endMeasure');
  const notation = () => value('notation');
  const notationFormat = () => value('notationFormat');
  const visibility = () => value('visibility');
  const instrumentId = () => value('instrumentId');
  const credits = () => value('credits');
  const instruments = () => value('instruments');
  const resources = () => value('resources');
  const setName = (next: string) => formApi.setFieldValue('name', next);
  const setCompositionYear = (next: string) => formApi.setFieldValue('compositionYear', next);
  const setStartMeasure = (next: string) => formApi.setFieldValue('startMeasure', next);
  const setEndMeasure = (next: string) => formApi.setFieldValue('endMeasure', next);
  const setNotation = (next: string) => formApi.setFieldValue('notation', next);
  const setNotationFormat = (next: ExerciseNotationFormat) =>
    formApi.setFieldValue('notationFormat', next);
  const setVisibility = (next: 'PRIVATE' | 'PUBLIC') => formApi.setFieldValue('visibility', next);
  const setInstrumentId = (next: string) => formApi.setFieldValue('instrumentId', next);
  const setCredits = (update: (items: RepertoireCreditInput[]) => RepertoireCreditInput[]) =>
    formApi.setFieldValue('credits', update(credits()));
  const setInstruments = (
    update: (items: RepertoireInstrumentInput[]) => RepertoireInstrumentInput[],
  ) => formApi.setFieldValue('instruments', update(instruments()));
  const setResources = (update: (items: RepertoireResourceInput[]) => RepertoireResourceInput[]) =>
    formApi.setFieldValue('resources', update(resources()));
  const [composerSuggestions, setComposerSuggestions] = createSignal<ComposerNameSuggestion[]>([]);
  const [activeComposerIndex, setActiveComposerIndex] = createSignal<number | null>(null);
  const [acceptedComposerNames, setAcceptedComposerNames] = createSignal<Record<number, string>>(
    {},
  );
  const [error, setError] = createSignal('');
  let composerSearchTimer: ReturnType<typeof setTimeout> | undefined;
  let composerSearchRequest = 0;

  onCleanup(() => clearTimeout(composerSearchTimer));

  function queueComposerSearch(index: number, query: string) {
    clearTimeout(composerSearchTimer);
    const request = ++composerSearchRequest;
    setActiveComposerIndex(index);
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (acceptedComposerNames()[index]?.toLocaleLowerCase() === normalizedQuery) {
      setComposerSuggestions([]);
      return;
    }
    if (
      normalizedQuery &&
      composerSuggestions().some(
        (suggestion) => suggestion.name.toLocaleLowerCase() === normalizedQuery,
      )
    ) {
      setAcceptedComposerNames((names) => ({ ...names, [index]: query.trim() }));
      setComposerSuggestions([]);
      return;
    }
    setAcceptedComposerNames((names) => {
      if (!(index in names)) return names;
      const nextNames = { ...names };
      delete nextNames[index];
      return nextNames;
    });
    if (query.trim().length < 2) {
      setComposerSuggestions([]);
      return;
    }
    composerSearchTimer = setTimeout(async () => {
      try {
        const suggestions = await searchComposerNames({ data: query });
        if (request === composerSearchRequest) setComposerSuggestions(suggestions);
      } catch {
        if (request === composerSearchRequest) setComposerSuggestions([]);
      }
    }, 200);
  }

  createEffect(() => {
    const nextValues = defaultValues(props);
    untrack(() => formApi.reset(nextValues));
  });

  async function save(values: LibraryItemFormValues) {
    setError('');
    try {
      if (props.kind === 'exercise') {
        const data: ExerciseInput = {
          name: values.name,
          notation: values.notation,
          notationFormat: values.notationFormat,
          visibility: values.visibility,
          instrumentId: values.instrumentId || null,
        };
        const result = props.id
          ? await updateExercise({ data: { id: props.id, ...data } })
          : await createExercise({ data });
        if (props.onSaved) {
          await props.onSaved({
            id: result.id,
            type: 'EXERCISE',
            name: data.name.trim(),
            detail: data.notation.trim() ? 'Exercise · with notation' : 'Exercise',
            instrumentIds: data.instrumentId ? [data.instrumentId] : [],
          });
          return;
        }
        await router.invalidate({ sync: true });
        await navigate({ to: '/exercises/$exerciseId', params: { exerciseId: result.id } });
      } else {
        const data: RepertoireInput = {
          title: values.name,
          compositionYear: values.compositionYear ? Number(values.compositionYear) : null,
          visibility: values.visibility,
          credits: values.credits,
          instruments: values.instruments,
          resources: values.resources,
        };
        const measureRange = {
          startMeasure: props.isExcerpt ? Number(values.startMeasure) : null,
          endMeasure: props.isExcerpt ? Number(values.endMeasure) : null,
        };
        const result = props.id
          ? await updateRepertoire({ data: { id: props.id, ...data, ...measureRange } })
          : props.parentId
            ? await createChildRepertoire({
                data: { parentId: props.parentId, ...data, ...measureRange },
              })
            : await createRepertoire({ data });
        if (props.onSaved) {
          await props.onSaved({
            id: result.id,
            type: 'REPERTOIRE',
            name: data.title.trim(),
            detail: 'Repertoire',
            instrumentIds: (data.instruments ?? []).map((instrument) => instrument.instrumentId),
          });
          return;
        }
        await router.invalidate({ sync: true });
        await navigate({
          to: '/repertoire/$repertoireId',
          params: { repertoireId: result.id },
        });
      }
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  const form = (
    <form
      classList={{ 'creation-form': !props.embedded }}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void formApi.handleSubmit();
      }}
    >
      {props.beforeFields}
      <label class="field-label" for="library-item-name">
        {props.kind === 'exercise' ? 'Name' : 'Title'}
      </label>
      <input
        id="library-item-name"
        class="text-input"
        value={name()}
        onInput={(event) => setName(event.currentTarget.value)}
        maxlength={props.kind === 'exercise' ? 200 : 300}
        required
      />

      <Show when={props.kind === 'repertoire'}>
        <label class="field-label" for="repertoire-composition-year">
          Composition or publication year (optional)
        </label>
        <input
          id="repertoire-composition-year"
          class="text-input"
          type="number"
          min="-9999"
          max="9999"
          step="1"
          value={compositionYear()}
          onInput={(event) => setCompositionYear(event.currentTarget.value)}
        />
      </Show>

      <Show when={props.kind === 'repertoire' && props.isExcerpt}>
        <div class="measure-range-fields">
          <div>
            <label class="field-label" for="repertoire-start-measure">
              Starting measure
            </label>
            <input
              id="repertoire-start-measure"
              class="text-input"
              type="number"
              min="1"
              max={endMeasure() || undefined}
              step="1"
              value={startMeasure()}
              onInput={(event) => setStartMeasure(event.currentTarget.value)}
              required
            />
          </div>
          <div>
            <label class="field-label" for="repertoire-end-measure">
              Ending measure
            </label>
            <input
              id="repertoire-end-measure"
              class="text-input"
              type="number"
              min={startMeasure() || '1'}
              step="1"
              value={endMeasure()}
              onInput={(event) => setEndMeasure(event.currentTarget.value)}
              required
            />
          </div>
        </div>
      </Show>

      <Show when={props.kind === 'exercise'}>
        <InstrumentSelect
          id="exercise-instrument"
          instruments={props.instrumentOptions ?? []}
          value={instrumentId()}
          onChange={setInstrumentId}
        />

        <label class="field-label" for="exercise-instructions">
          Instructions or notation (optional)
        </label>
        <textarea
          id="exercise-instructions"
          class="text-input"
          rows="7"
          value={notation()}
          onInput={(event) => setNotation(event.currentTarget.value)}
        />

        <label class="field-label" for="exercise-notation-format">
          Notation format
        </label>
        <select
          id="exercise-notation-format"
          class="text-input"
          value={notationFormat()}
          onChange={(event) =>
            setNotationFormat(event.currentTarget.value as ExerciseNotationFormat)
          }
        >
          <option value={EXERCISE_NOTATION_FORMAT.TEXT}>Text</option>
          <option value={EXERCISE_NOTATION_FORMAT.ABC}>ABC notation</option>
        </select>

        <Show when={notationFormat() === EXERCISE_NOTATION_FORMAT.ABC}>
          <section class="exercise-notation-preview" aria-labelledby="exercise-preview-heading">
            <p class="eyebrow" id="exercise-preview-heading">
              Preview
            </p>
            <Show
              when={notation().trim()}
              fallback={<p class="muted">Enter ABC notation above to preview the score.</p>}
            >
              <ExerciseNotation notation={notation()} format={EXERCISE_NOTATION_FORMAT.ABC} />
            </Show>
          </section>
        </Show>
      </Show>

      <Show when={props.kind === 'repertoire'}>
        <section class="repertoire-editor-section">
          <div class="repertoire-editor-section-header">
            <div>
              <h2>Credits</h2>
              <p>
                Composers, arrangers, editors, and other contributors. Start typing a composer’s
                name and choose their full name when it appears.
              </p>
            </div>
            <button
              class="secondary-button"
              type="button"
              onClick={() => setCredits((items) => [...items, { person: '', role: 'COMPOSER' }])}
            >
              + Add credit
            </button>
          </div>
          <div class="repertoire-editor-rows">
            <Index each={credits()}>
              {(credit, index) => (
                <div class="repertoire-editor-row credit-row">
                  <input
                    class="text-input"
                    value={credit().person}
                    list={
                      credit().role === 'COMPOSER' ? `composer-name-options-${index}` : undefined
                    }
                    aria-label={`Credit ${index + 1} name`}
                    placeholder="Person name"
                    maxlength="200"
                    required
                    onFocus={() => {
                      if (credit().role === 'COMPOSER') {
                        queueComposerSearch(index, credit().person);
                      }
                    }}
                    onInput={(event) => {
                      setCredits((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, person: event.currentTarget.value }
                            : item,
                        ),
                      );
                      if (credit().role === 'COMPOSER') {
                        queueComposerSearch(index, event.currentTarget.value);
                      }
                    }}
                  />
                  <Show when={credit().role === 'COMPOSER'}>
                    <datalist id={`composer-name-options-${index}`}>
                      <For each={activeComposerIndex() === index ? composerSuggestions() : []}>
                        {(composer) => <option value={composer.name} />}
                      </For>
                    </datalist>
                  </Show>
                  <select
                    class="text-input"
                    value={credit().role}
                    aria-label={`Credit ${index + 1} role`}
                    onChange={(event) => {
                      setCredits((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                role: event.currentTarget.value as RepertoireCreditInput['role'],
                              }
                            : item,
                        ),
                      );
                      if (event.currentTarget.value === 'COMPOSER') {
                        queueComposerSearch(index, credit().person);
                      }
                    }}
                  >
                    <option value="COMPOSER">Composer</option>
                    <option value="ARRANGER">Arranger</option>
                    <option value="EDITOR">Editor</option>
                    <option value="TRANSCRIBER">Transcriber</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <button
                    class="row-remove-button"
                    type="button"
                    aria-label={`Remove credit ${index + 1}`}
                    onClick={() =>
                      setCredits((items) => items.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    Remove
                  </button>
                </div>
              )}
            </Index>
          </div>
        </section>

        <section class="repertoire-editor-section">
          <div class="repertoire-editor-section-header">
            <div>
              <h2>Instrumentation</h2>
              <p>Instruments, their roles, and optional part names.</p>
            </div>
            <button
              class="secondary-button"
              type="button"
              disabled={(props.instrumentOptions?.length ?? 0) === 0}
              onClick={() => {
                const firstInstrument = props.instrumentOptions?.[0];
                if (!firstInstrument) return;
                setInstruments((items) => [
                  ...items,
                  { instrumentId: firstInstrument.id, role: 'SOLO', partName: null },
                ]);
              }}
            >
              + Add instrument
            </button>
          </div>
          <div class="repertoire-editor-rows">
            <For each={instruments()}>
              {(instrument, index) => (
                <div class="repertoire-editor-row instrument-row">
                  <select
                    class="text-input"
                    value={instrument.instrumentId}
                    aria-label={`Instrument ${index() + 1}`}
                    onChange={(event) =>
                      setInstruments((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index()
                            ? { ...item, instrumentId: event.currentTarget.value }
                            : item,
                        ),
                      )
                    }
                  >
                    <For each={groupInstrumentOptions(props.instrumentOptions ?? [])}>
                      {(group) => (
                        <optgroup label={group.label}>
                          <For each={group.instruments}>
                            {(option) => <option value={option.id}>{option.name}</option>}
                          </For>
                        </optgroup>
                      )}
                    </For>
                  </select>
                  <select
                    class="text-input"
                    value={instrument.role}
                    aria-label={`Instrument ${index() + 1} role`}
                    onChange={(event) =>
                      setInstruments((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index()
                            ? {
                                ...item,
                                role: event.currentTarget
                                  .value as RepertoireInstrumentInput['role'],
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="SOLO">Solo</option>
                    <option value="ACCOMPANIMENT">Accompaniment</option>
                    <option value="ENSEMBLE">Ensemble</option>
                  </select>
                  <input
                    class="text-input"
                    value={instrument.partName ?? ''}
                    aria-label={`Instrument ${index() + 1} part name`}
                    placeholder="Part name (optional)"
                    maxlength="200"
                    onInput={(event) =>
                      setInstruments((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index()
                            ? { ...item, partName: event.currentTarget.value || null }
                            : item,
                        ),
                      )
                    }
                  />
                  <button
                    class="row-remove-button"
                    type="button"
                    aria-label={`Remove instrument ${index() + 1}`}
                    onClick={() =>
                      setInstruments((items) =>
                        items.filter((_, itemIndex) => itemIndex !== index()),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              )}
            </For>
          </div>
        </section>

        <section class="repertoire-editor-section">
          <div class="repertoire-editor-section-header">
            <div>
              <h2>Resources</h2>
              <p>Scores, recordings, videos, and related links.</p>
            </div>
            <button
              class="secondary-button"
              type="button"
              onClick={() => setResources((items) => [...items, { type: 'LINK', url: '' }])}
            >
              + Add resource
            </button>
          </div>
          <div class="repertoire-editor-rows">
            <For each={resources()}>
              {(resource, index) => (
                <div class="repertoire-editor-row resource-row">
                  <select
                    class="text-input"
                    value={resource.type}
                    aria-label={`Resource ${index() + 1} type`}
                    onChange={(event) =>
                      setResources((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index()
                            ? {
                                ...item,
                                type: event.currentTarget.value as RepertoireResourceInput['type'],
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="SCORE">Score</option>
                    <option value="RECORDING">Recording</option>
                    <option value="VIDEO">Video</option>
                    <option value="AUDIO">Audio</option>
                    <option value="LINK">Link</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <input
                    class="text-input"
                    type="url"
                    value={resource.url}
                    aria-label={`Resource ${index() + 1} URL`}
                    placeholder="https://…"
                    required
                    onInput={(event) =>
                      setResources((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index()
                            ? { ...item, url: event.currentTarget.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <button
                    class="row-remove-button"
                    type="button"
                    aria-label={`Remove resource ${index() + 1}`}
                    onClick={() =>
                      setResources((items) => items.filter((_, itemIndex) => itemIndex !== index()))
                    }
                  >
                    Remove
                  </button>
                </div>
              )}
            </For>
          </div>
        </section>
      </Show>

      <Show
        when={!props.parentId}
        fallback={
          <p class="field-help inherited-visibility-help">
            This child item is private to you, even when its parent repertoire is public.
          </p>
        }
      >
        <label class="field-label" for="library-item-visibility">
          Visibility
        </label>
        <select
          id="library-item-visibility"
          class="text-input"
          value={visibility()}
          onChange={(event) => setVisibility(event.currentTarget.value as 'PRIVATE' | 'PUBLIC')}
        >
          <option value="PRIVATE">Private</option>
          <Show when={props.canCreatePublic || (editing() && props.visibility === 'PUBLIC')}>
            <option value="PUBLIC">Public</option>
          </Show>
        </select>
        <p class="field-help">Public items can be viewed and used by other musicians.</p>
      </Show>

      {props.afterFields}

      <Show when={error() || validationError()}>
        <p class="form-error" role="alert">
          {error() || validationError()}
        </p>
      </Show>
      <div class="form-actions">
        {props.cancelAction}
        <button class="primary-button" type="submit" disabled={isSubmitting()}>
          {isSubmitting()
            ? 'Saving…'
            : (props.submitLabel ?? (editing() ? `Save ${label()}` : `Create ${label()}`))}
        </button>
      </div>
    </form>
  );

  if (props.embedded) return form;

  const repertoireChildLabel = () => (props.isExcerpt ? 'excerpt' : 'movement or piece');
  const cancelLink = () => {
    if (editing()) {
      return props.kind === 'exercise' ? (
        <Link
          class="secondary-button"
          to="/exercises/$exerciseId"
          params={{ exerciseId: props.id! }}
        >
          Cancel
        </Link>
      ) : (
        <Link
          class="secondary-button"
          to="/repertoire/$repertoireId"
          params={{ repertoireId: props.id! }}
        >
          Cancel
        </Link>
      );
    }
    if (props.parentId) {
      return (
        <Link
          class="secondary-button"
          to="/repertoire/$repertoireId"
          params={{ repertoireId: props.parentId }}
        >
          Cancel
        </Link>
      );
    }
    return (
      <Link class="secondary-button" to="/library">
        Cancel
      </Link>
    );
  };

  return (
    <main class={`page form-page ${props.kind === 'repertoire' ? 'repertoire-form-page' : ''}`}>
      <header class="page-header">
        <div>
          <p class="eyebrow">My Library</p>
          <h1>
            {props.parentId
              ? `${editing() ? 'Edit' : 'Add'} ${repertoireChildLabel()}`
              : `${editing() ? 'Edit' : 'Create'} ${label()}`}
          </h1>
          <Show when={props.parentName}>
            {(parentName) => <p class="lede">Part of {parentName()}</p>}
          </Show>
        </div>
        {cancelLink()}
      </header>
      {form}
    </main>
  );
}
