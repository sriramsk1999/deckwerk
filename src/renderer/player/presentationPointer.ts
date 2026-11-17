/**
 * A click produced after dragging across text must belong to the browser's
 * native selection gesture, not to presentation navigation.
 */
export function selectionPreventsAdvance(selection: Selection | null = window.getSelection()): boolean {
  return selection !== null && selection.rangeCount > 0 && !selection.isCollapsed;
}

/** Whether an event happened on a video, whose own controls own the click. */
export function eventOnVideo(event: Event): boolean {
  if (event.composedPath().some((target) => target instanceof HTMLVideoElement)) return true;
  return event.target instanceof Element && event.target.closest('video') !== null;
}

/**
 * A video under the pointer shows its playback controls, so the speaker can
 * pause and scrub, and the audience sees them only meanwhile. A video authored
 * with controls keeps them. Returns a function that removes the listeners.
 */
export function showVideoControlsOnHover(): () => void {
  const authored = new WeakMap<HTMLVideoElement, boolean>();
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
  window.addEventListener('pointerover', onOver);
  window.addEventListener('pointerout', onOut);
  return () => {
    window.removeEventListener('pointerover', onOver);
    window.removeEventListener('pointerout', onOut);
  };
}
