import { For, Show, createSignal, createUniqueId } from 'solid-js';
import { SessionExerciseNotation } from '@/components/SessionExerciseNotation';
import { SessionRepertoireRandomizer } from '@/components/SessionRepertoireRandomizer';
import {
  PRACTICE_ITEM_TYPE,
  SESSION_ITEM_ACTION,
  SESSION_ITEM_STATUS,
  SESSION_TIMING_MODE,
  appendKeyToSessionNote,
  appendRepertoireChildToSessionNote,
  isResolvedSessionItemStatus,
  type PracticeItemType,
  type SessionItemAction,
  type SessionItemStatus,
  type SessionTimingMode,
} from '@/domain/session';

export type PracticePlanItem = {
  id: string;
  parentId: string | null;
  type: PracticeItemType;
  name: string;
  instruction: string | null;
  notation: string | null;
  notationFormat: string | null;
  repertoireChildren?: { id: string; title: string }[];
  status?: SessionItemStatus;
  sessionNote?: string | null;
  addedDuringSession?: boolean;
  durationMinutes?: number | null;
};

type PracticePlanItemNode = PracticePlanItem & { children: PracticePlanItemNode[] };

type PracticePlanOutlineProps = {
  items: PracticePlanItem[];
  sessionActive?: boolean;
  addingItem?: boolean;
  timingMode?: SessionTimingMode | null;
  hasActiveItem?: boolean;
  onAction?: (itemId: string, action: SessionItemAction) => void;
  onRemove?: (itemId: string) => Promise<boolean>;
  onUpdateSessionNote?: (itemId: string, sessionNote: string) => Promise<boolean>;
  onDropLibraryItem?: (event: DragEvent, parentId: string | null) => void;
};

