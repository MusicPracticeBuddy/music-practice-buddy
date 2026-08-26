import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { Link, useNavigate } from '@tanstack/solid-router'
import * as Dialog from '@kobalte/core/dialog'
import Sortable, { type MoveEvent, type SortableEvent } from 'sortablejs'
import { PracticeLibraryPanel } from '@/components/PracticeLibraryPanel'
import {
  createLibraryItem,
  createSessionTemplate,
  updatePlannedSession,
  updateSessionTemplate,
  type PlannedSessionEdit,
  type TemplateItemInput,
  type TemplateLibraryItem,
  type SessionTemplateDetail,
} from '@/data/sessionTemplates'
import {
  LIBRARY_ITEM_TYPE,
  PRACTICE_ITEM_TYPE,
  isLibraryItemType,
  type LibraryItemType,
} from '@/domain/session'

type EditorNode = Omit<TemplateItemInput, 'parentClientId' | 'position'> & {
  children: EditorNode[]
}

let nextClientId = 0
function clientId() {
  nextClientId += 1
  return `item-${Date.now()}-${nextClientId}`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function flatten(nodes: EditorNode[], parentClientId: string | null = null): TemplateItemInput[] {
  return nodes.flatMap((node, position) => [
    {
      clientId: node.clientId,
      parentClientId,
      type: node.type,
      sourceId: node.sourceId,
      name: node.name,
      notes: node.notes,
      position: position + 1,
    },
    ...flatten(node.children, node.clientId),
  ])
}

function findChildren(items: EditorNode[], parentId: string | null): EditorNode[] | null {
  if (parentId === null) return items
  for (const item of items) {
    if (item.clientId === parentId) return item.children
    const found = findChildren(item.children, parentId)
    if (found) return found
  }
  return null
}

function findNode(items: EditorNode[], id: string): EditorNode | null {
  for (const item of items) {
    if (item.clientId === id) return item
    const found = findNode(item.children, id)
    if (found) return found
  }
  return null
}

function containsNode(item: EditorNode, id: string): boolean {
  return item.children.some((child) => child.clientId === id || containsNode(child, id))
}

function removeEditorNode(items: EditorNode[], id: string): EditorNode | null {
  const index = items.findIndex((item) => item.clientId === id)
  if (index >= 0) return items.splice(index, 1)[0] ?? null
  for (const item of items) {
    const removed = removeEditorNode(item.children, id)
    if (removed) return removed
  }
  return null
}

function buildTree(items: TemplateItemInput[]): EditorNode[] {
  const nodes = new Map<string, EditorNode>()
  const roots: EditorNode[] = []
  for (const item of items) {
    nodes.set(item.clientId, {
      clientId: item.clientId,
      type: item.type,
      sourceId: item.sourceId,
      name: item.name,
      notes: item.notes,
      children: [],
    })
  }
  for (const item of items) {
    const node = nodes.get(item.clientId)
    if (!node) continue
    const parent = item.parentClientId ? nodes.get(item.parentClientId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

function PlanSortableList(props: {
  parentId: string | null
  class: string
  children: JSX.Element
  canMove: (nodeId: string, parentId: string | null) => boolean
  onMoveNode: (nodeId: string, parentId: string | null, index: number) => void
  onAddLibraryItem: (
    libraryId: string,
    libraryType: LibraryItemType,
    parentId: string | null,
    index: number,
  ) => void
}) {
  let element: HTMLDivElement | undefined

  onMount(() => {
    if (!element) return
    const sortable = new Sortable(element, {
      group: { name: 'practice-plan', pull: true, put: ['practice-plan', 'practice-library'] },
      animation: 150,
      fallbackOnBody: true,
      swapThreshold: 0.65,
      draggable: '.editor-node',
      handle: '.editor-drag-handle',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onMove: (event: MoveEvent) => {
        const nodeId = (event.dragged as HTMLElement).dataset.nodeId
        return nodeId ? props.canMove(nodeId, props.parentId) : true
      },
      onAdd: (event: SortableEvent) => {
        if (event.from.dataset.sortableKind === 'library') {
          const libraryId = event.item.dataset.libraryId
          const libraryType = event.item.dataset.libraryType
          const destinationIndex = event.newIndex ?? 0
          queueMicrotask(() => {
            if (event.clone.parentElement === event.from) {
              event.clone.replaceWith(event.item)
            } else if (event.item.parentElement !== event.from) {
              const oldIndex = event.oldIndex ?? event.from.children.length
              const anchor = event.from.children.item(
                Math.min(oldIndex, event.from.children.length),
              )
              event.from.insertBefore(event.item, anchor)
            }
            if (libraryId && isLibraryItemType(libraryType)) {
              props.onAddLibraryItem(libraryId, libraryType, props.parentId, destinationIndex)
            }
          })
          return
        }
        const nodeId = event.item.dataset.nodeId
        if (nodeId) {
          queueMicrotask(() => props.onMoveNode(nodeId, props.parentId, event.newIndex ?? 0))
        }
      },
      onUpdate: (event: SortableEvent) => {
        const nodeId = event.item.dataset.nodeId
        if (nodeId) {
          queueMicrotask(() => props.onMoveNode(nodeId, props.parentId, event.newIndex ?? 0))
        }
      },
    })
    onCleanup(() => sortable.destroy())
  })

  return (
    <div
      ref={(node) => {
        element = node
      }}
      class={props.class}
      data-sortable-kind="plan"
    >
      {props.children}
    </div>
  )
}

export function PracticePlanEditor(props: {
  library: TemplateLibraryItem[]
  template?: SessionTemplateDetail
  session?: PlannedSessionEdit
}) {
  const navigate = useNavigate()
  const initialRecord = props.session ?? props.template
  const [nodes, setNodes] = createStore<EditorNode[]>(buildTree(initialRecord?.items ?? []))
  const [library, setLibrary] = createStore<TemplateLibraryItem[]>([...props.library])
  const [name, setName] = createSignal(initialRecord?.name ?? '')
  const [assignedDate, setAssignedDate] = createSignal(props.session?.assignedDate ?? '')
  const [libraryType, setLibraryType] = createSignal<LibraryItemType>(LIBRARY_ITEM_TYPE.EXERCISE)
  const [selectedParentId, setSelectedParentId] = createSignal<string | null>(null)
  const [savingAction, setSavingAction] = createSignal<'save' | 'save-and-use' | null>(null)
  const [error, setError] = createSignal('')
  const [creatingItem, setCreatingItem] = createSignal(false)
  const [newItemType, setNewItemType] = createSignal<LibraryItemType>(LIBRARY_ITEM_TYPE.EXERCISE)
  const [newItemName, setNewItemName] = createSignal('')
  const [newItemNotes, setNewItemNotes] = createSignal('')

  const itemCount = createMemo(
    () => flatten(nodes).filter((item) => item.type !== PRACTICE_ITEM_TYPE.SECTION).length,
  )

  function addNode(node: EditorNode, parentId = selectedParentId(), index?: number) {
    setNodes(
      produce((items) => {
        const destination = findChildren(items, parentId) ?? items
        if (index === undefined) {
          destination.push(node)
          return
        }
        destination.splice(Math.min(Math.max(index, 0), destination.length), 0, node)
      }),
    )
  }

  function addSection(parentId: string | null = selectedParentId()) {
    addNode(
      {
        clientId: clientId(),
        type: PRACTICE_ITEM_TYPE.SECTION,
        sourceId: null,
        name: 'New section',
        notes: '',
        children: [],
      },
      parentId,
    )
  }

  function addLibraryEntry(
    item: TemplateLibraryItem,
    notes = '',
    parentId = selectedParentId(),
    index?: number,
  ) {
    addNode(
      {
        clientId: clientId(),
        type: item.type,
        sourceId: item.id,
        name: item.name,
        notes,
        children: [],
      },
      parentId,
      index,
    )
  }

  function canMoveNode(nodeId: string, parentId: string | null) {
    const node = findNode(nodes, nodeId)
    return Boolean(node && parentId !== nodeId && (!parentId || !containsNode(node, parentId)))
  }

  function moveNodeTo(nodeId: string, parentId: string | null, index: number) {
    setNodes(
      produce((items) => {
        const node = findNode(items, nodeId)
        if (!node || parentId === nodeId || (parentId && containsNode(node, parentId))) return
        const moved = removeEditorNode(items, nodeId)
        if (!moved) return
        const destination = findChildren(items, parentId) ?? items
        destination.splice(Math.min(Math.max(index, 0), destination.length), 0, moved)
      }),
    )
  }

  function addLibraryItemById(
    libraryId: string,
    itemType: LibraryItemType,
    parentId: string | null,
    index: number,
  ) {
    const item = library.find(
      (candidate) => candidate.id === libraryId && candidate.type === itemType,
    )
    if (!item) return
    addLibraryEntry(item, '', parentId, index)
    setSelectedParentId(parentId)
  }

  function removeNode(id: string) {
    setNodes(
      produce((items) => {
        function removeFrom(children: EditorNode[]): boolean {
          const index = children.findIndex((item) => item.clientId === id)
          if (index >= 0) {
            children.splice(index, 1)
            return true
          }
          return children.some((item) => removeFrom(item.children))
        }
        removeFrom(items)
      }),
    )
    if (selectedParentId() === id) setSelectedParentId(null)
  }

  function moveNode(id: string, offset: -1 | 1) {
    setNodes(
      produce((items) => {
        function moveIn(children: EditorNode[]): boolean {
          const index = children.findIndex((item) => item.clientId === id)
          if (index >= 0) {
            const destination = index + offset
            if (destination < 0 || destination >= children.length) return true
            const [item] = children.splice(index, 1)
            if (item) children.splice(destination, 0, item)
            return true
          }
          return children.some((item) => moveIn(item.children))
        }
        moveIn(items)
      }),
    )
  }

  function renameSection(id: string, value: string) {
    setNodes(
      produce((items) => {
        function rename(children: EditorNode[]): boolean {
          const item = children.find((candidate) => candidate.clientId === id)
          if (item) {
            item.name = value
            return true
          }
          return children.some((candidate) => rename(candidate.children))
        }
        rename(items)
      }),
    )
  }

  async function saveTemplate(action: 'save' | 'save-and-use') {
    setError('')
    if (!name().trim()) {
      setError(props.session ? 'Enter a session name.' : 'Enter a template name.')
      return
    }
    setSavingAction(action)
    try {
      const data = { name: name(), items: flatten(nodes) }
      if (props.session) {
        await updatePlannedSession({
          data: {
            id: props.session.id,
            name: name(),
            assignedDate: assignedDate() || null,
            items: data.items,
          },
        })
        await navigate({
          to: '/sessions/$sessionId',
          params: { sessionId: props.session.id },
        })
        return
      }

      const template = props.template
        ? await updateSessionTemplate({ data: { id: props.template.id, ...data } })
        : await createSessionTemplate({ data })
      if (action === 'save-and-use') {
        await navigate({ to: '/sessions/new', search: { template: template.id } })
      } else {
        await navigate({ to: '/templates' })
      }
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSavingAction(null)
    }
  }

  async function createAndAddItem(event: SubmitEvent) {
    event.preventDefault()
    setError('')
    try {
      const item = await createLibraryItem({
        data: { type: newItemType(), name: newItemName(), notes: newItemNotes() },
      })
      setLibrary((items) => [...items, item])
      setLibraryType(item.type)
      addLibraryEntry(item, newItemNotes())
      setNewItemName('')
      setNewItemNotes('')
      setCreatingItem(false)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <main class="page template-editor-page">
      <header class="editor-header">
        <div>
          <h1>
            {props.session
              ? 'Edit planned session'
              : props.template
                ? 'Edit template'
                : 'Create template'}
          </h1>
          <p class="lede">
            {props.session
              ? `Adjust the schedule and practice outline for ${props.session.name}.`
              : 'Build a reusable practice structure from your library.'}
          </p>
        </div>
        <div class="header-actions">
          <Show
            when={props.session}
            fallback={
              <Show
                when={props.template}
                fallback={
                  <Link class="secondary-button" to="/templates">
                    Cancel
                  </Link>
                }
              >
                {(template) => (
                  <Link
                    class="secondary-button"
                    to="/templates/$templateId"
                    params={{ templateId: template().id }}
                  >
                    Cancel
                  </Link>
                )}
              </Show>
            }
          >
            {(session) => (
              <Link
                class="secondary-button"
                to="/sessions/$sessionId"
                params={{ sessionId: session().id }}
              >
                Cancel
              </Link>
            )}
          </Show>
          <Show
            when={!props.session}
            fallback={
              <button
                class="primary-button"
                type="button"
                disabled={savingAction() !== null}
                onClick={() => saveTemplate('save')}
              >
                {savingAction() === 'save' ? 'Saving…' : 'Save session'}
              </button>
            }
          >
            <button
              class="secondary-button"
              type="button"
              disabled={savingAction() !== null}
              onClick={() => saveTemplate('save')}
            >
              {savingAction() === 'save' ? 'Saving…' : 'Save template'}
            </button>
            <button
              class="primary-button"
              type="button"
              disabled={savingAction() !== null}
              onClick={() => saveTemplate('save-and-use')}
            >
              {savingAction() === 'save-and-use' ? 'Saving…' : 'Save and use'}
            </button>
          </Show>
        </div>
      </header>

      <Show
        when={!props.session}
        fallback={
          <div>
            <label class="field-label" for="session-name">
              Session name
            </label>
            <input
              id="session-name"
              class="text-input template-name-input"
              value={name()}
              onInput={(event) => setName(event.currentTarget.value)}
              maxlength="200"
              required
            />
            <label class="field-label" for="session-scheduled-date">
              Scheduled date (optional)
            </label>
            <input
              id="session-scheduled-date"
              class="text-input"
              type="date"
              value={assignedDate()}
              onInput={(event) => setAssignedDate(event.currentTarget.value)}
            />
          </div>
        }
      >
        <label class="field-label" for="template-name">
          Template name
        </label>
        <input
          id="template-name"
          class="text-input template-name-input"
          value={name()}
          onInput={(event) => setName(event.currentTarget.value)}
          placeholder="My practice template"
        />
      </Show>
      <Show when={error()}>
        <p class="form-error" role="alert">
          {error()}
        </p>
      </Show>

      <div class="template-workspace">
        <section class="editor-panel">
          <div class="editor-panel-header">
            <strong>Template</strong>
            <span>{itemCount()} items</span>
            <button class="secondary-button" type="button" onClick={() => addSection(null)}>
              + Section
            </button>
          </div>
          <button
            type="button"
            class={`root-target ${selectedParentId() === null ? 'selected' : ''}`}
            onClick={() => setSelectedParentId(null)}
          >
            New items will be added at the top level
          </button>
          <PlanSortableList
            parentId={null}
            class="editor-tree plan-sortable-list"
            canMove={canMoveNode}
            onMoveNode={moveNodeTo}
            onAddLibraryItem={addLibraryItemById}
          >
            <Show
              when={nodes.length > 0}
              fallback={
                <p class="editor-empty">Add a section or drag something from your library.</p>
              }
            >
              <For each={nodes}>
                {(node) => (
                  <TemplateNode
                    node={node}
                    selectedParentId={selectedParentId()}
                    onSelect={setSelectedParentId}
                    onAddSection={addSection}
                    onRemove={removeNode}
                    onMove={moveNode}
                    onRename={renameSection}
                    canMove={canMoveNode}
                    onMoveNode={moveNodeTo}
                    onAddLibraryItem={addLibraryItemById}
                  />
                )}
              </For>
            </Show>
          </PlanSortableList>
        </section>

        <PracticeLibraryPanel
          class="library-panel"
          title="My library"
          subtitle="Adds to the selected section"
          items={library}
          type={libraryType()}
          onTypeChange={setLibraryType}
          onSelect={addLibraryEntry}
          dragMode="sortable"
          footer={
            <Dialog.Root
              open={creatingItem()}
              onOpenChange={(open) => {
                if (open) setNewItemType(libraryType())
                setCreatingItem(open)
              }}
            >
              <Dialog.Trigger class="secondary-button full-button">
                + Create new{' '}
                {libraryType() === LIBRARY_ITEM_TYPE.EXERCISE ? 'exercise' : 'repertoire'}
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay class="modal-backdrop" />
                <Dialog.Content class="editor-modal">
                  <form onSubmit={createAndAddItem}>
                    <Dialog.Title>Create and add an item</Dialog.Title>
                    <label class="field-label" for="new-item-type">
                      Type
                    </label>
                    <select
                      id="new-item-type"
                      class="text-input"
                      value={newItemType()}
                      onChange={(event) => {
                        const type = event.currentTarget.value
                        if (isLibraryItemType(type)) setNewItemType(type)
                      }}
                    >
                      <option value={LIBRARY_ITEM_TYPE.EXERCISE}>Exercise</option>
                      <option value={LIBRARY_ITEM_TYPE.REPERTOIRE}>Repertoire</option>
                    </select>
                    <label class="field-label" for="new-item-name">
                      Name
                    </label>
                    <input
                      id="new-item-name"
                      class="text-input"
                      value={newItemName()}
                      onInput={(event) => setNewItemName(event.currentTarget.value)}
                      required
                    />
                    <label class="field-label" for="new-item-notes">
                      Notes (optional)
                    </label>
                    <textarea
                      id="new-item-notes"
                      class="text-input"
                      value={newItemNotes()}
                      onInput={(event) => setNewItemNotes(event.currentTarget.value)}
                      rows="3"
                    />
                    <div class="modal-actions">
                      <Dialog.CloseButton class="secondary-button">Cancel</Dialog.CloseButton>
                      <button type="submit" class="primary-button">
                        Create and add
                      </button>
                    </div>
                  </form>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          }
        />
      </div>
    </main>
  )
}

function TemplateNode(props: {
  node: EditorNode
  selectedParentId: string | null
  onSelect: (id: string | null) => void
  onAddSection: (id: string | null) => void
  onRemove: (id: string) => void
  onMove: (id: string, offset: -1 | 1) => void
  onRename: (id: string, value: string) => void
  canMove: (nodeId: string, parentId: string | null) => boolean
  onMoveNode: (nodeId: string, parentId: string | null, index: number) => void
  onAddLibraryItem: (
    libraryId: string,
    libraryType: LibraryItemType,
    parentId: string | null,
    index: number,
  ) => void
}) {
  const isSection = () => props.node.type === PRACTICE_ITEM_TYPE.SECTION

  return (
    <article
      class={`editor-node ${props.selectedParentId === props.node.clientId ? 'selected' : ''}`}
      data-node-id={props.node.clientId}
    >
      <div class="editor-node-row">
        <span class="editor-drag-handle" title="Drag to move" aria-hidden="true">
          ⠿
        </span>
        <Show
          when={isSection()}
          fallback={
            <div class="editor-node-copy">
              <strong>{props.node.name}</strong>
              <small>{props.node.type.toLowerCase()}</small>
            </div>
          }
        >
          <input
            class="section-name-input"
            value={props.node.name}
            aria-label="Section name"
            onFocus={() => props.onSelect(props.node.clientId)}
            onInput={(event) => props.onRename(props.node.clientId, event.currentTarget.value)}
          />
        </Show>
        <div class="editor-node-actions">
          <button
            type="button"
            title="Move up"
            onClick={() => props.onMove(props.node.clientId, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            title="Move down"
            onClick={() => props.onMove(props.node.clientId, 1)}
          >
            ↓
          </button>
          <Show when={isSection()}>
            <button type="button" onClick={() => props.onSelect(props.node.clientId)}>
              Select
            </button>
            <button
              type="button"
              title="Add nested section"
              onClick={() => props.onAddSection(props.node.clientId)}
            >
              + Section
            </button>
          </Show>
          <button type="button" title="Remove" onClick={() => props.onRemove(props.node.clientId)}>
            ×
          </button>
        </div>
      </div>
      <Show when={isSection()}>
        <PlanSortableList
          parentId={props.node.clientId}
          class="editor-node-children plan-sortable-list"
          canMove={props.canMove}
          onMoveNode={props.onMoveNode}
          onAddLibraryItem={props.onAddLibraryItem}
        >
          <Show
            when={props.node.children.length > 0}
            fallback={<span class="section-drop-hint">Drop items here</span>}
          >
            <For each={props.node.children}>
              {(child) => <TemplateNode {...props} node={child} />}
            </For>
          </Show>
        </PlanSortableList>
      </Show>
    </article>
  )
}
