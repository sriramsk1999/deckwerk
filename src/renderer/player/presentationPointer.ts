/**
 * A click produced after dragging across text must belong to the browser's
 * native selection gesture, not to presentation navigation.
 */
export function selectionPreventsAdvance(selection: Selection | null = window.getSelection()): boolean {
  return selection !== null && selection.rangeCount > 0 && !selection.isCollapsed;
}

/** The class on <html> while the pointer is in use; presentation CSS shows the cursor only then. */
export const POINTER_ACTIVE_CLASS = 'presentation-pointer-active';

/** Whether an event happened on a video, whose own controls own the click. */
export function eventOnVideo(event: Event): boolean {
  if (event.composedPath().some((target) => target instanceof HTMLVideoElement)) return true;
  return event.target instanceof Element && event.target.closest('video') !== null;
}

/**
 * The pointer on a presentation surface: hidden while the talk runs from the
 * keyboard or clicker, shown as soon as the mouse moves and hidden again once
 * it rests. A video under the pointer shows its playback controls, so the
 * speaker can pause and scrub, and the audience sees them only meanwhile.
 */
export function installPresentationPointer(idleMs = 2500): () => void {
  const html = document.documentElement;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const authored = new WeakMap<HTMLVideoElement, boolean>();
  const onMove = (): void => {
    html.classList.add(POINTER_ACTIVE_CLASS);
    clearTimeout(idle);
    idle = setTimeout(() => html.classList.remove(POINTER_ACTIVE_CLASS), idleMs);
  };
  const onOver = (event: PointerEvent): void => {
    const video = event.target instanceof HTMLVideoElement ? event.target : null;
    if (!video || authored.has(video)) return;
    authored.set(video, video.controls);
    video.controls = true;
  };
  const onOut = (event: PointerEvent): void => {
    const video = event.target instanceof HTMLVideoElement ? event.target : null;
    if (!video || !authored.has(video) || (event.relatedTarget instanceof Node && video.contains(event.relatedTarget))) return;
    video.controls = authored.get(video)!;
    authored.delete(video);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerover', onOver);
  window.addEventListener('pointerout', onOut);
  return () => {
    clearTimeout(idle);
    html.classList.remove(POINTER_ACTIVE_CLASS);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerover', onOver);
    window.removeEventListener('pointerout', onOut);
  };
}