function buildItemTree(items: PracticePlanItem[]): PracticePlanItemNode[] {
  const nodes = new Map<string, PracticePlanItemNode>();
  const roots: PracticePlanItemNode[] = [];
  for (const item of items) nodes.set(item.id, { ...item, children: [] });
  for (const item of items) {
    const node = nodes.get(item.id);
    if (!node) continue;
    const parent = item.parentId ? nodes.get(item.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function descendants(item: PracticePlanItemNode): PracticePlanItemNode[] {
  return item.children.flatMap((child) => [child, ...descendants(child)]);
}

function practiceDescendants(item: PracticePlanItemNode) {
  return descendants(item).filter((child) => child.type !== PRACTICE_ITEM_TYPE.SECTION);
}

function derivedSectionStatus(item: PracticePlanItemNode): SessionItemStatus {
  const children = practiceDescendants(item);
  if (children.length === 0) return SESSION_ITEM_STATUS.NOT_STARTED;
  if (children.every((child) => child.status === SESSION_ITEM_STATUS.SKIPPED)) {
    return SESSION_ITEM_STATUS.SKIPPED;
  }
  if (
    children.every(
      (child) => child.status !== undefined && isResolvedSessionItemStatus(child.status),
    )
  ) {
    return SESSION_ITEM_STATUS.COMPLETE;
  }
  if (
    children.some(
      (child) =>
        child.status === SESSION_ITEM_STATUS.IN_PROGRESS ||
        child.status === SESSION_ITEM_STATUS.COMPLETE,
    )
  ) {
    return SESSION_ITEM_STATUS.IN_PROGRESS;
  }
  return SESSION_ITEM_STATUS.NOT_STARTED;
}

function statusLabel(status: SessionItemStatus) {
  return status
    .replace('_', ' ')
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
}

function StatusIndicator(props: { status: SessionItemStatus }) {
  const icon = () => {
    if (props.status === SESSION_ITEM_STATUS.COMPLETE) return '✓';
    if (props.status === SESSION_ITEM_STATUS.SKIPPED) return '—';
    if (props.status === SESSION_ITEM_STATUS.IN_PROGRESS) return '◐';
    return '○';
  };
  return (
    <span
      class={`item-state item-state-${props.status.toLowerCase().replace('_', '-')}`}
      aria-label={statusLabel(props.status)}
      title={statusLabel(props.status)}
    >
      {icon()}
    </span>
  );
}

export function PracticePlanOutline(props: PracticePlanOutlineProps) {
  const tree = () => buildItemTree(props.items);

  return (
    <section class="session-outline" aria-label="Practice plan contents">
      <For each={tree()}>{(item) => <PracticePlanOutlineItem {...props} item={item} />}</For>
    </section>
  );
}

function PracticePlanOutlineItem(props: PracticePlanOutlineProps & { item: PracticePlanItemNode }) {
  const isSection = props.item.type === PRACTICE_ITEM_TYPE.SECTION;
  const [expanded, setExpanded] = createSignal(isSection);
  const [editingSessionNote, setEditingSessionNote] = createSignal(false);
  const [sessionNoteDraft, setSessionNoteDraft] = createSignal(props.item.sessionNote ?? '');
  const [savingSessionNote, setSavingSessionNote] = createSignal(false);
  const uniqueId = createUniqueId();
  const contentId = `practice-plan-item-${uniqueId}-content`;
  const sessionNoteId = `practice-plan-item-${uniqueId}-session-note`;
  let sessionNoteElement: HTMLTextAreaElement | undefined;
  const itemStatus = () => props.item.status ?? SESSION_ITEM_STATUS.NOT_STARTED;
  const status = () => (isSection ? derivedSectionStatus(props.item) : itemStatus());
  const sectionCanSkip = () => {
    const items = practiceDescendants(props.item);
    return (
      items.length > 0 &&
      items.every(
        (item) =>
          item.status === SESSION_ITEM_STATUS.NOT_STARTED ||
          item.status === SESSION_ITEM_STATUS.SKIPPED,
      )
    );
  };

  function editSessionNote() {
    setSessionNoteDraft(props.item.sessionNote ?? '');
    setEditingSessionNote(true);
  }

  async function saveSessionNote() {
    if (!props.onUpdateSessionNote) return;
    setSavingSessionNote(true);
    const saved = await props.onUpdateSessionNote(props.item.id, sessionNoteDraft());
    setSavingSessionNote(false);
    if (saved) setEditingSessionNote(false);
  }

  function recordSelectedKey(keyLabel: string) {
    const currentNote = editingSessionNote() ? sessionNoteDraft() : (props.item.sessionNote ?? '');
    const nextNote = appendKeyToSessionNote(currentNote, keyLabel);
    setSessionNoteDraft(nextNote);
    setEditingSessionNote(true);
    queueMicrotask(() => {
      sessionNoteElement?.focus();
      sessionNoteElement?.setSelectionRange(nextNote.length, nextNote.length);
    });
  }

  function recordSelectedRepertoireChild(title: string) {
    const currentNote = editingSessionNote() ? sessionNoteDraft() : (props.item.sessionNote ?? '');
    const nextNote = appendRepertoireChildToSessionNote(currentNote, title);
    setSessionNoteDraft(nextNote);
    setEditingSessionNote(true);
    queueMicrotask(() => {
      sessionNoteElement?.focus();
      sessionNoteElement?.setSelectionRange(nextNote.length, nextNote.length);
    });
  }

  if (isSection) {
    return (
      <section class="practice-section">
        <div class="practice-section-header">
          <button
            type="button"
            class="section-disclosure"
            aria-expanded={expanded()}
            aria-controls={contentId}
            onClick={() => setExpanded((value) => !value)}
          >
            <span class="disclosure-icon" aria-hidden="true">
              {expanded() ? '⌄' : '›'}
            </span>
            <h2>{props.item.name}</h2>
          </button>
          <Show when={props.item.status !== undefined}>
            <div class="disclosure-status">
              <Show when={props.sessionActive && status() === SESSION_ITEM_STATUS.SKIPPED}>
                <button
                  class="item-action item-action-reset"
                  type="button"
                  onClick={() => props.onAction?.(props.item.id, SESSION_ITEM_ACTION.RESET)}
                >
                  Reset section
                </button>
              </Show>
              <Show
                when={
                  props.sessionActive &&
                  status() !== SESSION_ITEM_STATUS.SKIPPED &&
                  sectionCanSkip()
                }
              >
                <button
                  class="item-action"
                  type="button"
                  onClick={() => props.onAction?.(props.item.id, SESSION_ITEM_ACTION.SKIP)}
                >
                  Skip section
                </button>
              </Show>
              <StatusIndicator status={status()} />
            </div>
          </Show>
        </div>
        <Show when={props.addingItem && props.onDropLibraryItem}>
          <div
            class="running-drop-zone running-drop-zone-section"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => props.onDropLibraryItem?.(event, props.item.id)}
          >
            Drop here to add to {props.item.name}
          </div>
        </Show>
        <Show when={expanded()}>
          <div id={contentId}>
            <Show when={props.item.instruction}>
              <div class="practice-instruction">
                <strong>Instruction</strong>
                <p>{props.item.instruction}</p>
              </div>
            </Show>
            <Show when={props.item.sessionNote}>
              <div class="practice-session-note">
                <strong>Session note</strong>
                <p>{props.item.sessionNote}</p>
              </div>
            </Show>
            <div class="practice-items">
              <For each={props.item.children}>
                {(child) => <PracticePlanOutlineItem {...props} item={child} />}
              </For>
            </div>
          </div>
        </Show>
      </section>
    );
  }

  return (
    <article class={`practice-item practice-item-${itemStatus().toLowerCase().replace('_', '-')}`}>
      <div class="practice-item-header">
        <button
          type="button"
          class="practice-item-toggle"
          aria-expanded={expanded()}
          aria-controls={contentId}
          onClick={() => setExpanded((value) => !value)}
        >
          <span class="disclosure-icon" aria-hidden="true">
            {expanded() ? '⌄' : '›'}
          </span>
          <h3>{props.item.name}</h3>
        </button>
        <Show when={props.item.status !== undefined}>
          <div class="practice-item-quick-actions">
            <Show
              when={
                props.sessionActive &&
                itemStatus() === SESSION_ITEM_STATUS.NOT_STARTED &&
                props.timingMode === SESSION_TIMING_MODE.MANUAL
              }
            >
              <button
                class="item-action"
                type="button"
                disabled={props.hasActiveItem}
                onClick={() => props.onAction?.(props.item.id, SESSION_ITEM_ACTION.START)}
              >
                Start timer
              </button>
            </Show>
            <Show
              when={
                props.sessionActive &&
                (itemStatus() === SESSION_ITEM_STATUS.NOT_STARTED ||
                  itemStatus() === SESSION_ITEM_STATUS.IN_PROGRESS)
              }
            >
              <button
                class="item-action item-action-complete"
                type="button"
                onClick={() => props.onAction?.(props.item.id, SESSION_ITEM_ACTION.COMPLETE)}
              >
                Complete
              </button>
              <button
                class="item-action"
                type="button"
                onClick={() => props.onAction?.(props.item.id, SESSION_ITEM_ACTION.SKIP)}
              >
                Skip
              </button>
            </Show>
            <Show
              when={
                props.sessionActive &&
                (itemStatus() === SESSION_ITEM_STATUS.COMPLETE ||
                  itemStatus() === SESSION_ITEM_STATUS.SKIPPED)
              }
            >
              <button
                class="item-action item-action-reset"
                type="button"
                aria-label={`Reset ${props.item.name} to not started`}
                onClick={() => props.onAction?.(props.item.id, SESSION_ITEM_ACTION.RESET)}
              >
                Reset
              </button>
            </Show>
            <Show when={props.sessionActive && props.item.addedDuringSession}>
              <button
                class="item-action item-action-remove"
                type="button"
                aria-label={`Remove ${props.item.name} from this session`}
                onClick={() => void props.onRemove?.(props.item.id)}
              >
                Remove
              </button>
            </Show>
            <StatusIndicator status={itemStatus()} />
          </div>
        </Show>
      </div>
      <Show when={expanded()}>
        <div id={contentId} class="practice-item-details">
          <div class="practice-item-heading">
            <span class="item-type">{props.item.type.toLowerCase()}</span>
            <Show when={props.item.status !== undefined}>
              <span class="item-timing">
                {props.item.durationMinutes !== null && props.item.durationMinutes !== undefined
                  ? `${props.item.durationMinutes} min`
                  : statusLabel(itemStatus())}
              </span>
            </Show>
          </div>
          <Show when={props.item.instruction}>
            <div class="practice-instruction">
              <strong>Instruction</strong>
              <p>{props.item.instruction}</p>
            </div>
          </Show>
          <Show when={props.item.sessionNote && !editingSessionNote()}>
            <div class="practice-session-note">
              <strong>Session note</strong>
              <p>{props.item.sessionNote}</p>
            </div>
          </Show>
          <Show when={props.sessionActive && props.onUpdateSessionNote && !editingSessionNote()}>
            <button
              class="text-button practice-note-action"
              type="button"
              onClick={editSessionNote}
            >
              {props.item.sessionNote ? 'Edit session note' : '+ Add session note'}
            </button>
          </Show>
          <Show when={props.sessionActive && props.onUpdateSessionNote && editingSessionNote()}>
            <div class="running-note-editor">
              <label class="field-label" for={sessionNoteId}>
                Session note
              </label>
              <textarea
                id={sessionNoteId}
                class="text-input"
                rows="3"
                maxlength="2000"
                value={sessionNoteDraft()}
                ref={(element) => {
                  sessionNoteElement = element;
                }}
                onInput={(event) => setSessionNoteDraft(event.currentTarget.value)}
              />
              <div class="running-note-actions">
                <button
                  class="secondary-button"
                  type="button"
                  disabled={savingSessionNote()}
                  onClick={() => setEditingSessionNote(false)}
                >
                  Cancel
                </button>
                <button
                  class="primary-button"
                  type="button"
                  disabled={savingSessionNote()}
                  onClick={() => void saveSessionNote()}
                >
                  {savingSessionNote() ? 'Saving…' : 'Save session note'}
                </button>
              </div>
            </div>
          </Show>
          <Show when={props.item.notation}>
            <SessionExerciseNotation
              notation={props.item.notation ?? ''}
              format={props.item.notationFormat}
              showKeyControls={props.sessionActive === true}
              onRecordKey={props.sessionActive ? recordSelectedKey : undefined}
            />
          </Show>
          <Show
            when={
              props.sessionActive &&
              props.item.type === PRACTICE_ITEM_TYPE.REPERTOIRE &&
              (props.item.repertoireChildren?.length ?? 0) > 0
            }
          >
            <SessionRepertoireRandomizer
              children={props.item.repertoireChildren ?? []}
              onRecordChild={recordSelectedRepertoireChild}
            />
          </Show>
        </div>
      </Show>
    </article>
  );
}
