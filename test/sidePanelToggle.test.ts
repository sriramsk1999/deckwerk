import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it } from 'vitest';
import { installSidePanelToggle } from '../src/renderer/editor/sidePanelToggle.js';

/**
 * The side panel folds away from its toolbar button or Mod+\, remembers that
 * per machine, and tells the shell so it can put away what follows the tab.
 */
describe('side panel toggle', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><body><div id="body"><aside id="side"></aside></div></body>', {
      pretendToBeVisual: true,
      url: 'http://localhost/',
    });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      localStorage: dom.window.localStorage,
      HTMLElement: dom.window.HTMLElement,
      KeyboardEvent: dom.window.KeyboardEvent,
    });
    // Node has a read-only `navigator` of its own; jsdom's reports no platform.
    Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  });

  // Installed per test: the toggle reads storage and binds keys when it is installed.
  function install(onChange?: (hidden: boolean) => void) {
    const body = document.getElementById('body')!;
    return { body, toggle: installSidePanelToggle(body, onChange) };
  }

  const press = (init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    document.body.dispatchEvent(event);
    return event;
  };

  it('starts shown, folds and unfolds on Ctrl+\\ and the button, and says so', async () => {
    const changes: boolean[] = [];
    const { body, toggle } = install((hidden) => changes.push(hidden));
    expect(body.classList.contains('side-hidden')).toBe(false);
    expect(toggle.button.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.button.title).toBe('Hide side panel (Ctrl+\\)');

    const event = press({ key: '\\', code: 'Backslash', ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(body.classList.contains('side-hidden')).toBe(true);
    expect(toggle.button.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.button.title).toBe('Show side panel (Ctrl+\\)');
    expect(localStorage.getItem('deckwerk.editor.side-hidden')).toBe('true');

    toggle.button.click();
    expect(body.classList.contains('side-hidden')).toBe(false);
    expect(localStorage.getItem('deckwerk.editor.side-hidden')).toBeNull();
    expect(changes).toEqual([true, false]);
  });

  it('comes back hidden after a reload, without announcing it', async () => {
    localStorage.setItem('deckwerk.editor.side-hidden', 'true');
    const changes: boolean[] = [];
    const { body, toggle } = install((hidden) => changes.push(hidden));
    expect(body.classList.contains('side-hidden')).toBe(true);
    expect(toggle.isHidden()).toBe(true);
    expect(changes).toEqual([]);
  });

  it('leaves other chords, dialogs and the welcome screen alone', async () => {
    const { body } = install();
    for (const init of [
      { key: '\\', code: 'Backslash' },
      { key: '\\', code: 'Backslash', ctrlKey: true, shiftKey: true },
      { key: '\\', code: 'Backslash', ctrlKey: true, altKey: true },
      { key: 'i', code: 'KeyI', ctrlKey: true },
    ]) {
      expect(press(init).defaultPrevented).toBe(false);
    }
    expect(body.classList.contains('side-hidden')).toBe(false);

    const dialog = document.createElement('div');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    press({ key: '\\', code: 'Backslash', metaKey: true });
    expect(body.classList.contains('side-hidden')).toBe(false);
    dialog.remove();

    body.classList.add('welcome-mode');
    press({ key: '\\', code: 'Backslash', metaKey: true });
    expect(body.classList.contains('side-hidden')).toBe(false);
  });
});
