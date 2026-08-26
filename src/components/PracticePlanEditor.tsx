import { For, Show, createMemo, createSignal } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { Link, useNavigate } from '@tanstack/solid-router'
import {
  createLibraryItem,
  createSessionTemplate,
  updatePlannedSession,
  updateSessionTemplate,
  type PlannedSessionEdit,
  type TemplateItemInput,
  type TemplateLibraryItem,
  type SessionTemplateDetail,
} from '../data/sessionTemplates'

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
  const [search, setSearch] = createSignal('')
  const [libraryType, setLibraryType] = createSignal<'EXERCISE' | 'REPERTOIRE'>('EXERCISE')
  const [selectedParentId, setSelectedParentId] = createSignal<string | null>(null)
  const [savingAction, setSavingAction] = createSignal<'save' | 'save-and-use' | null>(null)
  const [error, setError] = createSignal('')
  const [creatingItem, setCreatingItem] = createSignal(false)
  const [newItemType, setNewItemType] = createSignal<'EXERCISE' | 'REPERTOIRE'>('EXERCISE')
  const [newItemName, setNewItemName] = createSignal('')
  const [newItemNotes, setNewItemNotes] = createSignal('')
  const [draggedLibraryItem, setDraggedLibraryItem] = createSignal<TemplateLibraryItem | null>(null)
  const [dropTargetId, setDropTargetId] = createSignal<string | null | undefined>(undefined)

  const filteredLibrary = createMemo(() => {
    const query = search().trim().toLowerCase()
    const selectedItems = library.filter((item) => item.type === libraryType())
    return query
      ? selectedItems.filter((item) => `${item.name} ${item.detail}`.toLowerCase().includes(query))
      : selectedItems
  })
  const itemCount = createMemo(
    () => flatten(nodes).filter((item) => item.type !== 'SECTION').length,
  )

  function addNode(node: EditorNode, parentId = selectedParentId()) {
    setNodes(
      produce((items) => {
        const destination = findChildren(items, parentId) ?? items
        destination.push(node)
      }),
    )
  }

  function addSection(parentId: string | null = selectedParentId()) {
    addNode(
      {
        clientId: clientId(),
        type: 'SECTION',
        sourceId: null,
        name: 'New section',
        notes: '',
        children: [],
      },
      parentId,
    )
  }

  function addLibraryEntry(item: TemplateLibraryItem, notes = '', parentId = selectedParentId()) {
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
    )
  }

  function dragLibraryEntry(event: DragEvent, item: TemplateLibraryItem) {
    setDraggedLibraryItem(item)
    event.dataTransfer?.setData('application/x-practice-library-item', item.id)
    event.dataTransfer?.setData('text/plain', item.name)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  }

  function allowLibraryDrop(event: DragEvent, parentId: string | null) {
    if (!draggedLibraryItem()) return
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    setDropTargetId(parentId)
  }

  function dropLibraryEntry(event: DragEvent, parentId: string | null) {
    const item = draggedLibraryItem()
    if (!item) return
    event.preventDefault()
    event.stopPropagation()
    addLibraryEntry(item, '', parentId)
    setSelectedParentId(parentId)
    clearLibraryDrag()
  }

  function leaveLibraryDropTarget(event: DragEvent, parentId: string | null) {
    const destination = event.relatedTarget
    const currentTarget = event.currentTarget
    if (
      destination instanceof Node &&
      currentTarget instanceof HTMLElement &&
      currentTarget.contains(destination)
    ) {
      return
    }
    if (dropTargetId() === parentId) setDropTargetId(undefined)
  }

  function clearLibraryDrag() {
    setDraggedLibraryItem(null)
    setDropTargetId(undefined)
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
    if (!props.session && !name().trim()) {
      setError('Enter a template name.')
      return
    }
    setSavingAction(action)
    try {
      const data = { name: name(), items: flatten(nodes) }
      if (props.session) {
        await updatePlannedSession({
          data: {
            id: props.session.id,
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
          <div class="template-name-input">
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
            class={`root-target ${selectedParentId() === null ? 'selected' : ''} ${dropTargetId() === null ? 'drop-target' : ''}`}
            onClick={() => setSelectedParentId(null)}
            onDragOver={(event) => allowLibraryDrop(event, null)}
            onDragLeave={(event) => leaveLibraryDropTarget(event, null)}
            onDrop={(event) => dropLibraryEntry(event, null)}
          >
            Add new items at the top level, or drop one here
          </button>
          <Show
            when={nodes.length > 0}
            fallback={
              <p class="editor-empty">Add a section or choose something from your library.</p>
            }
          >
            <div class="editor-tree">
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
                    dropTargetId={dropTargetId()}
                    onLibraryDragOver={allowLibraryDrop}
                    onLibraryDragLeave={leaveLibraryDropTarget}
                    onLibraryDrop={dropLibraryEntry}
                  />
                )}
              </For>
            </div>
          </Show>
        </section>

        <aside class="editor-panel library-panel">
          <div class="editor-panel-header">
            <strong>My library</strong>
            <span>Adds to the selected section</span>
          </div>
          <div class="library-type-tabs" role="tablist" aria-label="Library type">
            <button
              type="button"
              role="tab"
              aria-selected={libraryType() === 'EXERCISE'}
              class={libraryType() === 'EXERCISE' ? 'active' : ''}
              onClick={() => setLibraryType('EXERCISE')}
            >
              Exercises ({library.filter((item) => item.type === 'EXERCISE').length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={libraryType() === 'REPERTOIRE'}
              class={libraryType() === 'REPERTOIRE' ? 'active' : ''}
              onClick={() => setLibraryType('REPERTOIRE')}
            >
              Repertoire ({library.filter((item) => item.type === 'REPERTOIRE').length})
            </button>
          </div>
          <input
            class="text-input"
            value={search()}
            onInput={(event) => setSearch(event.currentTarget.value)}
            placeholder={`Search ${libraryType() === 'EXERCISE' ? 'exercises' : 'repertoire'}`}
            aria-label={`Search ${libraryType() === 'EXERCISE' ? 'exercises' : 'repertoire'}`}
          />
          <div class="editor-library-list">
            <For each={filteredLibrary()}>
              {(item) => (
                <button
                  type="button"
                  class={`editor-library-item ${draggedLibraryItem()?.id === item.id ? 'dragging' : ''}`}
                  draggable={true}
                  onClick={() => addLibraryEntry(item)}
                  onDragStart={(event) => dragLibraryEntry(event, item)}
                  onDragEnd={clearLibraryDrag}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <b>+ Add</b>
                </button>
              )}
            </For>
          </div>
          <button
            class="secondary-button full-button"
            type="button"
            onClick={() => {
              setNewItemType(libraryType())
              setCreatingItem(true)
            }}
          >
            + Create new {libraryType() === 'EXERCISE' ? 'exercise' : 'repertoire'}
          </button>
        </aside>
      </div>

      <Show when={creatingItem()}>
        <div class="modal-backdrop" role="presentation">
          <form class="editor-modal" onSubmit={createAndAddItem}>
            <h2>Create and add an item</h2>
            <label class="field-label" for="new-item-type">
              Type
            </label>
            <select
              id="new-item-type"
              class="text-input"
              value={newItemType()}
              onChange={(event) =>
                setNewItemType(event.currentTarget.value as 'EXERCISE' | 'REPERTOIRE')
              }
            >
              <option value="EXERCISE">Exercise</option>
              <option value="REPERTOIRE">Repertoire</option>
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
              <button type="button" class="secondary-button" onClick={() => setCreatingItem(false)}>
                Cancel
              </button>
              <button type="submit" class="primary-button">
                Create and add
              </button>
            </div>
          </form>
        </div>
      </Show>
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
  dropTargetId: string | null | undefined
  onLibraryDragOver: (event: DragEvent, parentId: string | null) => void
  onLibraryDragLeave: (event: DragEvent, parentId: string | null) => void
  onLibraryDrop: (event: DragEvent, parentId: string | null) => void
}) {
  const isSection = () => props.node.type === 'SECTION'

  return (
    <article
      class={`editor-node ${props.selectedParentId === props.node.clientId ? 'selected' : ''}`}
    >
      <div
        class={`editor-node-row ${isSection() && props.dropTargetId === props.node.clientId ? 'drop-target' : ''}`}
        onDragOver={(event) => {
          if (isSection()) props.onLibraryDragOver(event, props.node.clientId)
        }}
        onDragLeave={(event) => {
          if (isSection()) props.onLibraryDragLeave(event, props.node.clientId)
        }}
        onDrop={(event) => {
          if (isSection()) props.onLibraryDrop(event, props.node.clientId)
        }}
      >
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
      <Show when={props.node.children.length > 0}>
        <div class="editor-node-children">
          <For each={props.node.children}>
            {(child) => <TemplateNode {...props} node={child} />}
          </For>
        </div>
      </Show>
    </article>
  )
}
