import { createSignal, type JSX } from 'solid-js';

const swipeLimit = 112;
const deleteThreshold = 72;

export function SwipeToDelete(props: {
  children: JSX.Element;
  enabled?: boolean;
  onDeleteRequest: () => void;
}) {
  let startX = 0;
  let startY = 0;
  let pointerId: number | null = null;
  let direction: 'horizontal' | 'vertical' | null = null;
  let suppressNextClick = false;
  const [offset, setOffset] = createSignal(0);
  const [dragging, setDragging] = createSignal(false);

  function resetGesture() {
    pointerId = null;
    direction = null;
    setDragging(false);
    setOffset(0);
  }

  function pointerDown(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    if (props.enabled === false || event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    direction = null;
  }

  function pointerMove(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    if (event.pointerId !== pointerId) return;
    const horizontalDistance = event.clientX - startX;
    const verticalDistance = event.clientY - startY;

    if (!direction && Math.max(Math.abs(horizontalDistance), Math.abs(verticalDistance)) >= 8) {
      direction =
        Math.abs(horizontalDistance) > Math.abs(verticalDistance) ? 'horizontal' : 'vertical';
      if (direction === 'horizontal') {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }
    }
    if (direction !== 'horizontal') return;

    event.preventDefault();
    setOffset(Math.max(-swipeLimit, Math.min(0, horizontalDistance)));
  }

  function pointerUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    const shouldDelete = direction === 'horizontal' && offset() <= -deleteThreshold;
    if (shouldDelete) {
      suppressNextClick = true;
      setTimeout(() => {
        suppressNextClick = false;
      });
    }
    resetGesture();
    if (shouldDelete) props.onDeleteRequest();
  }

  function cancelPointer(event: PointerEvent) {
    if (event.pointerId === pointerId) resetGesture();
  }

  return (
    <div
      class="swipe-delete-container"
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={cancelPointer}
      onClick={(event) => {
        if (!suppressNextClick) return;
        event.preventDefault();
        event.stopPropagation();
        suppressNextClick = false;
      }}
    >
      <div
        class="swipe-delete-background"
        style={{ opacity: Math.min(1, Math.abs(offset()) / 24) }}
        aria-hidden="true"
      >
        Delete
      </div>
      <div
        class={`swipe-delete-content ${dragging() ? 'dragging' : ''}`}
        style={{ transform: `translateX(${offset()}px)` }}
      >
        {props.children}
      </div>
    </div>
  );
}
