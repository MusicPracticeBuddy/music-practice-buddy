import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from 'solid-js'
import Sortable from 'sortablejs'
import type { TemplateLibraryItem } from '@/data/sessionTemplates'
import {
  LIBRARY_ITEM_TYPE,
  type LibraryItemType as PracticeLibraryItemType,
} from '@/domain/session'

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

function subtreeMatches(item: TemplateLibraryItem, query: string): boolean {
  return (
    `${item.name} ${item.detail}`.toLowerCase().includes(query) ||
    (item.children ?? []).some((child) => subtreeMatches(child, query))
  )
}

function LibraryPickerRow(props: {
  item: TemplateLibraryItem
  depth: number
  expanded: boolean
  disabled?: boolean
  dragMode?: 'sortable' | 'native'
  actionLabel: string
  onSelect: () => void
  onToggle: () => void
  onDragStart?: (event: DragEvent) => void
}) {
  const children = () => props.item.children ?? []
  const padding = () => `${10 + props.depth * 18}px`

  return (
    <Show
      when={children().length > 0}
      fallback={
        <button
          type="button"
          class="editor-library-item"
          style={{ 'padding-left': padding() }}
          data-library-id={props.item.id}
          data-library-type={props.item.type}
          draggable={props.dragMode === 'native'}
          disabled={props.disabled}
          onDragStart={props.onDragStart}
          onClick={props.onSelect}
        >
          <span>
            <strong>{props.item.name}</strong>
            <small>{props.item.detail}</small>
          </span>
          <b>{props.actionLabel}</b>
        </button>
      }
    >
      <div
        class="editor-library-item library-item-with-children"
        style={{ 'padding-left': padding() }}
        data-library-id={props.item.id}
        data-library-type={props.item.type}
        draggable={props.dragMode === 'native'}
        onDragStart={props.onDragStart}
      >
        <button
          class="library-item-main"
          type="button"
          disabled={props.disabled}
          onClick={props.onSelect}
        >
          <span>
            <strong>{props.item.name}</strong>
            <small>{props.item.detail}</small>
          </span>
          <b>{props.actionLabel}</b>
        </button>
        <button
          class="library-expand-button"
          type="button"
          disabled={props.disabled}
          aria-expanded={props.expanded}
          aria-label={`${props.expanded ? 'Collapse' : 'Expand'} children of ${props.item.name}`}
          onClick={props.onToggle}
        >
          {props.expanded ? '▾' : '›'} {children().length}
        </button>
      </div>
    </Show>
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
  publicRepertoireItems?: TemplateLibraryItem[]
  searchPublicRepertoire?: boolean
  publicRepertoireLoading?: boolean
  onSearchPublicRepertoireChange?: (enabled: boolean) => void
  disabled?: boolean
  dragMode?: 'sortable' | 'native'
  itemActionLabel?: string
  headerAction?: JSX.Element
  footer?: JSX.Element
  helpText?: string
  onItemDragStart?: (event: DragEvent, item: TemplateLibraryItem) => void
}) {
  const [search, setSearch] = createSignal('')
  const [expandedIds, setExpandedIds] = createSignal<string[]>([])
  const selectedItems = createMemo(() =>
    props.type === LIBRARY_ITEM_TYPE.REPERTOIRE && props.searchPublicRepertoire
      ? (props.publicRepertoireItems ?? [])
      : props.items.filter((item) => item.type === props.type),
  )
  const visibleItems = createMemo(() => {
    const query = search().trim().toLowerCase()
    const visible: { item: TemplateLibraryItem; depth: number }[] = []
    const expanded = new Set(expandedIds())

    function visit(items: TemplateLibraryItem[], depth: number) {
      for (const item of items) {
        if (query && !subtreeMatches(item, query)) continue
        visible.push({ item, depth })
        const children = item.children ?? []
        const matchingChild = query && children.some((child) => subtreeMatches(child, query))
        if (expanded.has(item.id) || matchingChild) visit(children, depth + 1)
      }
    }

    visit(selectedItems(), 0)
    return visible
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
      <Show
        when={props.type === LIBRARY_ITEM_TYPE.REPERTOIRE && props.onSearchPublicRepertoireChange}
      >
        <label class="library-public-search-toggle">
          <input
            type="checkbox"
            checked={props.searchPublicRepertoire}
            onChange={(event) =>
              props.onSearchPublicRepertoireChange?.(event.currentTarget.checked)
            }
          />
          Search public repertoire
        </label>
      </Show>
      <PracticeLibraryList sortable={props.dragMode === 'sortable'}>
        <Show
          when={!props.loading && !props.publicRepertoireLoading}
          fallback={<p class="editor-empty">Loading…</p>}
        >
          <For
            each={visibleItems()}
            fallback={<p class="editor-empty">No matching practice items</p>}
          >
            {(entry) => (
              <LibraryPickerRow
                item={entry.item}
                depth={entry.depth}
                expanded={expandedIds().includes(entry.item.id)}
                disabled={props.disabled}
                dragMode={props.dragMode}
                actionLabel={props.itemActionLabel ?? '+ Add'}
                onSelect={() => props.onSelect(entry.item)}
                onToggle={() =>
                  setExpandedIds((ids) =>
                    ids.includes(entry.item.id)
                      ? ids.filter((id) => id !== entry.item.id)
                      : [...ids, entry.item.id],
                  )
                }
                onDragStart={(event) => props.onItemDragStart?.(event, entry.item)}
              />
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
