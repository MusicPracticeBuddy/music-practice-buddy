import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from 'solid-js'
import Sortable from 'sortablejs'
import type { TemplateLibraryItem } from '../data/sessionTemplates'
import {
  LIBRARY_ITEM_TYPE,
  type LibraryItemType as PracticeLibraryItemType,
} from '../domain/session'

export type { PracticeLibraryItemType }

function PracticeLibraryList(props: { sortable: boolean; children: JSX.Element }) {
  let element: HTMLDivElement | undefined

  onMount(() => {
    if (!element || !props.sortable) return
    const sortable = new Sortable(element, {
      group: { name: 'practice-library', pull: 'clone', put: false },
      sort: false,
      animation: 150,
      draggable: '.editor-library-item',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
    })
    onCleanup(() => sortable.destroy())
  })

  return (
    <div
      ref={(node) => {
        element = node
      }}
      class="editor-library-list"
      data-sortable-kind={props.sortable ? 'library' : undefined}
    >
      {props.children}
    </div>
  )
}

export function PracticeLibraryPanel(props: {
  items: TemplateLibraryItem[]
  type: PracticeLibraryItemType
  onTypeChange: (type: PracticeLibraryItemType) => void
  onSelect: (item: TemplateLibraryItem) => void
  title?: string
  subtitle?: string
  class?: string
  loading?: boolean
  disabled?: boolean
  dragMode?: 'sortable' | 'native'
  itemActionLabel?: string
  headerAction?: JSX.Element
  footer?: JSX.Element
  helpText?: string
  onItemDragStart?: (event: DragEvent, item: TemplateLibraryItem) => void
}) {
  const [search, setSearch] = createSignal('')
  const filteredItems = createMemo(() => {
    const query = search().trim().toLowerCase()
    const selectedItems = props.items.filter((item) => item.type === props.type)
    return query
      ? selectedItems.filter((item) => `${item.name} ${item.detail}`.toLowerCase().includes(query))
      : selectedItems
  })
  const typeLabel = () => (props.type === LIBRARY_ITEM_TYPE.EXERCISE ? 'exercises' : 'repertoire')

  return (
    <aside
      class={`editor-panel ${props.class ?? ''}`}
      aria-label={props.title ?? 'Practice library'}
    >
      <div class="editor-panel-header">
        <strong>{props.title ?? 'Practice library'}</strong>
        <Show when={props.subtitle}>
          <span>{props.subtitle}</span>
        </Show>
        {props.headerAction}
      </div>
      <div class="library-type-tabs" role="tablist" aria-label="Library type">
        <button
          type="button"
          role="tab"
          aria-selected={props.type === LIBRARY_ITEM_TYPE.EXERCISE}
          classList={{ active: props.type === LIBRARY_ITEM_TYPE.EXERCISE }}
          onClick={() => props.onTypeChange(LIBRARY_ITEM_TYPE.EXERCISE)}
        >
          Exercises ({props.items.filter((item) => item.type === LIBRARY_ITEM_TYPE.EXERCISE).length}
          )
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={props.type === LIBRARY_ITEM_TYPE.REPERTOIRE}
          classList={{ active: props.type === LIBRARY_ITEM_TYPE.REPERTOIRE }}
          onClick={() => props.onTypeChange(LIBRARY_ITEM_TYPE.REPERTOIRE)}
        >
          Repertoire (
          {props.items.filter((item) => item.type === LIBRARY_ITEM_TYPE.REPERTOIRE).length})
        </button>
      </div>
      <input
        class="text-input"
        type="search"
        value={search()}
        onInput={(event) => setSearch(event.currentTarget.value)}
        placeholder={`Search ${typeLabel()}…`}
        aria-label={`Search ${typeLabel()}`}
      />
      <PracticeLibraryList sortable={props.dragMode === 'sortable'}>
        <Show when={!props.loading} fallback={<p class="editor-empty">Loading…</p>}>
          <For
            each={filteredItems()}
            fallback={<p class="editor-empty">No matching practice items</p>}
          >
            {(item) => (
              <button
                type="button"
                class="editor-library-item"
                data-library-id={item.id}
                data-library-type={item.type}
                draggable={props.dragMode === 'native'}
                disabled={props.disabled}
                onDragStart={(event) => props.onItemDragStart?.(event, item)}
                onClick={() => props.onSelect(item)}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.detail}</small>
                </span>
                <b>{props.itemActionLabel ?? '+ Add'}</b>
              </button>
            )}
          </For>
        </Show>
      </PracticeLibraryList>
      {props.footer}
      <Show when={props.helpText}>
        <p class="field-help">{props.helpText}</p>
      </Show>
    </aside>
  )
}
