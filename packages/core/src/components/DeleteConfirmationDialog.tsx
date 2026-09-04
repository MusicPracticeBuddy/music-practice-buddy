import { Show, createSignal } from 'solid-js';
import * as AlertDialog from '@kobalte/core/alert-dialog';

export function DeleteConfirmationDialog(props: {
  triggerLabel: string;
  triggerAriaLabel?: string;
  triggerTooltip?: string;
  title: string;
  itemName: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  onConfirm: () => Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [error, setError] = createSignal('');

  function handleOpenChange(nextOpen: boolean) {
    if (deleting()) return;
    if (nextOpen) setError('');
    setInternalOpen(nextOpen);
    props.onOpenChange?.(nextOpen);
  }

  async function confirmDelete(event: SubmitEvent) {
    event.preventDefault();
    setDeleting(true);
    setError('');
    try {
      await props.onConfirm();
      setInternalOpen(false);
      props.onOpenChange?.(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The item could not be deleted.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog.Root open={props.open ?? internalOpen()} onOpenChange={handleOpenChange}>
      <AlertDialog.Trigger
        class="danger-button"
        aria-label={props.triggerAriaLabel}
        title={props.triggerTooltip}
      >
        {props.triggerLabel}
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay class="modal-backdrop" />
        <AlertDialog.Content class="editor-modal confirmation-modal">
          <form onSubmit={confirmDelete}>
            <AlertDialog.Title>{props.title}</AlertDialog.Title>
            <AlertDialog.Description>
              <span>{props.description}</span>
              <strong class="confirmation-item-name">{props.itemName}</strong>
            </AlertDialog.Description>
            <Show when={error()}>
              <p class="form-error" role="alert">
                {error()}
              </p>
            </Show>
            <div class="modal-actions">
              <AlertDialog.CloseButton class="secondary-button" disabled={deleting()}>
                Cancel
              </AlertDialog.CloseButton>
              <button class="danger-button" type="submit" disabled={deleting()}>
                {deleting() ? (props.pendingLabel ?? 'Deleting…') : props.confirmLabel}
              </button>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
