import { Show, createSignal } from 'solid-js';

type RepertoireChild = {
  id: string;
  title: string;
};

type SessionRepertoireRandomizerProps = {
  children: RepertoireChild[];
  onRecordChild: (title: string) => void;
};

export function SessionRepertoireRandomizer(props: SessionRepertoireRandomizerProps) {
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const selectedChild = () => props.children.find((child) => child.id === selectedId()) ?? null;

  function selectRandomChild() {
    const current = selectedChild();
    const candidates =
      props.children.length > 1
        ? props.children.filter((child) => child.id !== current?.id)
        : props.children;
    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    if (selected) setSelectedId(selected.id);
  }

  return (
    <div class="repertoire-randomizer">
      <div class="repertoire-randomizer-actions">
        <button class="secondary-button" type="button" onClick={selectRandomChild}>
          Random child
        </button>
        <Show when={selectedChild()}>
          {(child) => (
            <button
              class="secondary-button"
              type="button"
              aria-label={`Add ${child().title} to note`}
              onClick={() => props.onRecordChild(child().title)}
            >
              Add {child().title}
            </button>
          )}
        </Show>
      </div>
      <Show when={selectedChild()}>
        {(child) => (
          <p class="repertoire-randomizer-selection">
            Selected: <strong>{child().title}</strong>
          </p>
        )}
      </Show>
    </div>
  );
}
