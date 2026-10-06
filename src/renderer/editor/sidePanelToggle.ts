/**
 * Hide and show the side panel (Props, Theme, Build, … on the right) to give
 * the canvas the room, from a toolbar button or Mod+\.
 *
 * The choice is per machine and survives a reload. The canvas refits by
 * itself: it observes its host, which the freed grid column widens. What the
 * shells tie to the active tab (the design preview, build badges, chat's read
 * state) is theirs to settle in `onChange`.
 */
const KEY = 'deckwerk.editor.side-hidden';

const ICON =
  '<svg class="bar-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
  '<rect x="1.75" y="2.75" width="12.5" height="10.5" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
  '<path class="side-panel-toggle-column" d="M10 2.75h4.25v10.5H10z" fill="currentColor"/>' +
  '<path d="M10 2.75v10.5" stroke="currentColor" stroke-width="1.5"/></svg>';

export interface SidePanelToggle {
  /** The toolbar button; place it in a `.bar-group`. */
  button: HTMLButtonElement;
  isHidden(): boolean;
  setHidden(hidden: boolean): void;
  toggle(): void;
}

function storedHidden(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

export function installSidePanelToggle(
  body: HTMLElement,
  onChange: (hidden: boolean) => void = () => {},
): SidePanelToggle {
  const mac = /mac/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
      ?? navigator.platform,
  );
  const shortcut = mac ? '⌘\\' : 'Ctrl+\\';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'bar-icon-button side-panel-toggle deck-only';
  button.setAttribute('aria-label', 'Side panel');
  button.innerHTML = ICON;

  let hidden = storedHidden();
  const paint = (): void => {
    body.classList.toggle('side-hidden', hidden);
    button.setAttribute('aria-pressed', String(!hidden));
    button.title = `${hidden ? 'Show' : 'Hide'} side panel (${shortcut})`;
  };
  const setHidden = (next: boolean): void => {
    if (next === hidden) return;
    hidden = next;
    paint();
    try {
      if (hidden) localStorage.setItem(KEY, 'true');
      else localStorage.removeItem(KEY);
    } catch {
      // A locked-down profile still hides the panel for this window.
    }
    onChange(hidden);
  };
  const toggle = (): void => setHidden(!hidden);

  button.addEventListener('click', toggle);
  // Capture phase: a text edit on the canvas stops every key it sees, and the
  // panel should still fold away mid-edit. Nothing types a backslash with the
  // command modifier held.
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Backslash' || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    if (body.classList.contains('welcome-mode') || document.querySelector('[aria-modal="true"]')) return;
    event.preventDefault();
    toggle();
  }, true);

  paint();
  return { button, isHidden: () => hidden, setHidden, toggle };
}
